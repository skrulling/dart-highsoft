import { test, expect, TEST_PLAYERS } from './fixtures';

const PLAYER_NAMES = {
  ONE: 'E2E Player One',
  TWO: 'E2E Player Two',
} as const;

type ClientId = 'scorerA' | 'scorerB' | 'spectator';

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

function scorerMatchRow(page: import('@playwright/test').Page, playerName: string) {
  const matchCard = page.getByText('Match', { exact: true }).locator('..').locator('..');
  return matchCard.getByText(playerName, { exact: true }).locator('..').locator('..');
}

async function expectScorerPlayerScore(
  page: import('@playwright/test').Page,
  playerName: string,
  score: number,
  options?: { timeout?: number }
) {
  await expect(scorerMatchRow(page, playerName).locator('div.text-2xl')).toHaveText(String(score), options);
}

async function expectScorerCurrentPlayer(page: import('@playwright/test').Page, playerName: string) {
  const upContainer = page.getByText('Up', { exact: true }).locator('..');
  await expect(upContainer.getByText(playerName, { exact: true })).toBeVisible({ timeout: 15000 });
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

async function expectSpectatorCurrentTurn(page: import('@playwright/test').Page, playerName: string) {
  const card = liveMatchCard(page);
  const currentTurn = card.getByText('Current Turn', { exact: true }).locator('..');
  await expect(currentTurn.getByText(playerName, { exact: true })).toBeVisible({ timeout: 15000 });
}

async function refreshClient(client: ClientId, pages: Record<ClientId, import('@playwright/test').Page>) {
  const page = pages[client];
  await page.reload();
  if (client === 'spectator') {
    await waitForSpectatorLoad(page);
  } else {
    await waitForScorerLoad(page);
  }
  await waitForRealtimeConnected(page);
}

async function expectAllClientsInSync(args: {
  scorerA: import('@playwright/test').Page;
  scorerB: import('@playwright/test').Page;
  spectator: import('@playwright/test').Page;
  playerOneScore: number;
  playerTwoScore: number;
  currentPlayerName: string;
}) {
  const { scorerA, scorerB, spectator, playerOneScore, playerTwoScore, currentPlayerName } = args;

  await expectScorerPlayerScore(scorerA, PLAYER_NAMES.ONE, playerOneScore, { timeout: 15000 });
  await expectScorerPlayerScore(scorerA, PLAYER_NAMES.TWO, playerTwoScore, { timeout: 15000 });
  await expectScorerCurrentPlayer(scorerA, currentPlayerName);

  await expectScorerPlayerScore(scorerB, PLAYER_NAMES.ONE, playerOneScore, { timeout: 15000 });
  await expectScorerPlayerScore(scorerB, PLAYER_NAMES.TWO, playerTwoScore, { timeout: 15000 });
  await expectScorerCurrentPlayer(scorerB, currentPlayerName);

  await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, playerOneScore, { timeout: 15000 });
  await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.TWO, playerTwoScore, { timeout: 15000 });
  await expectSpectatorCurrentTurn(spectator, currentPlayerName);
}

test.describe('realtime multi-client refresh sync', () => {
  test('two scoring clients + one spectator stay in sync across alternating throws and refreshes', async ({
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
    await waitForScorerLoad(scorerA);
    await waitForRealtimeConnected(scorerA);

    const scorerB = await context.newPage();
    await scorerB.goto(`/match/${matchId}`);
    await waitForScorerLoad(scorerB);
    await waitForRealtimeConnected(scorerB);

    const spectator = await context.newPage();
    await spectator.goto(`/match/${matchId}?spectator=true`);
    await waitForSpectatorLoad(spectator);
    await waitForRealtimeConnected(spectator);

    const pages: Record<ClientId, import('@playwright/test').Page> = { scorerA, scorerB, spectator };

    // Deterministic throw + refresh sequence (simulates "random-ish" refreshes without test flakiness).
    const throws = [20, 5, 20, 1, 19, 7, 20, 5, 20, 3, 18, 20];
    const actors: ClientId[] = ['scorerA', 'scorerB', 'scorerA', 'scorerB', 'scorerA', 'scorerB', 'scorerA', 'scorerB', 'scorerA', 'scorerB', 'scorerA', 'scorerB'];
    const refreshBefore: Record<number, ClientId[]> = {
      1: ['scorerB'],
      2: ['spectator'],
      4: ['scorerA', 'spectator'],
      6: ['scorerB'],
      8: ['scorerA'],
      9: ['spectator'],
      10: ['scorerB', 'spectator'],
    };

    let playerOneScore = 301;
    let playerTwoScore = 301;
    let currentPlayerName = PLAYER_NAMES.ONE;
    let dartsInTurn = 0;

    await expectAllClientsInSync({
      scorerA,
      scorerB,
      spectator,
      playerOneScore,
      playerTwoScore,
      currentPlayerName,
    });

    for (let i = 0; i < throws.length; i++) {
      const toRefresh = refreshBefore[i] ?? [];
      for (const client of toRefresh) {
        await refreshClient(client, pages);
      }

      const actor = pages[actors[i]];
      const value = throws[i];
      await actor.getByRole('button', { name: String(value), exact: true }).click();

      if (currentPlayerName === PLAYER_NAMES.ONE) {
        playerOneScore -= value;
      } else {
        playerTwoScore -= value;
      }

      dartsInTurn += 1;
      if (dartsInTurn === 3) {
        dartsInTurn = 0;
        currentPlayerName = currentPlayerName === PLAYER_NAMES.ONE ? PLAYER_NAMES.TWO : PLAYER_NAMES.ONE;
      }

      await expectAllClientsInSync({
        scorerA,
        scorerB,
        spectator,
        playerOneScore,
        playerTwoScore,
        currentPlayerName,
      });
    }

    await scorerB.close();
    await spectator.close();
  });
});
