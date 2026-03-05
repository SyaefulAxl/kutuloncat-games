import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhaserGame } from '@/components/PhaserGame';
import {
  SnakeScene,
  type SnakeGameState,
  type SnakeDifficulty,
} from '@/games/snake/SnakeScene';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Moon,
  Sun,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const EMPTY_STATE: SnakeGameState = {
  score: 0,
  highScore: 0,
  gameOver: false,
  started: false,
  elapsed: 0,
  level: 'sedang',
  length: 3,
  foodEaten: 0,
  combo: 0,
  maxCombo: 0,
  comboTimeLeft: 0,
  comboTimerMax: 3000,
  lastScoreGain: 0,
  deathReason: '',
};

const DIFFICULTIES: {
  key: SnakeDifficulty;
  label: string;
  emoji: string;
  desc: string;
  color: string;
}[] = [
  {
    key: 'gampang',
    label: 'Gampang',
    emoji: '🟢',
    desc: 'Pelan, tanpa dinding',
    color:
      'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30',
  },
  {
    key: 'sedang',
    label: 'Sedang',
    emoji: '🟡',
    desc: 'Normal, ada dinding',
    color:
      'bg-yellow-500/20 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/30',
  },
  {
    key: 'susah',
    label: 'Susah',
    emoji: '🔴',
    desc: 'Cepat, banyak rintangan',
    color: 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30',
  },
  {
    key: 'gak-ngotak',
    label: 'Gak Ngotak',
    emoji: '💀',
    desc: 'Gila, mustahil!',
    color:
      'bg-purple-500/20 border-purple-500/50 text-purple-400 hover:bg-purple-500/30',
  },
];

