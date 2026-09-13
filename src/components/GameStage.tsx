'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  LoaderCircle,
  Pause,
  Play,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import {
  GESTURES,
  type Chart,
  type Gesture,
  type GestureEvent,
  type PlayResult,
  type Song,
} from '@/game/types';
import { NOTE_STYLE, SCORE_VERSION } from '@/game/config';
import { containRect } from '@/game/coordinates';
import { GameEngine } from '@/game/engine';
import { drawFrame, type FieldRect } from '@/game/draw';
import { AudioEngine } from '@/lib/audio/audioEngine';
import { HandTracker, openCamera } from '@/mediapipe/handLandmarker';
import { authToken, rankingConfigured } from '@/lib/supabase/browser';
import { NoteIcon } from './NoteIcon';

export function GameStage({
  song,
  chart,
  musicVolume,
  sfxVolume,
  mirror,
  onExit,
  onResult,
}: {
  song: Song;
  chart: Chart;
  musicVolume: number;
  sfxVolume: number;
  mirror: boolean;
  onExit: () => void;
  onResult: (result: PlayResult) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    field = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioEngine | null>(null),
    tracker = useRef<HandTracker | null>(null),
    stream = useRef<MediaStream | null>(null),
    engine = useRef<GameEngine | undefined>(undefined);
  const phase = useRef<'check' | 'playing' | 'paused' | 'finished'>('check');
  const [screen, setScreen] = useState<'check' | 'playing' | 'paused'>('check');
  const [cameraState, setCameraState] = useState<'off' | 'loading' | 'ready'>('off'),
    [audioReady, setAudioReady] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<Gesture[]>([]),
    [handCount, setHandCount] = useState(0),
    [practice, setPractice] = useState(false),
    [practiceGesture, setPracticeGesture] = useState<Gesture>('fist');
  const practiceRef = useRef(false),
    practiceGestureRef = useRef<Gesture>('fist'),
    ranked = useRef(false),
    sessionId = useRef<string | undefined>(undefined),
    alive = useRef(true),
    cameraOpening = useRef(false);
  const [onlineMessage, setOnlineMessage] = useState(''),
    [hud, setHud] = useState({ score: 0, combo: 0, time: -3000 });
  const rect = useRef<FieldRect>({ x: 0, y: 0, width: 1280, height: 720 }),
    pointer = useRef({ x: 0.5, y: 0.5 });
  const feedback = useRef<Parameters<typeof drawFrame>[5]>([]),
    finish = useRef(onResult);
  useEffect(() => {
    finish.current = onResult;
  }, [onResult]);
  const input = useCallback((event: GestureEvent) => {
    if (phase.current === 'check') {
      setSeen((previous) =>
        previous.includes(event.gesture) ? previous : [...previous, event.gesture],
      );
      return;
    }
    if (phase.current !== 'playing' || !audio.current || !engine.current) return;
    // Capture timestamp is performance.now(); subtract inference latency from audio time.
    const time = audio.current.timeMs - Math.max(0, performance.now() - event.timestampMs);
    const hit = engine.current.input({ ...event, timestampMs: time });
    if (hit) {
      if (hit.judgement !== 'miss') audio.current.hit(hit.gesture);
      feedback.current.push({ event: hit, at: audio.current.timeMs });
    }
  }, []);
  const pause = useCallback(() => {
    if (phase.current !== 'playing') return;
    audio.current?.pause();
    phase.current = 'paused';
    ranked.current = false;
    setScreen('paused');
  }, []);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const sound = new AudioEngine(musicVolume, sfxVolume);
    audio.current = sound;
    sound
      .load(song.audio, controller.signal)
      .then(() => {
        if (alive.current) setAudioReady(true);
      })
      .catch((e) => {
        if (alive.current && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : '音源を読み込めません。');
      });
    sound.context.onstatechange = () => {
      if (sound.context.state === 'suspended' && phase.current === 'playing') pause();
    };
    return () => {
      alive.current = false;
      controller.abort();
      tracker.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      void sound.dispose();
      audio.current = null;
    };
  }, [song.audio, musicVolume, sfxVolume, pause]);
  useEffect(() => {
    let raf = 0,
      lastHud = 0;
    const tick = () => {
      if (!canvas.current || !field.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const box = field.current.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio, 2),
        ctx = canvas.current.getContext('2d');
      if (!ctx) return;
      if (
        canvas.current.width !== Math.round(box.width * dpr) ||
        canvas.current.height !== Math.round(box.height * dpr)
      ) {
        canvas.current.width = Math.round(box.width * dpr);
        canvas.current.height = Math.round(box.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rect.current = containRect(
        box.width,
        box.height,
        video.current?.videoWidth || 1280,
        video.current?.videoHeight || 720,
      );
      const time = audio.current?.timeMs ?? 0;
      if (phase.current === 'playing' && engine.current) {
        engine.current.advance(time).forEach((event) => feedback.current.push({ event, at: time }));
        if (time >= chart.durationMs + 300) {
          phase.current = 'finished';
          audio.current?.pause();
          tracker.current?.stop();
          stream.current?.getTracks().forEach((t) => t.stop());
          finish.current({
            ...engine.current.result,
            songId: song.id,
            difficulty: chart.difficulty,
            chartVersion: chart.chartVersion,
            scoreVersion: SCORE_VERSION,
            events: engine.current.events,
            ranked: ranked.current,
            sessionId: sessionId.current,
            newRecord: false,
          });
          return;
        }
      }
      feedback.current = feedback.current.filter((f) => time - f.at < 700);
      drawFrame(
        ctx,
        rect.current,
        engine.current,
        time,
        tracker.current?.hands ?? [],
        feedback.current,
        practiceRef.current ? pointer.current : undefined,
      );
      if (performance.now() - lastHud > 90) {
        lastHud = performance.now();
        setHandCount(tracker.current?.hands.length ?? 0);
        if (engine.current)
          setHud({ score: engine.current.result.score, combo: engine.current.combo, time });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chart, song.id]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) pause();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        pause();
        return;
      }
      if (!practiceRef.current || phase.current !== 'playing' || event.repeat) return;
      const gesture = ({ f: 'fist', g: 'gun', o: 'open' } as Record<string, Gesture>)[
        event.key.toLowerCase()
      ];
      if (gesture) {
        event.preventDefault();
        input({
          ...pointer.current,
          gesture,
          timestampMs: performance.now(),
          confidence: 1,
          hand: 'right',
        });
      }
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', key);
    };
  }, [pause, input]);
  async function enableCamera() {
    if (cameraOpening.current) return;
    cameraOpening.current = true;
    setError('');
    setCameraState('loading');
    try {
      await audio.current?.unlock();
      const nextStream = await openCamera();
      if (!alive.current) {
        nextStream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = nextStream;
      if (!video.current) throw new Error('カメラ画面を準備できません。');
      video.current.srcObject = nextStream;
      await video.current.play();
      const nextTracker = new HandTracker(video.current, mirror, input, (message) => {
        setError(message);
        pause();
      });
      tracker.current = nextTracker;
      await nextTracker.start();
      if (!alive.current) {
        nextTracker.stop();
        return;
      }
      setCameraState('ready');
      nextStream.getVideoTracks()[0].onended = () => {
        setError('カメラの接続が切れました。曲選択に戻り、再接続してください。');
        pause();
      };
    } catch (e) {
      tracker.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (alive.current) {
        setError(e instanceof Error ? e.message : 'カメラを開始できません。');
        setCameraState('off');
      }
    } finally {
      cameraOpening.current = false;
    }
  }
  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await audio.current?.unlock();
      if (!practiceRef.current && rankingConfigured) {
        try {
          const token = await authToken();
          const response = await fetch('/api/play-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              songId: song.id,
              difficulty: chart.difficulty,
              chartVersion: chart.chartVersion,
              scoreVersion: SCORE_VERSION,
            }),
            signal: AbortSignal.timeout(8000),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          sessionId.current = data.playSessionId;
          ranked.current = true;
        } catch (e) {
          ranked.current = false;
          setOnlineMessage(
            `${e instanceof Error ? e.message : '通信に失敗しました。'} ローカル記録でプレイします。`,
          );
        }
      }
      if (!alive.current) return;
      engine.current = new GameEngine(chart);
      audio.current?.start(3);
      phase.current = 'playing';
      setScreen('playing');
    } catch (e) {
      setError(e instanceof Error ? e.message : '音声を開始できません。');
    } finally {
      setBusy(false);
    }
  }
  async function resume() {
    try {
      await audio.current?.unlock();
      audio.current?.start(2);
      phase.current = 'playing';
      setScreen('playing');
    } catch (e) {
      setError(e instanceof Error ? e.message : '再開できません。');
    }
  }
  function enablePractice() {
    setPractice(true);
    practiceRef.current = true;
    setSeen([...GESTURES]);
    tracker.current?.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    setError('');
  }
  return (
    <div className={`game-shell ${screen === 'check' ? 'checking' : ''}`}>
      <header className="game-header">
        <button className="icon-button" onClick={onExit} aria-label="曲選択へ戻る">
          <ArrowLeft size={20} />
        </button>
        <div className="game-song">
          <b>{song.title}</b>
          <span>
            {chart.difficulty.toUpperCase()} / LV.{chart.level}
          </span>
        </div>
        <div className="game-score">
          <small>SCORE / LIVE SESSION</small>
          <b>{hud.score.toLocaleString().padStart(7, '0')}</b>
        </div>
        <button
          className="icon-button"
          onClick={pause}
          disabled={screen !== 'playing'}
          aria-label="一時停止"
        >
          <Pause size={20} />
        </button>
      </header>
      <div className="game-progress">
        <i style={{ width: `${Math.max(0, (hud.time / chart.durationMs) * 100)}%` }} />
      </div>
      <div
        className="camera-field"
        ref={field}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect(),
            r = rect.current;
          pointer.current = {
            x: Math.max(0, Math.min(1, (e.clientX - box.left - r.x) / r.width)),
            y: Math.max(0, Math.min(1, (e.clientY - box.top - r.y) / r.height)),
          };
        }}
        onPointerDown={() => {
          if (practiceRef.current)
            input({
              ...pointer.current,
              gesture: practiceGestureRef.current,
              timestampMs: performance.now(),
              confidence: 1,
              hand: 'right',
            });
        }}
      >
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          style={{ transform: mirror ? 'scaleX(-1)' : 'none' }}
          aria-label="カメラ映像"
        />
        <canvas ref={canvas} aria-label="ノーツと判定サークル" />
        {screen === 'playing' && hud.combo > 1 && (
          <div className="combo-display">
            <b>{hud.combo}</b>
            <span>COMBO</span>
          </div>
        )}
        {screen === 'playing' && hud.time < 0 && (
          <div className="countdown">{Math.ceil(-hud.time / 1000) || 'GO'}</div>
        )}
        {screen === 'playing' && onlineMessage && hud.time < 4000 && (
          <div className="game-notice">{onlineMessage}</div>
        )}
        {screen === 'check' && (
          <div className="camera-check">
            <div className="camera-check-heading">
              <span className="eyebrow">GET READY</span>
              <h1>手をかざして、準備しよう。</h1>
              <p>カメラから1〜2m離れて、両手が映る位置に。</p>
            </div>
            <div className="camera-window-status">
              {cameraState === 'ready' ? (
                <span className="status-pill">
                  <i />
                  {handCount} HANDS DETECTED
                </span>
              ) : practice ? (
                <span className="status-pill">操作体験モード</span>
              ) : (
                <>
                  <Camera size={42} />
                  <span>YOUR STAGE IS HERE</span>
                  <button
                    className="button primary"
                    onClick={() => void enableCamera()}
                    disabled={cameraState === 'loading'}
                  >
                    {cameraState === 'loading' ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <Camera size={18} />
                    )}{' '}
                    {cameraState === 'loading' ? 'カメラと手の認識を準備中…' : 'カメラを有効にする'}
                  </button>
                </>
              )}
            </div>
            <div className="gesture-checks">
              {GESTURES.map((g) => (
                <div key={g} className={seen.includes(g) ? 'checked' : ''}>
                  <NoteIcon gesture={g} />
                  <div>
                    <b>{NOTE_STYLE[g].label}</b>
                    <small>{NOTE_STYLE[g].instruction}</small>
                  </div>
                  {seen.includes(g) ? <Check size={18} /> : <span className="check-empty" />}
                </div>
              ))}
            </div>
            <p className="privacy-line">
              <ShieldCheck size={15} /> カメラ映像はブラウザ内で処理し、サーバーへ送信しません。
            </p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="check-actions">
              <button className="text-button" onClick={onExit}>
                曲選択に戻る
              </button>
              <button
                className="button primary"
                disabled={(!practice && cameraState !== 'ready') || !audioReady || busy}
                onClick={() => void start()}
              >
                {busy || !audioReady ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Play size={18} />
                )}{' '}
                {!audioReady
                  ? '音源を準備中…'
                  : seen.length === GESTURES.length
                    ? 'READY — プレイ開始'
                    : 'チェックをスキップして開始'}
              </button>
            </div>
            {!practice && (
              <button
                className="practice-link"
                disabled={cameraState === 'loading'}
                onClick={enablePractice}
              >
                カメラなしで操作を試す（ランキング対象外）
              </button>
            )}
            {practice && (
              <p className="muted">ノーツにカーソルを重ね、F / G / O キーを押すと判定できます。</p>
            )}
          </div>
        )}
        {screen === 'paused' && (
          <div className="pause-overlay">
            <span className="eyebrow">TAKE A BREATH</span>
            <h1>PAUSED</h1>
            <p>一時停止したプレイはランキング対象外です。</p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" onClick={() => void resume()}>
              <Play size={18} /> 再開する
            </button>
            <button className="text-button" onClick={onExit}>
              曲選択へ戻る
            </button>
          </div>
        )}
      </div>
      <footer className="game-footer">
        <span>
          <span className={`live-dot ${practice ? 'practice' : ''}`} />
          {practice
            ? 'PRACTICE · ランキング対象外'
            : `${handCount} HANDS · ${mirror ? 'MIRROR ON' : 'MIRROR OFF'}`}
        </span>
        {practice && screen !== 'check' ? (
          <div className="practice-controls">
            {GESTURES.map((g) => (
              <button
                key={g}
                className={practiceGesture === g ? 'active' : ''}
                onClick={() => {
                  setPracticeGesture(g);
                  practiceGestureRef.current = g;
                }}
              >
                {NOTE_STYLE[g].icon} {g[0].toUpperCase()}
              </button>
            ))}
          </div>
        ) : (
          <span>
            {screen === 'check'
              ? '3つのジェスチャーを確認しよう'
              : '円が重なる瞬間に、手の形を変えよう'}
          </span>
        )}
        <span>
          <Volume2 size={14} /> MUSIC {Math.round(musicVolume * 100)}% · DRUM{' '}
          {Math.round(sfxVolume * 100)}%
        </span>
      </footer>
    </div>
  );
}
