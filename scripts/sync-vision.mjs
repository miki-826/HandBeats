import { cpSync, existsSync, mkdirSync } from 'node:fs';
const source = 'node_modules/@mediapipe/tasks-vision/wasm';
if (existsSync(source)) {
  mkdirSync('public/mediapipe/wasm', { recursive: true });
  cpSync(source, 'public/mediapipe/wasm', { recursive: true });
}
