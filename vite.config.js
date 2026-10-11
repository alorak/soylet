import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/soylet/' : '/',
  build: { target: 'es2022' },
  server: { host: '127.0.0.1' }
});