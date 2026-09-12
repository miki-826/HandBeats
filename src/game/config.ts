import type { Difficulty, Gesture } from './types';
// Change SCORE_VERSION whenever timing windows, scoring, or position rules change.
export const SCORE_VERSION = 1;
export const NOTE_APPROACH_MS = 1300;
export const PERFECT_WINDOW_MS = 80;
export const GREAT_WINDOW_MS = 150;
export const GOOD_WINDOW_MS = 250;
export const POSITION_RADIUS: Record<Difficulty, number> = {
  easy: 0.18,
  normal: 0.145,
  hard: 0.12,
};
export const GESTURE_STABLE_FRAMES = 2;
export const CLAP_DISTANCE_THRESHOLD = 0.14;
export const CLAP_REARM_DISTANCE = 0.27;
export const CLAP_COOLDOWN_MS = 220;
export const NOTE_STYLE: Record<
  Gesture,
  { icon: string; label: string; sound: string; color: string; instruction: string }
> = {
  fist: { icon: '✊', label: 'FIST', sound: 'KICK', color: '#ff657e', instruction: 'グーをつくる' },
  gun: {
    icon: '👉',
    label: 'GUN',
    sound: 'SNARE',
    color: '#65a8ff',
    instruction: '親指と人差し指を伸ばす',
  },
  open: {
    icon: '✋',
    label: 'OPEN',
    sound: 'HI-HAT',
    color: '#87edb0',
    instruction: '手のひらをひらく',
  },
  clap: {
    icon: '👏',
    label: 'CLAP',
    sound: 'CLAP',
    color: '#ffb66f',
    instruction: '両手を離してから拍手',
  },
};
