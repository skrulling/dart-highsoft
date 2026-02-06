import { test, expect, TEST_PLAYERS } from './fixtures';

const PLAYER_NAMES = {
  ONE: 'E2E Player One',
  TWO: 'E2E Player Two',
} as const;

async function waitForScorerLoad(page: import('@playwright/test').Page) {
  await expect(page.getByRole('button', { name: 'Undo dart' })).toBeVisible({ timeout: 15000 });
}

async function waitForSpectatorLoad(page: import('@playwright/test').Page) {
  await expect(page.getByText('Live Match', { exact: true })).toBeVisible({ timeout: 15000 });
}

async function waitForRealtimeConnected(page: import('@playwright/test').Page) {
  const indicator = page.locator('div.fixed.bottom-4.right-4').first();
  await expect(indicator.getByText('Live')).toBeVisible({ timeout: 20000 });
}

function liveMatchCard(page: import('@playwright/test').Page) {
  return page.getByText('Live Match', { exact: true }).locator('..').locator('..');
}

function spectatorPlayerCard(page: import('@playwright/test').Page, playerName: string) {
  const card = liveMatchCard(page);
  const name = card.locator('div.font-semibold.text-lg', { hasText: playerName }).first();
  return name.locator('..').locator('..').locator('..');
}

async function expectSpectatorPlayerScore(
  page: import('@playwright/test').Page,
  playerName: string,
  score: number,
  options?: { timeout?: number }
) {
  await expect(spectatorPlayerCard(page, playerName).locator('div.text-3xl.font-mono.font-bold')).toHaveText(
    String(score),
    options
  );
}

test.describe('realtime spectator latency and ordering', () => {
  test('spectator receives ordered score updates with low latency and no polling fallback', async ({
    page,
    context,
    createMatch,
  }) => {
    const { matchId } = await createMatch({
      startScore: 301,
      playerIds: [TEST_PLAYERS.ONE, TEST_PLAYERS.TWO],
    });

    await page.goto(`/match/${matchId}`);
    await waitForScorerLoad(page);
    await waitForRealtimeConnected(page);

    const spectator = await context.newPage();
    await spectator.goto(`/match/${matchId}?spectator=true`);
    await waitForSpectatorLoad(spectator);
    await waitForRealtimeConnected(spectator);

    const throws = [20, 5, 1, 20, 5, 1];
    const expectedScoresAfterThrow = [
      { one: 281, two: 301 },
      { one: 276, two: 301 },
      { one: 275, two: 301 },
      { one: 275, two: 281 },
      { one: 275, two: 276 },
      { one: 275, two: 275 },
    ];

    const perThrowLatenciesMs: number[] = [];
    for (let i = 0; i < throws.length; i++) {
      const t0 = Date.now();
      await page.getByRole('button', { name: String(throws[i]), exact: true }).click();
      await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, expectedScoresAfterThrow[i].one, { timeout: 3000 });
      await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.TWO, expectedScoresAfterThrow[i].two, { timeout: 3000 });
      perThrowLatenciesMs.push(Date.now() - t0);
    }

    const maxLatency = Math.max(...perThrowLatenciesMs);
    expect(maxLatency).toBeLessThan(1500);

    const metrics = await spectator.evaluate((id) => {
      const store = window.__dartRealtimeMetrics?.[id];
      return store ?? null;
    }, matchId);

    expect(metrics).not.toBeNull();
    expect((metrics?.throwsEvents ?? 0) + (metrics?.turnsEvents ?? 0)).toBeGreaterThanOrEqual(throws.length);
    expect(metrics?.fallbackPollTicks ?? 0).toBe(0);

    await spectator.close();
  });
});

