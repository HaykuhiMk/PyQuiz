#!/usr/bin/env node
// Load benchmark for PyQuiz's main endpoints using autocannon.
//
//   node scripts/benchmark.js                       # http://localhost:7498
//   node scripts/benchmark.js --url http://127.0.0.1:7599 --duration 10 --connections 10
//
// Target safety: the default is always http://localhost:7498. The target is
// never read from an environment variable (so a production API_URI in .env
// can't be picked up by accident); any other target has to be passed
// explicitly with --url, and a non-local one prints a warning first. This
// script registers a throwaway user and writes quiz sessions/answers, so
// only point it at a database you are happy to fill with benchmark data.
//
// The target backend should run with BENCHMARK_DISABLE_RATE_LIMITS=true
// (honoured only outside production, see config/rateLimitBypass.js);
// otherwise the rate limiters answer most requests with 429 and the numbers
// measure the limiter, not the endpoint. Non-2xx counts are printed for
// every run so that is always visible.
const autocannon = require('autocannon');

const DEFAULT_URL = 'http://localhost:7498';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseArgs(argv) {
  const args = { url: DEFAULT_URL, duration: 10, connections: 10, answers: 2000 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--url') args.url = value;
    else if (key === '--duration') args.duration = Number(value);
    else if (key === '--connections') args.connections = Number(value);
    else if (key === '--answers') args.answers = Number(value);
    else if (key === '--help' || key === '-h') args.help = true;
    else continue;
    if (key !== '--help' && key !== '-h') i += 1;
  }
  return args;
}

async function api(baseUrl, path, { method = 'GET', body, cookie, csrf } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return { json, res };
}

async function createBenchmarkUser(baseUrl) {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const user = { username: `bench${suffix}`, email: `bench${suffix}@example.com`, password: 'Passw0rd!bench' };
  await api(baseUrl, '/api/v1/auth/register', { method: 'POST', body: user });
  const { json, res } = await api(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { email: user.email, password: user.password },
  });
  const setCookies = res.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  return { cookie, csrf: json.data.csrfToken };
}

// Answer-submit needs a fresh quiz session per answer (a session only
// accepts answers for its current question), so the sessions are created up
// front and the timed run submits exactly one answer to each.
async function createSessions(baseUrl, auth, count) {
  const sessions = [];
  const batch = 20;
  for (let start = 0; start < count; start += batch) {
    const created = await Promise.all(
      Array.from({ length: Math.min(batch, count - start) }, () =>
        api(baseUrl, '/api/v1/quiz/sessions', {
          method: 'POST',
          body: { mode: 'classic', topics: [], practiceMode: true },
          ...auth,
        })
      )
    );
    for (const { json } of created) {
      sessions.push({ id: json.data.sessionId, questionId: json.data.question._id });
    }
  }
  return sessions;
}

function run(opts) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(opts, (error, result) => (error ? reject(error) : resolve(result)));
    autocannon.track(instance, { renderProgressBar: false, renderResultsTable: false, renderLatencyTable: false });
  });
}

function summarise(name, result) {
  const { latency, requests } = result;
  return {
    endpoint: name,
    requests: result.requests.total,
    'req/s (avg)': Math.round(requests.average),
    'p50 ms': latency.p50,
    'p90 ms': latency.p90,
    'p99 ms': latency.p99,
    'max ms': latency.max,
    non2xx: result.non2xx,
    errors: result.errors + result.timeouts,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/benchmark.js [--url URL] [--duration SECONDS] [--connections N] [--answers N]');
    return;
  }

  const target = new URL(args.url);
  const baseUrl = target.origin;
  if (!LOCAL_HOSTS.has(target.hostname)) {
    console.warn(`WARNING: ${baseUrl} is not a local address. It was passed explicitly with --url;`);
    console.warn('this run registers a user and writes quiz sessions and answers to that server.');
  }

  console.log(`Target: ${baseUrl}  duration: ${args.duration}s  connections: ${args.connections}`);
  const auth = await createBenchmarkUser(baseUrl);
  const common = { url: baseUrl, connections: args.connections };
  const authHeaders = { Cookie: auth.cookie };
  const rows = [];

  rows.push(
    summarise(
      'GET /questions/random (question fetch)',
      await run({ ...common, duration: args.duration, path: '/api/v1/questions/random' })
    )
  );

  console.log(`Creating ${args.answers} quiz sessions for the answer-submit run...`);
  const sessions = await createSessions(baseUrl, auth, args.answers);
  let next = 0;
  rows.push(
    summarise(
      'POST /quiz/sessions/:id/answer (answer submit)',
      await run({
        ...common,
        amount: sessions.length,
        requests: [
          {
            method: 'POST',
            setupRequest: (req) => {
              const session = sessions[next % sessions.length];
              next += 1;
              return {
                ...req,
                path: `/api/v1/quiz/sessions/${session.id}/answer`,
                headers: { ...authHeaders, 'X-CSRF-Token': auth.csrf, 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionId: session.questionId, selectedIndex: 0 }),
              };
            },
          },
        ],
      })
    )
  );

  rows.push(
    summarise(
      'GET /users/leaderboard',
      await run({ ...common, duration: args.duration, path: '/api/v1/users/leaderboard' })
    )
  );
  rows.push(
    summarise(
      'GET /users/me (dashboard profile + stats)',
      await run({ ...common, duration: args.duration, path: '/api/v1/users/me', headers: authHeaders })
    )
  );
  rows.push(
    summarise(
      'GET /users/topic-mastery (dashboard mastery)',
      await run({ ...common, duration: args.duration, path: '/api/v1/users/topic-mastery', headers: authHeaders })
    )
  );

  console.table(rows);
  if (rows.some((row) => row.non2xx > 0)) {
    console.warn('Some responses were not 2xx — if they are 429s, start the backend with BENCHMARK_DISABLE_RATE_LIMITS=true.');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
