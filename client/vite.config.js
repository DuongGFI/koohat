import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy API + websocket to the game server on :3000.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on LAN for phones
    port: 5173,
    proxy: {
      "/api": "http://localhost:1234",
      "/socket.io": { target: "http://localhost:1234", ws: true },
    },
  },
});
