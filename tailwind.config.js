/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0d0f18', surface: '#141625', overlay: '#1a1d30', muted: '#2a2d42',
        subtle: '#5a5f7a', text: '#cdd6f4', subtext: '#7f849c',
        green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', mauve: '#cba6f7',
        peach: '#fab387', teal: '#94e2d5', red: '#f38ba8', sky: '#89dceb',
      },
    },
  },
  plugins: [],
}
