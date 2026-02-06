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
  const currentPlayer = (await upContainer.textContent())?.includes(PLAYER_NAMES.ONE) ? PLAYER_NAMES.ONE : PLAYER_NAMES.TWO;

  return {
    one: Number.parseInt(oneScoreText ?? '0', 10),
    two: Number.parseInt(twoScoreText ?? '0', 10),
    currentPlayer,
  };
}

async function assertScorerMatchesState(
  page: import('@playwright/test').Page,
  state: { one: number; two: number; currentPlayer: string }
) {
  await expect(scorerMatchRow(page, PLAYER_NAMES.ONE).locator('div.text-2xl')).toHaveText(String(state.one), {
    timeout: 15000,
  });
  await expect(scorerMatchRow(page, PLAYER_NAMES.TWO).locator('div.text-2xl')).toHaveText(String(state.two), {
    timeout: 15000,
  });
  const upContainer = page.getByText('Up', { exact: true }).locator('..');
  await expect(upContainer.getByText(state.currentPlayer, { exact: true })).toBeVisible({ timeout: 15000 });
}

async function assertSpectatorMatchesState(
  page: import('@playwright/test').Page,
  state: { one: number; two: number; currentPlayer: string }
) {
  await expect(spectatorPlayerCard(page, PLAYER_NAMES.ONE).locator('div.text-3xl.font-mono.font-bold')).toHaveText(
    String(state.one),
    { timeout: 15000 }
  );
  await expect(spectatorPlayerCard(page, PLAYER_NAMES.TWO).locator('div.text-3xl.font-mono.font-bold')).toHaveText(
    String(state.two),
    { timeout: 15000 }
  );
  const currentTurn = liveMatchCard(page).getByText('Current Turn', { exact: true }).locator('..');
  await expect(currentTurn.getByText(state.currentPlayer, { exact: true })).toBeVisible({ timeout: 15000 });
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

test.describe('realtime chaos reconnect sync', () => {
  test('clients converge after concurrent scoring, reconnect flap, and random refreshes', async ({
    page,
    context,
    createMatch,
  }) => {
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

    const assertConsensus = async () => {
      const deadline = Date.now() + 20000;
      let refreshed = false;
      let lastSnapshot = '';

      while (Date.now() < deadline) {
        const a = await readScorerState(scorerA);
        const b = await readScorerState(scorerB);
        const s = await readSpectatorState(spectator);
        lastSnapshot = JSON.stringify({ a, b, s });

        const allEqual =
          a.one === b.one &&
          a.one === s.one &&
          a.two === b.two &&
          a.two === s.two &&
          a.currentPlayer === b.currentPlayer &&
          a.currentPlayer === s.currentPlayer;

        if (allEqual) {
          await assertScorerMatchesState(scorerB, a);
          await assertSpectatorMatchesState(spectator, a);
          return;
        }

        if (!refreshed && Date.now() > deadline - 9000) {
          refreshed = true;
          await refreshClient('scorerA', pages);
          await refreshClient('scorerB', pages);
          await refreshClient('spectator', pages);
        } else {
          await scorerA.waitForTimeout(250);
        }
      }

      throw new Error(`Clients did not converge to same state. Last snapshot: ${lastSnapshot}`);
    };

    await assertConsensus();

    await scorerA.getByRole('button', { name: '20', exact: true }).click();
    await assertConsensus();

    await refreshClient('scorerB', pages);
    await assertConsensus();

    await Promise.all([
      scorerA.getByRole('button', { name: '20', exact: true }).click(),
      scorerB.getByRole('button', { name: '20', exact: true }).click(),
    ]);
    await assertConsensus();

    await context.setOffline(true);
    await scorerA.waitForTimeout(350);
    await context.setOffline(false);
    await waitForLiveBadge(scorerA);
    await waitForLiveBadge(scorerB);
    await waitForLiveBadge(spectator);

    await refreshClient('spectator', pages);
    await refreshClient('scorerA', pages);
    await assertConsensus();

    await scorerB.getByRole('button', { name: '5', exact: true }).click();
    await assertConsensus();

    await scorerA.getByRole('button', { name: '1', exact: true }).click();
    await assertConsensus();

    await scorerB.close();
    await spectator.close();
  });
});
