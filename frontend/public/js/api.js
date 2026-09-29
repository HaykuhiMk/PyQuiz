import API_BASE_URL from './config.js';

const ACHIEVEMENT_LABELS = {
  first_correct: { label: 'First Correct' },
  streak_5: { label: '5 Streak' },
  streak_10: { label: '10 Streak' },
  points_100: { label: '100 Points' },
  points_500: { label: '500 Points' },
};

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getCsrfToken() {
  return readCookie('csrfToken');
}

async function request(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = getCsrfToken();
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
    const message = payload.error?.message || payload.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

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
  checkAnswer: (questionId, { selectedIndex, reveal = false } = {}) =>
    request(`/api/v1/questions/${questionId}/check`, {
      method: 'POST',
      body: JSON.stringify({ selectedIndex, reveal }),
    }),
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
  adminLogin: (body) =>
    request('/api/v1/admin/login', { method: 'POST', body: JSON.stringify(body) }),
  addQuestion: (body) =>
    request('/api/v1/questions/add', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      body: JSON.stringify(body),
    }),
  getAdminQuestions: ({ topics = [], difficulty = '', page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (topics.length) params.set('topics', topics.join(','));
    if (difficulty) params.set('difficulty', difficulty);
    return request(`/api/v1/admin/questions?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
    });
  },
  getAdminQuestion: (id) =>
    request(`/api/v1/admin/questions/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
    }),
  updateQuestion: (id, body) =>
    request(`/api/v1/admin/questions/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      body: JSON.stringify(body),
    }),
  deleteQuestion: (id) =>
    request(`/api/v1/admin/questions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
    }),
  getAdminUsers: ({ page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    return request(`/api/v1/admin/users?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
    });
  },
  setUserBanned: (id, banned) =>
    request(`/api/v1/admin/users/${id}/ban`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      body: JSON.stringify({ banned }),
    }),
  getAdminContacts: ({ page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    return request(`/api/v1/admin/contacts?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
    });
  },
  submitContact: (body) =>
    request('/api/v1/contact', { method: 'POST', body: JSON.stringify(body) }),
};

export function getAchievementMeta(key) {
  return ACHIEVEMENT_LABELS[key] || { label: key };
}

// The auth token itself lives only in an httpOnly cookie (invisible to JS).
// The readable csrfToken cookie is set alongside it on login/cleared on
// logout, so its presence doubles as a "logged in" signal for the client.
export function isLoggedIn() {
  return Boolean(getCsrfToken());
}

export function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}
