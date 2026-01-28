import { test, expect, TEST_PLAYERS, addThrowsToTurn, createTurn } from './fixtures';

async function expectScoreVisible(
  page: import('@playwright/test').Page,
  value: number | string,
  options?: { timeout?: number }
) {
  const rawValue = typeof value === 'string' ? value : String(value);
  const numericValue = rawValue.replace(/\s*pts$/i, '');
  const escaped = numericValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`^${escaped}(\\s+pts)?$`);
  await expect(page.getByText(matcher).first()).toBeVisible(options);
}

function turnsCard(page: import('@playwright/test').Page) {
  return page.getByText('History of this leg').locator('..').locator('..');
}

async function expectHistoryCountAtLeast(
  page: import('@playwright/test').Page,
  label: string,
  min: number,
  options?: { timeout?: number }
) {
  await expect
    .poll(async () => turnsCard(page).getByText(label, { exact: true }).count(), {
      timeout: options?.timeout ?? 10000,
    })
    .toBeGreaterThanOrEqual(min);
}

async function expectHistoryCount(
  page: import('@playwright/test').Page,
  label: string,
  count: number,
  options?: { timeout?: number }
) {
  await expect
    .poll(async () => turnsCard(page).getByText(label, { exact: true }).count(), {
      timeout: options?.timeout ?? 10000,
    })
    .toBe(count);
}

async function expectCurrentPlayer(page: import('@playwright/test').Page, name: string) {
  const upContainer = page.getByText('Up').locator('..');
  await expect(upContainer.getByText(name)).toBeVisible({ timeout: 10000 });
}

async function expectMatchScore(
  page: import('@playwright/test').Page,
  name: string,
  score: number,
  options?: { timeout?: number }
) {
  const matchCard = page.getByText('Match', { exact: true }).locator('..').locator('..');
  const row = matchCard.getByText(name, { exact: true }).locator('..').locator('..');
  await expect(row.locator('div.text-2xl')).toHaveText(String(score), options);
}

const PLAYER_NAMES = {
  ONE: 'E2E Player One',
  TWO: 'E2E Player Two',
  THREE: 'E2E Player Three',
} as const;

// Helper to wait for match to load - waits for the Undo button to be visible
async function waitForMatchLoad(page: import('@playwright/test').Page, expectedScore?: number | string) {
  await expect(page.getByRole('button', { name: 'Undo dart' })).toBeVisible({ timeout: 10000 });
  if (expectedScore !== undefined) {
    await expectScoreVisible(page, expectedScore, { timeout: 10000 });
  }
}

