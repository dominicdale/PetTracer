import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub project pages are served below /PetTracer/. Local development and
  // other hosts continue to use the site root.
  base: process.env.GITHUB_ACTIONS ? '/PetTracer/' : '/'
});
