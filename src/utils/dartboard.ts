export type SegmentResult =
  | { kind: 'Miss'; scored: 0; label: 'Miss' }
  | { kind: 'Single'; value: number; scored: number; label: string }
  | { kind: 'Double'; value: number; scored: number; label: string }
  | { kind: 'Triple'; value: number; scored: number; label: string }
  | { kind: 'OuterBull'; scored: 25; label: 'SB' }
  | { kind: 'InnerBull'; scored: 50; label: 'DB' };

// Board geometry constants in SVG units (viewBox 500x500)
export const BOARD_RADIUS = 230; // outer double ring outer radius
export const DOUBLE_OUTER_RADIUS = 230;
export const DOUBLE_INNER_RADIUS = 210;
export const TRIPLE_OUTER_RADIUS = 140;
export const TRIPLE_INNER_RADIUS = 120;
export const OUTER_BULL_RADIUS = 30;
export const INNER_BULL_RADIUS = 12;

const SEGMENT_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17,
  3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
];

export function polarFromPoint(x: number, y: number, cx: number, cy: number) {
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  // SVG y is down; invert for math
  const angleRad = Math.atan2(-dy, dx);
  const angleDegFromX = (angleRad * 180) / Math.PI;
  // Convert to degrees from top, clockwise
  const angleFromTopCw = (90 - angleDegFromX + 360) % 360;
  return { r, angleFromTopCw };
}

export function getSegmentByAngle(angleFromTopCw: number): number {
  // Offset by 9 degrees so that 20 is centered at the top (0°)
  const adjusted = (angleFromTopCw + 9) % 360;
  const index = Math.floor(adjusted / 18) % 20;
  return SEGMENT_ORDER[index];
}

export function classifyRing(r: number): SegmentResult['kind'] | 'BoardOutside' {
  if (r <= INNER_BULL_RADIUS) return 'InnerBull';
  if (r <= OUTER_BULL_RADIUS) return 'OuterBull';
  if (r <= TRIPLE_INNER_RADIUS) return 'Single';
  if (r <= TRIPLE_OUTER_RADIUS) return 'Triple';
  if (r <= DOUBLE_INNER_RADIUS) return 'Single';
  if (r <= DOUBLE_OUTER_RADIUS) return 'Double';
  return 'BoardOutside';
}

export function computeHit(
  svgX: number,
  svgY: number,
  viewBoxSize = 500
): SegmentResult {
  const cx = viewBoxSize / 2;
  const cy = viewBoxSize / 2;
  const { r, angleFromTopCw } = polarFromPoint(svgX, svgY, cx, cy);
  const ring = classifyRing(r);
  if (ring === 'BoardOutside') {
    return { kind: 'Miss', scored: 0, label: 'Miss' };
  }
  if (ring === 'InnerBull') {
    return { kind: 'InnerBull', scored: 50, label: 'DB' };
  }
  if (ring === 'OuterBull') {
    return { kind: 'OuterBull', scored: 25, label: 'SB' };
  }
  const value = getSegmentByAngle(angleFromTopCw);
  if (ring === 'Triple') {
    return { kind: 'Triple', value, scored: value * 3, label: `T${value}` };
  }
  if (ring === 'Double') {
    return { kind: 'Double', value, scored: value * 2, label: `D${value}` };
  }
  // Single
  return { kind: 'Single', value, scored: value, label: `S${value}` };
}

export function isDoubleKind(kind: SegmentResult['kind']): boolean {
  return kind === 'Double' || kind === 'InnerBull';
}
