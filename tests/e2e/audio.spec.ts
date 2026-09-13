import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { createSynthHitSounds } from '../../src/lib/audio/hitSounds';
import type { Chart } from '../../src/game/types';

test('all three drums render audible attacks, decay to silence and respect mute', async ({
  page,
}) => {
  await page.goto('/');
  const source = ts
    .transpileModule(readFileSync('src/lib/audio/hitSounds.ts', 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    })
    .outputText.replace('export function createSynthHitSounds', 'function createSynthHitSounds');
  await page.addScriptTag({ content: `${source}\nwindow.testDrumBank = createSynthHitSounds;` });
  const results = await page.evaluate(async () => {
    const createBank = (window as unknown as { testDrumBank: typeof createSynthHitSounds })
      .testDrumBank;
    const result = [];
    for (const gesture of ['fist', 'gun', 'open'] as const) {
      for (const volume of [0, 0.9]) {
        const context = new OfflineAudioContext(1, 24000, 48000);
        const gain = context.createGain();
        gain.gain.value = volume;
        gain.connect(context.destination);
        const bank = createBank(context, gain);
        bank.play(gesture);
        const rendered = await context.startRendering();
        const samples = rendered.getChannelData(0);
        const attack = samples.slice(0, 2400);
        result.push({
          gesture,
          volume,
          peak: Math.max(...samples.map(Math.abs)),
          rms: Math.sqrt(attack.reduce((sum, v) => sum + v * v, 0) / attack.length),
          tail: Math.max(...samples.slice(19200).map(Math.abs)),
          finite: samples.every(Number.isFinite),
        });
        bank.dispose();
      }
    }
    return result;
  });
  for (const result of results) {
    expect(result.finite).toBe(true);
    expect(result.tail).toBe(0);
    if (result.volume === 0) expect(result.peak).toBe(0);
    else {
      expect(result.peak).toBeGreaterThan(0.7);
      expect(result.peak).toBeLessThan(1);
      expect(result.rms).toBeGreaterThan(0.1);
    }
  }
});

test('Perfect, Great and Good each trigger one drum; wrong inputs and misses stay silent', async ({
  page,
}) => {
  const chart = JSON.parse(readFileSync('src/data/songs/song-01/easy.json', 'utf8')) as Chart;
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      value: class extends Original {
        get currentTime() {
          return Number(document.documentElement.dataset.audioTime ?? 0);
        }
        createBufferSource() {
          const source = super.createBufferSource();
          const start = source.start.bind(source);
          source.start = (...args) => {
            if (source.buffer && source.buffer.duration < 1) {
              const root = document.documentElement;
              root.dataset.drumHits = String(Number(root.dataset.drumHits ?? 0) + 1);
            }
            start(...args);
          };
          return source;
        }
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'START PLAYING', exact: true }).click();
  await page.getByRole('button', { name: 'EASY LV.2', exact: true }).click();
  await page.getByRole('button', { name: 'PLAY THIS TRACK' }).click();
  await page.getByRole('button', { name: 'カメラなしで操作を試す（ランキング対象外）' }).click();
  await expect(page.locator('.gesture-checks > div')).toHaveCount(3);
  await page.getByRole('button', { name: 'READY — プレイ開始' }).click();
  const box = await page.locator('.camera-field').boundingBox();
  if (!box) throw new Error('Missing game field');
  const width = Math.min(box.width, (box.height * 16) / 9),
    height = (width * 9) / 16;
  for (const [index, offset] of [0, 110, 200].entries()) {
    const note = chart.notes[index];
    await page.mouse.move(
      box.x + (box.width - width) / 2 + note.x * width,
      box.y + (box.height - height) / 2 + note.y * height,
    );
    await page.evaluate(
      (time) => {
        document.documentElement.dataset.audioTime = String(time);
      },
      3 + (note.timeMs + chart.offsetMs + offset) / 1000,
    );
    await page.keyboard.press('c');
    await page.keyboard.press(note.gesture === 'fist' ? 'g' : 'f');
    expect(await page.locator('html').getAttribute('data-drum-hits')).toBe(
      index ? String(index) : null,
    );
    await page.keyboard.press(note.gesture[0]);
    await expect(page.locator('html')).toHaveAttribute('data-drum-hits', String(index + 1));
    await page.keyboard.press(note.gesture[0]);
    await expect(page.locator('html')).toHaveAttribute('data-drum-hits', String(index + 1));
  }
  await expect
    .poll(async () => Number((await page.locator('.game-score b').innerText()).replaceAll(',', '')))
    .toBe(2000);
  const missed = chart.notes[3];
  await page.evaluate(
    (time) => {
      document.documentElement.dataset.audioTime = String(time);
    },
    3 + (missed.timeMs + 300) / 1000,
  );
  await expect(page.locator('.combo-display')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-drum-hits', '3');
});

test('drum previews work at the selected volume and close cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '音量・カメラ設定' }).click();
  for (const name of ['KICK', 'SNARE', 'HI-HAT'])
    await page.getByRole('button', { name: `${name}を試聴` }).click();
  await page.getByRole('slider', { name: 'ヒット音の音量' }).fill('0');
  await expect(
    page.getByText('ヒット音はミュート中です。音量を上げると試聴できます。'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'KICKを試聴' }).click();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
