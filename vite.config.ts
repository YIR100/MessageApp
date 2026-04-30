import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Capacitor loads the built files from the local filesystem.
  // Using relative asset paths prevents blank screens on device.
  // base: './', // Removed to fix Vercel SPA routing
  plugins: [react()],
})
