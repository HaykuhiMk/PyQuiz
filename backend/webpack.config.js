const path = require('path');

// Why webpack for a Node backend: `npm run build` bundles app.js and its
// dependencies into a single dist/server.js so the production artifact is
// one file started by `npm run prod`. Caveats: mode 'production' bakes
// process.env.NODE_ENV === 'production' into the bundle, and swagger-jsdoc
// still reads routes/v1/*.js from disk at runtime (see docs/swagger.js).

module.exports = {
  entry: './app.js',
  output: {
    filename: 'server.js',
    path: path.resolve(__dirname, 'dist'),
  },
  mode: 'production', 
  target: 'node'
};