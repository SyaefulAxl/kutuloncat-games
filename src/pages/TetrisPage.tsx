import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhaserGame } from '@/components/PhaserGame';
import {
  TetrisScene,
  type TetrisGameState,
  type TetrisDifficulty,
} from '@/games/tetris/TetrisScene';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

const EMPTY_STATE: TetrisGameState = {
  score: 0,
  level: 1,
  lines: 0,
  combo: 0,
  maxCombo: 0,
  nextPiece: '?',
  holdPiece: '',
  gameOver: false,
  started: false,
  difficulty: 'sedang',
  singles: 0,
  doubles: 0,
  triples: 0,
  tetrises: 0,
  tSpins: 0,
};

const DIFFICULTIES: {
  key: TetrisDifficulty;
  label: string;
  emoji: string;
  desc: string;
  color: string;
}[] = [
  {
    key: 'gampang',
    label: 'Gampang',
    emoji: '🟢',
    desc: 'Pelan, ada preview',
    color:
      'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30',
  },
  {
    key: 'sedang',
    label: 'Sedang',
    emoji: '🟡',
    desc: 'Normal, ada preview',
    color:
      'bg-yellow-500/20 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/30',
  },
  {
    key: 'susah',
    label: 'Susah',
    emoji: '🔴',
    desc: 'Cepat, 1 baris sampah',
    color: 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30',
  },
  {
    key: 'gak-ngotak',
    label: 'Gak Ngotak',
    emoji: '💀',
    desc: 'Gila, tanpa preview, 3 baris sampah!',
    color:
      'bg-purple-500/20 border-purple-500/50 text-purple-400 hover:bg-purple-500/30',
  },
];

/* Aggressive mobile anti-selection / anti-context-menu styles */
const MOBILE_GUARD_STYLE: React.CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
} as React.CSSProperties;

