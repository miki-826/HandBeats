import type { CSSProperties } from 'react';
import type { Gesture } from '@/game/types';
import { NOTE_STYLE } from '@/game/config';
export function NoteIcon({ gesture, small = false }: { gesture: Gesture; small?: boolean }) {
  return (
    <span
      className={`note-icon ${gesture} ${small ? 'small' : ''}`}
      style={{ '--note-color': NOTE_STYLE[gesture].color } as CSSProperties}
    >
      <span aria-hidden="true">{NOTE_STYLE[gesture].icon}</span>
    </span>
  );
}
