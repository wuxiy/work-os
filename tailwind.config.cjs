/** @type {import('tailwindcss').Config} */
module.exports = {
  // Renderer + plugin sources both use Tailwind utility classes.
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{ts,tsx}',
    './plugins/*/src/**/*.{ts,tsx}',
    './plugins/*/index.html'
  ],
  theme: {
    extend: {
      fontFamily: {
        // Native-feel skill ref 06: system font, never a web font.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif'
        ],
        mono: ['"SF Mono"', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace']
      }
    }
  },
  plugins: []
}