export function TetrisPage() {
  const [gs, setGs] = useState<TetrisGameState>(EMPTY_STATE);
  const [sceneReady, setSceneReady] = useState(false);
  const [difficulty, setDifficulty] = useState<TetrisDifficulty>(() => {
    return ((window as any).__tetrisDifficulty as TetrisDifficulty) || 'sedang';
  });
  const overlayRef = useRef<HTMLDivElement>(null);
  const isTouchRef = useRef(false);

  /* Swipe gesture refs */
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  const swipeHandledRef = useRef(false);
  const softDropActiveRef = useRef(false);
  const lastTapRef = useRef(0);

  /* Scene ready listener */
  useEffect(() => {
    const onReady = () => requestAnimationFrame(() => setSceneReady(true));
    window.addEventListener('tetris-scene-ready', onReady);
    return () => window.removeEventListener('tetris-scene-ready', onReady);
  }, []);

  /* Game state polling */
  useEffect(() => {
    let prev = '';
    const interval = setInterval(() => {
      const s = (window as any).__tetrisState as TetrisGameState | undefined;
      if (!s) return;
      const key = `${s.score}-${s.level}-${s.lines}-${s.combo}-${s.gameOver}-${s.started}`;
      if (key !== prev) {
        prev = key;
        setGs({ ...s });
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  /* Set initial difficulty */
  useEffect(() => {
    (window as any).__tetrisDifficulty = difficulty;
  }, []);

  /* Restart handler */
  const handleRestart = useCallback(() => {
    window.dispatchEvent(new Event('tetris-restart'));
  }, []);

  /* Control dispatch */
  const sendDir = useCallback((dir: string) => {
    window.dispatchEvent(new CustomEvent('tetris-direction', { detail: dir }));
  }, []);

  /* Block contextmenu / selectstart globally while on this page */
  useEffect(() => {
    const noCtx = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', noCtx, { passive: false });
    document.addEventListener('selectstart', noCtx, { passive: false });
    return () => {
      document.removeEventListener('contextmenu', noCtx);
      document.removeEventListener('selectstart', noCtx);
    };
  }, []);

  /* Change difficulty */
  const changeDifficulty = useCallback((d: TetrisDifficulty) => {
    setDifficulty(d);
    (window as any).__tetrisDifficulty = d;
    window.dispatchEvent(
      new CustomEvent('tetris-set-difficulty', { detail: d }),
    );
  }, []);

  /* Phaser config */
  const { config, canvasW, canvasH } = useMemo(() => {
    const mob = window.innerWidth < 768;
    const reservedH = 120; /* header + HUD + small footer */
    const availH = window.innerHeight - reservedH;
    const availW = window.innerWidth - (mob ? 16 : 24);

    /* Tetris grid is 10:20 ratio (1:2) */
    let w: number;
    let h: number;
    if (mob) {
      h = Math.min(availH, 700);
      w = Math.floor(h / 2);
      if (w > availW) {
        w = availW;
        h = w * 2;
      }
      w = Math.max(w, 220);
      h = Math.max(h, 400);
    } else {
      h = Math.min(700, availH);
      w = Math.floor(h / 2);
      if (w > availW) {
        w = availW;
        h = w * 2;
      }
    }

    return {
      canvasW: w,
      canvasH: h,
      config: {
        type: Phaser.AUTO,
        width: w,
        height: h,
        backgroundColor: '#0f172a',
        scene: TetrisScene,
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
    DIFFICULTIES.find((d) => d.key === gs.difficulty) || DIFFICULTIES[1];

  return (
    <div
      className='min-h-svh flex flex-col bg-background'
      style={MOBILE_GUARD_STYLE}
      onContextMenu={(e) => e.preventDefault()}
    >
      {' '}
      {/* Header */}
      <header className='flex items-center justify-between px-3 py-2 border-b border-border/30'>
        <Link
          to='/'
          draggable={false}
        >
          <Button
            variant='outline'
            size='sm'
            className='gap-1.5 touch-none select-none'
          >
            <ArrowLeft className='h-4 w-4' />
            Dashboard
          </Button>
        </Link>
        <div className='rounded-lg bg-card border border-border px-3 py-1.5 text-sm font-bold tabular-nums'>
          🧱 Skor: {gs.score}
        </div>
      </header>
      {/* HUD */}
      <div className='flex items-center justify-between px-3 py-1.5 text-xs sm:text-sm'>
        <div className='flex items-center gap-2'>
          <span className='tabular-nums'>📊 Lvl {gs.level}</span>
          <span className='tabular-nums text-muted-foreground'>
            {gs.lines} baris
          </span>
        </div>
        <div className='flex items-center gap-2'>
          {gs.combo > 0 && (
            <Badge
              variant='default'
              className='text-xs animate-bounce bg-amber-500'
            >
              🔥 x{gs.combo}
            </Badge>
          )}
          <span className='text-muted-foreground tabular-nums'>
            {gs.started
              ? `T:${gs.tetrises} 3:${gs.triples} 2:${gs.doubles}${gs.tSpins ? ` TS:${gs.tSpins}` : ''}`
              : `${diffInfo.emoji} ${diffInfo.label}`}
          </span>
        </div>
      </div>
      {/* Game Canvas */}
      <div className='flex-1 mx-auto my-1 relative'>
        <div
          className='rounded-xl border border-border/30 overflow-hidden shadow-lg shadow-black/40 relative'
          style={{ maxWidth: canvasW, maxHeight: canvasH }}
          /* ── Swipe gesture handling on canvas ── */
          onTouchStart={(e) => {
            isTouchRef.current = true;
            const t = e.touches[0];
            touchStartRef.current = {
              x: t.clientX,
              y: t.clientY,
              t: Date.now(),
            };
            swipeHandledRef.current = false;
            softDropActiveRef.current = false;
          }}
          onTouchMove={(e) => {
            if (!touchStartRef.current || swipeHandledRef.current) return;
            const t = e.touches[0];
            const dx = t.clientX - touchStartRef.current.x;
            const dy = t.clientY - touchStartRef.current.y;
            const THRESHOLD = 30;
            /* Horizontal swipe */
            if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
              sendDir(dx > 0 ? 'right' : 'left');
              touchStartRef.current = {
                x: t.clientX,
                y: t.clientY,
                t: Date.now(),
              };
              swipeHandledRef.current = true;
            }
            /* Swipe down → soft drop */
            if (dy > THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
              if (!softDropActiveRef.current) {
                sendDir('soft-drop-start');
                softDropActiveRef.current = true;
              }
              swipeHandledRef.current = true;
            }
            /* Swipe up → rotate */
            if (dy < -THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
              sendDir('rotate');
              swipeHandledRef.current = true;
              touchStartRef.current = null;
            }
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            if (softDropActiveRef.current) {
              sendDir('soft-drop-stop');
              softDropActiveRef.current = false;
            }
            /* Double-tap = hard drop (intentional only) */
            if (touchStartRef.current && !swipeHandledRef.current) {
              const elapsed = Date.now() - touchStartRef.current.t;
              if (elapsed < 200) {
                const now = Date.now();
                if (now - lastTapRef.current < 300) {
                  /* Double tap → hard drop */
                  sendDir('hard-drop');
                  lastTapRef.current = 0;
                } else {
                  lastTapRef.current = now;
                }
              }
            }
            touchStartRef.current = null;
          }}
          onTouchCancel={() => {
            if (softDropActiveRef.current) {
              sendDir('soft-drop-stop');
              softDropActiveRef.current = false;
            }
            touchStartRef.current = null;
          }}
        >
          {/* Loading overlay */}
          <div
            ref={overlayRef}
            className={`absolute inset-0 z-20 bg-background flex flex-col items-center justify-center rounded-xl transition-opacity duration-500 ${sceneReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          >
            <div className='text-4xl animate-bounce mb-3'>🧱</div>
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
                <p className='text-6xl mb-4'>🧱</p>
                <h2 className='text-2xl font-bold text-white mb-2'>Tehencis</h2>
                <p className='text-white/60 text-sm mb-1'>
                  Level: {diffInfo.emoji} {diffInfo.label}
                </p>
                <p className='text-white/40 text-xs'>{diffInfo.desc}</p>
                <div className='mt-4 space-y-1'>
                  <p className='text-white/50 text-sm animate-pulse'>
                    Tap layar untuk mulai
                  </p>
                  <p className='text-white/30 text-xs'>
                    ← → Geser · ↑ Putar · ↓ Jatuh pelan · 2x Tap = Jatuh cepat
                  </p>
                  <p className='text-white/30 text-xs'>
                    💾 Hold: Keyboard C · Swipe ↑ juga putar
                  </p>
                </div>
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
            <p className='text-2xl font-bold text-white mb-1'>
              Skor: {gs.score}
            </p>
            <div className='text-sm text-white/60 mb-3 text-center space-y-0.5'>
              <p>
                Level {gs.level} · {gs.lines} baris
              </p>
              <p>
                Tetris: {gs.tetrises} · Triple: {gs.triples} · Double:{' '}
                {gs.doubles}
                {gs.tSpins > 0 && ` · T-Spin: ${gs.tSpins}`}
              </p>
              {gs.maxCombo > 0 && <p>Max Combo: {gs.maxCombo}</p>}
            </div>
            <Button
              onClick={handleRestart}
              className='gap-2'
            >
              🔄 Main Lagi
            </Button>
          </div>
        )}
      </div>
      {/* Difficulty selector */}
      {!gs.started && !gs.gameOver && (
        <div className='px-3 py-2 flex flex-wrap items-center justify-center gap-2'>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              onClick={() => changeDifficulty(d.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                d.color,
                difficulty === d.key && 'ring-2 ring-white/30 scale-105',
              )}
            >
              {d.emoji} {d.label}
            </button>
          ))}
        </div>
      )}
      {/* Simple footer */}
      <div className='px-3 py-2 border-t border-border/30'>
        <div className='flex items-center justify-center gap-2'>
          {gs.gameOver && (
            <Button
              onClick={handleRestart}
              size='sm'
              className='gap-1'
            >
              🔄 Main Lagi
            </Button>
          )}
          {gs.started && !gs.gameOver && (
            <p className='text-center text-xs text-muted-foreground'>
              ← → Geser · ↑ Putar · 2x Tap = Jatuh · ↓ Soft Drop · Keyboard:
              C=Hold
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
