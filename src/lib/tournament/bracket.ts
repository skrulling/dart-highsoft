export type BracketSlot = {
  tempId: string;
  bracket: 'winners' | 'losers' | 'grand_final';
  round: number;
  position: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  loserId: string | null;
  isBye: boolean;
  nextWinnerTempId: string | null;
  nextWinnerSlot: 'player1' | 'player2' | null;
  nextLoserTempId: string | null;
  nextLoserSlot: 'player1' | 'player2' | null;
};

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generate a full double-elimination bracket for the given player IDs.
 *
 * Players are assigned to WB R1 in the order provided (caller should
 * shuffle beforehand if random seeding is desired).  Byes are placed
 * so that the *highest* seeds get a free pass.
 */
export function generateBracket(playerIds: string[]): BracketSlot[] {
  if (playerIds.length < 3) {
    throw new Error('Tournament requires at least 3 players');
  }

  let idCounter = 0;
  function tempId(prefix: string): string {
    return `${prefix}_${++idCounter}`;
  }

  const numPlayers = playerIds.length;
  const bracketSize = nextPowerOf2(numPlayers);
  const numByes = bracketSize - numPlayers;
  const wbRounds = Math.log2(bracketSize); // number of WB rounds

  const slots: BracketSlot[] = [];
  const wbByRound: BracketSlot[][] = [];

  // ── Winners Bracket ────────────────────────────────────────────────
  for (let round = 1; round <= wbRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    const roundSlots: BracketSlot[] = [];
    for (let pos = 0; pos < matchesInRound; pos++) {
      const slot: BracketSlot = {
        tempId: tempId('wb'),
        bracket: 'winners',
        round,
        position: pos,
        player1Id: null,
        player2Id: null,
        winnerId: null,
        loserId: null,
        isBye: false,
        nextWinnerTempId: null,
        nextWinnerSlot: null,
        nextLoserTempId: null,
        nextLoserSlot: null,
      };
      roundSlots.push(slot);
      slots.push(slot);
    }
    wbByRound.push(roundSlots);
  }

  // Wire WB round N winners → WB round N+1
  for (let r = 0; r < wbRounds - 1; r++) {
    const current = wbByRound[r];
    const next = wbByRound[r + 1];
    for (let i = 0; i < current.length; i++) {
      const destIdx = Math.floor(i / 2);
      const destSlot: 'player1' | 'player2' = i % 2 === 0 ? 'player1' : 'player2';
      current[i].nextWinnerTempId = next[destIdx].tempId;
      current[i].nextWinnerSlot = destSlot;
    }
  }

  // ── Losers Bracket ─────────────────────────────────────────────────
  // LB has 2*(wbRounds-1) rounds.
  // Odd LB rounds (1,3,5,...) are "drop-down" rounds receiving WB losers.
  // Even LB rounds (2,4,6,...) are "internal" rounds (LB vs LB).
  const lbTotalRounds = 2 * (wbRounds - 1);
  const lbByRound: BracketSlot[][] = [];

  // Calculate matches per LB round:
  // LB R1: bracketSize/4 matches (WB R1 losers drop in)
  // LB R2: bracketSize/4 matches (internal)
  // LB R3: bracketSize/8 matches (WB R2 losers drop in)
  // LB R4: bracketSize/8 matches (internal)
  // ... and so on
  let lbMatchCount = bracketSize / 4; // Starting size for LB R1

  for (let lbRound = 1; lbRound <= lbTotalRounds; lbRound++) {
    const roundSlots: BracketSlot[] = [];
    for (let pos = 0; pos < lbMatchCount; pos++) {
      const slot: BracketSlot = {
        tempId: tempId('lb'),
        bracket: 'losers',
        round: lbRound,
        position: pos,
        player1Id: null,
        player2Id: null,
        winnerId: null,
        loserId: null,
        isBye: false,
        nextWinnerTempId: null,
        nextWinnerSlot: null,
        nextLoserTempId: null,
        nextLoserSlot: null,
      };
      roundSlots.push(slot);
      slots.push(slot);
    }
    lbByRound.push(roundSlots);

    // After even rounds (internal), halve the count for next pair
    if (lbRound % 2 === 0) {
      lbMatchCount = Math.max(1, lbMatchCount / 2);
    }
  }

  // Wire LB internal progression: LB round winners → next LB round
  for (let i = 0; i < lbByRound.length - 1; i++) {
    const current = lbByRound[i];
    const next = lbByRound[i + 1];
    const isDropDownNext = (i + 2) % 2 === 1; // next round is odd = drop-down

    if (isDropDownNext) {
      // Current is internal (even), next is drop-down (odd)
      // Internal winners go to the LB side of the drop-down match
      for (let j = 0; j < current.length; j++) {
        const destIdx = Math.floor(j / 2);
        const destSlot: 'player1' | 'player2' = j % 2 === 0 ? 'player1' : 'player2';
        // Actually for drop-down rounds, the existing LB players take player1
        // and the dropping WB losers take player2. Let internal winners go to player1.
        current[j].nextWinnerTempId = next[destIdx].tempId;
        current[j].nextWinnerSlot = destSlot;
      }
    } else {
      // Current is drop-down (odd), next is internal (even)
      // Same number of matches, 1:1 mapping
      for (let j = 0; j < current.length; j++) {
        current[j].nextWinnerTempId = next[j].tempId;
        current[j].nextWinnerSlot = 'player1';
      }
    }
  }

  // Wire WB losers → LB drop-down rounds
  // WB R1 losers → LB R1 (drop-down)
  // WB R2 losers → LB R3 (drop-down)
  // WB R(k) losers → LB R(2k-1) (drop-down)
  for (let wbR = 0; wbR < wbRounds; wbR++) {
    const wbRound = wbByRound[wbR];
    const lbDropRoundIdx = wbR === 0 ? 0 : 2 * wbR - 1; // LB round index (0-based)

    if (lbDropRoundIdx >= lbByRound.length) {
      // WB final loser goes to GF (handled separately)
      continue;
    }

    const lbDropRound = lbByRound[lbDropRoundIdx];

    if (wbR === 0) {
      // WB R1 losers drop into LB R1
      // WB R1 has bracketSize/2 matches, LB R1 has bracketSize/4 matches
      // So 2 WB R1 losers feed into 1 LB R1 match
      for (let i = 0; i < wbRound.length; i++) {
        const destIdx = Math.floor(i / 2);
        const destSlot: 'player1' | 'player2' = i % 2 === 0 ? 'player1' : 'player2';
        wbRound[i].nextLoserTempId = lbDropRound[destIdx].tempId;
        wbRound[i].nextLoserSlot = destSlot;
      }
    } else {
      // WB R(k>1) losers drop into LB drop-down round
      // The drop-down round already has LB survivors in player1 slot
      // WB losers go into player2 slot
      for (let i = 0; i < wbRound.length; i++) {
        if (i < lbDropRound.length) {
          wbRound[i].nextLoserTempId = lbDropRound[i].tempId;
          wbRound[i].nextLoserSlot = 'player2';
        }
      }
    }
  }

  // ── Grand Final ────────────────────────────────────────────────────
  const gf1: BracketSlot = {
    tempId: tempId('gf'),
    bracket: 'grand_final',
    round: 1,
    position: 0,
    player1Id: null, // WB champion
    player2Id: null, // LB champion
    winnerId: null,
    loserId: null,
    isBye: false,
    nextWinnerTempId: null,
    nextWinnerSlot: null,
    nextLoserTempId: null,
    nextLoserSlot: null,
  };

  const gfReset: BracketSlot = {
    tempId: tempId('gf'),
    bracket: 'grand_final',
    round: 2,
    position: 0,
    player1Id: null,
    player2Id: null,
    winnerId: null,
    loserId: null,
    isBye: false,
    nextWinnerTempId: null,
    nextWinnerSlot: null,
    nextLoserTempId: null,
    nextLoserSlot: null,
  };

  slots.push(gf1, gfReset);

  // WB final winner → GF player1
  const wbFinal = wbByRound[wbRounds - 1][0];
  wbFinal.nextWinnerTempId = gf1.tempId;
  wbFinal.nextWinnerSlot = 'player1';

  // WB final loser → LB (last drop-down round, player2 slot)
  // The WB final loser drops to the last LB "drop-down" round
  const lastLbDropIdx = 2 * (wbRounds - 1) - 1; // 0-based index of last drop-down round
  if (lastLbDropIdx >= 0 && lastLbDropIdx < lbByRound.length) {
    wbFinal.nextLoserTempId = lbByRound[lastLbDropIdx][0].tempId;
    wbFinal.nextLoserSlot = 'player2';
  }

  // LB final winner → GF player2
  const lbFinal = lbByRound[lbByRound.length - 1][0];
  lbFinal.nextWinnerTempId = gf1.tempId;
  lbFinal.nextWinnerSlot = 'player2';

  // LB final loser has no next (eliminated, gets final_rank)
  // GF1 and GF reset don't have fixed next pointers —
  // advancement logic determines what happens based on who wins

  // ── Seed Players into WB R1 ────────────────────────────────────────
  const wbR1 = wbByRound[0];

  // Standard seeding: seed 1 vs seed N, seed 2 vs seed N-1, etc.
  // Byes are given to the top seeds (first N byes go to seeds 0..numByes-1)
  for (let i = 0; i < wbR1.length; i++) {
    const topSeedIdx = i;
    const bottomSeedIdx = bracketSize - 1 - i;

    const topPlayer = topSeedIdx < numPlayers ? playerIds[topSeedIdx] : null;
    const bottomPlayer = bottomSeedIdx < numPlayers ? playerIds[bottomSeedIdx] : null;

    wbR1[i].player1Id = topPlayer;
    wbR1[i].player2Id = bottomPlayer;

    // Check if this is a bye
    if (!topPlayer || !bottomPlayer) {
      wbR1[i].isBye = true;
      wbR1[i].winnerId = topPlayer ?? bottomPlayer;
    }
  }

  // ── Propagate Bye Winners ──────────────────────────────────────────
  propagateByes(slots);

  return slots;
}

