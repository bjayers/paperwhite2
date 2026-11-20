import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { EDITOR_PORT } from "./shared/api.ts";

// `npm run dev` serves the page from Vite with hot reload and sends /api to the editor's server.
export default defineConfig({
  plugins: [react()],
  server: { port: EDITOR_PORT + 1, strictPort: true, proxy: { "/api": `http://127.0.0.1:${EDITOR_PORT}` } },
  // (one chunk is fine for a page served from the local disk; the limit only quiets Vite's warning)
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
