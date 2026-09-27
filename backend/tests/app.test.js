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

describe('Log redaction', () => {
  const logger = require('../config/logger');

  it('masks password-reset keys in logged URLs', () => {
    expect(logger.redactUrl('/api/v1/auth/reset-password/abc123def')).toBe(
      '/api/v1/auth/reset-password/[redacted]'
    );
    expect(logger.redactUrl('/api/v1/questions/topics')).toBe('/api/v1/questions/topics');
  });

  it('censors credential headers', () => {
    const { Writable } = require('stream');
    const pino = require('pino');
    let line = '';
    const sink = new Writable({
      write(chunk, _enc, cb) {
        line += chunk;
        cb();
      },
    });
    // Same redaction config as the app logger, written to a buffer.
    const probe = pino({ redact: logger.redact }, sink);
    probe.info({ req: { headers: { cookie: 'token=secret-jwt', authorization: 'Bearer secret-admin' } } });

    expect(line).not.toMatch(/secret-jwt|secret-admin/);
  });
});

describe('Question seed data', () => {
  const questions = require('../database/questions.json');

  it('gives every question an answer that is one of its options', () => {
    const unanswerable = questions
      .map((q, index) => ({ index, question: q.question }))
      .filter(({ index }) => !questions[index].options.includes(questions[index].answer));

    expect(unanswerable).toEqual([]);
  });
});
