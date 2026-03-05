import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const DISMISS_KEY = 'pwa-install-dismissed';
const DELAY_MS = 3 * 60 * 1000; // 3 minutes

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if already dismissed today
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedDate = new Date(Number(dismissed)).toDateString();
      if (dismissedDate === new Date().toDateString()) return;
    }

    // Check if standalone (already installed)
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone
    )
      return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Show after 3 minutes delay
  useEffect(() => {
    if (!deferredPrompt) return;
    const timer = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [deferredPrompt]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }, []);

  if (!visible) return null;

  return (
    <div className='fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm animate-slide-up'>
      <div className='rounded-xl border border-border bg-card shadow-lg p-4'>
        <div className='flex items-start gap-3'>
          <img
            src='/favicon.png'
            alt='KutuLoncat'
            className='h-10 w-10 rounded-lg shrink-0'
          />
          <div className='flex-1 min-w-0'>
            <h3 className='font-semibold text-sm'>Install KutuLoncat</h3>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Pasang di homescreen untuk akses cepat tanpa buka browser!
            </p>
            <div className='flex gap-2 mt-2'>
              <Button
                size='sm'
                onClick={handleInstall}
                className='text-xs'
              >
                Install
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={handleDismiss}
                className='text-xs'
              >
                Nanti aja
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className='text-muted-foreground hover:text-foreground'
          >
            <X className='h-4 w-4' />
          </button>
        </div>
      </div>
    </div>
  );
}
