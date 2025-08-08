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

  const segments = useMemo(() => {
    const colors = ['#000', '#c00'];
    const paths: { d: string; fill: string }[] = [];
    for (let i = 0; i < 20; i++) {
      const startAngle = ((i * 18 - 90) * Math.PI) / 180; // start from top
      const endAngle = (((i + 1) * 18 - 90) * Math.PI) / 180;
      const fillSingle = colors[i % 2 === 0 ? 0 : 1];
      const fillTriple = colors[i % 2 === 0 ? 1 : 0];
      const fillDouble = colors[i % 2 === 0 ? 1 : 0];

      // Single outer (between triple outer and double inner)
      paths.push({ d: annularSector(TRIPLE_OUTER_RADIUS, DOUBLE_INNER_RADIUS, startAngle, endAngle), fill: fillSingle });
      // Triple ring
      paths.push({ d: annularSector(TRIPLE_INNER_RADIUS, TRIPLE_OUTER_RADIUS, startAngle, endAngle), fill: fillTriple });
      // Single inner (between bull outer and triple inner)
      paths.push({ d: annularSector(OUTER_BULL_RADIUS, TRIPLE_INNER_RADIUS, startAngle, endAngle), fill: fillSingle });
      // Double ring
      paths.push({ d: annularSector(DOUBLE_INNER_RADIUS, DOUBLE_OUTER_RADIUS, startAngle, endAngle), fill: fillDouble });
    }
    return paths;
  }, []);

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

  function onClick(evt: React.MouseEvent<SVGSVGElement>) {
    const rect = (evt.target as SVGElement).ownerSVGElement!.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const svgX = (x / rect.width) * viewBox;
    const svgY = (y / rect.height) * viewBox;
    const result = computeHit(svgX, svgY, viewBox);
    onHit(svgX, svgY, result);
  }

  return (
    <svg
      role="img"
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      className="w-full max-w-[500px] cursor-crosshair select-none drop-shadow"
      onClick={onClick}
    >
      <circle cx={cx} cy={cy} r={DOUBLE_OUTER_RADIUS} fill="#222" stroke="#111" strokeWidth={2} />
      {segments.map((seg, i) => (
        <path key={i} d={seg.d} fill={seg.fill} stroke="#222" strokeWidth={0.5} />
      ))}
      {/* Bulls */}
      <circle cx={cx} cy={cy} r={OUTER_BULL_RADIUS} fill="#2b2" />
      <circle cx={cx} cy={cy} r={INNER_BULL_RADIUS} fill="#c00" />
      {/* Outer border */}
      <circle cx={cx} cy={cy} r={DOUBLE_OUTER_RADIUS} fill="none" stroke="#000" strokeWidth={4} />
    </svg>
  );
}
