module.exports = function (api) {
  api.cache(true);

  // NativeWind v4: `nativewind/babel` is a PRESET (not a plugin), and
  // babel-preset-expo needs jsxImportSource: 'nativewind' so the `className`
  // prop is transformed on RN components. The starter template had nativewind
  // listed under `plugins`, which breaks babel ("not a valid Plugin property")
  // and className styling.
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
