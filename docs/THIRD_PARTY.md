# Third-party components

- Next.js, React, Lucide, Supabase JS, Zod and other dependencies retain their upstream licenses in their npm packages; exact versions are pinned in `package-lock.json`.
- MediaPipe Tasks Vision is from the official `@mediapipe/tasks-vision` package (Apache-2.0). WASM files are copied locally by `scripts/sync-vision.mjs` on installation; no camera frames leave the browser.
- Hand Landmarker float16 model version 1 is downloaded from Google: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task . Model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker . Keep the model under `public/mediapipe/hand_landmarker.task`.
- Google Fonts serves Noto Sans JP and Barlow Condensed (SIL Open Font License). Standard system fonts are used if the font request is unavailable. Only font requests, never camera frames, are made to Google Fonts.
- Note hand glyphs use the device's standard emoji font. The SVG-style outlines and jacket fallback artwork are project-authored CSS / Canvas, not downloaded image assets.
- `ffmpeg-static` is a development-only audio preparation tool. The application does not distribute its executable in browser bundles. Preserve its upstream GPL terms if distributing that executable separately.
- The four original songs are user-supplied under `資料/music/`. No external songs, percussion samples, or jacket images were downloaded. Original files are unmodified; publishing rights for those songs remain with their supplier.
