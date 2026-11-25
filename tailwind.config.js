/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'sheet-down': {
          '0%': { transform: 'translateY(var(--drag-y, 0px))' },
          '100%': { transform: 'translateY(100%)' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'pop-out': {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Page change: slide in from the side we navigated towards
        'page-from-right': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'page-from-left': {
          '0%': { opacity: '0', transform: 'translateX(-24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        shake: 'shake 0.4s ease-in-out',
        'sheet-up': 'sheet-up 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 0.2s ease-out',
        'pop-in': 'pop-in 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
        'sheet-down': 'sheet-down 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards',
        'fade-out': 'fade-out 0.22s ease-in forwards',
        'pop-out': 'pop-out 0.16s ease-in forwards',
        'fade-up': 'fade-up 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        'page-from-right': 'page-from-right 0.32s cubic-bezier(0.32, 0.72, 0, 1) both',
        'page-from-left': 'page-from-left 0.32s cubic-bezier(0.32, 0.72, 0, 1) both',
      },
      colors: {
        // Basil green — single accent
        brand: {
          50:  '#EEF7F1',
          100: '#DDF3E4',
          200: '#BFE3CC',
          300: '#8FCBA6',
          400: '#5AAE7E',
          500: '#2F8A5A',
          600: '#1F6B45',
          700: '#16503A',
          800: '#113D28',
          900: '#0C2C1D',
        },
        mint:   { DEFAULT: '#DDF3E4', bright: '#B5F0C9', ink: '#0F4A2E' },
        ink:    { DEFAULT: '#15171A', soft: '#3D4046', muted: '#5C6066', faint: '#8A8E94' },
        canvas: '#F5F4EF',
        line:   { DEFAULT: '#E2E0D8', soft: '#EEEDE7' },
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
