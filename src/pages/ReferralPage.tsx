import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getMyReferral, type ReferralEntry } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Copy,
  Check,
  Users,
  DollarSign,
  UserPlus,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

export function ReferralPage() {
  const { user } = useAuth();
  const [data, setData] = useState<{
    referralCode: string;
    referralLink: string;
    totalReferrals: number;
    activeCount: number;
    inactiveCount: number;
    totalEarnings: number;
    valuePerReferral: number;
    referrals: ReferralEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getMyReferral()
      .then((r) => {
        if (r.ok) setData(r);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Tersalin!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Gagal menyalin');
    }
  }

  if (loading) {
    return (
      <div className='min-h-svh pb-20 md:pb-4'>
        <Navbar />
        <main className='mx-auto max-w-3xl px-3 sm:px-4 py-4 sm:py-6'>
          <div className='py-12 text-center text-muted-foreground animate-pulse'>
            Loading...
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className='min-h-svh pb-20 md:pb-4'>
        <Navbar />
        <main className='mx-auto max-w-3xl px-3 sm:px-4 py-4 sm:py-6'>
          <div className='py-12 text-center text-muted-foreground'>
            Gagal memuat data referral.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className='min-h-svh pb-20 md:pb-4'>
      <Navbar />
      <main className='mx-auto max-w-3xl px-3 sm:px-4 py-4 sm:py-6'>
        <h1 className='text-xl sm:text-2xl font-bold mb-3 sm:mb-4'>
          💰 Referral Dashboard
        </h1>

        {/* Referral Code & Link */}
        <Card className='mb-4'>
          <CardHeader>
            <CardTitle className='text-lg'>Kode Referralmu</CardTitle>
            <CardDescription>
              Bagikan kode atau link ini ke temanmu
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex items-center gap-2'>
              <div className='flex-1 rounded-lg border bg-muted/50 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em]'>
                {data.referralCode}
              </div>
              <Button
                variant='outline'
                size='icon'
                onClick={() => handleCopy(data.referralCode)}
              >
                {copied ? (
                  <Check className='h-4 w-4' />
                ) : (
                  <Copy className='h-4 w-4' />
                )}
              </Button>
            </div>
            <div className='flex items-center gap-2'>
              <div className='flex-1 rounded-lg border bg-muted/50 px-3 py-2 text-xs truncate'>
                {data.referralLink}
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => handleCopy(data.referralLink)}
              >
                Salin Link
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4'>
          <Card>
            <CardContent className='pt-4 text-center'>
              <Users className='h-6 w-6 mx-auto mb-1 text-blue-500' />
              <div className='text-2xl font-bold'>{data.totalReferrals}</div>
              <div className='text-xs text-muted-foreground'>Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-4 text-center'>
              <UserCheck className='h-6 w-6 mx-auto mb-1 text-green-500' />
              <div className='text-2xl font-bold'>{data.activeCount}</div>
              <div className='text-xs text-muted-foreground'>Aktif</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-4 text-center'>
              <UserPlus className='h-6 w-6 mx-auto mb-1 text-orange-500' />
              <div className='text-2xl font-bold'>{data.inactiveCount}</div>
              <div className='text-xs text-muted-foreground'>Belum Aktif</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='pt-4 text-center'>
              <DollarSign className='h-6 w-6 mx-auto mb-1 text-emerald-500' />
              <div className='text-2xl font-bold'>
                Rp{data.totalEarnings.toLocaleString('id-ID')}
              </div>
              <div className='text-xs text-muted-foreground'>Total Bonus</div>
            </CardContent>
          </Card>
        </div>

        {/* Info */}
        <Card className='mb-4'>
          <CardContent className='pt-4 text-xs text-muted-foreground space-y-1'>
            <p>
              <strong>Cara kerja:</strong> Bagikan kode referral ke teman. Saat
              mereka mendaftar menggunakan kode kamu dan sudah bermain minimal 2
              game berbeda, referral menjadi <strong>aktif</strong>.
            </p>
            <p>
              Setiap referral aktif bernilai{' '}
              <strong>Rp{data.valuePerReferral.toLocaleString('id-ID')}</strong>
              .
            </p>
          </CardContent>
        </Card>

        {/* Referral List */}
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Daftar Referral</CardTitle>
          </CardHeader>
          <CardContent>
            {data.referrals.length === 0 ? (
              <div className='py-6 text-center text-muted-foreground text-sm'>
                Belum ada yang menggunakan kode referralmu.
              </div>
            ) : (
              <div className='space-y-2'>
                {data.referrals.map((ref) => (
                  <div
                    key={ref.id}
                    className='flex items-center gap-3 rounded-lg border px-3 py-2.5'
                  >
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-sm truncate'>
                        {ref.referredName}
                      </div>
                      <div className='text-[10px] text-muted-foreground'>
                        Bergabung:{' '}
                        {new Date(ref.createdAt).toLocaleDateString('id-ID')}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        ref.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                      )}
                    >
                      {ref.status === 'active' ? '✅ Aktif' : '⏳ Belum Aktif'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
