import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './bridge';
import { DEFAULT_SETTINGS } from './defaults';
import type { AppInfo, Settings } from './types';

interface SystemContextValue {
  info: AppInfo | null;
  settings: Settings;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  setInfo: (info: AppInfo) => void;
}

const SystemContext = createContext<SystemContextValue | null>(null);

export function SystemProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextInfo, nextSettings] = await Promise.all([api.appInfo(), api.getSettings()]);
      setInfo(nextInfo);
      setSettings(nextSettings);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'MapScraper could not load its settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = api.onApiInfo((payload) => {
      setInfo((current) =>
        current
          ? {
              ...current,
              api: { url: payload.url, port: payload.port, error: payload.error },
              apiTokenRequired: payload.tokenRequired ?? current.apiTokenRequired,
            }
          : current
      );
    });
    return unsubscribe;
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const result = await api.saveSettings(patch);
      setSettings(result.settings);
      try {
        const nextInfo = await api.appInfo();
        setInfo(nextInfo);
      } catch {
        // settings are still saved even if the info refresh fails
      }
      return result.settings;
    },
    []
  );

  const value = useMemo(
    () => ({ info, settings, loading, error, refresh, updateSettings, setInfo }),
    [info, settings, loading, error, refresh, updateSettings]
  );

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

export function useSystem() {
  const context = useContext(SystemContext);
  if (!context) throw new Error('useSystem must be used inside SystemProvider.');
  return context;
}
