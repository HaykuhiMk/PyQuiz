// scripts/applyContentFixes.js: applies the approved content fixes
// (database/contentFixes.json) only to questions in the expected state.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const path = require('path');
const { spawnSync } = require('child_process');
const mongoose = require('mongoose');
const db = require('./testUtils/db');
const { fixes } = require('../database/contentFixes.json');
const { fixes: fixes2 } = require('../database/contentFixes2.json');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'applyContentFixes.js');
const oid = (id) => new mongoose.Types.ObjectId(id);
const questions = () => mongoose.connection.db.collection('questions');

beforeAll(async () => {
  await db.connect();
}, 30000);

afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

const uri = () => {
  const { host, port, name } = mongoose.connection;
  return `mongodb://${host}:${port}/${name}`;
};
const run = (args, input = '') => {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:1/must-not-be-used', MONGO_URI: '' },
    input,
    encoding: 'utf8',
    timeout: 60000,
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
};

// The 20 questions as production has them now: the expected values, plus
// valid stand-ins for the fields the fixes don't touch.
async function insertCurrent() {
  await questions().insertMany(
    fixes.map((f) => {
      const options = f.expect.options || ['a', 'b'];
      return {
        _id: oid(f.id),
        question: 'What will be the output of the following code?',
        code: 'print(1)',
        options,
        answer: options[0],
        difficulty: 'easy',
        primaryTopic: 'functions',
        secondaryTopics: [],
        explanation: 'old',
        createdBy: 'admin',
        ...f.expect,
      };
    })
  );
}
const snapshot = async () => JSON.stringify(await questions().find({}).sort({ _id: 1 }).toArray());

describe('scripts/applyContentFixes.js', () => {
  it('refuses without --uri', () => {
    const res = run([]);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/pass the connection string with --uri/);
  });

  it('dry run: prints the target first, plans all 20, writes nothing', async () => {
    await insertCurrent();
    const before = await snapshot();
    const res = run(['--uri', uri()]);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^Target host: mongodb:\/\/(127\.0\.0\.1|localhost):\d+\nDatabase: {4}\S+\nQuestions: {3}20\n/);
    expect(res.out).toContain(`${fixes.length} content fixes: ${fixes.length} to apply, 0 already applied, 0 unexpected.`);
    expect(res.out).toMatch(/\[dry-run\]/);
    expect(await snapshot()).toBe(before);
  });

  it('a wrong confirmation changes nothing', async () => {
    await insertCurrent();
    const before = await snapshot();
    const res = run(['--uri', uri(), '--apply'], 'pyquiz\n');
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/Nothing was changed/);
    expect(await snapshot()).toBe(before);
  });

  it('--apply sets every new value and keeps other fields; a second run changes nothing', async () => {
    await insertCurrent();
    const res = run(['--uri', uri(), '--apply'], `${mongoose.connection.name}\n`);
    expect(res.out).toMatch(/All 20 content fixes are in place, and every fixed question passes the v2 validators\./);
    expect(res.code).toBe(0);
    for (const f of fixes) {
      const q = await questions().findOne({ _id: oid(f.id) });
      for (const [field, value] of Object.entries(f.set)) expect({ id: f.id, field, value: q[field] }).toEqual({ id: f.id, field, value });
      expect(q.createdBy).toBe('admin');
    }
    const again = run(['--uri', uri(), '--apply'], `${mongoose.connection.name}\n`);
    expect(again.code).toBe(0);
    expect(again.out).toContain(`${fixes.length} content fixes: 0 to apply, ${fixes.length} already applied, 0 unexpected.`);
    expect(again.out).toMatch(/Nothing to change/);
  });

  it('refuses everything if one question was edited meanwhile', async () => {
    await insertCurrent();
    const edited = fixes.find((f) => f.expect.explanation);
    await questions().updateOne({ _id: oid(edited.id) }, { $set: { explanation: 'edited in the admin panel' } });
    const before = await snapshot();
    const res = run(['--uri', uri(), '--apply'], `${mongoose.connection.name}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toContain(`${edited.id} (${edited.ref}): current content doesn't match the expected value of: explanation`);
    expect(await snapshot()).toBe(before);
  });

  it('refuses if new options would drop a misconception tag', async () => {
    await insertCurrent();
    const fix = fixes.find((f) => f.ref === '#18');
    await questions().updateOne({ _id: oid(fix.id) }, { $set: { distractors: [{ option: 'Name: James Age: 25', misconceptionId: 'dicts.iteration-yields-pairs' }] } });
    const res = run(['--uri', uri()]);
    expect(res.code).toBe(1);
    expect(res.out).toContain(`${fix.id} (#18): the new options would drop 1 misconception tag(s)`);
  });

  it('refuses if a question is missing', async () => {
    await insertCurrent();
    await questions().deleteOne({ _id: oid(fixes[0].id) });
    const res = run(['--uri', uri()]);
    expect(res.code).toBe(1);
    expect(res.out).toContain(`${fixes[0].id} (${fixes[0].ref}): question not found`);
  });
});

