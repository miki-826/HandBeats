import { test, expect } from '@playwright/test';

test('generated logo, stage and all four song banners load and stay readable at different widths', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.hero-logo')).toBeVisible();
  await expect(page.locator('.hero-backdrop')).toBeVisible();
  await expect(page.locator('.teaser-jackets .jacket img')).toHaveCount(4);
  await expect
    .poll(async () =>
      page
        .locator('.hero img, .teaser-jackets img, .brand img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'START PLAYING', exact: true }).click();
  for (let index = 0; index < 4; index++) {
    await page.locator('.song-row').nth(index).click();
    await expect(page.locator('.selected-cover .jacket img')).toHaveAttribute(
      'src',
      `/assets/songs/song-0${index + 1}/banner-v3.webp`,
    );
    await expect
      .poll(async () =>
        page
          .locator('.selected-cover .jacket img')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'PLAY THIS TRACK' })).toBeVisible();
    await page.screenshot({ path: `test-results/blue-selection-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: '音量・カメラ設定' }).click();
  await expect(page.getByRole('button', { name: 'KICKを試聴' })).toBeVisible();
  await page.screenshot({ path: 'test-results/blue-settings-mobile.png', fullPage: true });
});
