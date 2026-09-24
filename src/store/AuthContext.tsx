import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { getDeviceId, getSavedName, getSavedPhone, saveName, savePhone, clearSession } from '../lib/identity';
import { normalizePhone } from '../lib/phone';
import { fetchMyRides, requestOtp, verifyOtp, type RideHistoryItem } from '../lib/rallyApi';

type AuthContextValue = {
  ready: boolean;
  signedIn: boolean;
  deviceId: string | null;
  name: string;
  phone: string;
  history: RideHistoryItem[];
  sendOtp: (phone: string, displayName: string) => Promise<{ ok: true; devCode?: string } | { ok: false; message: string }>;
  confirmOtp: (code: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  refreshHistory: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingName, setPendingName] = useState('');
  const [history, setHistory] = useState<RideHistoryItem[]>([]);

  useEffect(() => {
    void (async () => {
      const [id, savedName, savedPhone] = await Promise.all([
        getDeviceId(),
        getSavedName(),
        getSavedPhone(),
      ]);
      setDeviceId(id);
      setName(savedName);
      setPhone(savedPhone);
      setReady(true);
    })();
  }, []);

  const refreshHistory = useCallback(async () => {
    if (!deviceId || !phone) {
      setHistory([]);
      return;
    }
    const rides = await fetchMyRides(deviceId, phone);
    setHistory(rides);
  }, [deviceId, phone]);

  useEffect(() => {
    if (ready && phone) {
      void refreshHistory();
    }
  }, [ready, phone, refreshHistory]);

  const sendOtp = useCallback(async (rawPhone: string, displayName: string) => {
    if (!deviceId) {
      return { ok: false as const, message: 'Still setting up this phone.' };
    }
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      return { ok: false as const, message: 'Add your name so the crew can see you.' };
    }
    const nextPhone = normalizePhone(rawPhone);
    if (!nextPhone) {
      return { ok: false as const, message: 'Enter a valid 10-digit mobile number.' };
    }
    const result = await requestOtp(nextPhone, deviceId);
    if (!result.ok) return result;
    setPendingPhone(nextPhone);
    setPendingName(trimmedName);
    return result;
  }, [deviceId]);

  const confirmOtp = useCallback(async (code: string) => {
    if (!deviceId) {
      return { ok: false as const, message: 'Still setting up this phone.' };
    }
    const result = await verifyOtp({
      phone: pendingPhone,
      code,
      displayName: pendingName,
      deviceId,
    });
    if (!result.ok) return result;
    await saveName(pendingName);
    await savePhone(pendingPhone);
    setName(pendingName);
    setPhone(pendingPhone);
    return { ok: true as const };
  }, [deviceId, pendingName, pendingPhone]);

  const signOut = useCallback(async () => {
    await clearSession();
    setName('');
    setPhone('');
    setHistory([]);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      signedIn: Boolean(phone),
      deviceId,
      name,
      phone,
      history,
      sendOtp,
      confirmOtp,
      refreshHistory,
      signOut,
    }),
    [ready, phone, deviceId, name, history, sendOtp, confirmOtp, refreshHistory, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
