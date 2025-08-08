"use client";

import { segmentFromSelection } from '@/utils/dartboard';
import { Button } from './ui/button';

type MobileKeypadProps = {
  onHit: (result: ReturnType<typeof segmentFromSelection>) => void;
};

export default function MobileKeypad({ onHit }: MobileKeypadProps) {
  const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
  let currentMod: 'S' | 'D' | 'T' = 'S';

  function makeHandler(mod: 'S' | 'D' | 'T', value: number) {
    return () => onHit(segmentFromSelection(mod, value));
  }

  return (
    <div className="w-full space-y-3">
      {/* Modifiers */}
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={() => (currentMod = 'S')} variant="outline">Single</Button>
        <Button onClick={() => (currentMod = 'D')} variant="outline">Double</Button>
        <Button onClick={() => (currentMod = 'T')} variant="outline">Triple</Button>
      </div>
      {/* Numbers */}
      <div className="grid grid-cols-5 gap-2">
        {numbers.map((n) => (
          <Button key={n} className="py-6" onClick={makeHandler(currentMod, n)}>
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
