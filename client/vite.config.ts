import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The client is served on :3000. It talks to the Elysia API on :3001 directly (see src/config.ts);
// the server's CORS_ORIGINS must include http://localhost:3000.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
  },
});
