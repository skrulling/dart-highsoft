interface DartIQParams {
  remainingScore: number;
  totalScore: number;
  busted: boolean;
  dartsUsedThisTurn?: number;
}

export interface DartIQSummary {
  isBogey: boolean;
  inCheckout: boolean;
  onDouble: boolean;
  twoDart: boolean;
  oneDart: boolean;
  maxOut: boolean;
  bust: boolean;
  bigVisit: boolean;
  weakVisit: boolean;
  setupShot: boolean;
}

export function computeDartIQ(params: DartIQParams): DartIQSummary {
  const { remainingScore, totalScore, busted, dartsUsedThisTurn } = params;

  const isBogey = [169, 168, 166, 165, 163, 162, 159].includes(remainingScore);
  const inCheckout = remainingScore <= 170 && remainingScore >= 2;
  const onDouble = remainingScore <= 40 && remainingScore % 2 === 0;
  const twoDart = remainingScore <= 100 && remainingScore >= 41;
  const oneDart = onDouble;
  const maxOut = remainingScore === 170;
  const bust = busted;
  const bigVisit = totalScore >= 100;
  const weakVisit = totalScore < 60;
  const setupShot = !bust && !bigVisit && inCheckout && !onDouble && dartsUsedThisTurn === 3;

  return {
    isBogey,
    inCheckout,
    onDouble,
    twoDart,
    oneDart,
    maxOut,
    bust,
    bigVisit,
    weakVisit,
    setupShot,
  };
}

export type HumorStyle =
  | 'hype-lite'
  | 'confident-dry'
  | 'neutral-dry'
  | 'roast-lite'
  | 'wry-quiet';

export function humorStyleFromScore(totalScore: number): HumorStyle {
  if (totalScore >= 130) return 'hype-lite';
  if (totalScore >= 100) return 'confident-dry';
  if (totalScore >= 60) return 'neutral-dry';
  if (totalScore >= 30) return 'roast-lite';
  return 'wry-quiet';
}
