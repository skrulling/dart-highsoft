"use client";

import MobileKeypad from '@/components/MobileKeypad';
import { Button } from '@/components/ui/button';
import type { Player } from '@/lib/match/types';
import type { SegmentResult } from '@/utils/dartboard';

export type EditableThrow = {
  id: string;
  turn_id: string;
  dart_index: number;
  segment: string;
  scored: number;
  player_id: string;
  turn_number: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  throws: EditableThrow[];
  playerById: Record<string, Player>;
  selectedThrowId: string | null;
  onSelectThrow: (throwId: string) => void;
  onUpdateThrow: (seg: SegmentResult) => void | Promise<void>;
};

export function EditThrowsModal({
  open,
  onClose,
  throws,
  playerById,
  selectedThrowId,
  onSelectThrow,
  onUpdateThrow,
}: Props) {
  if (!open) return null;

  const byTurn = new Map<number, EditableThrow[]>();
  for (const thr of throws) {
    if (!byTurn.has(thr.turn_number)) byTurn.set(thr.turn_number, []);
    byTurn.get(thr.turn_number)!.push(thr);
  }
  const ordered = Array.from(byTurn.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[min(700px,95vw)] max-h-[90vh] overflow-auto rounded-lg border bg-background p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Edit throws</div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Tap a throw, then use the keypad to set a new value.</div>
          <div className="max-h-64 overflow-auto rounded border divide-y">
            {ordered.length > 0 ? (
              <div>
                {ordered.map(([turnNumber, list]) => (
                  <div key={turnNumber} className="p-2">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <div className="font-medium">Turn {turnNumber}</div>
                      <div className="text-muted-foreground">
                        {playerById[list[0]!.player_id]?.display_name ?? 'Player'}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {list
                        .slice()
                        .sort((a, b) => a.dart_index - b.dart_index)
                        .map((thr) => {
                          const isSelected = selectedThrowId === thr.id;
                          return (
                            <button
                              key={thr.id}
                              className={`rounded border px-3 py-2 text-left ${
                                isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-accent'
                              }`}
                              onClick={() => onSelectThrow(thr.id)}
                            >
                              <div className="text-xs text-muted-foreground">Dart {thr.dart_index}</div>
                              <div className="font-mono">{thr.segment}</div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">No throws yet.</div>
            )}
          </div>
          <div className="mt-3">
            {selectedThrowId ? (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Select a new segment:</div>
                <MobileKeypad
                  onHit={(seg) => {
                    void onUpdateThrow(seg);
                  }}
                />
              </div>
            ) : (
              <div className="rounded border p-4 text-center text-sm text-muted-foreground">
                Select a throw above to edit
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

