import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { EDITOR_PORT } from "./shared/api.ts";

// `npm run dev` serves the page from Vite with hot reload and sends /api to the editor's server.
export default defineConfig({
  plugins: [react()],
  server: { port: EDITOR_PORT + 1, strictPort: true, proxy: { "/api": `http://127.0.0.1:${EDITOR_PORT}` } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