// The second round (v2.1 QA, database/contentFixes2.json), run with
// --fixes. Same rules; it expects the state the first round leaves.
describe('scripts/applyContentFixes.js --fixes contentFixes2.json', () => {
  const FIXES2 = ['--fixes', 'contentFixes2.json'];

  // The second-round questions as they are once the first round is applied.
  async function insertRound2Current() {
    await questions().insertMany(
      fixes2.map((f) => {
        const options = f.expect.options || f.set.options || ['a', 'b'];
        const kept = (f.set.options || options).filter((o) => options.includes(o));
        return {
          _id: oid(f.id),
          question: 'What will be the output of the following code?',
          code: 'print(1)',
          options,
          answer: f.expect.answer || kept[0],
          difficulty: 'easy',
          primaryTopic: 'functions',
          secondaryTopics: [],
          explanation: 'old',
          createdBy: 'admin',
          ...f.expect,
        };
      })
    );
  }

  it('dry run: names the fixes file, plans all of them, writes nothing', async () => {
    await insertRound2Current();
    const before = await snapshot();
    const res = run(['--uri', uri(), ...FIXES2]);
    expect(res.code).toBe(0);
    expect(res.out).toContain(`Fixes:       database/contentFixes2.json (${fixes2.length} questions)`);
    expect(res.out).toContain(`${fixes2.length} content fixes: ${fixes2.length} to apply, 0 already applied, 0 unexpected.`);
    expect(await snapshot()).toBe(before);
  });

  it('--apply sets every new value; a second run changes nothing', async () => {
    await insertRound2Current();
    const res = run(['--uri', uri(), ...FIXES2, '--apply'], `${mongoose.connection.name}\n`);
    expect(res.out).toMatch(new RegExp(`All ${fixes2.length} content fixes are in place`));
    expect(res.code).toBe(0);
    for (const f of fixes2) {
      const q = await questions().findOne({ _id: oid(f.id) });
      for (const [field, value] of Object.entries(f.set)) expect({ id: f.id, field, value: q[field] }).toEqual({ id: f.id, field, value });
    }
    const again = run(['--uri', uri(), ...FIXES2, '--apply'], `${mongoose.connection.name}\n`);
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/Nothing to change/);
  });

  it('expects the first round to have been applied: questions still in the old state are refused', async () => {
    await insertRound2Current();
    // #26 (67e05bfe…) before the first round: the old options.
    const first = fixes.find((f) => f.id === '67e05bfebe7a85e233ca816e');
    await questions().updateOne({ _id: oid(first.id) }, { $set: first.expect });
    const before = await snapshot();
    const res = run(['--uri', uri(), ...FIXES2, '--apply'], `${mongoose.connection.name}\n`);
    expect(res.code).toBe(1);
    expect(res.out).toContain(`${first.id} (C-15): current content doesn't match the expected value of: options`);
    expect(await snapshot()).toBe(before);
  });

  it('keeps every misconception-tagged option', async () => {
    await insertRound2Current();
    const tagged = fixes2.find((f) => f.ref.startsWith('C-14'));
    await questions().updateOne(
      { _id: oid(tagged.id) },
      { $set: { answer: 'None | None | None |', distractors: [{ option: '{0, 1, 2}', misconceptionId: 'sets.add-returns-set' }, { option: '{0, 1, 2, 0, 1, 2}', misconceptionId: 'sets.add-returns-set' }] } }
    );
    // As production has them (C-14 changes the other options only).
    const res = run(['--uri', uri(), ...FIXES2, '--apply'], `${mongoose.connection.name}\n`);
    expect(res.out).not.toMatch(/would drop/);
    expect(res.code).toBe(0);
    expect((await questions().findOne({ _id: oid(tagged.id) })).distractors.map((d) => d.option)).toEqual(['{0, 1, 2}', '{0, 1, 2, 0, 1, 2}']);
  });

  it('refuses a fixes file outside database/ before connecting', () => {
    for (const name of ['../package.json', 'questions.json', '']) {
      const res = run(['--uri', 'mongodb://127.0.0.1:1/never', '--fixes', name]);
      expect(res.code).toBe(1);
      expect(res.out).toMatch(/--fixes takes a file name in database\/ like contentFixes2\.json/);
      expect(res.out).not.toMatch(/Target host/);
    }
  });
});
