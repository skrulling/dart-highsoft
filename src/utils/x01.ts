import { SegmentResult, isDoubleKind } from './dartboard';

export type StartScore = 201 | 301 | 501;
export type FinishRule = 'single_out' | 'double_out';

export type ThrowEvent = {
  segment: SegmentResult;
};

export type TurnOutcome = {
  newScore: number;
  busted: boolean;
  finished: boolean;
};

export function applyThrow(
  currentScore: number,
  segment: SegmentResult,
  finish: FinishRule
): TurnOutcome {
  const scored = segment.scored;
  const next = currentScore - scored;
  if (next < 0) {
    return { newScore: currentScore, busted: true, finished: false };
  }
  if (next === 0) {
    if (finish === 'double_out' && !isDoubleKind(segment.kind)) {
      return { newScore: currentScore, busted: true, finished: false };
    }
    return { newScore: 0, busted: false, finished: true };
  }
  if (finish === 'double_out' && next === 1) {
    return { newScore: currentScore, busted: true, finished: false };
  }
  return { newScore: next, busted: false, finished: false };
}
