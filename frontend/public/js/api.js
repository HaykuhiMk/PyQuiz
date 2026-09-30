import API_BASE_URL from './config.js';

const ACHIEVEMENT_LABELS = {
  first_correct: { label: 'First Correct' },
  streak_5: { label: '5 Streak' },
  streak_10: { label: '10 Streak' },
  points_100: { label: '100 Points' },
  points_500: { label: '500 Points' },
};

// 401 here means "your session is no longer valid" for every endpoint
// except these — the login endpoints return 401 for a plain
// wrong-credentials attempt (each login form shows that inline), and the
// /me endpoints are how a page asks "am I logged in?", so their 401 is an
// answer rather than a stale session (docs/AUDIT.md Phase 4, item 12).
const SESSION_EXEMPT_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/me',
  '/api/v1/admin/login',
  '/api/v1/admin/me',
];

// Regular users and admins have separate session cookies, each with its own
// HMAC-bound CSRF token (docs/AUDIT.md Phase 4, items 11-12). Paths below
// use the admin session; everything else uses the regular-user session.
function scopeForPath(path) {
  return path.startsWith('/api/v1/admin/') || path === '/api/v1/questions/add' ? 'admin' : 'user';
}

const CSRF_COOKIE_NAMES = {
  user: ['__Host-csrfToken', 'csrfToken'],
  admin: ['__Host-adminCsrfToken', 'adminCsrfToken'],
};
const ME_PATHS = { user: '/api/v1/auth/me', admin: '/api/v1/admin/me' };

// The CSRF token for the current page, per scope. Filled from the login or
// /me response body — the CSRF cookie is host-only (and __Host- prefixed in
// production), so when the API is on a different host than this page it
// can't be read from document.cookie. Kept in memory only: it's re-fetched
// from /me on each page load, never persisted to web storage. undefined =
// not checked yet on this page; null = checked, no session.
const csrfTokens = { user: undefined, admin: undefined };

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function readCsrfCookie(scope) {
  for (const name of CSRF_COOKIE_NAMES[scope]) {
    const value = readCookie(name);
    if (value) return value;
  }
  return null;
}

async function getCsrfToken(scope) {
  if (csrfTokens[scope] === undefined) {
    const fromCookie = readCsrfCookie(scope);
    if (fromCookie) {
      csrfTokens[scope] = fromCookie;
    } else {
      // Not known yet on this page: ask the server, which recomputes it
      // from the httpOnly session cookie (request() stores it from the /me
      // response). A 401 just means there is no session, e.g. a guest.
      if (scope === 'user') await getSession();
      else await request(ME_PATHS.admin).catch(() => {});
      if (csrfTokens[scope] === undefined) csrfTokens[scope] = null;
    }
  }
  return csrfTokens[scope];
}

