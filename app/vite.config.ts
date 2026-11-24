import { defineConfig } from 'vite';

// Configurazione di Vite (prepara l'interfaccia per Tauri).
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_'],
  build: { target: 'es2022', outDir: 'dist', sourcemap: false },
});
