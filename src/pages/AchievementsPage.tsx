import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getAchievementCatalog, type AchievementCatalogItem } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Lock, CheckCircle2 } from 'lucide-react';

const rarityEmoji: Record<string, string> = {
  common: '⚪',
  uncommon: '🟢',
  rare: '🔵',
  epic: '🟣',
  legendary: '🟡',
};

export function AchievementsPage() {
  const [items, setItems] = useState<AchievementCatalogItem[]>([]);
  const [stats, setStats] = useState({
    unlocked: 0,
    total: 0,
    totalPoints: 0,
    progress: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAchievementCatalog()
      .then((r) => {
        if (r.ok) {
          setItems(r.rows);
          setStats(r.stats);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className='min-h-svh pb-20 md:pb-4'>
      <Navbar />
      <main className='mx-auto max-w-3xl px-4 py-6'>
        <h1 className='text-2xl font-bold mb-4'>🏅 Achievements</h1>

        {/* Progress summary */}
        <Card className='mb-6'>
          <CardContent className='p-5'>
            <div className='flex items-center justify-between mb-3'>
              <div>
                <div className='text-lg font-bold'>
                  {stats.unlocked} / {stats.total} Unlocked
                </div>
                <div className='text-sm text-muted-foreground'>
                  {stats.totalPoints} total poin
                </div>
              </div>
              <div className='text-3xl font-bold text-primary'>
                {stats.progress}%
              </div>
            </div>
            <Progress value={stats.progress} />
          </CardContent>
        </Card>

        {/* Achievement list */}
        <div className='space-y-3'>
          {loading ? (
            <div className='py-8 text-center text-muted-foreground animate-pulse'>
              Loading...
            </div>
          ) : (
            items.map((item) => (
              <Card
                key={item.code}
                className={cn(
                  'transition-all',
                  item.unlocked ? 'border-primary/30' : 'opacity-70',
                )}
              >
                <CardContent className='flex items-center gap-4 p-4'>
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl',
                      item.unlocked ? 'bg-primary/10' : 'bg-muted',
                    )}
                  >
                    {item.unlocked ? (
                      <CheckCircle2 className='h-6 w-6 text-primary' />
                    ) : (
                      <Lock className='h-5 w-5 text-muted-foreground' />
                    )}
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='font-semibold flex items-center gap-2'>
                      <span>{rarityEmoji[item.rarity] || '⚪'}</span>
                      {item.title}
                    </div>
                    <div className='flex items-center gap-2 mt-1'>
                      <Badge
                        variant={
                          item.rarity as
                            | 'common'
                            | 'uncommon'
                            | 'rare'
                            | 'epic'
                            | 'legendary'
                        }
                      >
                        {item.rarity}
                      </Badge>
                      <span className='text-xs text-muted-foreground'>
                        {item.points} pts
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
