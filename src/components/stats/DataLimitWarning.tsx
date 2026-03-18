import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { DataLimitWarnings } from '@/lib/stats/types';

interface DataLimitWarningProps {
  warnings: DataLimitWarnings;
  dismissed: boolean;
  onDismiss: () => void;
}

export function DataLimitWarning({ warnings, dismissed, onDismiss }: DataLimitWarningProps) {
  if (dismissed || !warnings.anyWarning) return null;

  return (
    <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="flex-1 space-y-1">
          <div className="font-semibold text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            Data Limit Warning
          </div>
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Your {warnings.message} is approaching the query limit (95,000+ rows).
            Some statistics may be incomplete. Consider archiving old matches or filtering data by date range.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="text-yellow-900 dark:text-yellow-100 hover:bg-yellow-100 dark:hover:bg-yellow-800/30"
        >
          Dismiss
        </Button>
      </CardContent>
    </Card>
  );
}
