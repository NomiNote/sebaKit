/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sage: {
          DEFAULT: '#4a7c59',
          50: '#f0f5f1',
          100: '#d9e8dd',
          200: '#b3d1bb',
          300: '#8cba99',
          400: '#66a377',
          500: '#4a7c59',
          600: '#3b6347',
          700: '#2c4a35',
          800: '#1e3224',
          900: '#0f1912',
        },
        amber: {
          DEFAULT: '#e8972a',
          50: '#fef7ec',
          100: '#fdecd0',
          200: '#fbd9a1',
          300: '#f9c672',
          400: '#f0ad4e',
          500: '#e8972a',
          600: '#c47d1f',
          700: '#9a6218',
          800: '#704810',
          900: '#462d09',
        },
        danger: {
          DEFAULT: '#d95f4b',
          50: '#fdf0ee',
          100: '#f9d8d3',
          200: '#f3b1a7',
          300: '#ed8a7b',
          400: '#e3745e',
          500: '#d95f4b',
          600: '#b8493a',
          700: '#8a372c',
          800: '#5c241d',
          900: '#2e120f',
        },
        cream: {
          DEFAULT: '#faf7f2',
          100: '#f5f0e8',
          200: '#ede6d9',
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulse_ring: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(24px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        pulse_ring: 'pulse_ring 1.5s ease-out infinite',
        fadeIn: 'fadeIn 0.2s ease-out',
        slideUp: 'slideUp 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
