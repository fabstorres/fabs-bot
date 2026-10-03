import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = `http://127.0.0.1:${process.env.FABS_PORT ?? 4800}`;

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: {
    // Loopback only: proxied requests reach the server from 127.0.0.1, which it
    // trusts without pairing, so exposing Vite would bypass pairing.
    host: "127.0.0.1",
    strictPort: true,
    port: 5173,
    proxy: {
      "/api": target,
      "/files": target,
      "/ws": { target, ws: true },
    },
  },
});
