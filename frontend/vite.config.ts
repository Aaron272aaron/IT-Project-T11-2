import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite reads this configuration when starting the frontend development server.
export default defineConfig({
  // Enable React development support, including Fast Refresh after edits.
  plugins: [react()],
  server: {
    // Forward API requests during development. This server configuration
    // is not bundled into the static files produced by npm run build.
    proxy: {
      // Match requests starting with /api and keep their path unchanged.
      // Browser -> Vite /api/canvas/preview -> Python /api/canvas/preview.
      "/api": {
        // Default: the local Python server. Tests override this with port 8001.
        target: process.env.API_PROXY_TARGET || "http://127.0.0.1:8000",
        // Set the forwarded Host header to the Python server address.
        changeOrigin: true,
      },
    },
  },
});
