import { ArcadeShell } from '@/components/ArcadeShell';
import { HopperScene } from '@/games/arcade/HopperScene';

export function RoadHopperPage() {
  return (
    <ArcadeShell
      title="Babi Ingkang Kapundut"
      scene={HopperScene}
      hints={
        <>
          <span className="text-pink-400/40">Tap: Lompat maju</span>
          <span>Swipe / Panah: Arah lain</span>
          <span className="text-pink-400/40">❤ Power-up: Perisai, Beku, x2 Skor, +Waktu</span>
          <span>Rayu 5 perempuan di ujung jalan!</span>
        </>
      }
    />
  );
}
