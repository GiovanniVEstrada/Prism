import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const serverPort = Number(process.env.PRISM_SERVER_PORT ?? process.env.VITE_PRISM_SERVER_PORT ?? 3001);

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/socket.io': {
        target: `http://localhost:${serverPort}`,
        ws: true
      }
    }
  },
  test: {
    include: ['src/**/*.test.ts']
  }
});
