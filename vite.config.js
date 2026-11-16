import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// O build vira um único index.html com JS e CSS embutidos,
// para abrir com duplo clique (file://) sem precisar de servidor.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
});
