"use client";

import { segmentFromSelection, type SegmentResult } from '@/utils/dartboard';
import { Button } from './ui/button';
import { useState } from 'react';
import { triggerHaptic } from '@/utils/haptics';

type MobileKeypadProps = {
  onHit: (result: SegmentResult) => void;
};

export default function MobileKeypad({ onHit }: MobileKeypadProps) {
  const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
  const [mod, setMod] = useState<'none' | 'D' | 'T'>('none');
  const applyMod = (value: number) => {
    const m = mod === 'none' ? 'S' : mod;
    onHit(segmentFromSelection(m, value));
    triggerHaptic(10);
    setMod('none');
  };

  return (
    <div className="w-full space-y-3">
      {/* Modifiers */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => setMod((m) => (m === 'D' ? 'none' : 'D'))}
          variant={mod === 'D' ? 'default' : 'outline'}
          className="cursor-pointer transition-transform active:scale-95"
        >
          Double
        </Button>
        <Button
          onClick={() => setMod((m) => (m === 'T' ? 'none' : 'T'))}
          variant={mod === 'T' ? 'default' : 'outline'}
          className="cursor-pointer transition-transform active:scale-95"
        >
          Triple
        </Button>
      </div>
      {/* Numbers */}
      <div className="grid grid-cols-5 gap-2">
        {numbers.map((n) => (
          <Button key={n} className="py-6 cursor-pointer transition-transform active:scale-95" onClick={() => applyMod(n)}>
            {n}
          </Button>
        ))}
      </div>
      {/* Zero + Bulls: equal widths */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          className="py-6 cursor-pointer transition-transform active:scale-95 min-w-0 truncate"
          onClick={() => { onHit({ kind: 'Miss', scored: 0, label: 'Miss' }); triggerHaptic(10); setMod('none'); }}
        >
          0 (Miss)
        </Button>
        <Button
          className="py-6 cursor-pointer transition-transform active:scale-95 min-w-0 truncate"
          onClick={() => { onHit(segmentFromSelection('SB')); triggerHaptic(10); setMod('none'); }}
        >
          Outer Bull (25)
        </Button>
        <Button
          className="py-6 cursor-pointer transition-transform active:scale-95 min-w-0 truncate"
          onClick={() => { onHit(segmentFromSelection('DB')); triggerHaptic(10); setMod('none'); }}
        >
          Inner Bull (50)
        </Button>
      </div>
    </div>
  );
}
