/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/__test__"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  automock: false,
  resetMocks: false,
};