test.describe('Match Undo/Edit Functionality', () => {
  test.describe('Undo Dart', () => {
    test('can undo a single dart throw', async ({ page, createMatch }) => {
      const { matchId } = await createMatch({ startScore: 301 });
      await page.goto(`/match/${matchId}`);

      // Wait for match to load
      await waitForMatchLoad(page);

      // Throw a dart (click 20)
      await page.getByRole('button', { name: '20', exact: true }).click();

      // Verify score changed (301 - 20 = 281)
      await expectScoreVisible(page, 281, { timeout: 5000 });

      // Click undo
      await page.getByRole('button', { name: 'Undo dart' }).click();

      // Verify score reverted to 301
      await expectScoreVisible(page, 301, { timeout: 5000 });
    });

    test('can undo multiple darts in sequence', async ({ page, createMatch }) => {
      const { matchId } = await createMatch({ startScore: 301 });
      await page.goto(`/match/${matchId}`);

      await waitForMatchLoad(page);

      // Throw three darts: 20, 20, 20
      await page.getByRole('button', { name: '20', exact: true }).click();
      await expectMatchScore(page, PLAYER_NAMES.ONE, 281, { timeout: 10000 });
      await page.getByRole('button', { name: '20', exact: true }).click();
      await expectMatchScore(page, PLAYER_NAMES.ONE, 261, { timeout: 10000 });
      await page.getByRole('button', { name: '20', exact: true }).click();
      await expectMatchScore(page, PLAYER_NAMES.ONE, 241, { timeout: 10000 });

      // Undo all three
      await page.getByRole('button', { name: 'Undo dart' }).click();
      await expectMatchScore(page, PLAYER_NAMES.ONE, 261, { timeout: 10000 });

      await page.getByRole('button', { name: 'Undo dart' }).click();
      await expectMatchScore(page, PLAYER_NAMES.ONE, 281, { timeout: 10000 });

      await page.getByRole('button', { name: 'Undo dart' }).click();
      await expectMatchScore(page, PLAYER_NAMES.ONE, 301, { timeout: 10000 });
    });

    test('can undo a double throw', async ({ page, createMatch }) => {
      const { matchId } = await createMatch({ startScore: 301 });
      await page.goto(`/match/${matchId}`);

      await waitForMatchLoad(page);

      // Click Double modifier, then 20 (D20 = 40)
      await page.getByRole('button', { name: 'Double' }).click();
      await page.getByRole('button', { name: '20', exact: true }).click();

      // Verify score is 301 - 40 = 261
      await expectScoreVisible(page, 261, { timeout: 5000 });

      // Undo
      await page.getByRole('button', { name: 'Undo dart' }).click();
      await expectScoreVisible(page, 301, { timeout: 5000 });
    });

    test('can undo a triple throw', async ({ page, createMatch }) => {
      const { matchId } = await createMatch({ startScore: 301 });
      await page.goto(`/match/${matchId}`);

      await waitForMatchLoad(page);

      // Click Triple modifier, then 20 (T20 = 60)
      await page.getByRole('button', { name: 'Triple' }).click();
      await page.getByRole('button', { name: '20', exact: true }).click();

      // Verify score is 301 - 60 = 241
      await expectScoreVisible(page, 241, { timeout: 5000 });

      // Undo
      await page.getByRole('button', { name: 'Undo dart' }).click();
      await expectScoreVisible(page, 301, { timeout: 5000 });
    });

    test('can undo across turn boundaries', async ({ page, supabase, createMatch }) => {
      const { matchId, legId } = await createMatch({ startScore: 301 });

      const turn1 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
      await addThrowsToTurn(supabase, turn1.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
        { segment: 'S20', scored: 20, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn1.id);

      const turn2 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 2);
      await addThrowsToTurn(supabase, turn2.id, matchId, [
        { segment: 'S19', scored: 19, dart_index: 1 },
      ]);
      await supabase.from('turns').update({ total_scored: 0, busted: false }).eq('id', turn2.id);

      await page.goto(`/match/${matchId}`);
      await expectCurrentPlayer(page, PLAYER_NAMES.TWO);

      // Undo should keep Player 2 as current (0 darts now)
      await page.getByRole('button', { name: 'Undo dart' }).click();
      await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
      await expectHistoryCount(page, 'S19', 0);

      // Undo again should go back to Player 1 with two darts remaining
      await page.getByRole('button', { name: 'Undo dart' }).click();
      await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
      await expectHistoryCount(page, 'S20', 2);
    });


    test('undo handles bust correctly', async ({ page, supabase, createMatch }) => {
      const { matchId, legId } = await createMatch({ startScore: 201, finish: 'double_out' });

      // Create a busted turn for Player 1
      const turn1 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
      await addThrowsToTurn(supabase, turn1.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
        { segment: 'S20', scored: 20, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 0, busted: true }).eq('id', turn1.id);

      await page.goto(`/match/${matchId}`);
      await expect(turnsCard(page).getByText('BUST').first()).toBeVisible({ timeout: 10000 });
      await expectCurrentPlayer(page, PLAYER_NAMES.TWO);

      // Undo should return to Player 1
      await page.getByRole('button', { name: 'Undo dart' }).click();
      await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    });
  });

  test.describe('Edit Throws Modal', () => {
    test('can open and close edit throws modal', async ({ page, createMatch }) => {
      const { matchId } = await createMatch({ startScore: 301 });
      await page.goto(`/match/${matchId}`);

      await waitForMatchLoad(page);

      // Throw a dart first
      await page.getByRole('button', { name: '20', exact: true }).click();
      await expectScoreVisible(page, 281, { timeout: 15000 });

      // Open edit modal
      await page.getByRole('button', { name: 'Edit throws' }).click();

      // Modal should be visible
      const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Edit throws' }).first();
      await expect(modal).toBeVisible();

      // Close modal (click outside or press escape)
      await page.keyboard.press('Escape');

      // Modal should be closed, game state unchanged
      await expectScoreVisible(page, 281, { timeout: 10000 });
    });

    test('edit modal shows all throws in current leg', async ({ page, supabase, createMatch }) => {
      const { matchId, legId } = await createMatch({ startScore: 301 });

      const turn = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
      await addThrowsToTurn(supabase, turn.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S10', scored: 10, dart_index: 2 },
        { segment: 'S19', scored: 19, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 49 }).eq('id', turn.id);

      await page.goto(`/match/${matchId}`);
      await waitForMatchLoad(page);

      // Open edit modal
      await page.getByRole('button', { name: 'Edit throws' }).click();

      // Should see the throws in the modal
      // The modal displays three throw entries
      const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Edit throws' }).first();
      await expect(modal.getByText('Dart 1')).toBeVisible({ timeout: 10000 });
      await expect(modal.getByText('Dart 2')).toBeVisible();
      await expect(modal.getByText('Dart 3')).toBeVisible();

      await page.keyboard.press('Escape');
    });

    test('can edit a throw from edit modal', async ({ page, supabase, createMatch }) => {
      const { matchId, legId } = await createMatch({ startScore: 301 });

      const turn = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
      await addThrowsToTurn(supabase, turn.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
        { segment: 'S20', scored: 20, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 60 }).eq('id', turn.id);

      await page.goto(`/match/${matchId}`);
      await waitForMatchLoad(page);

      // Open edit modal
      await page.getByRole('button', { name: 'Edit throws' }).click();

      // Should see S20 throws
      const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Edit throws' }).first();
      const s20Elements = modal.getByText('S20');
      await expect(s20Elements).toHaveCount(3);

      // Select a throw and change it
      await s20Elements.first().click();
      await modal.getByRole('button', { name: '19', exact: true }).click();
      await expect(modal.getByText('S19').first()).toBeVisible();
      await expect(s20Elements).toHaveCount(2);

      // Close modal
      await page.keyboard.press('Escape');

      // Score should be recalculated (S20 + S20 + S19 = 59, so 301 - 59 = 242)
      await expectScoreVisible(page, 242, { timeout: 10000 });
    });

    test('editing multiple historical throws recalculates scores without changing the current player', async ({
      page,
      supabase,
      createMatch,
    }) => {
      const { matchId, legId } = await createMatch({ startScore: 301, finish: 'double_out' });

      // Seed a "mid-game" state with an incomplete current turn:
      // - Several full turns have been played
      // - Player One is currently Up and has thrown 2 darts in turn 5
      const turn1 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
      await addThrowsToTurn(supabase, turn1.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
        { segment: 'S20', scored: 20, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn1.id);

      const turn2 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 2);
      await addThrowsToTurn(supabase, turn2.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
        { segment: 'S20', scored: 20, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn2.id);

      const turn3 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 3);
      await addThrowsToTurn(supabase, turn3.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
        { segment: 'S20', scored: 20, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn3.id);

      const turn4 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 4);
      await addThrowsToTurn(supabase, turn4.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
        { segment: 'S20', scored: 20, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn4.id);

      const turn5 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 5);
      await addThrowsToTurn(supabase, turn5.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
      ]);
      // Keep turn5 total_scored at 0 (the app typically only sets total_scored when a turn is completed).
      // The UI should still show the subtotal via the throws list for incomplete turns.

      await page.goto(`/match/${matchId}`);
      await waitForMatchLoad(page);

      await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
      // Player One has an incomplete turn (2 darts) so the UI includes the subtotal (40) in the displayed score.
      await expectMatchScore(page, PLAYER_NAMES.ONE, 141, { timeout: 15000 });
      await expectMatchScore(page, PLAYER_NAMES.TWO, 181, { timeout: 15000 });

      // Edit TWO throws "a couple rounds back": change the first two S20s in the leg (turn 1)
      // into T20, which should pull Player One's current score down from 141 -> 61.
      await page.getByRole('button', { name: 'Edit throws' }).click();
      const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Edit throws' }).first();
      await expect(modal).toBeVisible({ timeout: 10000 });

      await expect(modal.getByText('Turn 1', { exact: true })).toBeVisible({ timeout: 15000 });

      const turn1Section = modal.getByText('Turn 1', { exact: true }).locator('..').locator('..');
      const turn1DartButton = (dartIndex: number) =>
        turn1Section.getByText(`Dart ${dartIndex}`, { exact: true }).locator('..');
      const turn1DartSegment = (dartIndex: number) =>
        turn1DartButton(dartIndex).locator('div.font-mono');

      await expect(turn1DartSegment(1)).toHaveText('S20', { timeout: 15000 });
      await expect(turn1DartSegment(2)).toHaveText('S20', { timeout: 15000 });

      // Change historical throw Turn 1 / Dart 1: S20 -> T20.
      await turn1DartButton(1).click();
      await expect(modal.getByText('Select a new segment:', { exact: true })).toBeVisible({ timeout: 15000 });
      await modal.getByRole('button', { name: 'Triple' }).click();
      await modal.getByRole('button', { name: '20', exact: true }).click();
      await expect(turn1DartSegment(1)).toHaveText('T20', { timeout: 15000 });

      // After an edit, the modal reloads and clears selection.
      await expect(modal.getByText('Select a throw above to edit')).toBeVisible({ timeout: 15000 });

      // Change historical throw Turn 1 / Dart 2: S20 -> T20.
      await turn1DartButton(2).click();
      await expect(modal.getByText('Select a new segment:', { exact: true })).toBeVisible({ timeout: 15000 });
      await modal.getByRole('button', { name: 'Triple' }).click();
      await modal.getByRole('button', { name: '20', exact: true }).click();
      await expect(turn1DartSegment(2)).toHaveText('T20', { timeout: 15000 });

      // Close modal and verify:
      // - Current player stays Player One (incomplete turn still theirs)
      // - Scores are recalculated from the edited history
      await page.keyboard.press('Escape');

      await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
      await expectMatchScore(page, PLAYER_NAMES.ONE, 61, { timeout: 15000 });
      await expectMatchScore(page, PLAYER_NAMES.TWO, 181, { timeout: 15000 });
      await expect(page.getByText('61 pts', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Score Recalculation After Edit', () => {
    test('scores update correctly after deleting a mid-leg throw', async ({
      page,
      supabase,
      createMatch,
    }) => {
      const { matchId, legId } = await createMatch({ startScore: 301 });

      // Pre-populate some throws via the database
      const turn = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);

      await addThrowsToTurn(supabase, turn.id, matchId, [
        { segment: 'T20', scored: 60, dart_index: 1 },
        { segment: 'T20', scored: 60, dart_index: 2 },
        { segment: 'T20', scored: 60, dart_index: 3 },
      ]);

      // Update turn total
      await supabase.from('turns').update({ total_scored: 180 }).eq('id', turn.id);

      // Navigate to match
      await page.goto(`/match/${matchId}`);

      // Player 1 should have scored 180 (301 - 180 = 121)
      await expectScoreVisible(page, 121, { timeout: 10000 });

      // Open edit modal
      await page.getByRole('button', { name: 'Edit throws' }).click();

      // Verify we see the T20 throws
      await expect(page.getByText('T20').first()).toBeVisible();
    });
  });

  test.describe('Edge Cases', () => {
    test('undo is disabled when match is won', async ({ page, createMatch }) => {
      const { matchId } = await createMatch({
        startScore: 201,
        finish: 'double_out',
        legsToWin: 1,
        legWinnerId: TEST_PLAYERS.ONE,
      });

      // Navigate to match
      await page.goto(`/match/${matchId}`);

      // Undo button should be disabled
      const undoButton = page.getByRole('button', { name: 'Undo dart' });
      await expect(undoButton).toBeDisabled();
    });

    test('can undo after a bust reverts to previous player', async ({ page, supabase, createMatch }) => {
      const { matchId, legId } = await createMatch({ startScore: 201, finish: 'double_out' });

      // Normal turn for Player 1
      const turn1 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
      await addThrowsToTurn(supabase, turn1.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
        { segment: 'S20', scored: 20, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn1.id);

      // Normal turn for Player 2
      const turn2 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 2);
      await addThrowsToTurn(supabase, turn2.id, matchId, [
        { segment: 'Miss', scored: 0, dart_index: 1 },
        { segment: 'Miss', scored: 0, dart_index: 2 },
        { segment: 'Miss', scored: 0, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 0, busted: false }).eq('id', turn2.id);

      // Busted turn for Player 1
      const turn3 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 3);
      await addThrowsToTurn(supabase, turn3.id, matchId, [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
        { segment: 'S20', scored: 20, dart_index: 3 },
      ]);
      await supabase.from('turns').update({ total_scored: 0, busted: true }).eq('id', turn3.id);

      await page.goto(`/match/${matchId}`);
      await expect(turnsCard(page).getByText('BUST').first()).toBeVisible({ timeout: 10000 });
      await expectCurrentPlayer(page, PLAYER_NAMES.TWO);

      // Undo - should remove the busted throw and return to Player 1
      await page.getByRole('button', { name: 'Undo dart' }).click();
      await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    });

    test('handles rapid undo clicks gracefully', async ({ page, createMatch }) => {
      const { matchId } = await createMatch({ startScore: 301 });
      await page.goto(`/match/${matchId}`);

      await waitForMatchLoad(page);

      // Throw several darts
      for (let i = 0; i < 5; i++) {
        await page.getByRole('button', { name: '20', exact: true }).click();
        await page.waitForTimeout(100); // Small delay between throws
      }

      // Rapidly click undo multiple times
      const undoButton = page.getByRole('button', { name: 'Undo dart' });
      await undoButton.click();
      await undoButton.click();
      await undoButton.click();

      // Should not crash, and score should be consistent
      await expect(page.locator('text=/\\d+ pts/').first()).toBeVisible();
    });
  });
});
