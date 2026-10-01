// scripts/syncSeedQuestions.js: brings seed questions in a local database up
// to date with database/questions.json (content fixes, misconception tags),
// and database/json_to_mongo.js seeding the tags. Also checks the seed file
// itself: every question passes the validators, and every misconception tag
// and feedback text follows the Stage 3 rules (docs/CONCEPT_GRAPH.md).
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const path = require('path');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const db = require('./testUtils/db');
const Question = require('../models/questionModel');
const seedQuestions = require('../database/questions.json');
const codeHistory = require('../database/seedCodeHistory.json');
const { addQuestionSchema } = require('../validators/questionValidators');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

function runScript(script, args = [], uri) {
  const { host, port, name } = mongoose.connection;
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [path.join(__dirname, '..', script), ...args], {
        env: { ...process.env, MONGODB_URI: uri || `mongodb://${host}:${port}/${name}`, MONGO_URI: '' },
        encoding: 'utf8',
      }),
    };
  } catch (error) {
    return { code: error.status, out: `${error.stdout}${error.stderr}` };
  }
}
const sync = (args, uri) => runScript('scripts/syncSeedQuestions.js', args, uri);

const Q11 = seedQuestions[10];
const Q11_OLD_CODE = codeHistory.find((h) => h.code === Q11.code).previousCodes[0];

describe('the seed file', () => {
  it('passes the question validators, tags included', () => {
    seedQuestions.forEach((q, i) => {
      const result = addQuestionSchema.safeParse(q);
      expect({ question: i + 1, ok: result.success }).toEqual({ question: i + 1, ok: true });
    });
  });

  it('has feedback exactly on the options tagged with a -confusion id', () => {
    const tags = seedQuestions.flatMap((q) => q.distractors || []);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(Boolean(tag.feedback)).toBe(tag.misconceptionId.endsWith('-confusion'));
    }
  });

  it('lists earlier code only for current seed questions, never colliding with current code', () => {
    const current = new Set(seedQuestions.map((q) => q.code));
    for (const { code, previousCodes } of codeHistory) {
      expect(current.has(code)).toBe(true);
      for (const previous of previousCodes) expect(current.has(previous)).toBe(false);
    }
  });
});

describe('scripts/syncSeedQuestions.js', () => {
  async function insertOutdated() {
    // Native inserts, as an older seed run left them: Q11 with its earlier
    // code and content, Q1 without tags, and an admin-added question.
    await Question.collection.insertMany([
      { ...Q11, code: Q11_OLD_CODE, options: ['a', 'b'], answer: 'a', explanation: 'old', distractors: undefined },
      { ...seedQuestions[0], distractors: undefined },
      { question: 'Admin question', code: 'print(42)', options: ['42', '24'], answer: '42', difficulty: 'easy', primaryTopic: 'numbers', secondaryTopics: [], explanation: 'e' },
    ]);
  }

  it('dry run by default: reports the changes and writes nothing', async () => {
    await insertOutdated();
    const { code, out } = sync();
    expect(code).toBe(0);
    expect(out).toMatch(/Target: mongodb:\/\/(127\.0\.0\.1|localhost):\d+ database /);
    expect(out).toMatch(/3 question\(s\) in the database: 2 match a seed question, 1 don't/);
    expect(out).toMatch(/seed Q11 \(\w+\): code, options, answer, explanation, distractors/);
    expect(out).toMatch(/seed Q1 \(\w+\): distractors/);
    expect(out).toMatch(/\[dry-run\]/);
    expect(await Question.collection.countDocuments({ code: Q11_OLD_CODE })).toBe(1);
  });

  it('--apply updates matched questions in place, leaves others alone, and is idempotent', async () => {
    await insertOutdated();
    const before = await Question.collection.findOne({ code: Q11_OLD_CODE });
    const admin = await Question.collection.findOne({ question: 'Admin question' });

    expect(sync(['--apply']).code).toBe(0);

    const after = await Question.collection.findOne({ _id: before._id });
    for (const field of ['code', 'options', 'answer', 'explanation', 'distractors', 'secondaryTopics']) {
      expect(after[field]).toEqual(Q11[field]);
    }
    expect((await Question.collection.findOne({ code: seedQuestions[0].code })).distractors).toEqual(seedQuestions[0].distractors);
    expect(await Question.collection.findOne({ _id: admin._id })).toEqual(admin);

    const again = sync(['--apply']);
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/0 question\(s\) to update/);
  });

  it('refuses to apply when two database questions match one seed question', async () => {
    await Question.collection.insertMany([{ ...seedQuestions[0] }, { ...seedQuestions[0], code: seedQuestions[0].code }]);
    const res = sync(['--apply']);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/seed Q1 matches 2 questions/);
  });

  it('refuses a non-local host before connecting', () => {
    const res = sync(['--apply'], 'mongodb://db.example.invalid:27017/pyquiz');
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/Target: mongodb:\/\/db\.example\.invalid:27017 database pyquiz/);
    expect(res.out).toMatch(/only runs against a local database/);
  });
});

describe('database/json_to_mongo.js', () => {
  it('seeds the misconception tags and feedback', async () => {
    expect(runScript('database/json_to_mongo.js').code).toBe(0);
    const tagged = seedQuestions.filter((q) => q.distractors);
    for (const q of tagged) {
      expect((await Question.collection.findOne({ code: q.code })).distractors).toEqual(q.distractors);
    }
  });
});
