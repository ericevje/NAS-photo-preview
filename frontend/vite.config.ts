import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8899",
        changeOrigin: true,
      },
      "/thumbs": {
        target: "http://localhost:8899",
        changeOrigin: true,
      },
    },
  },
});
