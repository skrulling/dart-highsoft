import { cn } from '@/lib/utils';

type ThrowSegment = {
  dart_index?: number;
  segment: string;
};

type ThrowSegmentBadgesProps = {
  throws?: ThrowSegment[];
  maxThrows?: number;
  highlightIncomplete?: boolean;
  showCount?: boolean;
  placeholder?: string;
  className?: string;
};

export function ThrowSegmentBadges({
  throws = [],
  maxThrows = 3,
  highlightIncomplete = false,
  showCount = false,
  placeholder = '-',
  className,
}: ThrowSegmentBadgesProps) {
  const orderedThrows = [...throws].sort((a, b) => (a.dart_index ?? 0) - (b.dart_index ?? 0));
  const hasIncomplete = highlightIncomplete && orderedThrows.length > 0 && orderedThrows.length < maxThrows;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {Array.from({ length: maxThrows }, (_, index) => {
        const throwData = orderedThrows[index];
        const hasThrow = index < orderedThrows.length;
        const isIncomplete = hasThrow && hasIncomplete;
        return (
          <div
            key={index}
            className={`min-w-[20px] h-5 px-1 rounded border flex items-center justify-center text-xs font-medium transition-all duration-300 ${
              hasThrow
                ? isIncomplete
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-muted-foreground bg-muted-foreground/10 text-muted-foreground'
                : 'border-dashed border-muted-foreground/40 text-muted-foreground/40'
            }`}
          >
            {hasThrow ? throwData.segment : placeholder}
          </div>
        );
      })}
      {showCount && (
        <span className="text-xs text-muted-foreground ml-1">
          {orderedThrows.length}/{maxThrows}
        </span>
      )}
    </div>
  );
}
