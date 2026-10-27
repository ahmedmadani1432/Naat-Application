/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f6f8ff',
          100: '#e8eeff',
          200: '#d5ddff',
          300: '#bbc7ff',
          400: '#9aa9ff',
          500: '#7889ff',
          600: '#5b67e8',
          700: '#4755c7',
          800: '#2f3d92',
          900: '#1e295e',
        },
      },
      boxShadow: {
        glow: '0 0 40px rgba(120,137,255,0.45)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
