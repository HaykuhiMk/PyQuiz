const path = require('path');

module.exports = {
  entry: './app.js',
  output: {
    filename: 'server.js',
    path: path.resolve(__dirname, 'dist'),
  },
  mode: 'production', 
  target: 'node'
};