/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        display: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f7f8fa',
          100: '#eef1f5',
          200: '#dde2ea',
          300: '#c2cad6',
          400: '#9aa5b6',
          500: '#6b7689',
          600: '#4d5666',
          700: '#363d4a',
          800: '#232834',
          900: '#161a23',
          950: '#0c0f16',
        },
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcd9ff',
          300: '#8ec1ff',
          400: '#599fff',
          500: '#2f7eff',
          600: '#1b61f0',
          700: '#174dd6',
          800: '#1940ab',
          900: '#1a3a86',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 16px rgba(16, 24, 40, 0.06)',
        card: '0 1px 3px rgba(16, 24, 40, 0.05), 0 8px 24px rgba(16, 24, 40, 0.05)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out',
        scaleIn: 'scaleIn 0.2s ease-out',
        slideIn: 'slideIn 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
