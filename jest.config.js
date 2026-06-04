/** Jest config for the Expo app. jest-expo handles TS/JSX + transformIgnorePatterns. */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
