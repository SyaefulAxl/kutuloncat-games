import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhaserGame } from '@/components/PhaserGame';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import Phaser from 'phaser';
import { SpacePanicScene, SPGameState, toggleSpMute, isSpMuted } from '@/games/spacepanic/GameScene';

const EMPTY_STATE: SPGameState = { score: 0, level: 1, lives: 3, oxygen: 100, oxygenMax: 100, gameOver: false, started: false, enemiesAlive: 0, state: 'TITLE', hiScore: 99900, menuCursor: 0, initialsEntry: false, initials: ['A','A','A'] };

function StarField() {
  const stars = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 2 + 0.5, delay: Math.random() * 3, duration: Math.random() * 2 + 1,
    })), []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map(s => (
        <div key={s.id} className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size + 'px', height: s.size + 'px',
            animation: `sp-twinkle ${s.duration}s ${s.delay}s infinite alternate`, opacity: 0.3 }} />
      ))}
    </div>
  );
}

export function SpacePanicPage() {
  const [gs, setGs] = useState<SPGameState>(EMPTY_STATE);
  const [sceneReady, setSceneReady] = useState(false);
  const [muted, setMuted] = useState(() => isSpMuted());

  useEffect(() => {
    const handler = () => {
      const s = (window as any).__spState as SPGameState | undefined;
      if (s) { setGs({ ...s }); }
    };
    const readyHandler = () => setSceneReady(true);
    const muteHandler = () => setMuted(isSpMuted()); // M key inside the game
    window.addEventListener('sp-update', handler);
    window.addEventListener('sp-scene-ready', readyHandler);
    window.addEventListener('sp-mute', muteHandler);
    return () => {
      window.removeEventListener('sp-update', handler);
      window.removeEventListener('sp-scene-ready', readyHandler);
      window.removeEventListener('sp-mute', muteHandler);
    };
  }, []);

  // Fixed logical resolution: the 16×12 grid at 32px cells + 64px HUD fills
  // 512×448 exactly, and Phaser FIT scales that canvas into whatever box the
  // page provides. Sizing the canvas from the viewport (the old approach) let
  // cellSize drop below 32 on phones, so the grid no longer spanned the
  // canvas — the leftover strip on the right was an invisible death pit and
  // swallowed every right-side enemy spawn.
  // 1024×896 backing store = the scene's 512×448 design space rendered at 2×
  // (see RES in GameScene) so the canvas stays sharp when scaled up to the
  // ~760px display box on laptops and on high-DPI phones.
  const config = useMemo(
    () =>
      ({
        type: Phaser.AUTO,
        width: 1024,
        height: 896,
        backgroundColor: '#000000',
        scene: SpacePanicScene,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        input: { mouse: { preventDefaultWheel: false }, touch: { capture: true } },
      }) satisfies Phaser.Types.Core.GameConfig,
    [],
  );

  const touchAction = (action: string) => {
    const scene = (window as any).__spScene as SpacePanicScene | undefined;
    if (!scene) return;
    (scene as any).touch[action] = 1;
  };
  const touchRelease = (action: string) => {
    const scene = (window as any).__spScene as SpacePanicScene | undefined;
    if (!scene) return;
    (scene as any).touch[action] = 0;
  };

  const handleRestart = useCallback(() => {
    (window as any).__spScene?.restart();
  }, []);

  return (
    <div className="min-h-svh flex flex-col bg-[#000] text-white font-mono relative">
      <StarField />

      {/* Arcade Header */}
      <header className="relative z-10 flex items-center justify-between px-3 py-1.5 border-b border-cyan-400/20 bg-gradient-to-r from-black/70 via-[#0c0a26]/70 to-black/70 backdrop-blur-sm shadow-[0_1px_16px_rgba(124,227,255,0.08)]">
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-1.5 bg-black/40 border-cyan-400/25 text-cyan-200/70 hover:bg-cyan-400/10 hover:text-cyan-100 text-[10px] h-7">
            <ArrowLeft className="h-3 w-3" /> Back
          </Button>
        </Link>
        <h1 className="text-[10px] tracking-[0.3em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-amber-300 font-bold">Space Panic</h1>
        <div className="w-16 flex justify-end">
          <button
            onClick={() => setMuted(!toggleSpMute())}
            aria-label={muted ? 'Nyalakan suara' : 'Matikan suara'}
            className="flex items-center justify-center h-7 w-7 rounded border border-cyan-400/25 bg-black/40 text-cyan-200/60 hover:bg-cyan-400/10 hover:text-cyan-100 active:scale-95 transition-all">
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {/* Game canvas — 8:7 box matches the 512×448 logical size; max-h keeps
          it inside short viewports (landscape phones), where FIT letterboxes
          against the black backdrop instead of overflowing the controls. */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-1 min-h-0">
        <div className="w-full max-w-[760px] aspect-[8/7] max-h-[76svh] relative overflow-hidden rounded-sm border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
          <div className={`absolute inset-0 z-20 bg-black flex flex-col items-center justify-center transition-opacity duration-500 ${sceneReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="w-6 h-6 border border-white/20 border-t-white/60 rounded-full animate-spin mb-2" />
            <p className="text-white/30 text-[8px] animate-pulse tracking-widest uppercase">Loading...</p>
          </div>

          <PhaserGame config={config} className="w-full h-full" />
        </div>
      </div>

      {/* Mobile Touch Controls */}
      <div className="relative z-10 px-3 py-2 border-t border-amber-400/15 bg-gradient-to-b from-black/80 to-[#0c0a26]/80 backdrop-blur-sm">
        {/* grid (not flex justify-between) so the score/level readout sits at
            the true midpoint regardless of the D-Pad vs action-button widths */}
        <div className="grid grid-cols-[120px_1fr_120px] md:hidden items-center px-1">
          {/* D-Pad */}
          <div className="flex justify-center">
          <div className="grid grid-cols-3 gap-1 w-28">
            <div />
            <button onTouchStart={e=>{e.preventDefault();touchAction('up')}} onTouchEnd={e=>{e.preventDefault();touchRelease('up')}}
              className="flex items-center justify-center h-10 rounded bg-cyan-400/[0.07] active:bg-cyan-400/20 border border-cyan-400/20 text-cyan-200/60 text-base">↑</button>
            <div />
            <button onTouchStart={e=>{e.preventDefault();touchAction('left')}} onTouchEnd={e=>{e.preventDefault();touchRelease('left')}}
              className="flex items-center justify-center h-10 rounded bg-cyan-400/[0.07] active:bg-cyan-400/20 border border-cyan-400/20 text-cyan-200/60 text-base">←</button>
            <button onTouchStart={e=>{e.preventDefault();touchAction('start')}} onTouchEnd={e=>{e.preventDefault();touchRelease('start')}}
              className="flex items-center justify-center h-10 rounded bg-amber-400/[0.07] active:bg-amber-400/20 border border-amber-400/20 text-amber-200/60 text-[8px] font-bold uppercase tracking-wider">OK</button>
            <button onTouchStart={e=>{e.preventDefault();touchAction('right')}} onTouchEnd={e=>{e.preventDefault();touchRelease('right')}}
              className="flex items-center justify-center h-10 rounded bg-cyan-400/[0.07] active:bg-cyan-400/20 border border-cyan-400/20 text-cyan-200/60 text-base">→</button>
            <div />
            <button onTouchStart={e=>{e.preventDefault();touchAction('down')}} onTouchEnd={e=>{e.preventDefault();touchRelease('down')}}
              className="flex items-center justify-center h-10 rounded bg-cyan-400/[0.07] active:bg-cyan-400/20 border border-cyan-400/20 text-cyan-200/60 text-base">↓</button>
            <div />
          </div>
          </div>

          {/* Info */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-[9px] text-amber-200/60 tabular-nums">{gs.score}</div>
            <div className="text-[8px] text-cyan-200/30">LV {gs.level}</div>
            <div className="text-[7px] text-cyan-200/25 uppercase tracking-wider">OK = Pause</div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-center gap-2">
            <button onTouchStart={e=>{e.preventDefault();touchAction('dig')}} onTouchEnd={e=>{e.preventDefault();touchRelease('dig')}}
              className="flex items-center justify-center h-12 w-14 rounded-full bg-gradient-to-br from-yellow-500/10 to-orange-500/10 active:from-yellow-500/30 active:to-orange-500/30 border border-yellow-500/30 active:border-yellow-500/60 text-yellow-500/70 text-[9px] font-bold uppercase tracking-wider transition-all duration-100 active:scale-95">
              Dig</button>
            <button onTouchStart={e=>{e.preventDefault();touchAction('hit')}} onTouchEnd={e=>{e.preventDefault();touchRelease('hit')}}
              className="flex items-center justify-center h-12 w-14 rounded-full bg-gradient-to-br from-red-500/10 to-orange-500/10 active:from-red-500/30 active:to-orange-500/30 border border-red-500/30 active:border-red-500/60 text-red-500/70 text-[9px] font-bold uppercase tracking-wider transition-all duration-100 active:scale-95">
              Hit</button>
          </div>
        </div>

        {/* Keyboard hints */}
        <div className="hidden md:flex items-center justify-center gap-4 text-[8px] text-cyan-200/25 tracking-wider">
          <span>← → Walk</span>
          <span>↑ ↓ Climb</span>
          <span className="text-amber-400/40">Z Dig</span>
          <span className="text-red-500/30">X Hit</span>
          <span className="text-cyan-300/30">P Pause</span>
          <span className="text-cyan-300/30">M Mute</span>
          <span className="text-cyan-300/30">Enter Start</span>
        </div>

        {/* Restart button (when game over) */}
        {gs.gameOver && (
          <div className="flex justify-center mt-1">
            <button onClick={handleRestart}
              className="px-4 py-1 text-[9px] text-amber-200/70 border border-amber-400/30 rounded hover:bg-amber-400/10 uppercase tracking-wider">
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
