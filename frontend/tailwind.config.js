/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#f4f7fb',
        midnight: '#081120',
        slate: '#0f172a',
        accent: {
          50: '#eef4ff',
          100: '#d9e7ff',
          200: '#bcd3ff',
          300: '#8fb5ff',
          400: '#5b8cff',
          500: '#2d68f6',
          600: '#184fe0',
          700: '#1640c2',
          800: '#19389d',
          900: '#1b347d'
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        panel: '0 18px 45px -22px rgba(15, 23, 42, 0.28)'
      },
      backgroundImage: {
        mesh: 'radial-gradient(circle at top left, rgba(45, 104, 246, 0.18), transparent 26%), radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.14), transparent 22%)'
      }
    },
  },
  plugins: [],
};
