/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,jsx,ts,tsx}', './src/components/**/*.{js,jsx,ts,tsx}'],
  // NativeWind v4 requires its Tailwind preset (the starter template omitted it).
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
