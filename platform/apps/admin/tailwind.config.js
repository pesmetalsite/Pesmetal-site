/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1a9e5a',
          2: '#34b981',
          dark: '#128c4a',
          light: '#63e69f',
          soft: 'rgba(26, 158, 90, 0.12)',
        },
        bg: {
          0: '#f7f8fa',
          1: '#ffffff',
          2: '#f1f3f5',
          3: '#e9ecef',
        },
        border: {
          DEFAULT: '#e5e8eb',
          strong: '#d3d9de',
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
