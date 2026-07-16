import { ArcadeShell } from '@/components/ArcadeShell';
import { HopperGlossary } from '@/components/arcade/HopperGlossary';
import { HopperScene } from '@/games/arcade/HopperScene';

export function RoadHopperPage() {
  return (
    <ArcadeShell
      title="Waran Ingkang Kapundut"
      scene={HopperScene}
      hints={
        <>
          <span className="text-amber-400/40">Tap: Lompat maju</span>
          <span>Swipe / Panah: Arah lain</span>
          <span>Rayu 5 perempuan cantik sebelum waktu habis</span>
        </>
      }
      info={({ onClose }) => <HopperGlossary onClose={onClose} />}
    />
  );
}
