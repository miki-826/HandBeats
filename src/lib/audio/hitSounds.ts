import type { Gesture } from '@/game/types';
export interface HitSoundBank {
  play(gesture: Gesture, at?: number): void;
  dispose(): void;
}

// Render once; each hit starts a new voice immediately and lets earlier tails ring.
export function createSynthHitSounds(
  context: BaseAudioContext,
  destination: AudioNode,
): HitSoundBank {
  const buffers = {} as Record<Gesture, AudioBuffer>;
  const durations = { fist: 0.34, gun: 0.24, open: 0.15 };
  for (const gesture of ['fist', 'gun', 'open'] as const) {
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * durations[gesture]),
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let seed = 1234567,
      previousNoise = 0,
      phase = 0,
      peak = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / context.sampleRate;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = (seed / 4294967296) * 2 - 1;
      const brightNoise = (noise - previousNoise) * 0.5;
      previousNoise = noise;
      let sample: number;
      if (gesture === 'fist') {
        phase += (2 * Math.PI * (52 + 125 * Math.exp(-t * 55))) / context.sampleRate;
        sample =
          Math.sin(phase) * Math.exp(-t * 13) +
          0.28 * Math.sin(phase * 2) * Math.exp(-t * 28) +
          0.22 * brightNoise * Math.exp(-t * 180);
      } else if (gesture === 'gun') {
        sample =
          0.72 * brightNoise * Math.exp(-t * 23) +
          0.48 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 30) +
          0.24 * Math.sin(2 * Math.PI * 330 * t) * Math.exp(-t * 42);
      } else {
        // Closed hat with metallic body, audible even through laptop speakers.
        const metal = Math.sin(2 * Math.PI * 3190 * t) * Math.sin(2 * Math.PI * 5270 * t);
        sample = (0.75 * brightNoise + 0.25 * metal) * Math.exp(-t * 38);
      }
      const attack = Math.min(1, t / 0.001);
      const release = Math.min(1, (data.length - 1 - i) / (context.sampleRate * 0.012));
      data[i] = Math.tanh(sample * 1.8) * attack * release;
      peak = Math.max(peak, Math.abs(data[i]));
    }
    const level = gesture === 'open' ? 0.85 : 0.98;
    for (let i = 0; i < data.length; i++) data[i] *= level / Math.max(peak, 0.001);
    buffers[gesture] = buffer;
  }
  const voices = new Set<AudioBufferSourceNode>();
  let disposed = false;
  return {
    play(gesture, at = context.currentTime) {
      if (disposed) return;
      const source = context.createBufferSource();
      source.buffer = buffers[gesture];
      source.connect(destination);
      voices.add(source);
      source.onended = () => {
        voices.delete(source);
        source.disconnect();
      };
      source.start(Math.max(at, context.currentTime));
    },
    dispose() {
      disposed = true;
      for (const voice of voices) {
        voice.stop();
        voice.disconnect();
      }
      voices.clear();
    },
  };
}
