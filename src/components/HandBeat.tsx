'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Disc3,
  Headphones,
  LoaderCircle,
  Music2,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import {
  DIFFICULTIES,
  GESTURES,
  type Chart,
  type Difficulty,
  type PlayResult,
  type Song,
} from '@/game/types';
import { NOTE_STYLE, SCORE_VERSION } from '@/game/config';
import { rankingKey, type RankingEntry } from '@/lib/ranking';
import { authToken, rankingConfigured } from '@/lib/supabase/browser';
import { Jacket } from './Jacket';
import { NoteIcon } from './NoteIcon';
import { GameStage } from './GameStage';
import { DrumPreview } from './DrumPreview';

type Screen = 'title' | 'menu' | 'game' | 'result' | 'ranking';
interface Settings {
  music: number;
  sfx: number;
  mirror: boolean;
}
const duration = (ms: number) =>
  `${Math.floor(Math.round(ms / 1000) / 60)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;
const count = (n: number) => n.toLocaleString('en-US');
export function HandBeat({
  songs,
  charts,
}: {
  songs: Song[];
  charts: Record<string, Record<string, Chart>>;
}) {
  const [screen, setScreen] = useState<Screen>('title'),
    [selected, setSelected] = useState(songs[0].id),
    [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [modal, setModal] = useState<'help' | 'settings' | null>(null),
    [settings, setSettings] = useState<Settings>({ music: 0.6, sfx: 0.9, mirror: true });
  const [best, setBest] = useState<Record<string, number>>({}),
    [result, setResult] = useState<PlayResult | null>(null),
    [run, setRun] = useState(0);
  const [ranking, setRanking] = useState<RankingEntry[]>([]),
    [rankingState, setRankingState] = useState<'loading' | 'ready' | 'offline' | 'error'>(
      'loading',
    ),
    [rankingError, setRankingError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const [name, setName] = useState(''),
    [worldRank, setWorldRank] = useState<number | null>(null),
    [submitState, setSubmitState] = useState<'idle' | 'sending' | 'sent'>('idle'),
    [submitMessage, setSubmitMessage] = useState('');
  const [previewing, setPreviewing] = useState(false),
    [previewError, setPreviewError] = useState('');
  const preview = useRef<HTMLAudioElement | null>(null),
    previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    previewGeneration = useRef(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const song = songs.find((s) => s.id === selected) ?? songs[0],
    chart = charts[song.id][difficulty];
  const key = rankingKey(song.id, difficulty, chart.chartVersion);
  // Hydrate browser-only storage after the server-rendered initial screen.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('handbeat-settings') ?? 'null');
      if (
        saved &&
        typeof saved.music === 'number' &&
        typeof saved.sfx === 'number' &&
        typeof saved.mirror === 'boolean'
      )
        setSettings({
          music: Math.max(0, Math.min(1, saved.music)),
          sfx: Math.max(0, Math.min(1, saved.sfx)),
          mirror: saved.mirror,
        });
      const stored = JSON.parse(localStorage.getItem('handbeat-best') ?? '{}');
      if (stored && typeof stored === 'object')
        setBest(
          Object.fromEntries(
            Object.entries(stored).filter(
              ([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
            ),
          ) as Record<string, number>,
        );
      setName(localStorage.getItem('handbeat-name') ?? '');
    } catch {
      setSubmitMessage('ブラウザの保存領域を読み込めません。このタブ内ではプレイできます。');
    }
  }, []);
  useEffect(() => {
    if (screen === 'title' || screen === 'game') return;
    const controller = new AbortController();
    setRankingState('loading');
    setRanking([]);
    fetch(
      `/api/ranking?songId=${song.id}&difficulty=${difficulty}&chartVersion=${chart.chartVersion}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setRanking(data.entries);
        setRankingState(data.configured ? 'ready' : 'offline');
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setRankingState('error');
          setRankingError(e instanceof Error ? e.message : 'ランキングを取得できません。');
        }
      });
    return () => controller.abort();
  }, [song.id, difficulty, chart.chartVersion, screen, refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null);
      if (e.key === 'Tab') {
        const controls = modalRef.current?.querySelectorAll<HTMLElement>(
          'button,input,[tabindex="0"]',
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === modalRef.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => {
      window.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, [modal]);
  useEffect(
    () => () => {
      preview.current?.pause();
      if (previewTimer.current) clearTimeout(previewTimer.current);
    },
    [],
  );
  function stopPreview() {
    previewGeneration.current++;
    preview.current?.pause();
    preview.current = null;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreviewing(false);
  }
  function navigate(next: Screen) {
    stopPreview();
    setScreen(next);
    window.scrollTo(0, 0);
  }
  function play() {
    setRun((r) => r + 1);
    navigate('game');
  }
  async function togglePreview() {
    if (previewing) {
      stopPreview();
      return;
    }
    stopPreview();
    const generation = previewGeneration.current;
    setPreviewError('');
    const element = new Audio(song.audio);
    preview.current = element;
    element.volume = settings.music;
    element.currentTime = song.previewStartMs / 1000;
    try {
      await element.play();
      if (generation !== previewGeneration.current) {
        element.pause();
        return;
      }
      setPreviewing(true);
      previewTimer.current = setTimeout(stopPreview, 15000);
    } catch {
      if (generation === previewGeneration.current)
        setPreviewError('プレビューを再生できません。もう一度お試しください。');
    }
  }
  function finish(next: PlayResult) {
    setSubmitMessage('');
    setWorldRank(null);
    const resultKey =
      rankingKey(next.songId, next.difficulty, next.chartVersion) + (next.ranked ? '' : ':local');
    next.newRecord = next.score > (best[resultKey] ?? 0);
    const updated = { ...best, [resultKey]: Math.max(next.score, best[resultKey] ?? 0) };
    setBest(updated);
    try {
      localStorage.setItem('handbeat-best', JSON.stringify(updated));
    } catch {
      setSubmitMessage('自己ベストを保存できませんでした。');
    }
    setResult(next);
    setSubmitState('idle');
    navigate('result');
  }
  function updateSettings(next: Settings) {
    setSettings(next);
    try {
      localStorage.setItem('handbeat-settings', JSON.stringify(next));
    } catch {
      setSubmitMessage('設定はこのタブ内にのみ保持されます。');
    }
  }
  async function submit() {
    if (!result?.sessionId || !result.ranked) return;
    setSubmitState('sending');
    setSubmitMessage('');
    try {
      const token = await authToken();
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          playSessionId: result.sessionId,
          songId: result.songId,
          difficulty: result.difficulty,
          chartVersion: result.chartVersion,
          scoreVersion: result.scoreVersion,
          events: result.events,
          displayName: name.trim(),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSubmitState('sent');
      setWorldRank(typeof data.worldRank === 'number' ? data.worldRank : null);
      setSubmitMessage('ランキングに登録しました。');
      setRefresh((v) => v + 1);
      try {
        localStorage.setItem('handbeat-name', name.trim());
      } catch {
        /* Registration already succeeded; name is optional local convenience. */
      }
    } catch (e) {
      setSubmitState('idle');
      setSubmitMessage(
        e instanceof Error ? e.message : '送信に失敗しました。接続を確認して再試行してください。',
      );
    }
  }
  const record = ranking[0];
  const worldText =
    rankingState === 'loading'
      ? '読み込み中…'
      : rankingState === 'offline'
        ? 'ランキング未接続'
        : rankingState === 'error'
          ? '取得できませんでした'
          : record
            ? record.display_name
            : '最初の記録をつくろう';
  if (screen === 'game')
    return (
      <GameStage
        key={run}
        song={song}
        chart={chart}
        musicVolume={settings.music}
        sfxVolume={settings.sfx}
        mirror={settings.mirror}
        onExit={() => navigate('menu')}
        onResult={finish}
      />
    );
  return (
    <div className={`app-shell screen-${screen}`}>
      <header className="site-header">
        <button className="brand" onClick={() => navigate('title')} aria-label="Hand Beat タイトル">
          <img src="/assets/ui/hand-beat-logo-v3.webp" alt="Hand Beat" width="180" height="60" />
        </button>
        <nav aria-label="メインナビゲーション">
          <button className={screen === 'menu' ? 'active' : ''} onClick={() => navigate('menu')}>
            PLAY
          </button>
          <button
            className={screen === 'ranking' ? 'active' : ''}
            onClick={() => navigate('ranking')}
          >
            RANKING
          </button>
          <button onClick={() => setModal('help')}>
            HOW TO PLAY <CircleHelp size={13} />
          </button>
        </nav>
        <div className="header-tools">
          <span className="edition">
            <i /> BROWSER RHYTHM GAME
          </span>
          <button
            className="icon-button"
            onClick={() => setModal('settings')}
            aria-label="音量・カメラ設定"
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <main>
        {screen === 'title' && (
          <>
            <section className="hero">
              <img
                className="hero-backdrop"
                src="/assets/ui/blue-arena-v3.webp"
                alt=""
                fetchPriority="high"
              />
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="short-line" /> MUSIC × MOTION × YOU
                </div>
                <img
                  className="hero-logo"
                  src="/assets/ui/hand-beat-logo-v3.webp"
                  alt="Hand Beat"
                  width="600"
                  height="200"
                  fetchPriority="high"
                />
                <h1>
                  その手で、<span>音を掴め。</span>
                </h1>
                <p>
                  手が、楽器になる。
                  <br />
                  動き出す、あたらしいリズム体験。
                </p>
                <div className="hero-actions">
                  <button className="button primary large-button" onClick={() => navigate('menu')}>
                    START PLAYING <ArrowUpRightIcon />
                  </button>
                  <button
                    className="round-button"
                    onClick={() => setModal('help')}
                    aria-label="遊び方を見る"
                  >
                    <Play size={20} />
                  </button>
                  <span className="hero-help">はじめての方へ</span>
                </div>
                <div className="hero-requirements">
                  <span>
                    <Camera size={15} /> Webカメラ
                  </span>
                  <span>
                    <Headphones size={15} /> イヤホン推奨
                  </span>
                  <span>
                    <ShieldCheck size={15} /> 映像の送信なし
                  </span>
                </div>
              </div>
              <div className="hero-stage" aria-label="3種類のジェスチャーでドラムを演奏">
                <span className="stage-kicker">BEYOND THE SCREEN</span>
                <p className="stage-manifesto">Music × Motion × You</p>
                <span className="stage-subtitle">動くたび、世界が輝く。</span>
                <div className="hero-pads">
                  {GESTURES.map((g) => (
                    <div key={g} className={`hero-pad pad-${g}`}>
                      <NoteIcon gesture={g} />
                      <span>{NOTE_STYLE[g].sound}</span>
                    </div>
                  ))}
                </div>
                <div className="stage-caption">
                  <span /> YOUR ROOM IS YOUR STAGE
                </div>
              </div>
              <div className="hero-bottom">
                <span>01 / ENTER THE BLUE</span>
                <span>
                  カメラをつないで、音楽の中へ。 <ArrowDown size={14} />
                </span>
              </div>
            </section>
            <section className="gesture-strip">
              <div className="strip-title">
                <span className="eyebrow">THE WAY YOU PLAY</span>
                <h2>
                  3つの動きで、
                  <br />
                  音楽になる。
                </h2>
              </div>
              {GESTURES.map((g) => (
                <button key={g} className="gesture-item" onClick={() => setModal('help')}>
                  <NoteIcon gesture={g} />
                  <span>
                    <b>{NOTE_STYLE[g].label}</b>
                    <small>{NOTE_STYLE[g].instruction}</small>
                  </span>
                  <span className="sound-label">{NOTE_STYLE[g].sound}</span>
                </button>
              ))}
            </section>
            <section className="library-teaser">
              <div>
                <span className="eyebrow">EXPLORE THE SOUND</span>
                <h2>次は、どんな世界で鳴らそう。</h2>
              </div>
              <button className="text-button" onClick={() => navigate('menu')}>
                {songs.length} ORIGINAL TRACKS <ArrowRight size={17} />
              </button>
              <div className="teaser-jackets">
                {songs.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelected(s.id);
                      navigate('menu');
                    }}
                  >
                    <Jacket song={s} />
                    <div>
                      <b>{s.title}</b>
                      <small>
                        {s.bpm} BPM · {duration(s.durationMs)}
                      </small>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {screen === 'menu' && (
          <section className="selection-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">CHOOSE YOUR WORLD</span>
                <h1>
                  SELECT MUSIC<span className="accent-dot">.</span>
                </h1>
                <p>気分に合う1曲を選んで、ステージへ。</p>
              </div>
              <span className="library-count">
                <Disc3 size={17} /> {String(songs.length).padStart(2, '0')} TRACKS AVAILABLE
              </span>
            </div>
            <div className="selection-layout">
              <div className="song-library">
                <div className="list-heading">
                  <span>
                    ALL TRACKS <b>{songs.length}</b>
                  </span>
                  <span>ORIGINAL COLLECTION</span>
                </div>
                <div className="song-list">
                  {songs.map((s, i) => (
                    <button
                      className={`song-row ${selected === s.id ? 'selected' : ''}`}
                      key={s.id}
                      onClick={() => {
                        stopPreview();
                        setSelected(s.id);
                        setPreviewError('');
                      }}
                      aria-pressed={selected === s.id}
                    >
                      <span className="track-index">{String(i + 1).padStart(2, '0')}</span>
                      <Jacket song={s} />
                      <div className="song-info">
                        <b>{s.title}</b>
                        <small>{s.artist}</small>
                        <span>
                          {s.bpm} BPM <i /> {duration(s.durationMs)}
                        </span>
                      </div>
                      <div className="song-levels">
                        {DIFFICULTIES.map((d) => (
                          <span key={d} className={d}>
                            {s.difficulties[d].level}
                          </span>
                        ))}
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
                <div className="library-hint">
                  <Headphones size={21} />
                  <div>
                    <b>音に集中できる準備を。</b>
                    <p>
                      イヤホンをつけて、両手を自由に。
                      <br />
                      最初はEASYから、自分のペースで。
                    </p>
                  </div>
                </div>
              </div>
              <div className="selected-track">
                <div className="selected-cover">
                  <Jacket key={song.id} song={song} large />
                  <button
                    className={`preview-button ${previewing ? 'playing' : ''}`}
                    onClick={() => void togglePreview()}
                    aria-label={previewing ? 'プレビュー停止' : '楽曲プレビュー'}
                  >
                    {previewing ? <AudioLines size={19} /> : <Play size={18} />}{' '}
                    {previewing ? 'STOP PREVIEW' : 'LISTEN'}
                  </button>
                  <span className="cover-tag">ORIGINAL / {song.id.slice(-2)}</span>
                </div>
                <div className="track-detail">
                  <span className="eyebrow">HAND BEAT ORIGINALS</span>
                  <h2>{song.title}</h2>
                  <p>{song.mood}</p>
                  <div className="track-stats">
                    <span>
                      <AudioLines size={14} />
                      {song.bpm} <small>BPM</small>
                    </span>
                    <span>
                      {duration(song.durationMs)} <small>TIME</small>
                    </span>
                    <span>
                      {chart.notes.length} <small>NOTES</small>
                    </span>
                  </div>
                  <div className="difficulty-heading">
                    <span>DIFFICULTY</span>
                    <span>CHART V.{chart.chartVersion}</span>
                  </div>
                  <div className="difficulty-options">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d}
                        className={`${d} ${d === difficulty ? 'active' : ''}`}
                        onClick={() => setDifficulty(d)}
                        aria-pressed={d === difficulty}
                      >
                        <span>{d.toUpperCase()}</span>
                        <b>
                          <small>LV.</small>
                          {song.difficulties[d].level}
                        </b>
                      </button>
                    ))}
                  </div>
                  <div className="records-row">
                    <div>
                      <span>PERSONAL BEST</span>
                      <b>
                        {best[key] || best[key + ':local']
                          ? count(Math.max(best[key] ?? 0, best[key + ':local'] ?? 0))
                          : '—'}
                      </b>
                      <small>このブラウザの記録</small>
                    </div>
                    <button onClick={() => navigate('ranking')}>
                      <span>
                        <Trophy size={12} /> WORLD RECORD <ChevronRight size={12} />
                      </span>
                      <b>{record ? count(record.score) : '—'}</b>
                      <small>{worldText}</small>
                    </button>
                  </div>
                  {previewError && (
                    <p className="error-message" role="alert">
                      {previewError}
                    </p>
                  )}
                  <button className="button primary play-track" onClick={play}>
                    <Play size={19} fill="currentColor" /> PLAY THIS TRACK <ArrowRight size={19} />
                  </button>
                  <span className="play-footnote">
                    <Camera size={12} /> 次の画面でカメラと手の動きを確認します
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}
        {screen === 'result' && result && (
          <section className="result-page">
            <div className="result-song-banner">
              <Jacket key={song.id} song={song} large />
              <span>SESSION COMPLETE / {song.title}</span>
            </div>
            <div className="result-heading">
              <span className="eyebrow">NICE SESSION</span>
              <h1>
                TRACK COMPLETE<span className="accent-dot">.</span>
              </h1>
              <p>
                {song.title}{' '}
                <span className={`difficulty-badge ${difficulty}`}>
                  {difficulty.toUpperCase()} LV.{chart.level}
                </span>
              </p>
            </div>
            <div className="result-layout">
              <div className="result-score-panel">
                <span className="eyebrow">YOUR SCORE</span>
                <strong>{count(result.score)}</strong>
                {result.newRecord && (
                  <span className="new-record">
                    <Trophy size={15} /> NEW PERSONAL BEST
                  </span>
                )}
                <div className="result-grade">
                  {result.accuracy >= 95
                    ? 'S'
                    : result.accuracy >= 85
                      ? 'A'
                      : result.accuracy >= 70
                        ? 'B'
                        : result.accuracy >= 50
                          ? 'C'
                          : 'D'}
                  <span>{result.counts.miss === 0 ? 'FULL COMBO' : 'KEEP THE RHYTHM'}</span>
                </div>
                <div className="result-big-stats">
                  <div>
                    <span>ACCURACY</span>
                    <b>
                      {result.accuracy.toFixed(2)}
                      <small>%</small>
                    </b>
                  </div>
                  <div>
                    <span>MAX COMBO</span>
                    <b>
                      {result.maxCombo}
                      <small> / {result.totalNotes}</small>
                    </b>
                  </div>
                </div>
                <div className="result-extra-stats">
                  <div>
                    <span>WORLD RANK</span>
                    <b>{worldRank ? `#${worldRank}` : '—'}</b>
                  </div>
                  <div>
                    <span>PERSONAL BEST</span>
                    <b>{count(Math.max(best[key] ?? 0, best[key + ':local'] ?? 0))}</b>
                  </div>
                </div>
              </div>
              <div className="result-details">
                <div className="judgement-counts">
                  {(['perfect', 'great', 'good', 'miss'] as const).map((j) => (
                    <div key={j} className={j}>
                      <span>
                        <i />
                        {j.toUpperCase()}
                      </span>
                      <b>{result.counts[j]}</b>
                    </div>
                  ))}
                </div>
                <div className="result-ranking">
                  <Trophy size={24} />
                  <h3>世界に、あなたのビートを。</h3>
                  {result.ranked ? (
                    <>
                      <label htmlFor="player-name">ランキング表示名</label>
                      <input
                        id="player-name"
                        maxLength={20}
                        placeholder="YOUR NAME"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={submitState === 'sent'}
                      />
                      <button
                        className="button primary"
                        onClick={() => void submit()}
                        disabled={!name.trim() || submitState !== 'idle'}
                      >
                        {submitState === 'sending' ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : submitState === 'sent' ? (
                          <Check size={16} />
                        ) : (
                          <Trophy size={16} />
                        )}{' '}
                        {submitState === 'sent' ? '登録済み' : 'スコアを登録する'}
                      </button>
                    </>
                  ) : (
                    <p>
                      {rankingConfigured
                        ? 'このプレイはローカル記録です。操作体験・一時停止・通信失敗時はランキング対象外になります。'
                        : '世界ランキングは未接続です。自己ベストはこのブラウザに保存されます。'}
                    </p>
                  )}
                  {submitMessage && (
                    <p
                      className={submitState === 'sent' ? 'success-message' : 'error-message'}
                      role="status"
                    >
                      {submitMessage}
                    </p>
                  )}
                  <button className="text-button" onClick={() => navigate('ranking')}>
                    ランキングを見る <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </div>
            <div className="result-actions">
              <button className="button secondary" onClick={() => navigate('menu')}>
                <Music2 size={17} /> SONG SELECT
              </button>
              <button className="button primary" onClick={play}>
                <RotateCcw size={17} /> RETRY
              </button>
            </div>
          </section>
        )}
        {screen === 'ranking' && (
          <section className="ranking-page">
            <button className="text-button back-link" onClick={() => navigate('menu')}>
              <ArrowLeft size={16} /> 曲選択へ
            </button>
            <div className="page-heading">
              <div>
                <span className="eyebrow">EVERY BEAT COUNTS</span>
                <h1>
                  WORLD RANKING<span className="accent-dot">.</span>
                </h1>
                <p>同じ曲、同じ譜面。その手で、ベストを更新しよう。</p>
              </div>
              <Trophy size={42} strokeWidth={1} />
            </div>
            <div className="ranking-filters">
              <label>
                TRACK
                <select value={song.id} onChange={(e) => setSelected(e.target.value)}>
                  {songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="difficulty-options">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    className={`${d} ${difficulty === d ? 'active' : ''}`}
                    onClick={() => setDifficulty(d)}
                    aria-pressed={difficulty === d}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="ranking-table">
              <div className="ranking-table-heading">
                <span>RANK</span>
                <span>PLAYER</span>
                <span>SCORE</span>
                <span>ACCURACY</span>
                <span>MAX COMBO</span>
              </div>
              {rankingState === 'ready' && ranking.length ? (
                ranking.map((entry, i) => (
                  <div className="ranking-entry" key={entry.user_id}>
                    <b className={i === 0 ? 'first-place' : ''}>{String(i + 1).padStart(2, '0')}</b>
                    <span>{entry.display_name}</span>
                    <b>{count(entry.score)}</b>
                    <span>{Number(entry.accuracy).toFixed(2)}%</span>
                    <span>{entry.max_combo}</span>
                  </div>
                ))
              ) : (
                <div className="empty-ranking">
                  {rankingState === 'loading' ? (
                    <LoaderCircle className="spin" size={30} />
                  ) : (
                    <Trophy size={35} strokeWidth={1.2} />
                  )}
                  <h2>
                    {rankingState === 'loading'
                      ? 'ランキングを読み込み中'
                      : rankingState === 'offline'
                        ? '世界ランキングは、ただいま準備中。'
                        : rankingState === 'error'
                          ? 'ランキングに接続できません'
                          : '最初のビートを、刻もう。'}
                  </h2>
                  <p>
                    {rankingState === 'offline'
                      ? '今はローカルで遊べます。あなたの自己ベストはブラウザに保存されます。'
                      : rankingState === 'error'
                        ? rankingError
                        : rankingState === 'ready'
                          ? 'この譜面の記録はまだありません。あなたの挑戦を待っています。'
                          : 'しばらくお待ちください。'}
                  </p>
                  {rankingState === 'error' ? (
                    <button className="button secondary" onClick={() => setRefresh((v) => v + 1)}>
                      再試行
                    </button>
                  ) : (
                    rankingState !== 'loading' && (
                      <button className="button primary" onClick={play}>
                        <Play size={17} /> この曲でプレイ
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
            <div className="ranking-footnote">
              <span>TOP 100 · 1人につき自己ベスト1件</span>
              <span>
                CHART V.{chart.chartVersion} / SCORE V.{SCORE_VERSION}
              </span>
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <span className="footer-tagline">YOUR HANDS. YOUR RHYTHM.</span>
        <span>
          PC・ノートPC推奨 <span className="footer-separator">/</span> カメラ映像はデバイス内で処理
        </span>
        <span>HAND BEAT © {new Date().getFullYear()}</span>
      </footer>
      <div className="mobile-notice">
        Hand BeatはPC・ノートPCの横長画面でのプレイをおすすめします。
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className="modal"
            ref={modalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="icon-button modal-close"
              onClick={() => setModal(null)}
              aria-label="閉じる"
            >
              <X size={21} />
            </button>
            <span className="eyebrow">
              {modal === 'help' ? 'MAKE YOUR FIRST BEAT' : 'MAKE IT YOURS'}
            </span>
            <h2 id="modal-title">{modal === 'help' ? '遊び方' : 'プレイ設定'}</h2>
            {modal === 'help' ? (
              <>
                <p>
                  ノーツの場所に手を動かし、
                  <br />
                  円が重なる瞬間に、指定された手の形をつくろう。
                </p>
                <div className="help-steps">
                  <div>
                    <b>01</b>
                    <Camera size={22} />
                    <span>カメラをON</span>
                    <small>1〜2m離れて両手を映す</small>
                  </div>
                  <ArrowRight size={18} />
                  <div>
                    <b>02</b>
                    <span className="help-target">◎</span>
                    <span>場所を合わせる</span>
                    <small>ノーツの中心へ手を移動</small>
                  </div>
                  <ArrowRight size={18} />
                  <div>
                    <b>03</b>
                    <AudioLines size={22} />
                    <span>形を変えてヒット</span>
                    <small>縮む円が重なる瞬間に</small>
                  </div>
                </div>
                <div className="help-gestures">
                  {GESTURES.map((g) => (
                    <div key={g}>
                      <NoteIcon gesture={g} />
                      <span>
                        <b>{NOTE_STYLE[g].label}</b>
                        <small>{NOTE_STYLE[g].instruction}</small>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="help-tip">
                  同じ形を出し続けても連打にはなりません。次の形へ切り替えましょう。パーは力を抜いて自然にひらけばOKです。Perfect・Great・Goodで、手の形に合わせたドラム音が鳴ります。
                </p>
                <p className="privacy-line">
                  <ShieldCheck size={15} /> カメラ映像の送信・録画・保存はしません。
                </p>
                <button
                  className="button primary full-width"
                  onClick={() => {
                    setModal(null);
                    navigate('menu');
                  }}
                >
                  LET&apos;S PLAY <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <>
                <p>音量とカメラ表示を調整できます。</p>
                <label className="setting-slider">
                  <span>
                    <Music2 size={17} /> 楽曲の音量 <b>{Math.round(settings.music * 100)}%</b>
                  </span>
                  <input
                    aria-label="楽曲の音量"
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={settings.music}
                    onChange={(e) => updateSettings({ ...settings, music: Number(e.target.value) })}
                  />
                </label>
                <label className="setting-slider">
                  <span>
                    <Volume2 size={17} /> ヒット音の音量 <b>{Math.round(settings.sfx * 100)}%</b>
                  </span>
                  <input
                    aria-label="ヒット音の音量"
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={settings.sfx}
                    onChange={(e) => updateSettings({ ...settings, sfx: Number(e.target.value) })}
                  />
                </label>
                <DrumPreview volume={settings.sfx} />
                <label className="mirror-setting">
                  <span>
                    <b>カメラの左右反転</b>
                    <small>鏡のように表示します（推奨）</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.mirror}
                    onChange={(e) => updateSettings({ ...settings, mirror: e.target.checked })}
                  />
                </label>
                <p className="help-tip">
                  音と動きが合わせにくい場合は、有線イヤホンをお試しください。ゲーム中はEscキーで一時停止できます。
                </p>
                <button className="button primary full-width" onClick={() => setModal(null)}>
                  設定を保存 <Check size={17} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowDown size={22} style={{ transform: 'rotate(-135deg)' }} />;
}
