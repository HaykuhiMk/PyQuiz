const client = require('prom-client');

client.collectDefaultMetrics();

function setupMetrics(app) {
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  });
}

module.exports = {
  setupMetrics,
};
