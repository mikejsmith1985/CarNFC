// PostCSS configuration. Tailwind 4 is CSS-first, so there is deliberately no tailwind.config.js — the theme lives in app/globals.css.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