/**
 * Propagate bye winners through the bracket.
 * A bye winner is automatically placed in their destination slot.
 *
 * Also cascades through the bracket: slots that will never receive all
 * expected players (because upstream byes don't produce losers) are
 * themselves marked as byes and their sole player is auto-advanced.
 */
function propagateByes(slots: BracketSlot[]) {
  const slotMap = new Map(slots.map((s) => [s.tempId, s]));

  // Phase 1: Propagate initial WB bye winners to their destinations
  for (const slot of slots) {
    if (!slot.isBye || !slot.winnerId) continue;

    if (slot.nextWinnerTempId) {
      const dest = slotMap.get(slot.nextWinnerTempId);
      if (dest) {
        if (slot.nextWinnerSlot === 'player1') {
          dest.player1Id = slot.winnerId;
        } else if (slot.nextWinnerSlot === 'player2') {
          dest.player2Id = slot.winnerId;
        }
      }
    }

    // Byes don't produce losers — no one drops to LB from a bye
  }

  // Phase 2: Cascade byes through the bracket.
  // Some slots will never receive all expected players because upstream
  // byes don't produce losers. Detect and mark these as byes too.
  let changed = true;
  while (changed) {
    changed = false;
    for (const slot of slots) {
      // Skip already-resolved slots and grand_final (populated dynamically)
      if (slot.isBye || slot.winnerId || slot.bracket === 'grand_final') continue;

      let currentPlayers = 0;
      if (slot.player1Id) currentPlayers++;
      if (slot.player2Id) currentPlayers++;

      // Count unresolved non-bye feeders that will still send a player
      let pendingFeeders = 0;
      for (const other of slots) {
        if (other === slot) continue;
        const isUnresolved = !other.winnerId && !other.isBye;
        if (other.nextWinnerTempId === slot.tempId && isUnresolved) pendingFeeders++;
        if (other.nextLoserTempId === slot.tempId && isUnresolved) pendingFeeders++;
      }

      const totalExpected = currentPlayers + pendingFeeders;

      if (totalExpected === 0) {
        // No players will ever arrive → empty bye
        slot.isBye = true;
        changed = true;
      } else if (totalExpected === 1 && currentPlayers === 1) {
        // Single player present, no more coming → auto-advance bye
        const soloPlayer = slot.player1Id || slot.player2Id;
        slot.isBye = true;
        slot.winnerId = soloPlayer;

        if (slot.nextWinnerTempId && soloPlayer) {
          const dest = slotMap.get(slot.nextWinnerTempId);
          if (dest) {
            if (slot.nextWinnerSlot === 'player1') dest.player1Id = soloPlayer;
            else if (slot.nextWinnerSlot === 'player2') dest.player2Id = soloPlayer;
          }
        }

        changed = true;
      }
    }
  }
}
