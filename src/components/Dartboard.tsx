"use client";

import React, { useMemo } from 'react';
import { DOUBLE_INNER_RADIUS, DOUBLE_OUTER_RADIUS, OUTER_BULL_RADIUS, INNER_BULL_RADIUS, TRIPLE_INNER_RADIUS, TRIPLE_OUTER_RADIUS, computeHit } from '@/utils/dartboard';

type DartboardProps = {
  onHit: (x: number, y: number, result: ReturnType<typeof computeHit>) => void;
};

export default function Dartboard({ onHit }: DartboardProps) {
  const viewBox = 500;
  const cx = viewBox / 2;
  const cy = viewBox / 2;

  // Colors approximating a standard board
  const COLORS = {
    singleLight: '#E6E2D3', // cream
    singleDark: '#2B2B2B', // dark
    ringRed: '#D12F2F', // red for double/triple
    ringGreen: '#2AAA3B', // green for double/triple
    outerBull: '#2AAA3B',
    innerBull: '#D12F2F',
    numberRingBg: '#111111',
    separators: '#222222',
  } as const;

  const segments = useMemo(() => {
    const paths: { d: string; fill: string }[] = [];
    for (let i = 0; i < 20; i++) {
      // Rotate wedges so 20 is centered up: shift by -9 degrees
      const startAngle = (((i * 18 - 9) - 90) * Math.PI) / 180; // start from top with -9° shift
      const endAngle = ((((i + 1) * 18 - 9) - 90) * Math.PI) / 180;

      const isDarkSingle = i % 2 === 0; // 20 wedge dark
      const singleFill = isDarkSingle ? COLORS.singleDark : COLORS.singleLight;
      const ringFill = i % 2 === 0 ? COLORS.ringRed : COLORS.ringGreen; // 20 ring red

      // Single outer (between triple outer and double inner)
      paths.push({ d: annularSector(TRIPLE_OUTER_RADIUS, DOUBLE_INNER_RADIUS, startAngle, endAngle), fill: singleFill });
      // Triple ring (red/green alternating)
      paths.push({ d: annularSector(TRIPLE_INNER_RADIUS, TRIPLE_OUTER_RADIUS, startAngle, endAngle), fill: ringFill });
      // Single inner (between bull outer and triple inner)
      paths.push({ d: annularSector(OUTER_BULL_RADIUS, TRIPLE_INNER_RADIUS, startAngle, endAngle), fill: singleFill });
      // Double ring (red/green alternating)
      paths.push({ d: annularSector(DOUBLE_INNER_RADIUS, DOUBLE_OUTER_RADIUS, startAngle, endAngle), fill: ringFill });
    }
    return paths;
  }, [COLORS.ringGreen, COLORS.ringRed, COLORS.singleDark, COLORS.singleLight]);

  function annularSector(r1: number, r2: number, start: number, end: number) {
    const cx = viewBox / 2;
    const cy = viewBox / 2;
    const p1 = { x: cx + r1 * Math.cos(start), y: cy + r1 * Math.sin(start) };
    const p2 = { x: cx + r2 * Math.cos(start), y: cy + r2 * Math.sin(start) };
    const p3 = { x: cx + r2 * Math.cos(end), y: cy + r2 * Math.sin(end) };
    const p4 = { x: cx + r1 * Math.cos(end), y: cy + r1 * Math.sin(end) };
    const largeArc = end - start <= Math.PI ? 0 : 1;
    return [
      `M ${p1.x} ${p1.y}`,
      `L ${p2.x} ${p2.y}`,
      `A ${r2} ${r2} 0 ${largeArc} 1 ${p3.x} ${p3.y}`,
      `L ${p4.x} ${p4.y}`,
      `A ${r1} ${r1} 0 ${largeArc} 0 ${p1.x} ${p1.y}`,
      'Z',
    ].join(' ');
  }


  // Numbers around the board
  const numberPositions = useMemo(() => {
    const segmentOrder = [
      20, 1, 18, 4, 13, 6, 10, 15, 2, 17,
      3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
    ];
    const items: { x: number; y: number; label: string }[] = [];
    const radius = DOUBLE_OUTER_RADIUS + 20;
    for (let i = 0; i < 20; i++) {
      // Use the actual wedge mid after -9° rotation, which is i*18°
      const angle = (((i * 18) - 90) * Math.PI) / 180;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      items.push({ x, y, label: String(segmentOrder[i]) });
    }
    return items;
  }, [cx, cy]);

  const handleClick = (event: React.MouseEvent<SVGElement>) => {
    const svgElement = event.currentTarget;
    const rect = svgElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * viewBox;
    const y = ((event.clientY - rect.top) / rect.height) * viewBox;
    const result = computeHit(x, y, viewBox);
    onHit(x, y, result);
  };

  return (
    <svg
      role="img"
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      className="w-full max-w-[500px] cursor-pointer select-none drop-shadow"
      onClick={handleClick}
    >
      {/* Number ring background */}
      <circle cx={cx} cy={cy} r={DOUBLE_OUTER_RADIUS + 26} fill={COLORS.numberRingBg} />
      {/* Board background */}
      <circle cx={cx} cy={cy} r={DOUBLE_OUTER_RADIUS} fill="#222" stroke="#111" strokeWidth={2} />
      {segments.map((seg, i) => (
        <path key={i} d={seg.d} fill={seg.fill} stroke="#111" strokeWidth={1} />
      ))}
      {/* Thin radial separators for each wedge */}
      {Array.from({ length: 20 }).map((_, i) => {
        const angle = (((i * 18 - 9) - 90) * Math.PI) / 180;
        const x1 = cx + OUTER_BULL_RADIUS * Math.cos(angle);
        const y1 = cy + OUTER_BULL_RADIUS * Math.sin(angle);
        const x2 = cx + DOUBLE_OUTER_RADIUS * Math.cos(angle);
        const y2 = cy + DOUBLE_OUTER_RADIUS * Math.sin(angle);
        return <line key={`sep-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.separators} strokeWidth={0.75} />;
      })}
      {/* Bulls */}
      <circle cx={cx} cy={cy} r={OUTER_BULL_RADIUS} fill={COLORS.outerBull} />
      <circle cx={cx} cy={cy} r={INNER_BULL_RADIUS} fill={COLORS.innerBull} />
      {/* Outer border */}
      <circle cx={cx} cy={cy} r={DOUBLE_OUTER_RADIUS} fill="none" stroke="#000" strokeWidth={4} />
      {/* Numbers */}
      {numberPositions.map((pos, i) => (
        <text
          key={i}
          x={pos.x}
          y={pos.y}
          fill="#FFF"
          fontSize={18}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {pos.label}
        </text>
      ))}
    </svg>
  );
}
