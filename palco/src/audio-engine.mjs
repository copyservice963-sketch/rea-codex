export function audible(track, tracks) {
  return !track.muted && (!tracks.some(item => item.solo) || track.solo);
}

export class AudioEngine {
  constructor(context) {
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);
    this.tracks = [];
    this.sources = [];
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
    this.revision = 0;
    this.masterVolume = 0.8;
    this.master.gain.value = this.masterVolume;
  }
  get duration() { return Math.max(0, ...this.tracks.map(t => t.buffer.duration)); }
  get position() {
    return Math.min(this.duration, this.playing
      ? this.offset + Math.max(0, this.context.currentTime - this.startedAt) : this.offset);
  }
  add(buffer, name) {
    const track = { id: crypto.randomUUID(), name, buffer, volume: 1, muted: false, solo: false };
    this.tracks.push(track);
    return track;
  }
  updateMix(immediate = false) {
    for (const { track, gain } of this.sources) {
      const level = audible(track, this.tracks) ? track.volume : 0;
      gain.gain.cancelScheduledValues(this.context.currentTime);
      if (immediate) gain.gain.value = level;
      else gain.gain.setTargetAtTime(level, this.context.currentTime, 0.008);
    }
  }
  setMaster(value) {
    this.masterVolume = value;
    this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.008);
  }
  async play() {
    if (this.playing || !this.tracks.length) return;
    const revision = this.revision;
    await this.context.resume();
    if (revision !== this.revision) return;
    if (this.offset >= this.duration) this.offset = 0;
    this.schedule(this.context.currentTime + 0.06);
  }
  // One AudioContext timestamp and one offset for every track. Never use separate media players.
  schedule(when) {
    if (this.playing) return;
    this.startedAt = when;
    this.playing = true;
    for (const track of this.tracks) {
      if (this.offset >= track.buffer.duration) continue;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = track.buffer;
      source.connect(gain); gain.connect(this.master);
      gain.gain.value = audible(track, this.tracks) ? track.volume : 0;
      source.start(when, this.offset);
      this.sources.push({ source, gain, track });
    }
  }
  pause() {
    this.revision++;
    this.offset = this.position;
    this.playing = false;
    for (const { source, gain } of this.sources) {
      source.stop(); source.disconnect(); gain.disconnect();
    }
    this.sources = [];
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
    this.tracks = this.tracks.filter(t => t.id !== id);
    this.offset = Math.min(this.offset, this.duration);
  }
}
