import { NOTE_APPROACH_MS, NOTE_STYLE } from './config';
import type { GameEngine } from './engine';
import type { JudgedEvent, Point } from './types';
import type { TrackedHand } from '@/mediapipe/handLandmarker';
export interface FieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  rect: FieldRect,
  engine: GameEngine | undefined,
  time: number,
  hands: TrackedHand[],
  feedback: { event: JudgedEvent; at: number }[],
  pointer?: Point,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const { x: ox, y: oy, width: w, height: h } = rect;
  const radius = Math.max(25, Math.min(42, w * 0.036));
  if (engine)
    for (const note of engine.chart.notes) {
      if (engine.judged.has(note.id)) continue;
      const until = note.timeMs + engine.chart.offsetMs - time;
      if (until > NOTE_APPROACH_MS || until < -250) continue;
      const x = ox + note.x * w,
        y = oy + note.y * h,
        style = NOTE_STYLE[note.gesture];
      const approach = 1 + Math.max(0, until / NOTE_APPROACH_MS) * 1.5;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (NOTE_APPROACH_MS - until) / 120);
      ctx.strokeStyle = style.color;
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.2 * approach, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha *= 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#071631ed';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (note.gesture === 'fist')
        ctx.roundRect(x - radius, y - radius, radius * 2, radius * 2, 12);
      else if (note.gesture === 'gun') {
        ctx.moveTo(x, y - radius * 1.14);
        ctx.lineTo(x + radius * 1.14, y);
        ctx.lineTo(x, y + radius * 1.14);
        ctx.lineTo(x - radius * 1.14, y);
        ctx.closePath();
      } else ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${radius * 0.95}px "Segoe UI Emoji",sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(style.icon, x, y - 2);
      ctx.font = '700 10px Arial';
      ctx.fillStyle = style.color;
      ctx.fillText(style.label, x, y + radius + 17);
      ctx.restore();
    }
  for (const hand of hands) {
    const x = ox + hand.x * w,
      y = oy + hand.y * h;
    ctx.strokeStyle = hand.gesture ? NOTE_STYLE[hand.gesture].color : '#c4edff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 10px Arial';
    ctx.textAlign = 'center';
    if (hand.gesture) ctx.fillText(NOTE_STYLE[hand.gesture].label, x, y + 29);
  }
  if (pointer) {
    ctx.strokeStyle = '#b5ecff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox + pointer.x * w, oy + pointer.y * h, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const { event, at } of feedback) {
    const age = time - at;
    if (age > 650 || age < 0) continue;
    ctx.save();
    ctx.globalAlpha = 1 - age / 650;
    ctx.textAlign = 'center';
    ctx.font = '800 20px Arial';
    ctx.fillStyle = event.judgement === 'miss' ? '#ffa3d1' : '#d6f5ff';
    ctx.shadowColor = event.judgement === 'miss' ? '#b94274' : '#63baff';
    ctx.shadowBlur = 12;
    ctx.fillText(
      event.judgement.toUpperCase(),
      ox + event.x * w,
      oy + event.y * h - 50 - age * 0.025,
    );
    if (event.judgement !== 'miss') {
      const x = ox + event.x * w,
        y = oy + event.y * h;
      ctx.strokeStyle = NOTE_STYLE[event.gesture].color;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 18 * (1 - age / 650);
      ctx.lineWidth = event.judgement === 'perfect' ? 4 : 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + age * 0.09, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI * 2) / 10;
        const distance = radius + 9 + age * 0.13;
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance,
          Math.max(0.5, 3 * (1 - age / 650)),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
