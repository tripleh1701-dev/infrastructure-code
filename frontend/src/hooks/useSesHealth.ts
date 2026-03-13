import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface SesHealthData {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  region: string;
  checks: Record<string, {
    status: "pass" | "fail" | "warn";
    message: string;
    duration_ms: number;
    details?: Record<string, any>;
  }>;
}

interface SesHealthState {
  data: SesHealthData | null;
  loading: boolean;
  dismissed: boolean;
  refresh: () => Promise<void>;
  dismiss: () => void;
}

const SesHealthContext = createContext<SesHealthState>({
  data: null,
  loading: false,
  dismissed: false,
  refresh: async () => {},
  dismiss: () => {},
});

export const useSesHealth = () => useContext(SesHealthContext);
export { SesHealthContext };

const DISMISS_KEY = "ses-health-dismissed";

function isDismissedToday(): boolean {
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) return false;
    const date = new Date(stored).toDateString();
    return date === new Date().toDateString();
  } catch {
    return false;
  }
}

export function useSesHealthProvider(): SesHealthState {
  const [data, setData] = useState<SesHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(isDismissedToday);
  const external = isExternalApi();

  const refresh = useCallback(async () => {
    if (!external) return;
    setLoading(true);
    try {
      const { data: result, error } = await httpClient.get<SesHealthData>("/health/ses");
      if (error) throw new Error(error.message);
      setData(result);
    } catch {
      // Silently fail on auto-run — don't block the app
    } finally {
      setLoading(false);
    }
  }, [external]);

  useEffect(() => {
    if (external) {
      refresh();
    }
  }, [external, refresh]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {}
  }, []);

  return { data, loading, dismissed, refresh, dismiss };
}
