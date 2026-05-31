import * as React from 'react';
import { api } from '@/lib/api';
import { clearSession, getDevEmail } from '@/lib/session';
import type { AuthedUser } from '@/lib/types';

interface SessionValue {
  user: AuthedUser | null;
  ready: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = React.createContext<SessionValue>({
  user: null,
  ready: false,
  refresh: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthedUser | null>(null);
  const [ready, setReady] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const email = await getDevEmail();
    if (!email) {
      setUser(null);
      return;
    }
    try {
      setUser(await api.get<AuthedUser>('/users/me'));
    } catch {
      setUser(null);
    }
  }, []);

  const signOut = React.useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  React.useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ user, ready, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => React.useContext(SessionContext);
