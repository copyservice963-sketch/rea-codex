import { AudioEngine, audible, panLabel } from './audio-engine.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const context = new AudioContext({ latencyHint: 'interactive' });
const engine = new AudioEngine(context);
const colors = ['#f2f2f2', '#d6d6d6', '#bcbcbc', '#a2a2a2', '#888888', '#6e6e6e'];
const elements = new Map();
let songs = [createSong('Música 1')];
let currentSongId = songs[0].id;
let importing = false;
let starting = false;
const undoStack = [];
const redoStack = [];
const HISTORY_LIMIT = 80;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_SESSION_BYTES = 768 * 1024 * 1024;
let dirty = false;

function createSong(name) {
  return { id: crypto.randomUUID(), name, tracks: [], bpm: 120, metronome: false, markers: [] };
}

function currentSong() { return songs.find(song => song.id === currentSongId); }
function durationOf(song) { return Math.max(0, ...song.tracks.map(track => (track.start || 0) + track.buffer.duration)); }
function time(value) {
  const ms = Math.max(0, Math.round(value * 1000));
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
function notice(message) { $('#notice').textContent = message; }
function showError(error) { notice(`Áudio: ${error.message}`); updateAudioState(true); }

function captureState() {
  return {
    currentSongId,
    masterVolume: engine.masterVolume,
    songs: songs.map(song => ({
      ...song,
      markers: song.markers.map(marker => ({ ...marker })),
      tracks: song.tracks.map(track => ({
        ref: track,
        values: {
          name: track.name, volume: track.volume, pan: track.pan,
          muted: track.muted, solo: track.solo, start: track.start || 0
        }
      }))
    }))
  };
}

function restoreState(state) {
  engine.stop();
  songs = state.songs.map(song => ({
    ...song,
    markers: song.markers.map(marker => ({ ...marker })),
    tracks: song.tracks.map(({ ref, values }) => Object.assign(ref, values))
  }));
  currentSongId = songs.some(song => song.id === state.currentSongId) ? state.currentSongId : songs[0].id;
  engine.setMaster(state.masterVolume ?? 0.8);
  $('#master').value = engine.masterVolume;
  $('#master-value').textContent = `${Math.round(engine.masterVolume * 100)}%`;
  selectSong(currentSongId);
  updateHistoryButtons();
}

function pushHistory(state = captureState()) {
  undoStack.push(state);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  setDirty(true);
  updateHistoryButtons();
}

function checkpoint() { pushHistory(); }

function beginFieldEdit(element) {
  if (element._historyState) return;
  element._historyState = captureState();
  element._historyValue = element.value;
}

function finishFieldEdit(element) {
  const changed = element._historyState && element.value !== element._historyValue;
  if (changed) pushHistory(element._historyState);
  element._historyState = null;
  element._historyValue = null;
}

function setDirty(value) {
  dirty = Boolean(value);
  const state = $('#project-state');
  if (state) state.textContent = dirty ? 'NÃO SALVO' : 'SALVO';
  document.title = `${dirty ? '● ' : ''}Palco Multitracks`;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(captureState());
  restoreState(undoStack.pop());
  setDirty(true);
  notice('Alteração desfeita.');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(captureState());
  restoreState(redoStack.pop());
  setDirty(true);
  notice('Alteração refeita.');
}

function updateHistoryButtons() {
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;
}

function updateAudioState(failed = false) {
  const state = failed ? 'error' : engine.context.state;
  const labels = { running: 'ÁUDIO ATIVO', suspended: 'ÁUDIO SUSPENSO', closed: 'ÁUDIO ENCERRADO', error: 'VERIFIQUE A SAÍDA' };
  $('#audio-state').textContent = labels[state] || state.toUpperCase();
  $('#audio-led').className = state === 'running' ? 'active' : state === 'error' || state === 'closed' ? 'error' : '';
}

async function loadAudioDevices() {
  const select = $('#audio-device');
  const selected = select.value || 'default';
  select.replaceChildren(new Option('Dispositivo padrão do Windows', 'default'));
  try {
    if (!navigator.mediaDevices?.enumerateDevices) throw new Error('lista de dispositivos indisponível');
    const outputs = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audiooutput');
    outputs.forEach((device, index) => {
      if (device.deviceId === 'default') return;
      select.add(new Option(device.label || `Saída de áudio ${index + 1}`, device.deviceId));
    });
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
    notice(outputs.length ? `${outputs.length} saída(s) encontrada(s). Use “Testar áudio” para confirmar.` : 'Usando a saída padrão do Windows.');
  } catch (error) {
    select.disabled = true;
    notice(`Saída padrão selecionada; ${error.message}.`);
  }
}

function switchView(view) {
  $$('.view-tab').forEach(tab => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $$('.view-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${view}-view`));
  if (view === 'playlist') renderPlaylist();
  if (view === 'arrangement') requestAnimationFrame(repaint);
}

function selectSong(id, openArrangement = false) {
  const song = songs.find(candidate => candidate.id === id);
  if (!song) return;
  engine.setTracks(song.tracks);
  currentSongId = id;
  $('#song-name').value = song.name;
  $('#tempo').value = song.bpm;
  $('#metronome').classList.toggle('active', song.metronome);
  $('#metronome').setAttribute('aria-pressed', String(song.metronome));
  engine.setTempo(song.bpm, song.metronome);
  renderTracks();
  refreshSession();
  renderPlaylist();
  if (openArrangement) switchView('arrangement');
  notice(`Música selecionada: ${song.name}.`);
}

function addSong(openArrangement = true) {
  checkpoint();
  const song = createSong(`Música ${songs.length + 1}`);
  songs.push(song);
  selectSong(song.id, openArrangement);
  $('#song-name').select();
}

function moveSong(id, direction) {
  const index = songs.findIndex(song => song.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= songs.length) return;
  checkpoint();
  [songs[index], songs[target]] = [songs[target], songs[index]];
  renderPlaylist();
}

function removeSong(id) {
  if (songs.length === 1) { notice('A playlist precisa manter pelo menos uma música.'); return; }
  const index = songs.findIndex(song => song.id === id);
  if (index < 0) return;
  checkpoint();
  const wasCurrent = id === currentSongId;
  const [removed] = songs.splice(index, 1);
  if (wasCurrent) selectSong(songs[Math.min(index, songs.length - 1)].id);
  else renderPlaylist();
  notice(`Música removida da sessão: ${removed.name}. Os arquivos originais não foram alterados.`);
}

function renderPlaylist() {
  $('#song-count').textContent = songs.length;
  const rows = $('#playlist-rows');
  rows.replaceChildren();
  songs.forEach((song, index) => {
    const row = document.createElement('article');
    row.className = `playlist-row${song.id === currentSongId ? ' selected' : ''}`;
    row.dataset.songId = song.id;
    row.innerHTML = `<span class="playlist-index"></span><div class="playlist-name-wrap"><input class="playlist-name" aria-label="Nome da música"><small></small></div><span class="playlist-tracks"></span><span class="playlist-duration"></span><div class="playlist-actions"><button data-action="open" title="Abrir no arranjo">Abrir</button><button data-action="up" title="Mover para cima">↑</button><button data-action="down" title="Mover para baixo">↓</button><button data-action="remove" title="Remover música">×</button></div>`;
    row.querySelector('.playlist-index').textContent = String(index + 1).padStart(2, '0');
    const input = row.querySelector('.playlist-name'); input.value = song.name;
    row.querySelector('.playlist-name-wrap small').textContent = song.id === currentSongId ? 'SELECIONADA' : 'PRONTA PARA SELECIONAR';
    row.querySelector('.playlist-tracks').textContent = `${song.tracks.length} faixa${song.tracks.length === 1 ? '' : 's'}`;
    row.querySelector('.playlist-duration').textContent = time(durationOf(song));
    input.onfocus = () => beginFieldEdit(input);
    input.onchange = () => {
      song.name = input.value.trim() || `Música ${index + 1}`;
      input.value = song.name;
      finishFieldEdit(input);
      if (song.id === currentSongId) $('#song-name').value = song.name;
    };
    row.querySelector('[data-action=open]').onclick = () => selectSong(song.id, true);
    row.querySelector('[data-action=up]').onclick = () => moveSong(song.id, -1);
    row.querySelector('[data-action=down]').onclick = () => moveSong(song.id, 1);
    row.querySelector('[data-action=remove]').onclick = () => removeSong(song.id);
    rows.append(row);
  });
}

function refreshMix() {
  engine.updateMix();
  for (const track of engine.tracks) {
    const views = elements.get(track.id);
    if (!views) continue;
    for (const container of [views.row, views.strip]) {
      container.classList.toggle('muted', !audible(track, engine.tracks));
      for (const kind of ['muted', 'solo']) {
        const button = container.querySelector(`[data-kind=${kind}]`);
        button.classList.toggle('active', track[kind]);
        button.setAttribute('aria-pressed', String(track[kind]));
      }
    }
  }
}

function paintWave(track) {
  const views = elements.get(track.id);
  if (!views) return;
  const canvas = views.row.querySelector('canvas');
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const pen = canvas.getContext('2d'); pen.scale(scale, scale);
  const channel = track.buffer.getChannelData(0);
  const visibleWidth = width;
  pen.strokeStyle = colors[engine.tracks.indexOf(track) % colors.length];
  pen.globalAlpha = 0.8; pen.lineWidth = 1.5;
  if (!track.peaks) {
    const bins = Math.min(2000, channel.length), stride = Math.ceil(channel.length / bins);
    track.peaks = [];
    for (let i = 0; i < bins; i++) {
      let peak = 0;
      for (let j = i * stride; j < Math.min(channel.length, (i + 1) * stride); j++) peak = Math.max(peak, Math.abs(channel[j]));
      track.peaks.push(peak);
    }
  }
  for (let x = 0; x < visibleWidth; x += 3) {
    const peak = track.peaks[Math.min(track.peaks.length - 1, Math.floor(x / visibleWidth * track.peaks.length))];
    const amplitude = Math.max(1, peak * 34);
    pen.beginPath(); pen.moveTo(x, height / 2 - amplitude); pen.lineTo(x, height / 2 + amplitude); pen.stroke();
  }
}

function repaint() { engine.tracks.forEach(paintWave); }

function renderMarkers() {
  const layer = $('#markers');
  layer.replaceChildren();
  const song = currentSong();
  for (const marker of song.markers) {
    const element = document.createElement('i');
    element.className = 'marker';
    element.dataset.name = marker.name;
    element.title = `${marker.name} · ${time(marker.time)}`;
    element.style.left = `${engine.duration ? marker.time / engine.duration * 100 : 0}%`;
    layer.append(element);
  }
}

function addMarker() {
  const song = currentSong();
  checkpoint();
  song.markers.push({ id: crypto.randomUUID(), time: engine.position, name: `M${song.markers.length + 1}` });
  song.markers.sort((a, b) => a.time - b.time);
  renderMarkers();
  notice(`Marcador adicionado em ${time(engine.position)}.`);
}

function refreshSession() {
  const count = engine.tracks.length;
  $('#empty').hidden = !!count;
  $('#track-count').textContent = `${count} ${count === 1 ? 'faixa' : 'faixas'}`;
  $('#song-duration').textContent = time(engine.duration);
  $('#seek').max = engine.duration || 1;
  $('#seek').disabled = !count || importing;
  $('#play').disabled = !count || importing || starting;
  $('#stop').disabled = !count || importing;
  $('#total').textContent = `/ ${time(engine.duration)}`;
  $('#previous-song').disabled = songs.findIndex(song => song.id === currentSongId) === 0;
  $('#next-song').disabled = songs.findIndex(song => song.id === currentSongId) === songs.length - 1;
  $('#ruler').replaceChildren(...Array.from({ length: 7 }, (_, index) => {
    const span = document.createElement('span'); span.textContent = time(engine.duration * index / 6).slice(0, 5); return span;
  }));
  renderMarkers();
  renderPlaylist();
  repaint();
}

function syncTrackControl(track, kind, value) {
  const views = elements.get(track.id);
  if (!views) return;
  for (const container of [views.row, views.strip]) {
    const input = container.querySelector(`[data-control=${kind}]`);
    if (input && Number(input.value) !== value) input.value = value;
    const label = container.querySelector(`[data-value=${kind}]`);
    if (label) label.textContent = kind === 'pan' ? panLabel(value) : `${Math.round(value * 100)}%`;
  }
}

function wireTrackControls(track, container) {
  for (const kind of ['muted', 'solo']) {
    const button = container.querySelector(`[data-kind=${kind}]`);
    button.setAttribute('aria-label', `${kind === 'muted' ? 'Mute' : 'Solo'} ${track.name}`);
    button.onclick = () => { checkpoint(); track[kind] = !track[kind]; refreshMix(); };
  }
  const volume = container.querySelector('[data-control=volume]');
  volume.setAttribute('aria-label', `Volume ${track.name}`);
  volume.onfocus = volume.onpointerdown = () => beginFieldEdit(volume);
  volume.oninput = () => { track.volume = Number(volume.value); syncTrackControl(track, 'volume', track.volume); engine.updateMix(); };
  volume.onchange = () => finishFieldEdit(volume);
  const pan = container.querySelector('[data-control=pan]');
  pan.setAttribute('aria-label', `Pan ${track.name}`);
  pan.onfocus = pan.onpointerdown = () => beginFieldEdit(pan);
  pan.oninput = () => { track.pan = Number(pan.value); syncTrackControl(track, 'pan', track.pan); engine.updateMix(); };
  pan.onchange = () => finishFieldEdit(pan);
}

function addRow(track, index) {
  const row = document.createElement('article');
  row.className = 'track'; row.dataset.id = track.id; row.style.setProperty('--track-color', colors[index % colors.length]);
  row.innerHTML = `<div class="track-controls"><div class="track-top"><span class="track-number"></span><h2 class="track-name"></h2><button class="remove" title="Remover faixa">×</button></div><p class="track-info"></p><div class="track-mix-row"><button class="mix-button mute" data-kind="muted" aria-pressed="false">M</button><button class="mix-button" data-kind="solo" aria-pressed="false">S</button><label>VOL<input data-control="volume" type="range" min="0" max="1" step="0.01"><span data-value="volume"></span></label><label>PAN<input data-control="pan" type="range" min="-1" max="1" step="0.01"><span data-value="pan"></span></label><label class="start-control">INÍCIO<input data-control="start" type="number" min="0" step="0.01"></label></div></div><div class="wave-wrap"><div class="audio-item"><canvas class="waveform"></canvas></div><div class="playhead"></div></div>`;
  row.querySelector('.track-number').textContent = String(index + 1).padStart(2, '0');
  row.querySelector('.track-name').textContent = track.name;
  row.querySelector('.track-name').title = track.name;
  row.querySelector('.track-name').contentEditable = 'true';
  row.querySelector('.track-name').spellcheck = false;
  row.querySelector('.track-name').setAttribute('aria-label', `Nome da faixa ${index + 1}`);
  let nameState = null;
  row.querySelector('.track-name').onfocus = () => { nameState = captureState(); };
  row.querySelector('.track-name').onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
    if (event.key === 'Escape') { event.currentTarget.textContent = track.name; event.currentTarget.blur(); }
  };
  row.querySelector('.track-name').onblur = event => {
    const name = event.currentTarget.textContent.trim() || `Faixa ${index + 1}`;
    if (name !== track.name) { pushHistory(nameState); track.name = name; renderTracks(); }
    else event.currentTarget.textContent = track.name;
    nameState = null;
  };
  row.querySelector('.track-info').textContent = `${track.buffer.numberOfChannels === 1 ? 'MONO' : 'ESTÉREO'} · ${time(track.buffer.duration)} · ${track.buffer.sampleRate / 1000} kHz`;
  row.querySelector('.remove').setAttribute('aria-label', `Remover ${track.name}`);

  const strip = document.createElement('article');
  strip.className = 'mixer-strip'; strip.dataset.id = track.id;
  strip.innerHTML = `<div class="strip-number"></div><strong class="strip-name"></strong><div class="meter"><i></i><i></i></div><div class="strip-buttons"><button class="mix-button mute" data-kind="muted" aria-pressed="false">M</button><button class="mix-button" data-kind="solo" aria-pressed="false">S</button></div><label>PAN <span data-value="pan"></span><input data-control="pan" type="range" min="-1" max="1" step="0.01"></label><label>VOL <span data-value="volume"></span><input data-control="volume" type="range" min="0" max="1" step="0.01"></label>`;
  strip.querySelector('.strip-number').textContent = index + 1;
  strip.querySelector('.strip-name').textContent = track.name;

  elements.set(track.id, { row, strip });
  wireTrackControls(track, row); wireTrackControls(track, strip);
  syncTrackControl(track, 'volume', track.volume); syncTrackControl(track, 'pan', track.pan);
  const start = row.querySelector('[data-control=start]');
  start.value = (track.start || 0).toFixed(2);
  start.onfocus = () => beginFieldEdit(start);
  start.onchange = () => {
    track.start = Math.max(0, Number(start.value) || 0);
    start.value = track.start.toFixed(2);
    finishFieldEdit(start);
    engine.stop(); renderTracks(); refreshSession();
    notice(`${track.name} inicia em ${time(track.start)}.`);
  };
  const item = row.querySelector('.audio-item');
  item.style.left = `${engine.duration ? (track.start || 0) / engine.duration * 100 : 0}%`;
  item.style.width = `${engine.duration ? track.buffer.duration / engine.duration * 100 : 100}%`;
  item.title = 'Arraste para alterar o início da faixa';
  item.onclick = event => event.stopPropagation();
  item.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const before = captureState();
    const original = track.start || 0;
    const area = row.querySelector('.wave-wrap').getBoundingClientRect();
    const duration = engine.duration;
    const startX = event.clientX;
    item.setPointerCapture(event.pointerId);
    item.onpointermove = moveEvent => {
      const delta = (moveEvent.clientX - startX) / area.width * duration;
      track.start = Math.max(0, original + delta);
      item.style.left = `${duration ? track.start / duration * 100 : 0}%`;
      start.value = track.start.toFixed(2);
    };
    item.onpointerup = () => {
      item.onpointermove = null; item.onpointerup = null;
      if (Math.abs(track.start - original) > 0.001) {
        pushHistory(before); engine.stop(); renderTracks(); refreshSession();
        notice(`${track.name} movida para ${time(track.start)}.`);
      }
    };
  };
  row.querySelector('.remove').onclick = () => {
    checkpoint();
    engine.remove(track.id); renderTracks(); refreshSession(); refreshMix();
    notice('Faixa removida. A reprodução foi pausada.');
  };
  row.querySelector('.wave-wrap').onclick = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    engine.seek((event.clientX - rect.left) / rect.width * engine.duration).catch(showError);
  };
  $('#tracks').append(row); $('#mixer-strips').append(strip);
}

