/** Design tokens for Tbilisi Property Map.
 *  Colours are CSS variables (see src/index.css) so the whole interface switches
 *  between the light theme and the matte navy dark theme by toggling `.dark` on <html>.
 *  paper   – app background      surface – panels and cards
 *  balcony – development projects (carved-balcony blue)
 *  ochre   – land plots (Narikala stone)      signal – the red selection circle
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: v('paper'),
        surface: v('surface'),
        line: v('line'),
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), faint: v('ink-faint') },
        balcony: { DEFAULT: v('balcony'), deep: v('balcony-deep'), tint: v('balcony-tint') },
        ochre: { DEFAULT: v('ochre'), deep: v('ochre-deep'), tint: v('ochre-tint') },
        signal: v('signal'),
      },
      fontFamily: {
        sans: ['Archivo', 'Noto Sans Georgian', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        float: '0 1px 2px rgba(8,14,20,.10), 0 8px 24px -6px rgba(8,14,20,.30)',
      },
    },
  },
  plugins: [],
};
