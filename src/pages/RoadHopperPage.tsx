import { ArcadeShell } from '@/components/ArcadeShell';
import { HopperScene } from '@/games/arcade/HopperScene';

export function RoadHopperPage() {
  return (
    <ArcadeShell
      title="Babi Nyabrang"
      scene={HopperScene}
      hints={
        <>
          <span className="text-amber-400/40">Tap: Lompat maju</span>
          <span>Swipe / Panah: Arah lain</span>
          <span>Isi 5 kandang sebelum waktu habis</span>
        </>
      }
    />
  );
}