function renderTracks() {
  elements.clear();
  $('#tracks').replaceChildren(); $('#mixer-strips').replaceChildren();
  if (!engine.tracks.length) {
    const message = document.createElement('div'); message.className = 'mixer-empty'; message.textContent = 'As faixas aparecerão aqui';
    $('#mixer-strips').append(message); return;
  }
  engine.tracks.forEach(addRow);
  refreshMix();
}

async function importFiles(files) {
  if (importing || starting || !files.length) return;
  importing = true; engine.pause(); $('#import').disabled = true; $('#empty-import').disabled = true; refreshSession();
  let added = 0; const errors = [];
  const beforeImport = captureState();
  for (const file of files) {
    notice(`Carregando ${file.name}…`);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('limite de 256 MB por arquivo');
      const sourceBytes = await file.arrayBuffer();
      const buffer = await engine.context.decodeAudioData(sourceBytes.slice(0));
      const bytes = buffer.length * buffer.numberOfChannels * 4;
      const retained = songs.flatMap(song => song.tracks).reduce((sum, track) => sum + track.buffer.length * track.buffer.numberOfChannels * 4, 0);
      if (retained + bytes > MAX_SESSION_BYTES) throw new Error('limite de memória da sessão (768 MB de áudio decodificado)');
      if (!added) pushHistory(beforeImport);
      engine.add(buffer, file.name, { sourceBytes, mimeType: file.type }); added++;
    } catch (error) { errors.push(`${file.name}: ${error.message}`); }
  }
  importing = false; $('#import').disabled = false; $('#empty-import').disabled = false; $('#files').value = '';
  renderTracks(); refreshSession(); refreshMix();
  notice(errors.length ? `${added} faixa(s) importada(s). Falha: ${errors.join(' · ')}` : `${added} faixa(s) importada(s) em ${currentSong().name}. Use “Testar áudio” se não ouvir a reprodução.`);
}

