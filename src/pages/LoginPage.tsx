import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { requestOtp, verifyOtp, loginNumber } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Gamepad2 } from 'lucide-react';
import { toast } from 'sonner';

export function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [step, setStep] = useState<'login' | 'register' | 'otp'>('register');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!phone.trim()) return toast.error('Masukkan nomor telepon');
    setLoading(true);
    try {
      const r = await loginNumber(phone);
      if (r.ok && r.user) {
        setUser(r.user);
        toast.success(`Selamat datang, ${r.user.name}!`);
        navigate('/');
      } else {
        toast.error(r.error || 'Nomor belum terdaftar');
      }
    } catch {
      toast.error('Gagal login');
    }
    setLoading(false);
  }

  async function handleRequestOtp() {
    if (!name.trim() || !phone.trim())
      return toast.error('Isi nama & nomor HP');
    setLoading(true);
    try {
      const r = await requestOtp(name, phone, email);
      if (r.ok) {
        if (r.registered) {
          toast.info('Nomor sudah terdaftar. Silakan login.');
          setStep('login');
        } else {
          if (r.sent === false) {
            toast.warning(
              'OTP gagal dikirim via WhatsApp. Hubungi admin atau coba lagi.',
            );
          } else {
            toast.success('OTP dikirim via WhatsApp (berlaku 60 menit)');
          }
          setStep('otp');
        }
      }
    } catch {
      toast.error('Gagal mengirim OTP');
    }
    setLoading(false);
  }

  async function handleVerifyOtp() {
    if (!code.trim()) return toast.error('Masukkan kode OTP');
    setLoading(true);
    try {
      const r = await verifyOtp(phone, code);
      if (r.ok && r.user) {
        setUser(r.user);
        toast.success('Registrasi berhasil!');
        navigate('/');
      } else {
        toast.error('Kode OTP salah atau expired');
      }
    } catch {
      toast.error('Gagal verifikasi OTP');
    }
    setLoading(false);
  }

  return (
    <div className='flex min-h-svh flex-col items-center justify-center bg-background p-4'>
      <div className='mb-8 flex flex-col items-center gap-3'>
        <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
          <Gamepad2 className='h-8 w-8' />
        </div>
        <h1 className='text-3xl font-bold tracking-tight'>KutuLoncat Games</h1>
        <p className='text-muted-foreground'>Game asik buat bercanda 🎮</p>
      </div>

      <Card className='w-full max-w-sm'>
        {step === 'login' && (
          <>
            <CardHeader>
              <CardTitle>Login</CardTitle>
              <CardDescription>Masuk dengan nomor telepon</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Input
                placeholder='08xx atau +62xxx'
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <Button
                className='w-full'
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Masuk'}
              </Button>
              <div className='text-center text-sm text-muted-foreground'>
                Belum punya akun?{' '}
                <button
                  className='text-primary underline-offset-4 hover:underline cursor-pointer'
                  onClick={() => setStep('register')}
                >
                  Daftar
                </button>
              </div>
            </CardContent>
          </>
        )}

        {step === 'register' && (
          <>
            <CardHeader>
              <CardTitle>Daftar</CardTitle>
              <CardDescription>Buat akun baru via WhatsApp OTP</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Input
                placeholder='Nama'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                placeholder='08xx atau +62xxx'
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input
                placeholder='Email (opsional)'
                type='email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                className='w-full'
                onClick={handleRequestOtp}
                disabled={loading}
              >
                {loading ? 'Mengirim...' : 'Kirim OTP'}
              </Button>
              <div className='text-center text-sm text-muted-foreground'>
                Sudah punya akun?{' '}
                <button
                  className='text-primary underline-offset-4 hover:underline cursor-pointer'
                  onClick={() => setStep('login')}
                >
                  Login
                </button>
              </div>
            </CardContent>
          </>
        )}

        {step === 'otp' && (
          <>
            <CardHeader>
              <CardTitle>Verifikasi OTP</CardTitle>
              <CardDescription>
                Masukkan kode 6 digit dari WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Input
                placeholder='123456'
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                maxLength={6}
                className='text-center tracking-[0.5em] text-lg font-mono'
              />
              <Button
                className='w-full'
                onClick={handleVerifyOtp}
                disabled={loading}
              >
                {loading ? 'Verifikasi...' : 'Verifikasi'}
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
