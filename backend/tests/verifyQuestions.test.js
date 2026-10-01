// scripts/verifyQuestions.js (`npm run verify-questions`): runs question
// snippets on the available Python versions and reports every answer that
// doesn't match the real output. Needs python3; skipped without it.
const path = require('path');
const { execFileSync } = require('child_process');
const { verify } = require('../scripts/verifyQuestions');

function findPython() {
  try {
    return execFileSync('which', ['python3'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}
const python = findPython();
const describeWithPython = python ? describe : describe.skip;

function run(file) {
  const lines = [];
  const code = verify(
    { file, requireChecked: false },
    { env: { ...process.env, PYQUIZ_PYTHONS: python, PYQUIZ_SNIPPET_TIMEOUT: '2' }, log: (line) => lines.push(line) }
  );
  return { code, output: lines.join('\n') };
}

describeWithPython('npm run verify-questions', () => {
  it('reports each kind of mismatch and passes the correct questions', () => {
    const { code, output } = run(path.join(__dirname, 'fixtures', 'verifyQuestions.json'));
    expect(code).toBe(1);
    expect(output).toMatch(/8 of 16 questions match/);
    expect(output).toMatch(/Q2: output differs from the answer/);
    expect(output).toMatch(/Q4: raised an error, but the answer is not an error option/);
    expect(output).toMatch(/actual: "ZeroDivisionError: division by zero"/);
    expect(output).toMatch(/Q5: another option also equals the output/);
    expect(output).toMatch(/Q6: timed out after 2 s/);
    // The dataset's conventions are accepted: "Error: <message>" (exact
    // message) and "Nothing" for no output; "[ ]" for "[]" is not.
    expect(output).toMatch(/Q10: raised an error, but the answer is not an error option/);
    expect(output).toMatch(/Q11: output differs from the answer/);
    // The rule: printed output, then "Error: <message>" (or the type name).
    expect(output).toMatch(/Q14: prints output before the error, but the answer is not "<output> Error: <detail>"/);
    expect(output).toMatch(/the rule allows: "a Error: boom" or "a Error: ValueError"/);
    expect(output).toMatch(/Q15: a wrong option equals the output printed before the error/);
    for (const passing of ['Q1:', 'Q3:', 'Q7:', 'Q8:', 'Q9:', 'Q12:', 'Q13:', 'Q16:']) expect(output).not.toContain(passing);
  }, 30000);

  it('passes every seed question', () => {
    const { code, output } = run(path.join(__dirname, '..', 'database', 'questions.json'));
    expect(output).toMatch(/47 of 47 questions match/);
    expect(code).toBe(0);
  }, 60000);
});
