module.exports = {
  testEnvironment: 'node',
  // All runtime application code. Excluded: scripts/ and database/ (one-off
  // CLI migration/seed tools run by hand, not part of the running server),
  // tests/, and third-party/build output.
  collectCoverageFrom: [
    'app.js',
    '{config,controllers,core,docs,jobs,middleware,models,observability,repositories,routes,services,utils,validators}/**/*.js',
  ],
  coverageReporters: ['text', 'text-summary', 'json-summary', 'lcov'],
};
