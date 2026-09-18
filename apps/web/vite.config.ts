import { tanstackRouter } from '@tanstack/router-plugin/vite'
import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { pmtilesDevServer } from './vite-plugin-pmtiles.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // must run before the react plugin
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    // serves data/cadastre/tiles/*.pmtiles as /tiles/<name>/{z}/{x}/{y}.mvt
    pmtilesDevServer(),
  ],
})
