/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#ff6b1a',
          2: '#ffb800',
          dark: '#c44500',
          light: '#ffa463',
          soft: 'rgba(255, 107, 26, 0.12)',
        },
        bg: {
          0: '#0a0a0a',
          1: '#111111',
          2: '#1a1a1a',
          3: '#242424',
        },
        border: {
          DEFAULT: '#2a2a2a',
          strong: '#3a3a3a',
        },
      },
      fontFamily: {
        display: ['Oswald', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
