'use client';
import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { GESTURES, type Gesture } from '@/game/types';
import { NOTE_STYLE } from '@/game/config';
import { AudioEngine } from '@/lib/audio/audioEngine';

export function DrumPreview({ volume }: { volume: number }) {
  const audio = useRef<AudioEngine | null>(null);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      void audio.current?.dispose();
      audio.current = null;
    },
    [],
  );
  async function play(gesture: Gesture) {
    try {
      const engine = (audio.current ??= new AudioEngine(0, volume));
      engine.setVolumes(0, volume);
      await engine.unlock();
      if (audio.current === engine) engine.hit(gesture);
      setError('');
    } catch {
      setError('試聴を開始できません。もう一度ボタンを押してください。');
    }
  }
  return (
    <div className="drum-preview">
      <span>
        <Volume2 size={14} /> ドラム音を試す
      </span>
      <div>
        {GESTURES.map((gesture) => (
          <button
            type="button"
            key={gesture}
            aria-label={`${NOTE_STYLE[gesture].sound}を試聴`}
            onClick={() => void play(gesture)}
          >
            <span>{NOTE_STYLE[gesture].icon}</span> {NOTE_STYLE[gesture].sound}
          </button>
        ))}
      </div>
      {volume === 0 && <small>ヒット音はミュート中です。音量を上げると試聴できます。</small>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
