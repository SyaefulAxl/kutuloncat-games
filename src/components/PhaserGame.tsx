import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { cn } from '@/lib/utils';

interface PhaserGameProps {
  config: Phaser.Types.Core.GameConfig;
  className?: string;
}

export function PhaserGame({ config, className }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const game = new Phaser.Game({
      ...config,
      parent: containerRef.current,
    });
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('w-full', className)}
    />
  );
}
