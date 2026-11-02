import { AudioEngine, audible } from './audio-engine.mjs';

const $ = selector => document.querySelector(selector);
const engine = new AudioEngine(new AudioContext({ latencyHint: 'playback' }));
const colors = ['#f2f2f2', '#d6d6d6', '#bcbcbc', '#a2a2a2', '#888888', '#6e6e6e'];
const elements = new Map();
let importing = false;
let starting = false;
const time = value => {
  const ms = Math.max(0, Math.round(value * 1000));
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
function notice(message) { $('#notice').textContent = message; }
function refreshMix() {
  engine.updateMix();
  for (const track of engine.tracks) {
    const row = elements.get(track.id);
    row.classList.toggle('muted', !audible(track, engine.tracks));
    for (const kind of ['muted', 'solo']) {
      const button = row.querySelector(`[data-kind=${kind}]`);
      button.classList.toggle('active', track[kind]);
      button.setAttribute('aria-pressed', String(track[kind]));
    }
  }
}
function paintWave(track) {
  const row = elements.get(track.id), canvas = row.querySelector('canvas');
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const pen = canvas.getContext('2d'); pen.scale(scale, scale);
  const channel = track.buffer.getChannelData(0);
  const visibleWidth = width * track.buffer.duration / engine.duration;
  pen.strokeStyle = colors[engine.tracks.indexOf(track) % colors.length];
  pen.globalAlpha = 0.8; pen.lineWidth = 1.5;
  // Fixed peak bins computed once; redraws never scan full audio buffers.
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
    const amplitude = Math.max(1, peak * 39);
    pen.beginPath(); pen.moveTo(x, height / 2 - amplitude); pen.lineTo(x, height / 2 + amplitude); pen.stroke();
  }
}
function repaint() { for (const track of engine.tracks) paintWave(track); }
function refreshSession() {
  const count = engine.tracks.length;
  $('#empty').hidden = !!count;
  $('#track-count').textContent = `${count} ${count === 1 ? 'faixa' : 'faixas'}`;
  $('#session-state').textContent = count ? `${count} faixas · ${engine.context.sampleRate / 1000} kHz · saída estéreo` : 'Nenhum áudio carregado';
  $('#seek').max = engine.duration || 1;
  $('#seek').disabled = !count || importing;
  $('#play').disabled = !count || importing || starting;
  $('#stop').disabled = !count || importing;
  $('#total').textContent = `/ ${time(engine.duration)}`;
  $('#ruler').replaceChildren(...Array.from({ length: 6 }, (_, index) => {
    const span = document.createElement('span'); span.textContent = time(engine.duration * index / 5).slice(0, 5); return span;
  }));
  repaint();
}
function addRow(track) {
  const row = document.createElement('article'); row.className = 'track'; row.dataset.id = track.id;
  row.style.setProperty('--track-color', colors[(engine.tracks.length - 1) % colors.length]);
  row.innerHTML = `<div class="track-controls"><div class="track-top"><span class="track-number"></span><h2 class="track-name"></h2><button class="remove" title="Remover faixa">×</button></div><p class="track-info"></p><div class="track-bottom"><button class="mix-button mute" data-kind="muted" aria-pressed="false">M</button><button class="mix-button" data-kind="solo" aria-pressed="false">S</button><input class="track-volume" type="range" min="0" max="1" step="0.01" value="1"><span class="volume-value">100%</span></div></div><div class="wave-wrap"><canvas class="waveform"></canvas><div class="playhead"></div></div>`;
  // Filenames are data; never insert them as HTML.
  row.querySelector('.track-name').textContent = track.name;
  row.querySelector('.track-name').title = track.name;
  row.querySelector('.track-info').textContent = `${track.buffer.numberOfChannels === 1 ? 'MONO' : 'ESTÉREO'} · ${time(track.buffer.duration)} · ${track.buffer.sampleRate / 1000} kHz`;
  row.querySelector('.remove').setAttribute('aria-label', `Remover ${track.name}`);
  row.querySelector('.remove').onclick = () => {
    engine.remove(track.id); row.remove(); elements.delete(track.id);
    for (const [index, item] of engine.tracks.entries()) elements.get(item.id).querySelector('.track-number').textContent = String(index + 1).padStart(2, '0');
    refreshSession(); refreshMix(); notice('Faixa removida. A reprodução foi pausada.');
  };
  row.querySelector('.track-number').textContent = String(engine.tracks.length).padStart(2, '0');
  for (const kind of ['muted', 'solo']) {
    const button = row.querySelector(`[data-kind=${kind}]`);
    button.setAttribute('aria-label', `${kind === 'muted' ? 'Mute' : 'Solo'} ${track.name}`);
    button.onclick = () => { track[kind] = !track[kind]; refreshMix(); };
  }
  const volume = row.querySelector('.track-volume'); volume.setAttribute('aria-label', `Volume ${track.name}`);
  volume.oninput = () => { track.volume = Number(volume.value); row.querySelector('.volume-value').textContent = `${Math.round(track.volume * 100)}%`; engine.updateMix(); };
  row.querySelector('.wave-wrap').onclick = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    engine.seek((event.clientX - rect.left) / rect.width * engine.duration).catch(showError);
  };
  elements.set(track.id, row); $('#tracks').append(row);
}
function showError(error) { notice(`Não foi possível reproduzir: ${error.message}`); }
async function importFiles(files) {
  if (importing || starting || !files.length) return;
  importing = true; engine.pause(); $('#import').disabled = true; $('#empty-import').disabled = true; refreshSession();
  let added = 0; const errors = [];
  for (const file of files) {
    notice(`Carregando ${file.name}…`);
    try {
      // Decoded audio is held in RAM. Bound the session before allocating large buffers.
      if (file.size > 256 * 1024 * 1024) throw new Error('limite de 256 MB por arquivo');
      const buffer = await engine.context.decodeAudioData(await file.arrayBuffer());
      const bytes = buffer.length * buffer.numberOfChannels * 4;
      const retained = engine.tracks.reduce((sum, t) => sum + t.buffer.length * t.buffer.numberOfChannels * 4, 0);
      if (retained + bytes > 768 * 1024 * 1024) throw new Error('limite de memória da sessão (768 MB de áudio decodificado)');
      const track = engine.add(buffer, file.name); addRow(track); added++;
    } catch (error) { errors.push(`${file.name}: ${error.message}`); }
  }
  importing = false; $('#import').disabled = false; $('#empty-import').disabled = false; $('#files').value = '';
  refreshSession(); refreshMix();
  notice(errors.length ? `${added} faixa(s) importada(s). Falha: ${errors.join(' · ')}` : `${added} faixa(s) importada(s). Pronto para tocar. Os volumes somam; reduza o master para evitar saturação.`);
}
$('#files').onchange = event => importFiles([...event.target.files]);
$('#import').onclick = $('#empty-import').onclick = () => $('#files').click();
async function togglePlay() {
  if (importing || starting || !engine.tracks.length) return;
  if (engine.playing) { engine.pause(); return; }
  starting = true; refreshSession();
  try { await engine.play(); } catch (error) { showError(error); }
  finally { starting = false; refreshSession(); }
}
$('#play').onclick = togglePlay;
$('#stop').onclick = () => engine.stop();
$('#seek').oninput = event => engine.seek(Number(event.target.value)).catch(showError);
$('#master').oninput = event => {
  engine.setMaster(Number(event.target.value)); $('#master-value').textContent = `${Math.round(engine.masterVolume * 100)}%`;
};
document.addEventListener('keydown', event => {
  if (['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.repeat) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.code === 'Escape') engine.stop();
});
window.addEventListener('resize', repaint);
window.addEventListener('beforeunload', event => {
  if (engine.tracks.length) { event.preventDefault(); event.returnValue = ''; }
});
setInterval(() => {
  if (engine.playing && engine.position >= engine.duration) { engine.stop(); notice('Fim da música. Reprodução parada no início.'); }
  $('#position').textContent = time(engine.position);
  $('#seek').value = engine.position;
  $('#play').classList.toggle('playing', engine.playing);
  $('#play').setAttribute('aria-label', engine.playing ? 'Pausar' : 'Reproduzir');
  $('#play-state').textContent = engine.playing ? 'REPRODUZINDO' : engine.offset ? 'PAUSADO' : 'PARADO';
  for (const row of elements.values()) row.querySelector('.playhead').style.left = `${engine.duration ? engine.position / engine.duration * 100 : 0}%`;
}, 40);
refreshSession();
