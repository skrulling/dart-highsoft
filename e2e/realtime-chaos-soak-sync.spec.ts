import { expect, test, TEST_PLAYERS } from './fixtures';

const PLAYER_NAMES = {
  ONE: 'E2E Player One',
  TWO: 'E2E Player Two',
} as const;

type ClientId = 'scorerA' | 'scorerB' | 'spectator';

function scorerMatchRow(page: import('@playwright/test').Page, playerName: string) {
  const matchCard = page.getByText('Match', { exact: true }).locator('..').locator('..');
  return matchCard.getByText(playerName, { exact: true }).locator('..').locator('..');
}

function liveMatchCard(page: import('@playwright/test').Page) {
  return page.getByText('Live Match', { exact: true }).locator('..').locator('..');
}

function spectatorPlayerCard(page: import('@playwright/test').Page, playerName: string) {
  const card = liveMatchCard(page);
  const name = card.locator('div.font-semibold.text-lg', { hasText: playerName }).first();
  return name.locator('..').locator('..').locator('..');
}

async function waitForScorerReady(page: import('@playwright/test').Page) {
  await expect(page.getByRole('button', { name: 'Undo dart' })).toBeVisible({ timeout: 15000 });
}

async function waitForSpectatorReady(page: import('@playwright/test').Page) {
  await expect(page.getByText('Live Match', { exact: true })).toBeVisible({ timeout: 15000 });
}

async function waitForLiveBadge(page: import('@playwright/test').Page) {
  const indicator = page.locator('div.fixed.bottom-4.right-4').first();
  await expect(indicator.getByText('Live')).toBeVisible({ timeout: 20000 });
}

async function refreshClient(client: ClientId, pages: Record<ClientId, import('@playwright/test').Page>) {
  const page = pages[client];
  await page.reload();
  if (client === 'spectator') {
    await waitForSpectatorReady(page);
  } else {
    await waitForScorerReady(page);
  }
  await waitForLiveBadge(page);
}

async function readScorerState(page: import('@playwright/test').Page) {
  const oneScoreText = await scorerMatchRow(page, PLAYER_NAMES.ONE).locator('div.text-2xl').textContent();
  const twoScoreText = await scorerMatchRow(page, PLAYER_NAMES.TWO).locator('div.text-2xl').textContent();
  const upContainer = page.getByText('Up', { exact: true }).locator('..');
  const upText = (await upContainer.textContent()) ?? '';

  return {
    one: Number.parseInt(oneScoreText ?? '0', 10),
    two: Number.parseInt(twoScoreText ?? '0', 10),
    currentPlayer: upText.includes(PLAYER_NAMES.ONE) ? PLAYER_NAMES.ONE : PLAYER_NAMES.TWO,
  };
}

async function readSpectatorState(page: import('@playwright/test').Page) {
  const oneScoreText = await spectatorPlayerCard(page, PLAYER_NAMES.ONE)
    .locator('div.text-3xl.font-mono.font-bold')
    .textContent();
  const twoScoreText = await spectatorPlayerCard(page, PLAYER_NAMES.TWO)
    .locator('div.text-3xl.font-mono.font-bold')
    .textContent();
  const currentTurn = liveMatchCard(page).getByText('Current Turn', { exact: true }).locator('..');
  const currentTurnText = (await currentTurn.textContent()) ?? '';

  return {
    one: Number.parseInt(oneScoreText ?? '0', 10),
    two: Number.parseInt(twoScoreText ?? '0', 10),
    currentPlayer: currentTurnText.includes(PLAYER_NAMES.ONE) ? PLAYER_NAMES.ONE : PLAYER_NAMES.TWO,
  };
}

async function assertConsensus(pages: Record<ClientId, import('@playwright/test').Page>) {
  const deadline = Date.now() + 20000;
  let last = '';

  while (Date.now() < deadline) {
    const a = await readScorerState(pages.scorerA);
    const b = await readScorerState(pages.scorerB);
    const s = await readSpectatorState(pages.spectator);
    last = JSON.stringify({ a, b, s });
    const ok =
      a.one === b.one &&
      a.one === s.one &&
      a.two === b.two &&
      a.two === s.two &&
      a.currentPlayer === b.currentPlayer &&
      a.currentPlayer === s.currentPlayer;
    if (ok) return;
    await pages.scorerA.waitForTimeout(200);
  }

  throw new Error(`Consensus timeout. Last: ${last}`);
}

test.describe('realtime chaos soak sync', () => {
  test('stays converged through repeated refresh churn and reconnect flaps', async ({ page, context, createMatch }) => {
    const { matchId } = await createMatch({
      startScore: 301,
      playerIds: [TEST_PLAYERS.ONE, TEST_PLAYERS.TWO],
    });

    const scorerA = page;
    await scorerA.goto(`/match/${matchId}`);
    await waitForScorerReady(scorerA);
    await waitForLiveBadge(scorerA);

    const scorerB = await context.newPage();
    await scorerB.goto(`/match/${matchId}`);
    await waitForScorerReady(scorerB);
    await waitForLiveBadge(scorerB);

    const spectator = await context.newPage();
    await spectator.goto(`/match/${matchId}?spectator=true`);
    await waitForSpectatorReady(spectator);
    await waitForLiveBadge(spectator);

    const pages: Record<ClientId, import('@playwright/test').Page> = { scorerA, scorerB, spectator };

    await assertConsensus(pages);

    const throws = [20, 5, 1, 19, 7, 3, 20, 5, 1, 18, 4, 2, 20, 1, 5, 17, 9, 3];
    const actors: ClientId[] = throws.map((_, i) => (i % 2 === 0 ? 'scorerA' : 'scorerB'));
    const refreshPlan: Record<number, ClientId[]> = {
      2: ['spectator'],
      4: ['scorerB'],
      6: ['scorerA', 'spectator'],
      8: ['scorerB', 'spectator'],
      11: ['scorerA'],
      14: ['scorerB'],
      16: ['spectator'],
    };

    for (let i = 0; i < throws.length; i++) {
      const refreshTargets = refreshPlan[i] ?? [];
      for (const target of refreshTargets) {
        await refreshClient(target, pages);
      }

      if (i === 5 || i === 12) {
        await context.setOffline(true);
        await scorerA.waitForTimeout(300);
        await context.setOffline(false);
        await waitForLiveBadge(scorerA);
        await waitForLiveBadge(scorerB);
        await waitForLiveBadge(spectator);
      }

      await pages[actors[i]].getByRole('button', { name: String(throws[i]), exact: true }).click();
      await assertConsensus(pages);
    }

    const spectatorMetrics = await spectator.evaluate((id) => window.__dartRealtimeMetrics?.[id] ?? null, matchId);
    expect(spectatorMetrics).not.toBeNull();
    expect((spectatorMetrics?.reconcileTurnCalls ?? 0) + (spectatorMetrics?.reconcileCurrentLegCalls ?? 0)).toBeLessThan(30);

    await scorerB.close();
    await spectator.close();
  });
});

