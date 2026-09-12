export const GESTURES = ['fist', 'gun', 'open', 'clap'] as const;
export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Gesture = (typeof GESTURES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Judgement = 'perfect' | 'great' | 'good' | 'miss';
export interface Point {
  x: number;
  y: number;
}
export interface Note extends Point {
  id: string;
  timeMs: number;
  gesture: Gesture;
}
export interface Chart {
  songId: string;
  difficulty: Difficulty;
  chartVersion: number;
  level: number;
  durationMs: number;
  offsetMs: number;
  notes: Note[];
}
export interface Song {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  durationMs: number;
  audio: string;
  jacket: string;
  previewStartMs: number;
  color: string;
  mood: string;
  difficulties: Record<Difficulty, { level: number; chartVersion: number; noteCount: number }>;
}
export interface GestureEvent extends Point {
  gesture: Gesture;
  timestampMs: number;
  confidence: number;
  hand: 'left' | 'right' | 'both';
}
export interface JudgedEvent {
  noteId: string;
  gesture: Gesture;
  judgedAtMs: number;
  timingOffsetMs: number;
  judgement: Judgement;
  x: number;
  y: number;
}
export interface Result {
  score: number;
  accuracy: number;
  maxCombo: number;
  totalNotes: number;
  counts: Record<Judgement, number>;
}
export interface PlayResult extends Result {
  songId: string;
  difficulty: Difficulty;
  chartVersion: number;
  scoreVersion: number;
  events: JudgedEvent[];
  ranked: boolean;
  sessionId?: string;
  newRecord: boolean;
}
