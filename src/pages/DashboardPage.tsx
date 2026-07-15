import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navbar } from '@/components/Navbar';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Swords,
  Cherry,
  Bird,
  Trophy,
  Award,
  Gamepad2,
  Blocks,
  Target,
  Skull,
  BrickWall,
  Rocket,
  Shield,
  Ghost,
  TrafficCone,
} from 'lucide-react';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Masih begadang';
  if (h < 10) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

const games = [
  {
    id: 'hangman',
    season: 1,
    title: '🇮🇩 Tebak Cellimat Pashang',
    description:
      'Tebak Cellimat Pashang Indonesia yang lucu, roasting & galau. Bisa pakai keyboard!',
    tip: '💡 Keyboard fisik juga bisa dipakai di laptop!',
    href: '/hangman',
    icon: Swords,
    gradient: 'from-blue-500/20 to-indigo-500/20',
    border: 'border-blue-500/30',
  },
  {
    id: 'fruit-ninja',
    season: 1,
    title: '🍉 Potong Bhuahaya',
    description:
      'Geser layar untuk memotong buah. Hindari bom! Kejar skor tertinggi!',
    tip: '💡 Di laptop cukup geser mouse, di HP geser jari!',
    href: '/fruit-ninja',
    icon: Cherry,
    gradient: 'from-green-500/20 to-emerald-500/20',
    border: 'border-green-500/30',
  },
  {
    id: 'flappy-bird',
    season: 1,
    title: '🐥 Piyik Mabur',
    description:
      'Terbangkan piyik melewati pipa! Tap untuk naik, hindari tabrakan!',
    tip: '💡 Tap layar atau tekan Space untuk terbang!',
    href: '/flappy-bird',
    icon: Bird,
    gradient: 'from-amber-500/20 to-yellow-500/20',
    border: 'border-amber-500/30',
  },
  {
    id: 'snake',
    season: 1,
    title: '🐍 Anomali Ulariyan',
    description:
      'Kendalikan ular, makan makanan, hindari dinding! 4 level kesulitan tersedia!',
    tip: '💡 Arrow keys / WASD atau swipe layar untuk bergerak!',
    href: '/snake',
    icon: Gamepad2,
    gradient: 'from-purple-500/20 to-pink-500/20',
    border: 'border-purple-500/30',
  },
  {
    id: 'tetris',
    season: 1,
    title: '🧱 Tehencis',
    description: 'Susun balok jatuh, bersihkan baris! Makin cepat makin susah!',
    tip: '💡 Arrow keys atau D-pad untuk gerak & putar balok!',
    href: '/tetris',
    icon: Blocks,
    gradient: 'from-cyan-500/20 to-blue-500/20',
    border: 'border-cyan-500/30',
  },
  {
    id: 'archery',
    season: 1,
    title: '🏹 AI-m Targetnya',
    description:
      'Bidik & lepas panah ke target! Hitung angin, jarak & kekuatan!',
    tip: '💡 Tahan untuk isi power, lepas untuk menembak!',
    href: '/archery',
    icon: Target,
    gradient: 'from-rose-500/20 to-orange-500/20',
    border: 'border-rose-500/30',
  },
  {
    id: 'space-panic',
    season: 2,
    title: '👾 Space Panic',
    description: 'Gali lubang, jebak alien, bertahan! Platformer legendaris 1980!',
    tip: '💡 Panah gerak & panjat, Z gali, X pukul!',
    href: '/space-panic',
    icon: Skull,
    gradient: 'from-slate-500/20 to-zinc-500/20',
    border: 'border-slate-500/30',
  },
  {
    id: 'brick-breaker',
    season: 2,
    title: '🏓 Pecah Bhata',
    description:
      'Pantulkan bola, hancurkan semua bata! Combo beruntun kali lima, power-up bertaburan!',
    tip: '💡 Geser jari / mouse untuk gerakkan paddle!',
    href: '/brick-breaker',
    icon: BrickWall,
    gradient: 'from-orange-500/20 to-red-500/20',
    border: 'border-orange-500/30',
  },
  {
    id: 'space-raid',
    season: 2,
    title: '🚀 Serbu Balik Alien',
    description:
      'Alien dari Space Panic menyerang balik! Rantai kill = skor x5, wave 5 lawan boss!',
    tip: '💡 Geser untuk kemudi, tembakan otomatis!',
    href: '/space-raid',
    icon: Rocket,
    gradient: 'from-violet-500/20 to-fuchsia-500/20',
    border: 'border-violet-500/30',
  },
  {
    id: 'sky-defense',
    season: 2,
    title: '🛡️ Jaga Kotha',
    description:
      'Rudal menghujani 6 kotamu! Tap untuk meledakkan pencegat — ledakan bisa berantai!',
    tip: '💡 Tap di langit tepat di depan rudal!',
    href: '/sky-defense',
    icon: Shield,
    gradient: 'from-emerald-500/20 to-teal-500/20',
    border: 'border-emerald-500/30',
  },
  {
    id: 'maze-chase',
    season: 2,
    title: '🟡 Lahap Labirin',
    description:
      'Makan semua titik, hindari 3 hantu! Pelet besar membalikkan keadaan: 200-400-800-1600!',
    tip: '💡 Swipe layar atau panah untuk belok!',
    href: '/maze-chase',
    icon: Ghost,
    gradient: 'from-yellow-500/20 to-amber-500/20',
    border: 'border-yellow-500/30',
  },
  {
    id: 'road-hopper',
    season: 2,
    title: '🐷 Babi Ingkang Kapundut',
    description:
      'Sebrangi jalan & sungai, rayu 5 perempuan cantik! Power-up, combo, pickup lines!',
    tip: '💡 Tap = maju, swipe = arah lain! Kumpulin power-up di median!',
    href: '/road-hopper',
    icon: TrafficCone,
    gradient: 'from-lime-500/20 to-green-500/20',
    border: 'border-lime-500/30',
  },
];

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className='min-h-svh pb-20 md:pb-4'>
      <Navbar />
      <main className='mx-auto max-w-5xl px-3 sm:px-4 py-4 sm:py-6'>
        <div className='mb-6 sm:mb-8'>
          <h1 className='text-xl sm:text-2xl font-bold md:text-3xl'>
            {getGreeting()}, {(user?.name || 'Player').split(' ')[0]} 👋
          </h1>
          <p className='mt-1 text-sm sm:text-base text-muted-foreground'>
            Pilih game dan mulai bermain!
          </p>
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          {games.map((game) => (
            <Link
              key={game.id}
              to={game.href}
            >
              <Card
                className={`group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:scale-[1.02] ${game.border}`}
              >
                <div
                  className={`absolute inset-0 bg-linear-to-br ${game.gradient} opacity-50 transition-opacity group-hover:opacity-100`}
                />
                <span
                  className={`absolute top-2 right-2 z-10 text-[9px] px-1.5 py-0.5 rounded-full border tracking-wide ${
                    game.season === 2
                      ? 'border-amber-400/40 text-amber-500 bg-amber-400/10'
                      : 'border-muted-foreground/25 text-muted-foreground/70 bg-muted/40'
                  }`}
                >
                  Season {game.season}
                </span>
                <CardHeader className='relative'>
                  <div className='flex items-center gap-3'>
                    <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10'>
                      <game.icon className='h-6 w-6 text-primary' />
                    </div>
                    <div>
                      <CardTitle className='text-lg'>{game.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='relative'>
                  <CardDescription className='text-sm'>
                    {game.description}
                  </CardDescription>
                  <p className='text-xs text-muted-foreground/70 mt-2 flex items-center gap-1'>
                    {game.tip}
                  </p>
                  <Button
                    variant='secondary'
                    size='sm'
                    className='mt-3'
                  >
                    Main Sekarang →
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className='mt-8 grid gap-4 sm:grid-cols-2'>
          <Link to='/leaderboard'>
            <Card className='group transition-all hover:shadow-md hover:scale-[1.01]'>
              <CardContent className='flex items-center gap-4 p-5'>
                <Trophy className='h-8 w-8 text-amber-500' />
                <div>
                  <h3 className='font-semibold'>Leaderboard</h3>
                  <p className='text-sm text-muted-foreground'>
                    Lihat siapa pemain terbaik
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to='/achievements'>
            <Card className='group transition-all hover:shadow-md hover:scale-[1.01]'>
              <CardContent className='flex items-center gap-4 p-5'>
                <Award className='h-8 w-8 text-purple-500' />
                <div>
                  <h3 className='font-semibold'>Achievements</h3>
                  <p className='text-sm text-muted-foreground'>
                    Koleksi badge dan raih poin
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}
