import { mirrorPoint } from '@/game/coordinates';
import type { Gesture, GestureEvent, Point } from '@/game/types';
import { classifyGesture, palmCenter, type Landmark } from './gestureClassifier';
import { GestureStabilizer } from './gestureStabilizer';
import { ClapDetector } from './clapDetector';
export interface TrackedHand extends Point {
  gesture: Gesture | null;
  hand: 'left' | 'right';
}
type WorkerResult = {
  type: string;
  message?: string;
  landmarks: Landmark[][];
  worldLandmarks: Landmark[][];
  handedness: { categoryName: string; score: number }[][];
  timestamp: number;
};
export class HandTracker {
  private worker: Worker;
  private busy = false;
  private ready = false;
  private raf = 0;
  private stopped = false;
  private lastVideo = -1;
  private lastSent = 0;
  private stabilizers = { left: new GestureStabilizer(), right: new GestureStabilizer() };
  private clap = new ClapDetector();
  private lastSeen = { left: 0, right: 0 };
  hands: TrackedHand[] = [];
  constructor(
    private video: HTMLVideoElement,
    private mirrored: boolean,
    private input: (event: GestureEvent) => void,
    private fail: (message: string) => void,
  ) {
    this.worker = new Worker(new URL('./vision.worker.ts', import.meta.url));
  }
  async start() {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('手の認識モデルの読み込みがタイムアウトしました。')),
        30000,
      );
      this.worker.onerror = () => {
        clearTimeout(timeout);
        const message = '手の認識を起動できません。Chrome / Edgeの最新版で再試行してください。';
        if (this.ready) this.fail(message);
        else reject(new Error(message));
      };
      this.worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        const data = event.data;
        if (data.type === 'ready') {
          clearTimeout(timeout);
          this.ready = true;
          resolve();
        }
        if (data.type === 'error') {
          clearTimeout(timeout);
          this.busy = false;
          if (!this.ready) reject(new Error(`手の認識を準備できません: ${data.message}`));
          else this.fail(`手の認識が停止しました: ${data.message}`);
        }
        if (data.type === 'result') {
          this.busy = false;
          this.process(data);
        }
      };
      this.worker.postMessage({ type: 'init', origin: location.origin });
    });
    if (!this.stopped) this.loop();
  }
  private process(data: WorkerResult) {
    if (this.stopped) return;
    const now = data.timestamp;
    const events: GestureEvent[] = [];
    this.hands = data.landmarks.map((landmarks, i) => {
      const hand = data.handedness[i][0].categoryName === 'Left' ? 'left' : 'right';
      const point = mirrorPoint(palmCenter(landmarks), this.mirrored);
      const gesture = classifyGesture(data.worldLandmarks[i] ?? landmarks);
      this.lastSeen[hand] = now;
      const changed = this.stabilizers[hand].update(gesture);
      if (changed)
        events.push({
          ...point,
          gesture: changed,
          hand,
          timestampMs: now,
          confidence: data.handedness[i][0].score,
        });
      return { ...point, gesture, hand };
    });
    for (const hand of ['left', 'right'] as const)
      if (now - this.lastSeen[hand] > 200) this.stabilizers[hand].reset();
    const clap = this.clap.update(this.hands, now);
    if (clap)
      this.input({ ...clap, gesture: 'clap', hand: 'both', confidence: 1, timestampMs: now });
    else events.forEach(this.input);
  }
  private loop = () => {
    if (this.stopped) return;
    const now = performance.now();
    if (
      !this.busy &&
      this.video.readyState >= 2 &&
      this.video.currentTime !== this.lastVideo &&
      now - this.lastSent >= 33
    ) {
      this.busy = true;
      this.lastVideo = this.video.currentTime;
      this.lastSent = now;
      createImageBitmap(this.video)
        .then((bitmap) => {
          if (this.stopped) {
            bitmap.close();
            return;
          }
          this.worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
        })
        .catch(() => {
          this.busy = false;
          this.fail('カメラ映像を読み取れません。カメラ接続を確認してください。');
        });
    }
    this.raf = requestAnimationFrame(this.loop);
  };
  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.worker.terminate();
    this.hands = [];
  }
}
export async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('カメラにはHTTPSまたはlocalhostでのアクセスが必要です。');
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError')
      throw new Error(
        'カメラが許可されていません。ブラウザのカメラ設定で許可して、もう一度お試しください。',
      );
    if (name === 'NotFoundError')
      throw new Error('カメラが見つかりません。Webカメラを接続してください。');
    if (name === 'NotReadableError')
      throw new Error('カメラを開けません。他のアプリで使用していないか確認してください。');
    throw new Error('カメラの起動に失敗しました。接続を確認してください。');
  }
}
