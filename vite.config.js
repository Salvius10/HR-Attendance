import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mailPlugin from './server/mailPlugin.js'

export default defineConfig({
  plugins: [react(), mailPlugin()],
})
