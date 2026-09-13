import { createSynthHitSounds, type HitSoundBank } from './hitSounds';
import type { Gesture } from '@/game/types';
export class AudioEngine {
  readonly context: AudioContext;
  private music: GainNode;
  private effects: GainNode;
  private master: DynamicsCompressorNode;
  private sounds: HitSoundBank;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private startAt = 0;
  private pausedAt = 0;
  private running = false;
  constructor(musicVolume = 0.6, sfxVolume = 0.9) {
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.music = this.context.createGain();
    this.effects = this.context.createGain();
    this.master = this.context.createDynamicsCompressor();
    this.master.threshold.value = -4;
    this.master.knee.value = 3;
    this.master.ratio.value = 12;
    this.master.attack.value = 0.002;
    this.master.release.value = 0.12;
    this.music.connect(this.master);
    this.effects.connect(this.master);
    this.master.connect(this.context.destination);
    this.sounds = createSynthHitSounds(this.context, this.effects);
    this.setVolumes(musicVolume, sfxVolume);
  }
  async unlock() {
    await this.context.resume();
  }
  async load(url: string, signal?: AbortSignal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('音源を読み込めません。接続を確認して再試行してください。');
    this.buffer = await this.context.decodeAudioData(await response.arrayBuffer());
  }
  setVolumes(music: number, sfx: number) {
    this.music.gain.value = Math.max(0, Math.min(1, music));
    this.effects.gain.value = Math.max(0, Math.min(1, sfx)) * 1.25;
  }
  start(countdownSeconds = 3) {
    if (!this.buffer) throw new Error('音源が準備できていません。');
    if (this.context.state !== 'running')
      throw new Error('音声が停止しています。ボタンを押して音声を有効にしてください。');
    this.source?.stop();
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.music);
    this.startAt = this.context.currentTime + countdownSeconds - this.pausedAt / 1000;
    this.source.start(
      this.context.currentTime + countdownSeconds,
      Math.max(0, this.pausedAt / 1000),
    );
    this.running = true;
  }
  get timeMs() {
    return this.running ? (this.context.currentTime - this.startAt) * 1000 : this.pausedAt;
  }
  get durationMs() {
    return (this.buffer?.duration ?? 0) * 1000;
  }
  pause() {
    this.pausedAt = Math.max(0, this.timeMs);
    this.running = false;
    this.source?.stop();
    this.source = undefined;
  }
  hit(gesture: Gesture) {
    this.sounds.play(gesture);
  }
  async dispose() {
    this.running = false;
    this.source?.stop();
    this.source = undefined;
    this.sounds.dispose();
    await this.context.close();
  }
}
