import type { Gesture } from '@/game/types';
export interface HitSoundBank {
  play(gesture: Gesture, at?: number): void;
  dispose(): void;
}
// Replace this factory with a decoded WAV bank implementing HitSoundBank.
export function createSynthHitSounds(context: AudioContext, destination: AudioNode): HitSoundBank {
  const noise = context.createBuffer(1, context.sampleRate * 0.3, context.sampleRate);
  const data = noise.getChannelData(0);
  // Deterministic noise; unrelated to chart data.
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  const voices = new Set<AudioScheduledSourceNode>();
  function tone(at: number, freq: number, end: number, duration: number, volume: number) {
    const osc = context.createOscillator(),
      gain = context.createGain();
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(end, at + duration);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    osc.connect(gain).connect(destination);
    voices.add(osc);
    osc.onended = () => {
      voices.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(at);
    osc.stop(at + duration);
  }
  function hiss(at: number, frequency: number, duration: number, volume: number, clap = false) {
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    source.buffer = noise;
    filter.type = clap ? 'bandpass' : 'highpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(volume, at);
    if (clap)
      for (const t of [0.012, 0.024]) {
        gain.gain.setValueAtTime(0.01, at + t - 0.004);
        gain.gain.setValueAtTime(volume, at + t);
      }
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    source.connect(filter).connect(gain).connect(destination);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(at);
    source.stop(at + duration);
  }
  return {
    play(gesture, at = context.currentTime) {
      if (gesture === 'fist') tone(at, 145, 42, 0.18, 0.8);
      if (gesture === 'gun') {
        tone(at, 190, 85, 0.09, 0.18);
        hiss(at, 1400, 0.12, 0.45);
      }
      if (gesture === 'open') hiss(at, 7200, 0.055, 0.3);
      if (gesture === 'clap') hiss(at, 1700, 0.16, 0.7, true);
    },
    dispose() {
      for (const voice of voices) {
        try {
          voice.stop();
        } catch {
          /* Already ended. */
        }
      }
      voices.clear();
    },
  };
}
