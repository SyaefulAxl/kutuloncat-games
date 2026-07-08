import { ArcadeShell } from '@/components/ArcadeShell';
import { BrickScene } from '@/games/arcade/BrickScene';

export function BrickBreakerPage() {
  return (
    <ArcadeShell
      title="Pecah Bhata"
      scene={BrickScene}
      hints={
        <>
          <span>Geser / Mouse: Paddle</span>
          <span className="text-amber-400/40">Tap / Space: Luncurkan</span>
          <span>Combo tanpa sentuh paddle = x5</span>
        </>
      }
    />
  );
}
