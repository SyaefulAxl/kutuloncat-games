import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateProfile, uploadPhoto } from '@/lib/api';
import { Camera, LogOut, Save, User } from 'lucide-react';
import { toast } from 'sonner';

export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama tidak boleh kosong');
    setSaving(true);
    try {
      const r = await updateProfile({ name: name.trim() });
      if (r.ok && r.user) {
        setUser(r.user);
        toast.success('Profil disimpan!');
      }
    } catch {
      toast.error('Gagal menyimpan');
    }
    setSaving(false);
  }

  function handleFileSelect() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error('Maks 2MB');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      try {
        const r = await uploadPhoto(dataUrl);
        if (r.ok && r.photoUrl) {
          setUser({ ...user!, photoUrl: r.photoUrl });
          toast.success('Foto diupdate!');
        }
      } catch {
        toast.error('Gagal upload foto');
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className='min-h-svh pb-20 md:pb-4'>
      <Navbar />
      <main className='mx-auto max-w-lg px-4 py-6'>
        <h1 className='text-2xl font-bold mb-6'>Profil</h1>

        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Foto & Informasi</CardTitle>
          </CardHeader>
          <CardContent className='space-y-6'>
            {/* Avatar */}
            <div className='flex justify-center'>
              <div className='relative group'>
                <div className='h-24 w-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border'>
                  {user?.photoUrl ? (
                    <img
                      src={user.photoUrl}
                      alt='foto'
                      className='h-full w-full object-cover'
                    />
                  ) : (
                    <User className='h-10 w-10 text-muted-foreground' />
                  )}
                </div>
                <button
                  className='absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-colors cursor-pointer'
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className='h-4 w-4' />
                </button>
                <input
                  ref={fileRef}
                  type='file'
                  accept='image/png,image/jpeg,image/webp'
                  className='hidden'
                  onChange={handleFileSelect}
                />
              </div>
            </div>

            {/* Name */}
            <div className='space-y-2'>
              <label className='text-sm font-medium text-muted-foreground'>
                Nama
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
              />
            </div>

            {/* Read-only info */}
            <div className='space-y-2'>
              <label className='text-sm font-medium text-muted-foreground'>
                Telepon
              </label>
              <Input
                value={user?.phone || ''}
                disabled
              />
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='rounded-lg bg-muted/50 p-3 text-center'>
                <div className='text-2xl font-bold'>
                  {user?.loginCount || 0}
                </div>
                <div className='text-xs text-muted-foreground'>Total Login</div>
              </div>
              <div className='rounded-lg bg-muted/50 p-3 text-center'>
                <div className='text-sm font-medium'>
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString('id-ID')
                    : '-'}
                </div>
                <div className='text-xs text-muted-foreground'>Bergabung</div>
              </div>
            </div>

            <Button
              className='w-full'
              onClick={handleSave}
              disabled={saving}
            >
              <Save className='h-4 w-4 mr-1' />
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>

            <div className='border-t border-border pt-4'>
              <Button
                variant='destructive'
                className='w-full'
                onClick={logout}
              >
                <LogOut className='h-4 w-4 mr-1' />
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
