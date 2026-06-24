import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  requestOtp,
  verifyOtp,
  loginNumber,
  loginVerify,
  validateReferralCode,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

import { toast } from 'sonner';

// Curated dial codes — Indonesia first (default). Covers the common origins of
// KutuLoncat players + foreign friends (CN/TW/BD/IN/SG/MY/etc).
const COUNTRIES = [
  { code: '+62', flag: '🇮🇩' },
  { code: '+86', flag: '🇨🇳' },
  { code: '+886', flag: '🇹🇼' },
  { code: '+81', flag: '🇯🇵' },
  { code: '+82', flag: '🇰🇷' },
  { code: '+852', flag: '🇭🇰' },
  { code: '+880', flag: '🇧🇩' },
  { code: '+91', flag: '🇮🇳' },
  { code: '+65', flag: '🇸🇬' },
  { code: '+60', flag: '🇲🇾' },
  { code: '+66', flag: '🇹🇭' },
  { code: '+84', flag: '🇻🇳' },
  { code: '+63', flag: '🇵🇭' },
  { code: '+1', flag: '🇺🇸' },
  { code: '+44', flag: '🇬🇧' },
  { code: '+61', flag: '🇦🇺' },
  { code: '+971', flag: '🇦🇪' },
  { code: '+966', flag: '🇸🇦' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser, setBlocked } = useAuth();
  const [step, setStep] = useState<'login' | 'register' | 'otp' | 'login-otp'>(
    'register',
  );
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referrerName, setReferrerName] = useState('');
  const [referralLocked, setReferralLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dialCode, setDialCode] = useState('+62');

  // Compose the full international number. If the user typed an explicit "+",
  // trust it verbatim. Otherwise prepend the selected country dial code.
  // Indonesia (+62) stays default so the familiar 08xx flow keeps working.
  function composedPhone() {
    const raw = phone.trim();
    if (raw.startsWith('+')) return raw;
    const cc = dialCode.replace(/\D/g, '');
    let local = raw.replace(/\D/g, '').replace(/^0+/, '');
    if (cc && local.startsWith(cc)) local = local.slice(cc.length);
    return `${dialCode}${local}`;
  }

  // Pick up referral code from URL (?ref=1234)
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setReferralCode(ref);
      setReferralLocked(true);
      setStep('register');
      validateReferralCode(ref).then((r) => {
        if (r.valid && r.referrerName) setReferrerName(r.referrerName);
      });
    }
  }, [searchParams]);

  async function handleCheckReferral(val: string) {
    setReferralCode(val);
    setReferrerName('');
    if (val.length >= 4) {
      try {
        const r = await validateReferralCode(val);
        if (r.valid && r.referrerName) setReferrerName(r.referrerName);
      } catch {
        /* ignore */
      }
    }
  }

  async function handleLogin() {
    if (!phone.trim()) return toast.error('Masukkan nomor telepon');
    setLoading(true);
    try {
      const r = await loginNumber(composedPhone());
      if (r.ok && r.needOtp) {
        if (r.sent === false) {
          toast.warning(
            'OTP gagal dikirim via WhatsApp. Hubungi admin atau coba lagi.',
          );
        } else {
          toast.success('OTP login dikirim via WhatsApp');
        }
        setStep('login-otp');
      } else if ((r as any).error === 'blocked') {
        setBlocked({
          message:
            (r as any).message ||
            'Akun kamu diblokir. Hubungi admin KutuLoncat via WhatsApp.',
          whatsappLink: (r as any).whatsappLink || 'https://wa.me/919629784300',
        });
        navigate('/');
      } else {
        toast.error(r.error || 'Nomor belum terdaftar');
      }
    } catch {
      toast.error('Gagal login');
    }
    setLoading(false);
  }

  async function handleLoginVerify() {
    if (!code.trim()) return toast.error('Masukkan kode OTP');
    setLoading(true);
    try {
      const r = await loginVerify(composedPhone(), code);
      if (r.ok && r.user) {
        setUser(r.user);
        toast.success(`Selamat datang kembali, ${r.user.name}!`);
        navigate('/');
      } else if ((r as any).error === 'blocked') {
        setBlocked({
          message:
            (r as any).message ||
            'Akun kamu diblokir. Hubungi admin KutuLoncat via WhatsApp.',
          whatsappLink: (r as any).whatsappLink || 'https://wa.me/919629784300',
        });
        navigate('/');
      } else {
        toast.error('Kode OTP salah atau expired');
      }
    } catch {
      toast.error('Gagal verifikasi OTP');
    }
    setLoading(false);
  }

  async function handleRequestOtp() {
    if (!name.trim() || !phone.trim())
      return toast.error('Isi nama & nomor HP');
    setLoading(true);
    try {
      const r = await requestOtp(name, composedPhone(), email, referralCode);
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
      const r = await verifyOtp(composedPhone(), code);
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
        <img
          src='/favicon.png'
          alt='KutuLoncat'
          className='h-16 w-16 rounded-2xl'
        />
        <h1 className='text-3xl font-bold tracking-tight'>KutuLoncat Games</h1>
        <p className='text-muted-foreground'>Game asik buat bercanda 🎮</p>
      </div>

      <Card className='w-full max-w-sm'>
        {step === 'login' && (
          <>
            <CardHeader>
              <CardTitle>Login</CardTitle>
              <CardDescription>
                Masuk dengan nomor telepon (OTP dikirim via WhatsApp)
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex gap-2'>
                <select
                  value={dialCode}
                  onChange={(e) => setDialCode(e.target.value)}
                  aria-label='Kode negara'
                  className='shrink-0 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <Input
                  className='flex-1'
                  placeholder='Nomor HP (mis. 81234567890)'
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
              <Button
                className='w-full'
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Kirim OTP Login'}
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

        {step === 'login-otp' && (
          <>
            <CardHeader>
              <CardTitle>Verifikasi Login</CardTitle>
              <CardDescription>
                Masukkan kode OTP 6 digit dari WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Input
                placeholder='123456'
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                onKeyDown={(e) => e.key === 'Enter' && handleLoginVerify()}
                maxLength={6}
                className='text-center tracking-[0.5em] text-lg font-mono'
              />
              <Button
                className='w-full'
                onClick={handleLoginVerify}
                disabled={loading}
              >
                {loading ? 'Verifikasi...' : 'Masuk'}
              </Button>
              <div className='text-center text-sm text-muted-foreground'>
                <button
                  className='text-primary underline-offset-4 hover:underline cursor-pointer'
                  onClick={() => {
                    setCode('');
                    setStep('login');
                  }}
                >
                  Kirim ulang OTP
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
              <div className='flex gap-2'>
                <select
                  value={dialCode}
                  onChange={(e) => setDialCode(e.target.value)}
                  aria-label='Kode negara'
                  className='shrink-0 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <Input
                  className='flex-1'
                  placeholder='Nomor HP (mis. 81234567890)'
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <Input
                placeholder='Email (opsional)'
                type='email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div>
                <Input
                  placeholder='Kode referral (opsional)'
                  value={referralCode}
                  onChange={(e) =>
                    handleCheckReferral(
                      e.target.value.replace(/\D/g, '').slice(0, 5),
                    )
                  }
                  maxLength={5}
                  readOnly={referralLocked}
                  disabled={referralLocked}
                />
                {referrerName && (
                  <p className='mt-1 text-xs text-green-600'>
                    Direferensikan oleh: {referrerName}
                  </p>
                )}
              </div>
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
