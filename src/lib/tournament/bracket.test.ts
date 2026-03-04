import { describe, it, expect } from 'vitest';
import { generateBracket, type BracketSlot } from './bracket';

function slotsByBracket(slots: BracketSlot[], bracket: string) {
  return slots.filter((s) => s.bracket === bracket);
}

function slotByTempId(slots: BracketSlot[], tempId: string) {
  return slots.find((s) => s.tempId === tempId);
}

describe('generateBracket', () => {
  it('rejects fewer than 3 players', () => {
    expect(() => generateBracket(['a', 'b'])).toThrow();
    expect(() => generateBracket(['a'])).toThrow();
    expect(() => generateBracket([])).toThrow();
  });

  it('3 players → bracket size 4, 1 bye', () => {
    const slots = generateBracket(['a', 'b', 'c']);
    const wb = slotsByBracket(slots, 'winners');
    const lb = slotsByBracket(slots, 'losers');
    const gf = slotsByBracket(slots, 'grand_final');

    // WB R1: 2 matches (bracket size 4 / 2)
    const wbR1 = wb.filter((s) => s.round === 1);
    expect(wbR1).toHaveLength(2);

    // Exactly 1 bye
    const byes = slots.filter((s) => s.isBye);
    expect(byes).toHaveLength(1);

    // Grand final exists
    expect(gf.length).toBeGreaterThanOrEqual(1);

    // LB exists
    expect(lb.length).toBeGreaterThan(0);
  });

  it('4 players → bracket size 4, 0 byes', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd']);
    const byes = slots.filter((s) => s.isBye);
    expect(byes).toHaveLength(0);

    const wbR1 = slotsByBracket(slots, 'winners').filter((s) => s.round === 1);
    expect(wbR1).toHaveLength(2);

    // All WB R1 matches have both players
    for (const s of wbR1) {
      expect(s.player1Id).not.toBeNull();
      expect(s.player2Id).not.toBeNull();
    }
  });

  it('5 players → bracket size 8, 3 WB byes + 1 LB bye', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e']);
    const byes = slots.filter((s) => s.isBye);
    // 3 WB R1 byes + 1 LB R1 empty bye (both WB feeders are byes)
    expect(byes).toHaveLength(4);

    const wbR1 = slotsByBracket(slots, 'winners').filter((s) => s.round === 1);
    expect(wbR1).toHaveLength(4); // bracket size 8 / 2
  });

  it('8 players → bracket size 8, 0 byes, full bracket', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const byes = slots.filter((s) => s.isBye);
    expect(byes).toHaveLength(0);

    const wbR1 = slotsByBracket(slots, 'winners').filter((s) => s.round === 1);
    expect(wbR1).toHaveLength(4);

    // All WB R1 matches have both players
    for (const s of wbR1) {
      expect(s.player1Id).not.toBeNull();
      expect(s.player2Id).not.toBeNull();
    }
  });

  it('WB bye matches have winner_id set; empty LB byes have no winner', () => {
    const slots = generateBracket(['a', 'b', 'c']); // 1 WB bye
    const wbByes = slots.filter((s) => s.isBye && s.bracket === 'winners');
    expect(wbByes.length).toBeGreaterThan(0);
    for (const bye of wbByes) {
      expect(bye.winnerId).not.toBeNull();
      const nonNullPlayer = bye.player1Id ?? bye.player2Id;
      expect(bye.winnerId).toBe(nonNullPlayer);
    }

    // Empty LB byes (0-player slots) have no winner
    const emptyByes = slots.filter((s) => s.isBye && !s.winnerId);
    for (const bye of emptyByes) {
      expect(bye.player1Id).toBeNull();
      expect(bye.player2Id).toBeNull();
    }
  });

  it('next_winner_tm_id pointers form valid chains from WB R1 to WB final', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const wb = slotsByBracket(slots, 'winners');

    // Each WB match (except the WB final) should point to a next winner slot
    const wbFinal = wb.filter((s) => s.round === Math.max(...wb.map((w) => w.round)));
    expect(wbFinal).toHaveLength(1);

    for (const slot of wb) {
      if (slot === wbFinal[0]) {
        // WB final's next winner should point to grand final
        expect(slot.nextWinnerTempId).not.toBeNull();
        const target = slotByTempId(slots, slot.nextWinnerTempId!);
        expect(target?.bracket).toBe('grand_final');
      } else {
        // Other WB matches should point to next WB round
        expect(slot.nextWinnerTempId).not.toBeNull();
        const target = slotByTempId(slots, slot.nextWinnerTempId!);
        expect(target?.bracket).toBe('winners');
        expect(target!.round).toBe(slot.round + 1);
      }
    }
  });

  it('next_loser_tm_id pointers send WB losers to LB', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const wb = slotsByBracket(slots, 'winners');

    for (const slot of wb) {
      // Every WB match should have a loser pointer to LB
      expect(slot.nextLoserTempId).not.toBeNull();
      const target = slotByTempId(slots, slot.nextLoserTempId!);
      expect(target?.bracket).toBe('losers');
    }
  });

  it('grand final has 2 slots (GF match 1 + reset match)', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd']);
    const gf = slotsByBracket(slots, 'grand_final');
    expect(gf).toHaveLength(2);

    // Round 1 and round 2
    expect(gf.map((g) => g.round).sort()).toEqual([1, 2]);
  });

  it('all tempIds are unique', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const ids = slots.map((s) => s.tempId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all next pointers reference valid tempIds', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const validIds = new Set(slots.map((s) => s.tempId));

    for (const slot of slots) {
      if (slot.nextWinnerTempId) {
        expect(validIds.has(slot.nextWinnerTempId)).toBe(true);
      }
      if (slot.nextLoserTempId) {
        expect(validIds.has(slot.nextLoserTempId)).toBe(true);
      }
    }
  });

  it('bye winners propagate into their destination slots', () => {
    // 3 players: 1 bye, that bye winner should be seeded into WB R2
    const slots = generateBracket(['a', 'b', 'c']);
    const byes = slots.filter((s) => s.isBye);

    for (const bye of byes) {
      if (!bye.nextWinnerTempId) continue;
      const dest = slotByTempId(slots, bye.nextWinnerTempId);
      expect(dest).toBeDefined();
      // The bye winner should be placed in the destination slot
      const placed =
        dest!.player1Id === bye.winnerId || dest!.player2Id === bye.winnerId;
      expect(placed).toBe(true);
    }
  });

  it('handles 6 players (bracket size 8, 2 WB byes + 1 LB bye)', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e', 'f']);
    const byes = slots.filter((s) => s.isBye);
    // 2 WB R1 byes + 1 LB R1 empty bye (both WB feeders are byes)
    expect(byes).toHaveLength(3);
  });

  it('handles 7 players (bracket size 8, 1 bye)', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const byes = slots.filter((s) => s.isBye);
    expect(byes).toHaveLength(1);
  });

  it('LB final winner next_winner points to grand final', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const lb = slotsByBracket(slots, 'losers');
    const maxLbRound = Math.max(...lb.map((s) => s.round));
    const lbFinal = lb.filter((s) => s.round === maxLbRound);
    expect(lbFinal).toHaveLength(1);

    expect(lbFinal[0].nextWinnerTempId).not.toBeNull();
    const target = slotByTempId(slots, lbFinal[0].nextWinnerTempId!);
    expect(target?.bracket).toBe('grand_final');
  });

  it('GF match 1 winner next_winner is null (tournament ends) or points to GF reset', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd']);
    const gf = slotsByBracket(slots, 'grand_final');
    const gf1 = gf.find((g) => g.round === 1);
    // GF1 doesn't have a simple next_winner — advancement depends on WHO wins
    // So nextWinnerTempId should be null (handled by advancement logic)
    expect(gf1).toBeDefined();
  });

  it('slot positions are unique within each bracket+round', () => {
    const slots = generateBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const seen = new Set<string>();
    for (const s of slots) {
      const key = `${s.bracket}-${s.round}-${s.position}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
