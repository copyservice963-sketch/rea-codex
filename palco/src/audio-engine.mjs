export function audible(track, tracks) {
  return !track.muted && (!tracks.some(item => item.solo) || track.solo);
}

export function panLabel(value) {
  const amount = Math.round(Math.abs(value) * 100);
  if (amount === 0) return 'C';
  return `${value < 0 ? 'L' : 'R'}${amount}`;
}

export class AudioEngine {
  constructor(context) {
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);
    this.tracks = [];
    this.sources = [];
    this.clicks = [];
    this.metronomeTimer = null;
    this.nextBeat = 0;
    this.metronomeStart = 0;
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
    this.revision = 0;
    this.masterVolume = 0.8;
    this.tempo = 120;
    this.metronome = false;
    this.master.gain.value = this.masterVolume;
  }

  get duration() { return Math.max(0, ...this.tracks.map(track => (track.start || 0) + track.buffer.duration)); }
  get position() {
    return Math.min(this.duration, this.playing
      ? this.offset + Math.max(0, this.context.currentTime - this.startedAt)
      : this.offset);
  }

  setTracks(tracks) {
    this.stop();
    this.tracks = tracks;
  }

  add(buffer, name, options = {}) {
    const track = {
      id: crypto.randomUUID(), name, buffer,
      volume: 1, pan: 0, muted: false, solo: false, start: 0,
      sourceBytes: options.sourceBytes || null,
      mimeType: options.mimeType || 'application/octet-stream'
    };
    this.tracks.push(track);
    return track;
  }

  updateMix(immediate = false) {
    for (const { track, gain, panner } of this.sources) {
      const level = audible(track, this.tracks) ? track.volume : 0;
      gain.gain.cancelScheduledValues(this.context.currentTime);
      panner.pan.cancelScheduledValues(this.context.currentTime);
      if (immediate) {
        gain.gain.value = level;
        panner.pan.value = track.pan;
      } else {
        gain.gain.setTargetAtTime(level, this.context.currentTime, 0.008);
        panner.pan.setTargetAtTime(track.pan, this.context.currentTime, 0.008);
      }
    }
  }

  setMaster(value) {
    this.masterVolume = value;
    this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.008);
  }

  setTempo(bpm, metronome = this.metronome) {
    this.tempo = Math.max(30, Math.min(300, Number(bpm) || 120));
    this.metronome = Boolean(metronome);
  }

  async ensureReady() {
    await this.context.resume();
    if (this.context.state !== 'running') {
      throw new Error(`o dispositivo de áudio não iniciou (estado: ${this.context.state})`);
    }
  }

  async setOutputDevice(deviceId) {
    if (typeof this.context.setSinkId !== 'function') {
      if (deviceId && deviceId !== 'default') throw new Error('seleção de saída indisponível neste sistema');
      return;
    }
    await this.context.setSinkId(deviceId || 'default');
  }

  async testTone(duration = 0.65) {
    await this.ensureReady();
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.value = 440;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
    gain.gain.setValueAtTime(0.16, now + Math.max(0.05, duration - 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain); gain.connect(this.master);
    oscillator.start(now); oscillator.stop(now + duration);
    oscillator.addEventListener('ended', () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
  }

  async play() {
    if (this.playing || !this.tracks.length) return;
    const revision = this.revision;
    await this.ensureReady();
    if (revision !== this.revision) return;
    if (this.offset >= this.duration) this.offset = 0;
    this.schedule(this.context.currentTime + 0.06);
  }

  // Every source uses one AudioContext timestamp and offset, preserving alignment.
  schedule(when) {
    if (this.playing) return;
    this.startedAt = when;
    this.playing = true;
    for (const track of this.tracks) {
      const trackStart = track.start || 0;
      const trackEnd = trackStart + track.buffer.duration;
      if (this.offset >= trackEnd) continue;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      const panner = this.context.createStereoPanner();
      source.buffer = track.buffer;
      source.connect(gain); gain.connect(panner); panner.connect(this.master);
      gain.gain.value = audible(track, this.tracks) ? track.volume : 0;
      panner.pan.value = track.pan;
      const delay = Math.max(0, trackStart - this.offset);
      const sourceOffset = Math.max(0, this.offset - trackStart);
      source.start(when + delay, sourceOffset);
      this.sources.push({ source, gain, panner, track });
    }
    if (this.metronome) this.startMetronome(when);
  }

  startMetronome(when) {
    const beat = 60 / this.tempo;
    this.nextBeat = Math.ceil(this.offset / beat) * beat;
    this.metronomeStart = when;
    this.fillMetronomeQueue();
    this.metronomeTimer = setInterval(() => this.fillMetronomeQueue(), 200);
  }

  fillMetronomeQueue() {
    if (!this.playing || !this.metronome) return;
    const beat = 60 / this.tempo;
    const projectNow = this.offset + Math.max(0, this.context.currentTime - this.metronomeStart);
    const horizon = Math.min(this.duration, projectNow + 2);
    while (this.nextBeat <= horizon) {
      const position = this.nextBeat;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = this.metronomeStart + position - this.offset;
      oscillator.frequency.value = Math.round(position / beat) % 4 === 0 ? 1320 : 880;
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
      oscillator.connect(gain); gain.connect(this.master);
      oscillator.start(start); oscillator.stop(start + 0.05);
      const click = { oscillator, gain };
      this.clicks.push(click);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect(); gain.disconnect();
        this.clicks = this.clicks.filter(candidate => candidate !== click);
      }, { once: true });
      this.nextBeat += beat;
    }
  }

  pause() {
    this.revision++;
    this.offset = this.position;
    this.playing = false;
    for (const { source, gain, panner } of this.sources) {
      try { source.stop(); } catch {}
      source.disconnect(); gain.disconnect(); panner.disconnect();
    }
    this.sources = [];
    if (this.metronomeTimer) clearInterval(this.metronomeTimer);
    this.metronomeTimer = null;
    for (const { oscillator, gain } of this.clicks) {
      try { oscillator.stop(); } catch {}
      oscillator.disconnect(); gain.disconnect();
    }
    this.clicks = [];
  }

  stop() { this.pause(); this.offset = 0; }

  async seek(position) {
    const wasPlaying = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(this.duration, position));
    if (wasPlaying && this.offset < this.duration) await this.play();
  }

  remove(id) {
    this.pause();
    const index = this.tracks.findIndex(track => track.id === id);
    if (index >= 0) this.tracks.splice(index, 1);
    this.offset = Math.min(this.offset, this.duration);
  }
}
