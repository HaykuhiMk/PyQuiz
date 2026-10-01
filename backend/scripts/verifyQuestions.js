// Automated content-quality check for questions: runs every question's code
// snippet on each available Python version and compares the real output with
// the stored answer (scripts/verify_questions.py has the comparison rules).
// Requires python3. The reference versions are in config/pythonVersion.js.
//
// It EXECUTES the snippets, so run it only on trusted question data (the
// seed file by default). It never connects to a database.
//
// Usage (from backend/):
//   npm run verify-questions                      # the seed file
//   npm run verify-questions -- --file <path>     # another questions JSON file
//   npm run verify-questions -- --require-checked # also fail if a version in
//                                                 # CHECKED_VERSIONS isn't available
// Interpreters: every python3 / python3.N found on PATH, or exactly the ones
// listed in PYQUIZ_PYTHONS (separated by ':'), e.g.
//   PYQUIZ_PYTHONS=/usr/bin/python3:/usr/local/bin/python3.14 npm run verify-questions
// Exit code 1 on any mismatch, if no usable interpreter is found, or (with
// --require-checked) if a checked version is missing.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { MINIMUM_VERSION, CHECKED_VERSIONS } = require('../config/pythonVersion');

const CHECKER = path.join(__dirname, 'verify_questions.py');
const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_FILE = path.join(__dirname, '..', 'database', 'questions.json');
// Snippets run in folders under the repository's gitignored tmp/.
const WORK_DIR = path.join(REPO_ROOT, 'tmp', 'verify-questions');

function parseArgs(argv) {
  const args = { file: DEFAULT_FILE, requireChecked: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--file') args.file = path.resolve(argv[(i += 1)]);
    else if (argv[i] === '--require-checked') args.requireChecked = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function candidateInterpreters(env) {
  if (env.PYQUIZ_PYTHONS) return env.PYQUIZ_PYTHONS.split(':').filter(Boolean);
  const found = [];
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => /^python3(\.\d+)?$/.test(n)).sort()) found.push(path.join(dir, name));
  }
  return found;
}

// [major, minor, patch] from "3.14.5".
const parseVersion = (version) => version.split('.').map((part) => parseInt(part, 10) || 0);
const atLeast = (version, minimum) => {
  const [a, b] = [parseVersion(version), parseVersion(minimum)];
  return a[0] > b[0] || (a[0] === b[0] && (a[1] || 0) >= (b[1] || 0));
};
const minorOf = (version) => parseVersion(version).slice(0, 2).join('.');

// One interpreter per distinct full version, in the order found.
function usableInterpreters(candidates, log) {
  const byVersion = new Map();
  for (const candidate of candidates) {
    let version;
    try {
      version = execFileSync(candidate, ['-c', 'import sys; print(sys.version.split()[0])'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10000,
      }).trim();
    } catch {
      continue;
    }
    if (!atLeast(version, MINIMUM_VERSION)) {
      log(`Skipping ${candidate} (Python ${version}): older than the minimum ${MINIMUM_VERSION}.`);
      continue;
    }
    if (!byVersion.has(version)) byVersion.set(version, candidate);
  }
  return [...byVersion].map(([version, interpreter]) => ({ version, interpreter }));
}

function summarize(text, max = 70) {
  const oneLine = String(text).replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function verify({ file, requireChecked }, { env = process.env, log = console.log } = {}) {
  const interpreters = usableInterpreters(candidateInterpreters(env), log);
  if (!interpreters.length) {
    log(`No Python ${MINIMUM_VERSION}+ interpreter found (python3 is required). Set PYQUIZ_PYTHONS to choose one.`);
    return 1;
  }
  fs.mkdirSync(WORK_DIR, { recursive: true });
  log(`Questions: ${path.relative(process.cwd(), file) || file}`);

  let mismatches = 0;
  for (const { version, interpreter } of interpreters) {
    const report = JSON.parse(
      execFileSync(interpreter, [CHECKER, file, WORK_DIR], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env })
    );
    const failed = report.results.filter((r) => !r.ok);
    mismatches += failed.length;
    log(`Python ${version} (${interpreter}): ${report.results.length - failed.length} of ${report.results.length} questions match.`);
    for (const r of failed) {
      log(`  Q${r.index}: ${r.reason}. ${summarize(r.code.split('\n')[0])}`);
      if (r.expected !== undefined) log(`      answer: ${JSON.stringify(r.expected)}`);
      if (r.actual !== undefined) log(`      actual: ${JSON.stringify(r.actual)}`);
      if (r.matchingOptions && r.matchingOptions.length) log(`      options equal to the output: ${JSON.stringify(r.matchingOptions)}`);
    }
  }

  const available = new Set(interpreters.map((i) => minorOf(i.version)));
  const missing = CHECKED_VERSIONS.filter((v) => !available.has(v));
  if (missing.length) {
    log(
      `${requireChecked ? 'Error' : 'Warning'}: not checked on Python ${missing.join(', ')} (no interpreter found). ` +
        'Install it or list it in PYQUIZ_PYTHONS.'
    );
  }
  if (mismatches) log(`${mismatches} mismatch(es).`);
  return mismatches || (requireChecked && missing.length) ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = verify(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`verify-questions failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verify, parseArgs, candidateInterpreters, usableInterpreters };
