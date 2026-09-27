import { defineConfig } from "vite";

const apiOrigin = `http://127.0.0.1:${process.env.API_PORT ?? "14000"}`;

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number.parseInt(process.env.WEB_PORT ?? "15173", 10),
    strictPort: true,
    proxy: {
      "/api": apiOrigin,
      "/health": apiOrigin
    }
  }
});
