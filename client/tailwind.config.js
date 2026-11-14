/** Design tokens for Tbilisi Property Map.
 *  slate  – mineral grey-green UI chrome (survey paper, not cream)
 *  balcony – carved-balcony blue, used only for development projects
 *  ochre  – Narikala stone ochre, used only for land plots
 *  signal – the red selection circle
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F2F4F3',
        line: '#D5DBD8',
        ink: { DEFAULT: '#1B2830', soft: '#4F5E66', faint: '#7E8B91' },
        balcony: { DEFAULT: '#1F5FA8', deep: '#163F70', tint: '#E3ECF6' },
        ochre: { DEFAULT: '#D99A1E', deep: '#8A5A0E', tint: '#FBF0DA' },
        signal: '#E0362C',
      },
      fontFamily: {
        sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        float: '0 1px 2px rgba(27,40,48,.08), 0 8px 24px -6px rgba(27,40,48,.22)',
      },
    },
  },
  plugins: [],
};
