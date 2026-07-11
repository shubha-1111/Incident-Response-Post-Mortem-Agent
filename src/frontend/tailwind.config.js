/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./main.jsx",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        bg: {
          base: '#0A0E14',
          surface: '#0F1420',
        },
        border: {
          default: '#1C2333',
          strong: '#2A3348',
        },
        text: {
          primary: '#F5F7FA',
          secondary: '#8B94A8',
          muted: '#5B6478',
        },
        accent: {
          cyan: '#67E8F9',
          violet: '#A78BFA',
        },
        severity: {
          critical: '#FB3A5D',
          high: '#F59E0B',
          medium: '#38BDF8',
          low: '#2DD4BF',
        },
        status: {
          success: '#34D399',
        },
      },
      borderRadius: {
        card: '10px',
        pill: '6px',
      },
      spacing: {
        '12': '12px',
        '16': '16px',
        '20': '20px',
      },
    },
  },
  plugins: [],
}
