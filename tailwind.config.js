/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,jsx,ts,tsx}', './src/components/**/*.{js,jsx,ts,tsx}'],
  // NativeWind v4 requires its Tailwind preset (the starter template omitted it).
  presets: [require('nativewind/preset')],
  // 'class' so css-interop allows setting the color scheme on web — with the
  // default 'media' it throws "Cannot manually set color scheme" at startup.
  // No dark: variants are used anywhere, so this changes nothing visually.
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};
