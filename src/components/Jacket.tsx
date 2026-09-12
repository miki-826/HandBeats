'use client';
import { useState, type CSSProperties } from 'react';
import type { Song } from '@/game/types';
export function Jacket({ song, large = false }: { song: Song; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`jacket jacket-${song.id} ${large ? 'large' : ''}`}
      style={{ '--jacket-color': song.color } as CSSProperties}
    >
      {!failed && song.jacket && (
        <img src={song.jacket} alt={`${song.title} ジャケット`} onError={() => setFailed(true)} />
      )}
      <div className="jacket-art" aria-hidden="true">
        <div className="art-disc" />
        <div className="art-line line-one" />
        <div className="art-line line-two" />
        <div className="art-line line-three" />
        <span className="art-number">{song.id.slice(-2)}</span>
        <span className="art-edition">
          HAND BEAT
          <br />
          ORIGINAL SOUND
        </span>
        <span className="art-caption">
          {['MORNING STEPS', 'FULL BLOOM', 'TAKE IT SLOW', 'THIS IS ME'][
            Number(song.id.slice(-2)) - 1
          ] ?? 'ORIGINAL'}
        </span>
      </div>
    </div>
  );
}
