import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Phaser from 'phaser';
import { PhaserGame } from '@/components/PhaserGame';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { isArcadeMuted, toggleArcadeMute } from '@/games/arcade/kit';

// Shared page chrome for the Season 2 arcade games: header (back + mute),
// the 8:7 sharp-canvas box, and a hints row. All controls are in-canvas
// (drag / tap / swipe handled by the scene), so pages stay thin.
export function ArcadeShell({
  title,
  scene,
  hints,
}: {
  title: string;
  scene: typeof Phaser.Scene;
  hints: ReactNode;
}) {
  const navigate = useNavigate();
  const [muted, setMuted] = useState(() => isArcadeMuted());

  useEffect(() => {
    const h = () => setMuted(isArcadeMuted()); // M key inside the game (kit.ts ArcadeScene)
    window.addEventListener('arcade-mute', h);
    return () => window.removeEventListener('arcade-mute', h);
  }, []);

  // 1024×896 backing store = 512×448 design space at 2× (see kit.ts RES)
  const config = useMemo(
    () =>
      ({
        type: Phaser.AUTO,
        width: 1024,
        height: 896,
        backgroundColor: '#000000',
        scene,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        input: { mouse: { preventDefaultWheel: false }, touch: { capture: true } },
      }) satisfies Phaser.Types.Core.GameConfig,
    [scene],
  );

  return (
    <div className="min-h-svh flex flex-col bg-[#000] text-white font-mono relative select-none">
      <header className="relative z-10 flex items-center justify-between px-3 py-1.5 border-b border-cyan-400/20 bg-gradient-to-r from-black/70 via-[#0c0a26]/70 to-black/70 backdrop-blur-sm">
        <Button
          onClick={() => navigate('/')}
          variant="outline"
          size="sm"
          className="gap-1.5 bg-black/40 border-cyan-400/25 text-cyan-200/70 hover:bg-cyan-400/10 hover:text-cyan-100 text-[10px] h-7"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Button>
        <h1 className="text-[10px] tracking-[0.3em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-amber-300 font-bold">
          {title}
        </h1>
        <div className="w-16 flex justify-end">
          <button
            onClick={() => setMuted(!toggleArcadeMute())}
            aria-label={muted ? 'Nyalakan suara' : 'Matikan suara'}
            className="flex items-center justify-center h-7 w-7 rounded border border-cyan-400/25 bg-black/40 text-cyan-200/60 hover:bg-cyan-400/10 hover:text-cyan-100 active:scale-95 transition-all"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center p-1 min-h-0">
        <div
          className="w-full max-w-[760px] aspect-[8/7] max-h-[80svh] relative overflow-hidden rounded-sm border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
          onContextMenu={(e) => e.preventDefault()}
        >
          <PhaserGame config={config} className="w-full h-full" />
        </div>
      </div>

      <div className="relative z-10 px-3 py-2 border-t border-cyan-400/10 bg-gradient-to-b from-black/80 to-[#0c0a26]/80 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-4 text-[8px] text-cyan-200/25 tracking-wider flex-wrap">
          {hints}
        </div>
      </div>
    </div>
  );
}
