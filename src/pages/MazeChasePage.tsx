import { ArcadeShell } from '@/components/ArcadeShell';
import { MazeScene } from '@/games/arcade/MazeScene';

export function MazeChasePage() {
  return (
    <ArcadeShell
      title="Lahap Labirin"
      scene={MazeScene}
      hints={
        <>
          <span>Swipe / Panah: Belok</span>
          <span className="text-amber-400/40">Pelet besar: hantu bisa dimakan</span>
          <span>Rantai hantu: 200-1600</span>
        </>
      }
    />
  );
}
