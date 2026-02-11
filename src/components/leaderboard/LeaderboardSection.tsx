import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type ReactNode } from 'react';

type LeaderboardSectionProps = {
  title: string;
  emptyMessage: string;
  emptySubMessage?: string;
  isEmpty: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
};

export function LeaderboardSection({
  title,
  emptyMessage,
  emptySubMessage,
  isEmpty,
  onClick,
  className,
  children,
}: LeaderboardSectionProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul
          className={`divide-y border rounded bg-card${onClick ? ' cursor-pointer' : ''}`}
          onClick={onClick}
          title={onClick ? `View full ${title} leaderboard` : undefined}
        >
          {children}
          {isEmpty && (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              <div>{emptyMessage}</div>
              {emptySubMessage && <div className="text-xs mt-1">{emptySubMessage}</div>}
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
