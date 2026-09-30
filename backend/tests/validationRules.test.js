// GET /api/v1/validation-rules serves the password rule the server itself
// validates with (config/validationRules.js), so the frontend's client-side
// check is derived from it instead of keeping its own copy.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const { passwordRule } = require('../validators/authValidators');
const { changePasswordSchema } = require('../validators/userValidators');

const CANDIDATES = [
  'Passw0rd!',
  'Passw0rd!#',
  'Passw0rd#x',
  'Émile#2024!x',
  'Pass w0rd!',
  'short1!A',
  'alllowercase1!',
  'ALLUPPERCASE1!',
  'NoDigits!!',
  'NoSpecial11',
  '',
];

describe('GET /api/v1/validation-rules', () => {
  it('is public and returns the password rule', async () => {
    const res = await request(app).get('/api/v1/validation-rules');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.password).toEqual({
      minLength: expect.any(Number),
      pattern: expect.any(String),
      requirements: expect.any(String),
    });
  });

  it.each(CANDIDATES)('a browser check built from the response agrees with the server on %j', async (password) => {
    const { minLength, pattern } = (await request(app).get('/api/v1/validation-rules')).body.data.password;
    // Exactly what frontend/public/js/validationRules.js does.
    const clientAccepts = password.length >= minLength && new RegExp(pattern).test(password);

    expect(clientAccepts).toBe(passwordRule.safeParse(password).success);
    expect(clientAccepts).toBe(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: password }).success);
  });
});
