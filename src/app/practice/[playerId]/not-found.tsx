import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PracticePlayerNotFound() {
  return (
    <div className="container mx-auto p-6">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Player Not Found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            The player you&apos;re looking for doesn&apos;t exist or the URL is invalid.
          </p>
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href="/practice">Choose Player</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/players">Manage Players</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}