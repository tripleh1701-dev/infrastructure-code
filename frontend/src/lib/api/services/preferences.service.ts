/**
 * User Preferences API Service
 *
 * Handles fetching / saving per-user preferences (e.g. theme)
 * with automatic provider switching (Supabase ↔ NestJS/DynamoDB).
 */

import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";

export interface UserPreferences {
  theme: "light" | "dark";
}

const DEFAULTS: UserPreferences = { theme: "light" };

export const preferencesService = {
  async get(): Promise<UserPreferences> {
    if (!isExternalApi()) {
      // Fallback: use localStorage when no external API
      const raw = localStorage.getItem("user-preferences");
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    }

    const { data, error } = await httpClient.get<UserPreferences>("/users/me/preferences");
    if (error || !data) {
      // Fallback to localStorage
      const raw = localStorage.getItem("user-preferences");
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    }
    return { ...DEFAULTS, ...data };
  },

  async save(prefs: Partial<UserPreferences>): Promise<void> {
    // Always mirror to localStorage for instant hydration on next load
    const current = JSON.parse(localStorage.getItem("user-preferences") || "{}");
    const merged = { ...current, ...prefs };
    localStorage.setItem("user-preferences", JSON.stringify(merged));

    if (!isExternalApi()) return;

    await httpClient.put("/users/me/preferences", prefs);
  },
};
