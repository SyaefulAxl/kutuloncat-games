import { ArcadeShell } from '@/components/ArcadeShell';
import { RaidScene } from '@/games/arcade/RaidScene';

export function SpaceRaidPage() {
  return (
    <ArcadeShell
      title="Serbu Balik Alien"
      scene={RaidScene}
      hints={
        <>
          <span>Geser / Panah: Kemudi</span>
          <span className="text-amber-400/40">Tembakan otomatis</span>
          <span>Rantai kill = x5</span>
          <span className="text-red-500/30">Wave 5: BOSS</span>
        </>
      }
    />
  );
}
