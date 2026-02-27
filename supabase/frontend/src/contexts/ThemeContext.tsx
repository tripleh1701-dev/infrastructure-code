import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { preferencesService, UserPreferences } from "@/lib/api/services/preferences.service";
import { useAuth } from "@/contexts/AuthContext";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage synchronously to avoid flash
  const [theme, setTheme] = useState<Theme>(() => {
    const raw = localStorage.getItem("user-preferences");
    if (raw) {
      try {
        return JSON.parse(raw).theme === "dark" ? "dark" : "light";
      } catch {
        // ignore
      }
    }
    return "light";
  });

  const { isAuthenticated } = useAuth();

  // Apply class to <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Load preferences from API when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    preferencesService.get().then((prefs) => {
      setTheme(prefs.theme || "light");
    });
  }, [isAuthenticated]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      preferencesService.save({ theme: next });
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
