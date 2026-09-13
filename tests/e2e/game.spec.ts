import { test, expect } from '@playwright/test';
test('Title → song/difficulty → fake camera → game → pause → result → ranking', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Browser-test-only clock control. No production shortcuts or query switches.
    const Original = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      value: class extends Original {
        get currentTime() {
          return super.currentTime + Number(document.documentElement.dataset.testAudioOffset ?? 0);
        }
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /その手で/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/title.png', fullPage: true });
  await page.getByRole('button', { name: 'START PLAYING', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'SELECT MUSIC.' })).toBeVisible();
  await page.getByRole('button', { name: 'EASY LV.2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'EASY LV.2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: 'test-results/song-select.png', fullPage: true });
  await page.getByRole('button', { name: 'PLAY THIS TRACK' }).click();
  await page.getByRole('button', { name: 'カメラを有効にする', exact: true }).click();
  await expect(page.getByText('手を映してください')).toBeVisible({ timeout: 45000 });
  await page.screenshot({ path: 'test-results/camera-check.png', fullPage: true });
  await page.getByRole('button', { name: 'チェックをスキップして開始' }).click();
  await expect(page.getByRole('button', { name: '一時停止', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    document.documentElement.dataset.testAudioOffset = '8';
  });
  await page.screenshot({ path: 'test-results/game.png' });
  await page.getByRole('button', { name: '一時停止', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
  await page.getByRole('button', { name: '再開する', exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.testAudioOffset = '190';
  });
  await expect(page.getByRole('heading', { name: 'TRACK COMPLETE.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/result.png', fullPage: true });
  await page.getByRole('button', { name: 'ランキングを見る', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'WORLD RANKING.' })).toBeVisible();
  await expect(page.getByText('世界ランキングは、ただいま準備中。')).toBeVisible();
  expect(errors).toEqual([]);
});
test('camera refusal is actionable and practice remains playable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'START PLAYING', exact: true }).click();
  await page.getByRole('button', { name: 'PLAY THIS TRACK' }).click();
  await page.getByRole('button', { name: 'カメラを有効にする', exact: true }).click();
  await expect(page.locator('.error-message[role=alert]')).toContainText(
    'カメラが許可されていません',
  );
  await page.getByRole('button', { name: 'カメラなしで操作を試す（ランキング対象外）' }).click();
  await page.getByRole('button', { name: 'READY — プレイ開始' }).click();
  await expect(page.getByText('PRACTICE · ランキング対象外')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
});
test('model failure and missing audio have explicit errors', async ({ page }) => {
  await page.route('**/mediapipe/hand_landmarker.task', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'START PLAYING', exact: true }).click();
  await page.getByRole('button', { name: 'PLAY THIS TRACK' }).click();
  await page.getByRole('button', { name: 'カメラを有効にする', exact: true }).click();
  await expect(page.locator('.error-message[role=alert]')).toContainText(
    '手の認識を準備できません',
    { timeout: 45000 },
  );
  await page.getByRole('button', { name: '曲選択へ戻る', exact: true }).click();
  await page.route('**/audio.m4a', (route) => route.fulfill({ status: 404, body: '' }));
  await page.getByRole('button', { name: 'PLAY THIS TRACK' }).click();
  await expect(page.locator('.error-message[role=alert]')).toContainText('音源を読み込めません');
});
test('settings persist, help is keyboard accessible, small screens have no overflow', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '音量・カメラ設定' }).click();
  await page.getByRole('slider', { name: '楽曲の音量' }).fill('0.4');
  await page.getByRole('button', { name: '設定を保存' }).click();
  await page.reload();
  await page.getByRole('button', { name: '音量・カメラ設定' }).click();
  await expect(page.getByRole('slider', { name: '楽曲の音量' })).toHaveValue('0.4');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'HOW TO PLAY' }).click();
  await expect(page.getByRole('dialog')).toContainText('同じ形を出し続けても連打にはなりません');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText('Hand BeatはPC・ノートPCの横長画面でのプレイをおすすめします。'),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
