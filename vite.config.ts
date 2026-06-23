import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import federation from "@originjs/vite-plugin-federation";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // host: "::",
    headers: {
      // "access-control-allow-origin":"*",
      "Access-Control-Allow-Origin": "*",
    },
    port: 3014,
    cors: true,
  },
  build: {
    modulePreload: true,
    target: "esnext",
    minify: "esbuild",
    cssCodeSplit: false,
  },
  // esbuild: {
  //   // 🔥 This will strip console.* and debugger statements in production
  //   drop: mode === "production" ? ["console", "debugger"] : [],
  // },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    federation({
      name: "hr_helpdesk_app",
      filename: "remoteEntry.js",
      exposes: { "./App": "./src/App.tsx" },
      shared: ["react", "react-dom", "react-router-dom"],
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
