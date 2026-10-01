import { api, getAchievementMeta, requireAuth } from './api.js';
import { icon, mountIcons } from './icons.js';
import { getTopicNamer } from './topics.js';

// Mastery rows carry stable topic ids; this turns them into display names.
let topicName = (id) => id;

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await requireAuth())) return;

  mountIcons(document.querySelector('.account-container'));
  document.getElementById('logout').addEventListener('click', handleLogout);

  try {
    const profile = await api.getMe();
    updateUI(profile);
  } catch (error) {
    // Only an expired or missing session means logging in again; any other
    // failure (offline, server error) is shown here with a way to retry.
    if (error.status === 401 || error.status === 404) {
      window.location.href = '/login.html';
      return;
    }
    const banner = document.createElement('div');
    banner.className = 'pq-banner pq-banner--coral';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `${icon('alert')}<span class="pq-banner__text"></span><button type="button" class="secondary-btn">Try again</button>`;
    banner.querySelector('.pq-banner__text').textContent = `Your dashboard couldn't be loaded. ${error.message}`;
    banner.querySelector('button').addEventListener('click', () => window.location.reload());
    // Hide the placeholder numbers rather than show them as real data.
    const container = document.querySelector('.account-container');
    [...container.children].forEach((section) => {
      section.hidden = true;
    });
    container.prepend(banner);
    return;
  }

  try {
    const [{ mastery, weakTopics }, namer] = await Promise.all([api.getTopicMastery(), getTopicNamer()]);
    topicName = namer;
    renderTopicMastery(mastery || []);
    renderWeakTopics(weakTopics || []);
  } catch (error) {
    console.error('Failed to load topic mastery:', error);
    document.getElementById('topic-mastery-list').innerHTML =
      '<p class="pq-muted pq-small">Topic mastery is unavailable right now.</p>';
  }
});

function updateUI(profile) {
  const stats = profile.stats || {};

  document.getElementById('username').textContent = profile.username;
  document.getElementById('email').textContent = profile.email || 'N/A';
  document.getElementById('rank').textContent = profile.rank || 'Beginner';
  document.getElementById('points-count').textContent = stats.totalPoints || 0;

  // Streaks count consecutive correct answers (a wrong answer resets them).
  document.getElementById('streak-count').textContent = stats.currentStreak || 0;
  document.getElementById('best-streak-line').textContent = `Best streak: ${stats.bestStreak || 0}`;
  document.getElementById('streak-stat-value').textContent = stats.currentStreak || 0;
  document.getElementById('streak-stat-desc').textContent = `Best: ${stats.bestStreak || 0}`;

  // "Questions answered correctly": the account's own totals, one count per
  // resolved question (correct on any attempt). Deliberately labelled
  // differently from the per-topic "Attempts correct", which counts every
  // attempt (AnswerEvent) — see the help texts in account.html.
  document.getElementById('accuracy-value').textContent =
    stats.totalAnswered > 0 ? `${Math.round(((stats.totalCorrect || 0) / stats.totalAnswered) * 100)}%` : '—';

  const total = (profile.answered || 0) + (profile.unanswered || 0);
  const progress = total > 0 ? Math.round((profile.answered / total) * 100) : 0;
  document.getElementById('progress-completed').textContent = profile.answered || 0;
  document.getElementById('progress-total').textContent = total;
  document.getElementById('progress-percentage').textContent = `${progress}%`;
  document.getElementById('progress-fill').style.width = `${progress}%`;

  renderAchievements(profile.achievements || []);
  renderAvatar(profile.avatar);
  renderDailyStatus(profile.dailyChallenge);
}

const MASTERY_LEVEL_LABEL = {
  master: 'Mastered',
  intermediate: 'Progressing',
  beginner: 'Started',
  new: 'Not started',
  measuring: 'Not enough attempts yet',
  unavailable: 'Not enough questions yet',
};

function renderTopicMastery(mastery) {
  const list = document.getElementById('topic-mastery-list');

  if (!mastery.length) {
    list.innerHTML = '<p class="pq-muted pq-small">No questions available yet to measure mastery.</p>';
    return;
  }

  const attempted = mastery.filter((topic) => topic.answered > 0);
  const rows = attempted.length ? attempted : mastery;

  list.innerHTML = rows
    .map(
      (topic) => `
        <div class="pq-mastery" data-level="${topic.level}">
          <span>${escapeHTML(topicName(topic.topic))}<small class="pq-mastery__level">${MASTERY_LEVEL_LABEL[topic.level] || topic.level}</small></span>
          <div class="pq-meter pq-meter--sm" style="--v: ${topic.coverage}%"><span></span></div>
          <b>${topic.coverage}%</b>
        </div>`
    )
    .join('');
}

function renderWeakTopics(weakTopics) {
  const section = document.getElementById('weak-topics-section');
  const grid = document.getElementById('weak-topics-grid');

  if (!weakTopics.length) {
    section.hidden = true;
    grid.innerHTML = '';
    return;
  }

  section.hidden = false;
  grid.innerHTML = weakTopics
    .map(
      (topic) => `
        <a href="/questions.html" class="card pq-card--fold fold-card">
          <div class="card__meta"><span>${topic.attempted} attempted</span></div>
          <h3 class="pq-heading fold-card__title">${escapeHTML(topicName(topic.topic))}</h3>
          <p class="pq-muted pq-small">Attempts correct: ${topic.accuracy}%</p>
          <div class="pq-meter pq-meter--sm" style="--v: ${topic.coverage}%"><span></span></div>
        </a>`
    )
    .join('');
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (match) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[match]));
}

function renderAvatar(avatar) {
  const img = document.getElementById('avatar-image');
  const icon = document.getElementById('avatar-icon');

  if (avatar) {
    img.src = avatar;
    img.hidden = false;
    icon.hidden = true;
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    icon.hidden = false;
  }
}

function renderAchievements(achievements) {
  const allKeys = ['first_correct', 'streak_5', 'streak_10', 'points_100', 'points_500'];
  const unlocked = new Set(achievements.map((item) => item.key));
  document.getElementById('badges').innerHTML = allKeys
    .map((key) => {
      const meta = getAchievementMeta(key);
      const isUnlocked = unlocked.has(key);
      // The sun disc marks a reward earned; a locked one is its outline.
      return `<div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
        <span class="achievement-card__disc" aria-hidden="true"></span>
        <span class="achievement-card__label">${meta.label}</span>
        <span class="pq-sr-only">${isUnlocked ? 'Unlocked' : 'Locked'}</span>
      </div>`;
    })
    .join('');
}

function renderDailyStatus(dailyChallenge) {
  const today = new Date().toISOString().slice(0, 10);
  const box = document.getElementById('daily-status');
  if (dailyChallenge?.date === today && dailyChallenge.completedAt) {
    box.innerHTML = `
      <p class="pq-muted" style="margin: 6px 0 16px">Completed today: <strong>${dailyChallenge.score}/${dailyChallenge.total}</strong></p>
      <a href="/daily.html" class="secondary-btn">Review today's challenge</a>`;
  } else {
    box.innerHTML = `
      <p class="pq-muted" style="margin: 6px 0 16px">Not completed yet — a new set of questions every day.</p>
      <a href="/daily.html" class="primary-btn">Answer today's</a>`;
  }
}

async function handleLogout() {
  try {
    await api.logout();
  } catch (error) {
    console.error('Logout request failed:', error);
  }
  document.cookie = 'guestMode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  window.location.href = '/login.html';
}
