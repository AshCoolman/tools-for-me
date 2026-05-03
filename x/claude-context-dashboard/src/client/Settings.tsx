import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "claude-context-dashboard:settings";

export type Settings = {
  contextLimit: number;
  notifyThreshold: number;
  scanIntervalMs: number;
  statusPollMs: number;
  severityWarn: number;
  severityHigh: number;
  severityCrit: number;
};

export const DEFAULT_SETTINGS: Settings = {
  contextLimit: 1_000_000,
  notifyThreshold: 300_000,
  scanIntervalMs: 10 * 60_000,
  statusPollMs: 5 * 60_000,
  severityWarn: 50_000,
  severityHigh: 150_000,
  severityCrit: 300_000,
};

const sanitize = (raw: unknown): Settings => {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<
    Record<keyof Settings, unknown>
  >;
  const num = (k: keyof Settings): number => {
    const v = Number(obj[k]);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_SETTINGS[k];
  };
  return {
    contextLimit: num("contextLimit"),
    notifyThreshold: num("notifyThreshold"),
    scanIntervalMs: num("scanIntervalMs"),
    statusPollMs: num("statusPollMs"),
    severityWarn: num("severityWarn"),
    severityHigh: num("severityHigh"),
    severityCrit: num("severityCrit"),
  };
};

type Ctx = {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
};

const SettingsCtx = createContext<Ctx | null>(null);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return sanitize(raw ? JSON.parse(raw) : null);
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const setSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ settings, setSetting, reset }),
    [settings, setSetting, reset],
  );
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
};

export const useSettings = (): Ctx => {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error("SettingsProvider missing");
  return c;
};
