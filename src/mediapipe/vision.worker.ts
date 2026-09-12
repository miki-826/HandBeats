import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
let landmarker: HandLandmarker | undefined;
self.onmessage = async (
  event: MessageEvent<{
    type: 'init' | 'frame';
    origin?: string;
    bitmap?: ImageBitmap;
    timestamp?: number;
  }>,
) => {
  const { type, origin, bitmap, timestamp } = event.data;
  try {
    if (type === 'init') {
      const files = await FilesetResolver.forVisionTasks(`${origin}/mediapipe/wasm`);
      landmarker = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${origin}/mediapipe/hand_landmarker.task`,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });
      self.postMessage({ type: 'ready' });
    } else if (bitmap && landmarker && timestamp !== undefined) {
      const result = landmarker.detectForVideo(bitmap, timestamp);
      self.postMessage({
        type: 'result',
        landmarks: result.landmarks,
        worldLandmarks: result.worldLandmarks,
        handedness: result.handedness,
        timestamp,
      });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : '認識処理に失敗しました。',
    });
  } finally {
    bitmap?.close();
  }
};