// The httpOnly session cookie can't be cleared from JS (by design); this
// drops everything this page knows about the session so no logged-in UI is
// shown against a session the server has already rejected. A same-host
// readable CSRF cookie is cleared too (__Host- cookies can only be
// overwritten with the Secure attribute).
function clearClientVisibleSessionState(scope) {
  csrfTokens[scope] = undefined;
  if (scope === 'user') sessionPromise = null;
  const [prefixed, plain] = CSRF_COOKIE_NAMES[scope];
  document.cookie = `${plain}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  document.cookie = `${prefixed}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure`;
}

function redirectToLoginOn401(path) {
  if (SESSION_EXEMPT_PATHS.includes(path)) return;

  const scope = scopeForPath(path);
  clearClientVisibleSessionState(scope);
  const loginPage = scope === 'admin' ? '/admin_login.html' : '/login.html';
  if (!window.location.pathname.endsWith(loginPage)) {
    window.location.href = loginPage;
  }
}

async function request(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = await getCsrfToken(scopeForPath(path));
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...options,
      headers,
    });
  } catch {
    // fetch only rejects when the request never got a response.
    throw new Error("Couldn't reach PyQuiz. Check your connection and try again.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      redirectToLoginOn401(path);
    }
    const message = payload.error?.message || payload.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (payload.data?.csrfToken && (path.endsWith('/login') || path.endsWith('/me'))) {
    csrfTokens[scopeForPath(path)] = payload.data.csrfToken;
  }
  if (path === '/api/v1/auth/logout') clearClientVisibleSessionState('user');
  if (path === '/api/v1/admin/logout') clearClientVisibleSessionState('admin');

  return payload.data;
}

export const api = {
  login: (body) =>
    request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) =>
    request('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request('/api/v1/users/me'),
  getProgress: () => request('/api/v1/users/user-progress'),
  getLeaderboard: (limit = 50) => request(`/api/v1/users/leaderboard?limit=${limit}`),
  getTopicMastery: () => request('/api/v1/users/topic-mastery'),
  updateProfile: (body) =>
    request('/api/v1/users/settings/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (body) =>
    request('/api/v1/users/settings/password', { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAccount: (body) =>
    request('/api/v1/users/me', { method: 'DELETE', body: JSON.stringify(body) }),
  getTopics: () => request('/api/v1/questions/topics'),
  getTopicTaxonomy: () => request('/api/v1/topics'),
  getValidationRules: () => request('/api/v1/validation-rules'),
  getRandomQuestion: ({ topics = [], difficulty = '', excludeIds = [] } = {}) => {
    const params = new URLSearchParams();
    if (topics.length) params.set('topics', topics.join(','));
    if (difficulty) params.set('difficulty', difficulty);
    if (excludeIds.length) params.set('excludeIds', excludeIds.join(','));
    const query = params.toString();
    return request(`/api/v1/questions/random${query ? `?${query}` : ''}`);
  },
  getStudyQuestions: ({ topics = [], difficulty = '', page = 1, limit = 10 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (topics.length) params.set('topics', topics.join(','));
    if (difficulty) params.set('difficulty', difficulty);
    return request(`/api/v1/questions/study?${params}`);
  },
  startQuizSession: ({ mode, topics = [], difficulty = '', practiceMode = false } = {}) =>
    request('/api/v1/quiz/sessions', {
      method: 'POST',
      body: JSON.stringify({ mode, topics, practiceMode, ...(difficulty ? { difficulty } : {}) }),
    }),
  getNextQuizQuestion: (sessionId) =>
    request(`/api/v1/quiz/sessions/${sessionId}/next`, { method: 'POST' }),
  submitQuizAnswer: (sessionId, { questionId, selectedIndex }) =>
    request(`/api/v1/quiz/sessions/${sessionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ questionId, selectedIndex }),
    }),
  revealQuizAnswer: (sessionId) =>
    request(`/api/v1/quiz/sessions/${sessionId}/reveal`, { method: 'POST' }),
  getDailyChallenge: () => request('/api/v1/challenges/daily'),
  submitDailyChallenge: (answers) =>
    request('/api/v1/challenges/daily/submit', {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
  logout: () => request('/api/v1/auth/logout', { method: 'POST' }),
  forgotPassword: (email) =>
    request('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (resetKey, password) =>
    request(`/api/v1/auth/reset-password/${resetKey}`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  // Admin auth rides its own httpOnly cookie with the same CSRF scheme as
  // regular users (docs/AUDIT.md Phase 4, item 11) — no token to attach
  // here: `request()` sends credentials, and the admin CSRF header for
  // every mutating admin call.
  adminLogin: (body) =>
    request('/api/v1/admin/login', { method: 'POST', body: JSON.stringify(body) }),
  adminLogout: () => request('/api/v1/admin/logout', { method: 'POST' }),
  getAdminMe: () => request('/api/v1/admin/me'),
  addQuestion: (body) =>
    request('/api/v1/questions/add', { method: 'POST', body: JSON.stringify(body) }),
  getAdminQuestions: ({ topics = [], difficulty = '', page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (topics.length) params.set('topics', topics.join(','));
    if (difficulty) params.set('difficulty', difficulty);
    return request(`/api/v1/admin/questions?${params}`);
  },
  getAdminQuestion: (id) => request(`/api/v1/admin/questions/${id}`),
  updateQuestion: (id, body) =>
    request(`/api/v1/admin/questions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteQuestion: (id) => request(`/api/v1/admin/questions/${id}`, { method: 'DELETE' }),
  getAdminUsers: ({ page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    return request(`/api/v1/admin/users?${params}`);
  },
  setUserBanned: (id, banned) =>
    request(`/api/v1/admin/users/${id}/ban`, { method: 'PATCH', body: JSON.stringify({ banned }) }),
  getAdminContacts: ({ page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    return request(`/api/v1/admin/contacts?${params}`);
  },
  submitContact: (body) =>
    request('/api/v1/contact', { method: 'POST', body: JSON.stringify(body) }),
};

export function getAchievementMeta(key) {
  return ACHIEVEMENT_LABELS[key] || { label: key };
}

// Whether this browser has a valid regular-user session, as confirmed by
// the server (GET /api/v1/auth/me) — not inferred from a cookie, which can
// outlive an expired or revoked JWT (docs/AUDIT.md Phase 4, item 12).
// Resolves to the user object, or null for no/invalid session. Memoized per
// page load so every caller on a page shares one request.
let sessionPromise = null;

export function getSession() {
  if (!sessionPromise) {
    sessionPromise = request('/api/v1/auth/me')
      .then((data) => data.user)
      .catch(() => null);
  }
  return sessionPromise;
}

export async function requireAuth() {
  if (!(await getSession())) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}