async function togglePlay() {
  if (importing || starting || !engine.tracks.length) return;
  if (engine.playing) { engine.pause(); return; }
  starting = true; refreshSession();
  try { await engine.play(); updateAudioState(); }
  catch (error) { showError(error); }
  finally { starting = false; refreshSession(); }
}

function navigateSong(direction) {
  const index = songs.findIndex(song => song.id === currentSongId);
  const target = songs[index + direction];
  if (target) selectSong(target.id);
}

function bytesToBase64(bytes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes]));
  });
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('dados de áudio Base64 inválidos ou acima do limite');
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function serializeProject() {
  const outputSongs = [];
  for (const song of songs) {
    const tracks = [];
    for (const track of song.tracks) {
      if (!track.sourceBytes) throw new Error(`a faixa “${track.name}” não possui os bytes originais para salvar`);
      tracks.push({
        id: track.id, name: track.name, volume: track.volume, pan: track.pan,
        muted: track.muted, solo: track.solo, start: track.start || 0,
        mimeType: track.mimeType, audioBase64: await bytesToBase64(track.sourceBytes)
      });
    }
    outputSongs.push({
      id: song.id, name: song.name, bpm: song.bpm,
      metronome: song.metronome, markers: song.markers, tracks
    });
  }
  return JSON.stringify({
    format: 'palco-project', version: 1, savedAt: new Date().toISOString(),
    currentSongId, masterVolume: engine.masterVolume, songs: outputSongs
  });
}

