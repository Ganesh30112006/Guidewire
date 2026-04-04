import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React runtime
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // State management + data fetching
          "vendor-query": ["@tanstack/react-query"],
          // UI primitives (Radix)
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-tabs",
            "@radix-ui/react-select",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-accordion",
          ],
          // Charts
          "vendor-charts": ["recharts"],
          // Forms + validation
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          // i18n
          "vendor-i18n": ["i18next", "react-i18next"],
        },
      },
    },
  },
}));
