import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { type User, checkAuth, logout as apiLogout } from '@/lib/api';

interface BlockedInfo {
  message: string;
  whatsappLink: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  blocked: BlockedInfo | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
  setBlocked: (b: BlockedInfo | null) => void;
}

const AuthCtx = createContext<AuthContextType>({
  user: null,
  loading: true,
  blocked: null,
  logout: async () => {},
  refresh: async () => {},
  setUser: () => {},
  setBlocked: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<BlockedInfo | null>(null);

  const refresh = useCallback(async (retries = 2) => {
    try {
      const r = await checkAuth();
      if (r.ok && r.user) {
        setUser(r.user);
        setBlocked(null);
      } else if (r.error === 'blocked') {
        setUser(null);
        setBlocked({
          message:
            r.message ||
            'Akun kamu diblokir. Hubungi admin KutuLoncat via WhatsApp.',
          whatsappLink: r.whatsappLink || 'https://wa.me/919629784300',
        });
      } else {
        setUser(null);
        setBlocked(null);
      }
    } catch {
      // Network error (e.g. server restarting) — retry before giving up
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1500));
        return refresh(retries - 1);
      }
      setUser(null);
    }
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setBlocked(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthCtx.Provider
      value={{ user, loading, blocked, logout, refresh, setUser, setBlocked }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
