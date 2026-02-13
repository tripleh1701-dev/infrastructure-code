import { useState, useEffect } from "react";
import { ViewMode } from "@/components/ui/view-toggle";

const STORAGE_KEY_PREFIX = "view-preference-";

export function useViewPreference(pageKey: string, defaultView: ViewMode = "table"): [ViewMode, (view: ViewMode) => void] {
  const storageKey = `${STORAGE_KEY_PREFIX}${pageKey}`;
  
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return defaultView;
    const stored = localStorage.getItem(storageKey);
    return (stored === "table" || stored === "tile") ? stored : defaultView;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, view);
  }, [view, storageKey]);

  return [view, setView];
}
