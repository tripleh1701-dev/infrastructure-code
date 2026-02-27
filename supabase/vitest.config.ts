import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./frontend/src/test/setup.ts"],
    include: ["frontend/src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["frontend/src/**/*.{ts,tsx}"],
      exclude: [
        "frontend/src/**/*.test.{ts,tsx}",
        "frontend/src/**/*.spec.{ts,tsx}",
        "frontend/src/test/**",
        "frontend/src/integrations/supabase/types.ts",
        "frontend/src/vite-env.d.ts",
        "frontend/src/main.tsx",
      ],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./frontend/src") },
  },
});