async function saveProject() {
  try {
    notice('Preparando projeto…');
    const content = await serializeProject();
    if (window.palcoDesktop) {
      const result = await window.palcoDesktop.saveProject(content);
      if (!result.canceled) setDirty(false);
      notice(result.canceled ? 'Salvamento cancelado.' : `Projeto salvo em ${result.path}.`);
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    link.download = 'projeto-palco.palco.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setDirty(false);
    notice('Projeto exportado.');
  } catch (error) { notice(`Projeto: ${error.message}`); }
}

async function loadProjectContent(content) {
  const project = JSON.parse(content);
  if (project?.format !== 'palco-project' || project.version !== 1 || !Array.isArray(project.songs) || !project.songs.length) {
    throw new Error('formato de projeto inválido ou incompatível');
  }
  const loadedSongs = [];
  let retainedBytes = 0;
  for (const sourceSong of project.songs) {
    const song = createSong(String(sourceSong.name || 'Música'));
    song.id = String(sourceSong.id || crypto.randomUUID());
    song.bpm = Math.max(30, Math.min(300, Number(sourceSong.bpm) || 120));
    song.metronome = Boolean(sourceSong.metronome);
    song.markers = Array.isArray(sourceSong.markers) ? sourceSong.markers.map(marker => ({
      id: String(marker.id || crypto.randomUUID()), name: String(marker.name || 'M'), time: Math.max(0, Number(marker.time) || 0)
    })) : [];
    for (const sourceTrack of sourceSong.tracks || []) {
      if (typeof sourceTrack.audioBase64 !== 'string') throw new Error(`faixa “${sourceTrack.name}” não contém áudio válido`);
      const sourceBytes = base64ToBytes(sourceTrack.audioBase64);
      if (sourceBytes.byteLength > MAX_FILE_BYTES) throw new Error(`faixa “${sourceTrack.name}” excede 256 MB`);
      retainedBytes += sourceBytes.byteLength;
      if (retainedBytes > MAX_SESSION_BYTES) throw new Error('o projeto excede o limite de 768 MB de áudio');
      const buffer = await engine.context.decodeAudioData(sourceBytes.slice(0));
      song.tracks.push({
        id: String(sourceTrack.id || crypto.randomUUID()), name: String(sourceTrack.name || 'Faixa'), buffer,
        volume: Number.isFinite(Number(sourceTrack.volume)) ? Math.max(0, Math.min(1, Number(sourceTrack.volume))) : 1,
        pan: Math.max(-1, Math.min(1, Number(sourceTrack.pan) || 0)),
        muted: Boolean(sourceTrack.muted), solo: Boolean(sourceTrack.solo),
        start: Math.max(0, Number(sourceTrack.start) || 0),
        sourceBytes, mimeType: String(sourceTrack.mimeType || 'application/octet-stream')
      });
    }
    loadedSongs.push(song);
  }
  songs = loadedSongs;
  currentSongId = songs.some(song => song.id === project.currentSongId) ? project.currentSongId : songs[0].id;
  const masterVolume = Number(project.masterVolume);
  engine.setMaster(Number.isFinite(masterVolume) ? Math.max(0, Math.min(1, masterVolume)) : 0.8);
  $('#master').value = engine.masterVolume;
  $('#master-value').textContent = `${Math.round(engine.masterVolume * 100)}%`;
  undoStack.length = 0; redoStack.length = 0;
  selectSong(currentSongId, true); updateHistoryButtons();
  setDirty(false);
  notice(`Projeto aberto com ${songs.length} música(s).`);
}

async function confirmDiscard() {
  if (!dirty) return true;
  if (window.palcoDesktop?.confirmDiscard) return window.palcoDesktop.confirmDiscard();
  return window.confirm('Descartar as alterações não salvas do projeto atual?');
}

async function openProject() {
  try {
    if (!await confirmDiscard()) { notice('Abertura cancelada.'); return; }
    if (window.palcoDesktop) {
      const result = await window.palcoDesktop.openProject();
      if (!result.canceled) await loadProjectContent(result.content);
      else notice('Abertura cancelada.');
      return;
    }
    $('#project-file').click();
  } catch (error) { notice(`Projeto: ${error.message}`); }
}

async function newProject() {
  if (!await confirmDiscard()) { notice('Novo projeto cancelado.'); return; }
  engine.stop();
  songs = [createSong('Música 1')]; currentSongId = songs[0].id;
  undoStack.length = 0; redoStack.length = 0;
  selectSong(currentSongId, true); updateHistoryButtons();
  setDirty(false);
  notice('Novo projeto criado.');
}

$('#files').onchange = event => importFiles([...event.target.files]);
$('#project-file').onchange = async event => {
  const [file] = event.target.files;
  if (!file) return;
  try { await loadProjectContent(await file.text()); }
  catch (error) { notice(`Projeto: ${error.message}`); }
  event.target.value = '';
};
$('#new-project').onclick = newProject;
$('#open-project').onclick = openProject;
$('#save-project').onclick = saveProject;
$('#undo').onclick = undo;
$('#redo').onclick = redo;
$('#add-marker').onclick = addMarker;
$('#import').onclick = $('#empty-import').onclick = () => $('#files').click();
$('#new-song').onclick = () => addSong(true);
$('#playlist-new-song').onclick = () => addSong(false);
$('#song-name').onchange = event => {
  currentSong().name = event.target.value.trim() || 'Música sem nome';
  event.target.value = currentSong().name; finishFieldEdit(event.target); renderPlaylist();
};
$('#song-name').onfocus = event => beginFieldEdit(event.target);
$('#tempo').onfocus = event => beginFieldEdit(event.target);
$('#tempo').onchange = event => {
  const song = currentSong();
  song.bpm = Math.max(30, Math.min(300, Number(event.target.value) || 120));
  event.target.value = song.bpm;
  finishFieldEdit(event.target);
  engine.setTempo(song.bpm, song.metronome);
  notice(`Tempo do projeto: ${song.bpm} BPM.`);
};
$('#metronome').onclick = () => {
  checkpoint();
  const song = currentSong(); song.metronome = !song.metronome;
  engine.setTempo(song.bpm, song.metronome);
  $('#metronome').classList.toggle('active', song.metronome);
  $('#metronome').setAttribute('aria-pressed', String(song.metronome));
};
$$('.view-tab').forEach(tab => tab.onclick = () => switchView(tab.dataset.view));
$('#play').onclick = togglePlay;
$('#stop').onclick = () => engine.stop();
$('#previous-song').onclick = () => navigateSong(-1);
$('#next-song').onclick = () => navigateSong(1);
$('#seek').oninput = event => engine.seek(Number(event.target.value)).catch(showError);
$('#master').oninput = event => {
  engine.setMaster(Number(event.target.value)); $('#master-value').textContent = `${Math.round(engine.masterVolume * 100)}%`;
};
$('#master').onfocus = $('#master').onpointerdown = event => beginFieldEdit(event.target);
$('#master').onchange = event => finishFieldEdit(event.target);
$('#audio-device').onchange = async event => {
  try { await engine.setOutputDevice(event.target.value); await engine.ensureReady(); updateAudioState(); notice(`Saída selecionada: ${event.target.selectedOptions[0].text}.`); }
  catch (error) { showError(error); }
};
$('#refresh-devices').onclick = loadAudioDevices;
$('#test-audio').onclick = async () => {
  try { await engine.testTone(); updateAudioState(); notice(`Tom de teste enviado para “${$('#audio-device').selectedOptions[0].text}”. Se não ouviu, escolha outra saída.`); }
  catch (error) { showError(error); }
};

const appMenus = {
  file: [
    ['Novo projeto', 'Ctrl+N', newProject], ['Abrir projeto…', 'Ctrl+O', openProject], ['Salvar projeto…', 'Ctrl+S', saveProject]
  ],
  edit: [['Desfazer', 'Ctrl+Z', undo], ['Refazer', 'Ctrl+Y', redo]],
  view: [['Arranjo', '', () => switchView('arrangement')], ['Playlist', '', () => switchView('playlist')]],
  track: [['Importar faixas…', '', () => $('#files').click()], ['Adicionar marcador', 'M', addMarker]],
  options: [['Testar saída de áudio', '', () => $('#test-audio').click()], ['Ativar/desativar metrônomo', '', () => $('#metronome').click()]],
  help: [['Mostrar atalhos', '', () => $('#shortcuts-dialog').showModal()]]
};

function closeAppMenu() {
  $('#menu-popup').hidden = true;
  $$('.app-menu button').forEach(button => button.classList.remove('open'));
}

$$('.app-menu button').forEach(button => button.onclick = event => {
  event.stopPropagation();
  const popup = $('#menu-popup');
  const wasOpen = button.classList.contains('open');
  closeAppMenu();
  if (wasOpen) return;
  const rect = button.getBoundingClientRect();
  popup.replaceChildren(...appMenus[button.dataset.menu].map(([label, shortcut, action]) => {
    const item = document.createElement('button');
    const name = document.createElement('span'); name.textContent = label;
    const key = document.createElement('kbd'); key.textContent = shortcut;
    item.append(name, key);
    item.onclick = () => { closeAppMenu(); action(); };
    return item;
  }));
  popup.style.left = `${rect.left}px`; popup.style.top = `${rect.bottom}px`;
  popup.hidden = false; button.classList.add('open');
});
document.addEventListener('click', event => { if (!event.target.closest('#menu-popup')) closeAppMenu(); });

document.addEventListener('keydown', event => {
  if (event.repeat) return;
  const command = event.ctrlKey || event.metaKey;
  if (command && event.code === 'KeyS') { event.preventDefault(); saveProject(); return; }
  if (command && event.code === 'KeyO') { event.preventDefault(); openProject(); return; }
  if (command && event.code === 'KeyN') { event.preventDefault(); newProject(); return; }
  if (command && event.code === 'KeyZ' && event.shiftKey) { event.preventDefault(); redo(); return; }
  if (command && event.code === 'KeyZ') { event.preventDefault(); undo(); return; }
  if (command && event.code === 'KeyY') { event.preventDefault(); redo(); return; }
  if (['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.code === 'Escape') engine.stop();
  if (event.code === 'KeyM') addMarker();
});
window.addEventListener('resize', repaint);
window.addEventListener('beforeunload', event => {
  if (dirty) { event.preventDefault(); event.returnValue = ''; }
});
engine.context.addEventListener('statechange', () => updateAudioState());
if (navigator.mediaDevices) navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices);

setInterval(() => {
  if (engine.playing && engine.position >= engine.duration) { engine.stop(); notice(`Fim de ${currentSong().name}. A próxima música não foi iniciada automaticamente.`); }
  $('#position').textContent = time(engine.position);
  $('#seek').value = engine.position;
  $('#play').classList.toggle('playing', engine.playing);
  $('#play').setAttribute('aria-label', engine.playing ? 'Pausar' : 'Reproduzir');
  $('#play-state').textContent = engine.playing ? 'REPRODUZINDO' : engine.offset ? 'PAUSADO' : 'PARADO';
  for (const { row } of elements.values()) row.querySelector('.playhead').style.left = `${engine.duration ? engine.position / engine.duration * 100 : 0}%`;
}, 40);

engine.setTracks(currentSong().tracks);
engine.setTempo(currentSong().bpm, currentSong().metronome);
$('#song-name').value = currentSong().name;
$('#tempo').value = currentSong().bpm;
renderTracks(); refreshSession(); renderPlaylist(); updateHistoryButtons(); setDirty(false); updateAudioState(); loadAudioDevices();