export function SnakePage() {
  const [dark, setDark] = useState(false);
  const [gs, setGs] = useState<SnakeGameState>(EMPTY_STATE);
  const [sceneReady, setSceneReady] = useState(false);
  const [difficulty, setDifficulty] = useState<SnakeDifficulty>(() => {
    return ((window as any).__snakeDifficulty as SnakeDifficulty) || 'sedang';
  });
  const overlayRef = useRef<HTMLDivElement>(null);

  /* Scene ready listener */
  useEffect(() => {
    const onReady = () => requestAnimationFrame(() => setSceneReady(true));
    window.addEventListener('snake-scene-ready', onReady);
    return () => window.removeEventListener('snake-scene-ready', onReady);
  }, []);

  /* Theme */
  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'light';
    setDark(saved === 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      document.body.classList.toggle('dark', next);
      window.dispatchEvent(new Event('snake-theme-change'));
      return next;
    });
  }, []);

  /* Game state polling */
  useEffect(() => {
    let prev = '';
    const interval = setInterval(() => {
      const s = (window as any).__snakeState as SnakeGameState | undefined;
      if (!s) return;
      const key = `${s.score}-${s.highScore}-${s.gameOver}-${s.started}-${s.foodEaten}-${s.combo}-${s.length}-${Math.floor(s.comboTimeLeft / 100)}`;
      if (key !== prev) {
        prev = key;
        setGs({ ...s });
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  /* Set initial difficulty */
  useEffect(() => {
    (window as any).__snakeDifficulty = difficulty;
  }, []);

  /* Restart handler */
  const handleRestart = useCallback(() => {
    window.dispatchEvent(new Event('snake-restart'));
  }, []);

  /* D-pad direction dispatch */
  const sendDir = useCallback((dir: string) => {
    window.dispatchEvent(new CustomEvent('snake-direction', { detail: dir }));
  }, []);

  /* Change difficulty */
  const changeDifficulty = useCallback((d: SnakeDifficulty) => {
    setDifficulty(d);
    (window as any).__snakeDifficulty = d;
    window.dispatchEvent(
      new CustomEvent('snake-set-difficulty', { detail: d }),
    );
  }, []);

  /* Phaser config */
  const { config, canvasW, canvasH } = useMemo(() => {
    const mob = window.innerWidth < 768;
    const reservedH = 200;
    const availH = window.innerHeight - reservedH;
    const availW = window.innerWidth - (mob ? 16 : 24);

    // Snake uses square grid so try to make it square-ish
    let size: number;
    if (mob) {
      size = Math.min(availW, availH, 420);
      size = Math.max(size, 300);
    } else {
      size = Math.min(500, availW, availH);
    }

    return {
      canvasW: size,
      canvasH: size,
      config: {
        type: Phaser.AUTO,
        width: size,
        height: size,
        backgroundColor: dark ? '#0f172a' : '#f1f5f9',
        scene: SnakeScene,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        input: {
          mouse: { preventDefaultWheel: false },
          touch: { capture: true },
        },
      } satisfies Phaser.Types.Core.GameConfig,
    };
  }, []);

  const diffInfo =
    DIFFICULTIES.find((d) => d.key === gs.level) || DIFFICULTIES[1];

  return (
    <div className='min-h-svh flex flex-col bg-background'>
      {/* Header */}
      <header className='flex items-center justify-between px-3 py-2 border-b border-border/30'>
        <Link to='/'>
          <Button
            variant='outline'
            size='sm'
            className='gap-1.5'
          >
            <ArrowLeft className='h-4 w-4' />
            Dashboard
          </Button>
        </Link>
        <button
          onClick={toggleTheme}
          className='p-2 rounded-lg hover:bg-accent transition-colors'
        >
          {dark ? (
            <Moon className='h-5 w-5 text-amber-400' />
          ) : (
            <Sun className='h-5 w-5 text-amber-600' />
          )}
        </button>
        <div className='rounded-lg bg-card border border-border px-3 py-1.5 text-sm font-bold tabular-nums'>
          🐍 Skor: {gs.score}
        </div>
      </header>

      {/* HUD */}
      <div className='flex items-center justify-between px-3 py-1.5'>
        <div className='rounded-lg bg-card border border-border px-3 py-1.5 text-sm tabular-nums'>
          🏆 Best: {gs.highScore}
        </div>
        <div className='flex items-center gap-2'>
          {gs.combo > 1 && (
            <Badge
              variant='default'
              className='text-xs animate-bounce bg-amber-500'
            >
              🔥 x{gs.combo}
            </Badge>
          )}
          <span className='text-xs text-muted-foreground tabular-nums'>
            {gs.started
              ? `${gs.elapsed}s`
              : `${diffInfo.emoji} ${diffInfo.label}`}
          </span>
        </div>
        <div className='rounded-lg bg-card border border-border px-3 py-1.5 text-sm tabular-nums'>
          🍎 {gs.foodEaten}
        </div>
      </div>

      {/* Game Canvas */}
      <div className='flex-1 mx-auto my-1 relative'>
        <div
          className='rounded-xl border border-border/30 overflow-hidden shadow-lg shadow-black/40 relative'
          style={{ aspectRatio: '1 / 1', maxWidth: canvasW }}
        >
          {/* Loading overlay */}
          <div
            ref={overlayRef}
            className={`absolute inset-0 z-20 bg-background flex flex-col items-center justify-center rounded-xl transition-opacity duration-500 ${sceneReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          >
            <div className='text-4xl animate-bounce mb-3'>🐍</div>
            <p className='text-white/80 text-sm animate-pulse'>
              Memuat game...
            </p>
          </div>
          <PhaserGame
            config={config}
            className='w-full'
          />

          {/* Start overlay */}
          {!gs.started && !gs.gameOver && sceneReady && (
            <div className='absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none'>
              <div className='text-center animate-fade-in'>
                <p className='text-6xl mb-4'>🐍</p>
                <h2 className='text-2xl font-bold text-white mb-2'>
                  Ular Anomali
                </h2>
                <p className='text-white/60 text-sm mb-1'>
                  Level: {diffInfo.emoji} {diffInfo.label}
                </p>
                <p className='text-white/40 text-xs'>{diffInfo.desc}</p>
                <p className='text-white/50 text-sm mt-4 animate-pulse'>
                  Tap layar atau tekan Arrow/WASD
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Game-over overlay */}
        {gs.gameOver && (
          <div className='absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 backdrop-blur-sm rounded-xl animate-pop-in'>
            <h2 className='text-3xl sm:text-4xl font-bold text-red-400 mb-2'>
              💀 Game Over
            </h2>
            {gs.deathReason && (
              <p className='text-sm text-red-300/80 mb-1'>
                {gs.deathReason === 'wall' && '🧱 Nabrak dinding!'}
                {gs.deathReason === 'self' && '🐍 Gigit badan sendiri!'}
                {gs.deathReason === 'obstacle' && '🪨 Nabrak rintangan!'}
              </p>
            )}
            <Badge
              variant='secondary'
              className='mb-4 text-sm'
            >
              {diffInfo.emoji} {diffInfo.label}
            </Badge>
            <div className='text-center space-y-1.5 mb-6'>
              <p className='text-3xl font-bold text-white tabular-nums'>
                Skor: {gs.score}
              </p>
              <p className='text-gray-300'>🏆 Best: {gs.highScore}</p>
              <div className='flex items-center justify-center gap-4 text-sm text-gray-300'>
                <span>🐍 Panjang: {gs.length}</span>
                <span>🍎 Makan: {gs.foodEaten}</span>
              </div>
              <div className='flex items-center justify-center gap-4 text-sm text-gray-300'>
                <span>🔥 Max Combo: {gs.maxCombo}</span>
                <span>⏱️ {gs.elapsed}s</span>
              </div>
            </div>

            <div className='flex flex-col gap-2 items-center'>
              <Button
                onClick={handleRestart}
                size='lg'
                className='text-base px-8'
              >
                🔁 Main Lagi
              </Button>
              <div className='flex gap-2 mt-2'>
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => changeDifficulty(d.key)}
                    className={cn(
                      'px-2 py-1 rounded text-xs border transition-all',
                      d.color,
                      difficulty === d.key
                        ? 'ring-1 ring-white/30'
                        : 'opacity-60',
                    )}
                  >
                    {d.emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Combo Timer Bar — below frame so it doesn't push the canvas */}
      {gs.started && gs.combo > 0 && gs.comboTimeLeft > 0 && (
        <div className='px-3 pt-1'>
          <div className='h-1.5 rounded-full bg-slate-700 overflow-hidden'>
            <div
              className='h-full rounded-full transition-all duration-100'
              style={{
                width: `${Math.round((gs.comboTimeLeft / gs.comboTimerMax) * 100)}%`,
                backgroundColor:
                  gs.comboTimeLeft / gs.comboTimerMax > 0.5
                    ? '#22c55e'
                    : gs.comboTimeLeft / gs.comboTimerMax > 0.25
                      ? '#eab308'
                      : '#ef4444',
              }}
            />
          </div>
          <p className='text-[10px] text-center text-muted-foreground mt-0.5'>
            Combo x{gs.combo} — {(gs.comboTimeLeft / 1000).toFixed(1)}s
          </p>
        </div>
      )}

      {/* Difficulty selector — below frame */}
      {!gs.started && !gs.gameOver && (
        <div className='px-3 py-2 flex flex-wrap items-center justify-center gap-2'>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              onClick={() => changeDifficulty(d.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200',
                d.color,
                difficulty === d.key
                  ? 'ring-2 ring-white/30 scale-105'
                  : 'opacity-70',
              )}
            >
              {d.emoji} {d.label}
            </button>
          ))}
        </div>
      )}

      {/* On-screen D-pad (mobile) + Controls */}
      <div className='px-3 py-2 border-t border-border/30 space-y-2'>
        {/* D-pad — visible on small screens */}
        <div className='flex md:hidden justify-center'>
          <div className='grid grid-cols-3 gap-1.5 w-55'>
            <div />
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                sendDir('UP');
              }}
              onMouseDown={() => sendDir('UP')}
              className='flex items-center justify-center h-16 rounded-xl bg-slate-700/80 active:bg-slate-500 active:scale-95 border border-slate-600 touch-none select-none transition-all'
            >
              <ChevronUp className='h-8 w-8 text-white' />
            </button>
            <div />
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                sendDir('LEFT');
              }}
              onMouseDown={() => sendDir('LEFT')}
              className='flex items-center justify-center h-16 rounded-xl bg-slate-700/80 active:bg-slate-500 active:scale-95 border border-slate-600 touch-none select-none transition-all'
            >
              <ChevronLeft className='h-8 w-8 text-white' />
            </button>
            <div className='flex items-center justify-center h-16 rounded-xl bg-slate-800/50 border border-slate-700'>
              <span className='text-sm text-slate-500'>🐍</span>
            </div>
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                sendDir('RIGHT');
              }}
              onMouseDown={() => sendDir('RIGHT')}
              className='flex items-center justify-center h-16 rounded-xl bg-slate-700/80 active:bg-slate-500 active:scale-95 border border-slate-600 touch-none select-none transition-all'
            >
              <ChevronRight className='h-8 w-8 text-white' />
            </button>
            <div />
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                sendDir('DOWN');
              }}
              onMouseDown={() => sendDir('DOWN')}
              className='flex items-center justify-center h-16 rounded-xl bg-slate-700/80 active:bg-slate-500 active:scale-95 border border-slate-600 touch-none select-none transition-all'
            >
              <ChevronDown className='h-8 w-8 text-white' />
            </button>
            <div />
          </div>
        </div>
        <div className='flex items-center gap-3'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleRestart}
          >
            Mulai Ulang
          </Button>
          <span className='text-xs text-muted-foreground'>
            Arrow / WASD / Swipe / D-pad
          </span>
        </div>
      </div>
    </div>
  );
}
