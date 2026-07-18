import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getTopScores,
  getDailyTopScores,
  getOverallLeaderboard,
  type ScoreRow,
  type OverallRanking,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { Trophy, Medal, Award, Crown } from 'lucide-react';

const GAMES = [
  { id: 'overall', label: '👑 Overall' },
  { id: 'hangman', label: '🇮🇩 Tebak Cellimat Pashang' },
  { id: 'fruit-ninja', label: '🍉 Potong Bhuahaya' },
  { id: 'flappy-bird', label: '🐥 Piyik Mabur' },
  { id: 'snake', label: '🐍 Anomali Ulariyan' },
  { id: 'tetris', label: '🧱 Tehencis' },
  { id: 'archery', label: '🏹 AI-m Targetnya' },
  { id: 'space-panic', label: '👾 Space Panic' },
  { id: 'brick-breaker', label: '🏓 Pecah Bhata' },
  { id: 'space-raid', label: '🚀 Serbu Balik Alien' },
  { id: 'sky-defense', label: '🛡️ Jaga Kotha' },
  { id: 'maze-chase', label: '🟡 Lahap Labirin' },
  { id: 'road-hopper', label: '🐷 Babi Nyabrang' },
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

// Games with a per-day seeded challenge get an extra "Hari Ini" board
const DAILY_GAMES = ['space-panic', 'brick-breaker', 'space-raid', 'sky-defense', 'maze-chase', 'road-hopper'];

export function LeaderboardPage() {
  const [tab, setTab] = useState('overall');
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [overallRows, setOverallRows] = useState<OverallRanking[]>([]);
  const [scoreMode, setScoreMode] = useState<'total' | 'best'>('best');
  const [daily, setDaily] = useState(false);
  const [dailyDate, setDailyDate] = useState('');
  const [loading, setLoading] = useState(true);

  const hasDaily = DAILY_GAMES.includes(tab);
  const showDaily = daily && hasDaily;

  useEffect(() => {
    setLoading(true);
    if (tab === 'overall') {
      getOverallLeaderboard(20)
        .then((r) => setOverallRows(r.ok ? r.rows : []))
        .catch(() => setOverallRows([]))
        .finally(() => setLoading(false));
    } else if (daily && DAILY_GAMES.includes(tab)) {
      getDailyTopScores(tab)
        .then((r) => {
          setRows(r.ok ? r.rows : []);
          setDailyDate(r.date || '');
          setScoreMode('best');
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    } else {
      getTopScores(tab, 20)
        .then((r) => {
          setRows(r.ok ? r.rows : []);
          setScoreMode(r.scoreMode || 'best');
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }
  }, [tab, daily]);

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
              onClick={() => {
                setTab(g.id);
                if (!DAILY_GAMES.includes(g.id)) setDaily(false);
              }}
            >
              {g.label}
            </Button>
          ))}
        </div>

        {hasDaily && (
          <div className='flex gap-2 mb-4'>
            <Button
              variant={!daily ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setDaily(false)}
            >
              🏆 All-Time
            </Button>
            <Button
              variant={daily ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setDaily(true)}
            >
              📅 Hari Ini
            </Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>
              {GAMES.find((g) => g.id === tab)?.label} —{' '}
              {showDaily ? `Daily Best${dailyDate ? ` (${dailyDate})` : ''}` : 'Top 20'}
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
                  {overallRows
                    .filter((row) => !(row.playerName?.toLowerCase().includes('syaeful')))
                    .map((row, i) => (
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
                          {row.rating}
                        </div>
                        <div className='text-[10px] text-muted-foreground'>
                          /100
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : rows.length === 0 ? (
              <div className='py-8 text-center text-muted-foreground'>
                {showDaily
                  ? 'Belum ada skor hari ini. Mainkan DAILY RUN dan jadilah yang pertama!'
                  : 'Belum ada skor. Jadilah yang pertama!'}
              </div>
            ) : (
              <div className='space-y-2'>
                {rows.filter((row) => !(row.playerName?.toLowerCase().includes('syaeful')))
                    .map((row, i) => (
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
                      <div className='text-[10px] sm:text-xs text-muted-foreground flex gap-2 flex-wrap'>
                        {showDaily ? (
                          <>
                            <span>🪜 LV {Number(row.meta?.level) || 1}</span>
                            <span>💥 {Number(row.meta?.kills) || 0} kill</span>
                            {Number(row.meta?.maxCombo) >= 2 && (
                              <span>🔥 combo x{Number(row.meta?.maxCombo)}</span>
                            )}
                          </>
                        ) : (
                          <>
                            <span>📊 {row.totalPlays ?? 1}x main</span>
                            {(row.achievementCount ?? 0) > 0 && (
                              <span>🏅 {row.achievementCount} ach</span>
                            )}
                            {scoreMode === 'total' && row.bestScore != null && (
                              <span>⭐ best {row.bestScore}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className='text-right'>
                      <div className='text-base sm:text-lg font-bold tabular-nums text-primary'>
                        {row.score}
                      </div>
                      <div className='text-[10px] text-muted-foreground'>
                        {showDaily ? 'hari ini' : scoreMode === 'total' ? 'total' : 'best'}
                      </div>
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
                <strong>Rating (0–100)</strong> = 15% Skill (percentile) + 15%
                Achievement + 10% Diversity + 35% Effort (√plays) + 25% Mastery
                (percentile × engagement)
              </p>
              <p className='mt-1'>
                Formula B: Loyalty-Heavy — menghargai dedikasi &amp; konsistensi
                bermain, bukan hanya skill mentah.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
