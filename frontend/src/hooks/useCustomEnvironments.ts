import { useState, useEffect, useCallback } from "react";

export interface CustomEnvironment {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
}

const STORAGE_KEY = "pipeline_custom_environments";

export function useCustomEnvironments() {
  const [customEnvironments, setCustomEnvironments] = useState<CustomEnvironment[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setCustomEnvironments(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load custom environments:", error);
    }
  }, []);

  // Save to localStorage whenever environments change
  const saveToStorage = useCallback((envs: CustomEnvironment[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envs));
    } catch (error) {
      console.error("Failed to save custom environments:", error);
    }
  }, []);

  const addEnvironment = useCallback((name: string, description?: string, color?: string) => {
    const newEnv: CustomEnvironment = {
      id: `env_custom_${Date.now()}`,
      name,
      description,
      color: color || "#6366f1",
      createdAt: new Date().toISOString(),
    };
    
    setCustomEnvironments((prev) => {
      const updated = [...prev, newEnv];
      saveToStorage(updated);
      return updated;
    });

    return newEnv;
  }, [saveToStorage]);

  const removeEnvironment = useCallback((id: string) => {
    setCustomEnvironments((prev) => {
      const updated = prev.filter((env) => env.id !== id);
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  const updateEnvironment = useCallback((id: string, updates: Partial<Omit<CustomEnvironment, "id" | "createdAt">>) => {
    setCustomEnvironments((prev) => {
      const updated = prev.map((env) =>
        env.id === id ? { ...env, ...updates } : env
      );
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  return {
    customEnvironments,
    addEnvironment,
    removeEnvironment,
    updateEnvironment,
  };
}
