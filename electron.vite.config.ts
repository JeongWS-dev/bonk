import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          // Settings window (the one opened from the tray)
          index: resolve(__dirname, 'src/renderer/index.html'),
          // Break overlay (slides in when a nudge fires)
          overlay: resolve(__dirname, 'src/renderer/overlay.html')
        }
      }
    }
  }
})
