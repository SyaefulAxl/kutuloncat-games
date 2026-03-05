import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getTopScores,
  getOverallLeaderboard,
  type ScoreRow,
  type OverallRanking,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { Trophy, Medal, Award, Crown } from 'lucide-react';

const GAMES = [
  { id: 'overall', label: '👑 Overall' },
  { id: 'hangman', label: '🇮🇩 Tebak Cielimat' },
  { id: 'fruit-ninja', label: '🍉 Potong Bhuahyaya' },
  { id: 'flappy-bird', label: '🐥 Piyik Mabur' },
  { id: 'snake', label: '🐍 Anomali Ulariyan' },
];

function rankIcon(i: number) {
  if (i === 0)
    return <Trophy className='h-5 w-5 text-amber-500 dark:text-amber-400' />;
  if (i === 1)
    return <Medal className='h-5 w-5 text-zinc-500 dark:text-zinc-300' />;
  if (i === 2) return <Award className='h-5 w-5 text-amber-600' />;
  return (
    <span className='text-sm text-muted-foreground font-mono w-5 text-center'>
      {i + 1}
    </span>
  );
}

export function LeaderboardPage() {
  const [tab, setTab] = useState('overall');
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [overallRows, setOverallRows] = useState<OverallRanking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (tab === 'overall') {
      getOverallLeaderboard(20)
        .then((r) => setOverallRows(r.ok ? r.rows : []))
        .catch(() => setOverallRows([]))
        .finally(() => setLoading(false));
    } else {
      getTopScores(tab, 20)
        .then((r) => setRows(r.ok ? r.rows : []))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }
  }, [tab]);

  return (
    <div className='min-h-svh pb-20 md:pb-4'>
      <Navbar />
      <main className='mx-auto max-w-3xl px-3 sm:px-4 py-4 sm:py-6'>
        <h1 className='text-xl sm:text-2xl font-bold mb-3 sm:mb-4'>
          🏆 Leaderboard
        </h1>

        <div className='flex flex-wrap gap-2 mb-4'>
          {GAMES.map((g) => (
            <Button
              key={g.id}
              variant={tab === g.id ? 'default' : 'outline'}
              size='sm'
              onClick={() => setTab(g.id)}
            >
              {g.label}
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>
              {GAMES.find((g) => g.id === tab)?.label} — Top 20
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className='py-8 text-center text-muted-foreground animate-pulse'>
                Loading...
              </div>
            ) : tab === 'overall' ? (
              overallRows.length === 0 ? (
                <div className='py-8 text-center text-muted-foreground'>
                  Belum ada data. Mainkan game untuk masuk ranking!
                </div>
              ) : (
                <div className='space-y-2'>
                  {overallRows.map((row, i) => (
                    <div
                      key={row.userId}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                        i < 3 ? 'bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <div className='shrink-0 w-6 flex justify-center'>
                        {rankIcon(i)}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='font-medium truncate text-sm sm:text-base'>
                          {row.displayName || row.playerName}
                        </div>
                        <div className='text-[10px] sm:text-xs text-muted-foreground flex gap-2 flex-wrap'>
                          <span>🎮 {row.gamesPlayed} game</span>
                          <span>🏅 {row.achievementCount} ach</span>
                          <span>📊 {row.totalPlays}x main</span>
                        </div>
                      </div>
                      <div className='text-right'>
                        <div className='text-base sm:text-lg font-bold tabular-nums text-primary'>
                          {row.compositeScore}
                        </div>
                        <div className='text-[10px] text-muted-foreground'>
                          pts
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : rows.length === 0 ? (
              <div className='py-8 text-center text-muted-foreground'>
                Belum ada skor. Jadilah yang pertama!
              </div>
            ) : (
              <div className='space-y-2'>
                {rows.map((row, i) => (
                  <div
                    key={row.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                      i < 3 ? 'bg-primary/5' : 'hover:bg-muted/50',
                    )}
                  >
                    <div className='shrink-0 w-6 flex justify-center'>
                      {rankIcon(i)}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium truncate text-sm sm:text-base'>
                        {row.displayName || row.playerName}
                      </div>
                      <div className='text-[10px] sm:text-xs text-muted-foreground'>
                        {new Date(row.createdAt).toLocaleDateString('id-ID')}
                      </div>
                    </div>
                    <div className='text-base sm:text-lg font-bold tabular-nums text-primary'>
                      {row.score}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {tab === 'overall' && (
          <Card className='mt-4'>
            <CardHeader>
              <CardTitle className='text-sm'>📊 Scoring Formula</CardTitle>
            </CardHeader>
            <CardContent className='text-xs text-muted-foreground space-y-1'>
              <p>
                <strong>Composite Score</strong> = Best Score tiap game +
                Achievement Points + Diversity Bonus (10 pts/game) + Play Count
                (max 100)
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
