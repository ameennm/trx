import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  define: {
    // Robust shims for node globals that trip up legacy CJS packages
    'process.env': {},
    'process.version': '"v16.0.0"',
    'process.browser': 'true',
    'global': 'globalThis',
  },
  optimizeDeps: {
    include: [
      '@gasfree/gasfree-sdk',
      'tronweb',
      'tslib',
      'bip39',
      'buffer'
    ],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/],
    }
  }
})
