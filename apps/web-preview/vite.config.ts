import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ops/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
}));
