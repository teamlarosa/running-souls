import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The calculation engine lives in ./engine and is imported under the name
// '@running/engine'. The alias points that name at the engine's source, so the
// whole project builds as ONE unit with no separate engine build step.
export default defineConfig({
  // Relative base: the built site works at a domain root (Netlify) and at a
  // sub-path (GitHub Pages) without changes.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@running/engine': fileURLToPath(new URL('./engine/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
