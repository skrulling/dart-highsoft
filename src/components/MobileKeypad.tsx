"use client";

import { segmentFromSelection, type SegmentResult } from '@/utils/dartboard';
import { Button } from './ui/button';
import { useState } from 'react';

type MobileKeypadProps = {
  onHit: (result: SegmentResult) => void;
};

export default function MobileKeypad({ onHit }: MobileKeypadProps) {
  const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
  const [mod, setMod] = useState<'none' | 'D' | 'T'>('none');
  const applyMod = (value: number) => {
    const m = mod === 'none' ? 'S' : mod;
    onHit(segmentFromSelection(m, value));
  };

  return (
    <div className="w-full space-y-3">
      {/* Modifiers */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => setMod((m) => (m === 'D' ? 'none' : 'D'))}
          variant={mod === 'D' ? 'default' : 'outline'}
        >
          Double
        </Button>
        <Button
          onClick={() => setMod((m) => (m === 'T' ? 'none' : 'T'))}
          variant={mod === 'T' ? 'default' : 'outline'}
        >
          Triple
        </Button>
      </div>
      {/* Numbers */}
      <div className="grid grid-cols-5 gap-2">
        {numbers.map((n) => (
          <Button key={n} className="py-6" onClick={() => applyMod(n)}>
            {n}
          </Button>
        ))}
      </div>
      {/* Bulls */}
      <div className="grid grid-cols-2 gap-2">
        <Button className="py-6" onClick={() => onHit(segmentFromSelection('SB'))}>Outer Bull (25)</Button>
        <Button className="py-6" onClick={() => onHit(segmentFromSelection('DB'))}>Inner Bull (50)</Button>
      </div>
    </div>
  );
}
