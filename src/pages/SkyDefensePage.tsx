import { ArcadeShell } from '@/components/ArcadeShell';
import { SkyScene } from '@/games/arcade/SkyScene';

export function SkyDefensePage() {
  return (
    <ArcadeShell
      title="Jaga Kotha"
      scene={SkyScene}
      hints={
        <>
          <span className="text-amber-400/40">Tap / Klik: Ledakkan pencegat</span>
          <span>Ledakan bisa berantai</span>
          <span>Lindungi 6 kota</span>
        </>
      }
    />
  );
}
