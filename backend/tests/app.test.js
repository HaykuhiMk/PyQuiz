process.env.SKIP_DB_CONNECT = 'true';

const request = require('supertest');
const app = require('../app');

describe('App health checks', () => {
  it('should respond on root route', async () => {
    const response = await request(app).get('/');
    expect(response.statusCode).toBe(200);
  });

  it('should expose swagger docs endpoint', async () => {
    const response = await request(app).get('/api-docs/');
    expect(response.statusCode).toBe(200);
  });
});
