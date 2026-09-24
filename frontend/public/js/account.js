import { api, getAchievementMeta, requireAuth } from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  document.getElementById('logout').addEventListener('click', handleLogout);

  try {
    const profile = await api.getMe();
    updateUI(profile);
  } catch (error) {
    console.error(error);
    window.location.href = '/login.html';
    return;
  }

  try {
    const { mastery, weakTopics } = await api.getTopicMastery();
    renderTopicMastery(mastery || []);
    renderWeakTopics(weakTopics || []);
    renderAccuracy(mastery || []);
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

  document.getElementById('streak-count').textContent = stats.currentStreak || 0;
  document.getElementById('best-streak-line').textContent = `Best streak: ${stats.bestStreak || 0} days`;
  document.getElementById('streak-stat-value').textContent = stats.currentStreak || 0;
  document.getElementById('streak-stat-desc').textContent = `Best: ${stats.bestStreak || 0} days`;

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

function renderAccuracy(mastery) {
  const totals = mastery.reduce(
    (acc, topic) => {
      acc.correct += topic.correct || 0;
      acc.attempted += topic.attempted || 0;
      return acc;
    },
    { correct: 0, attempted: 0 }
  );

  const accuracyEl = document.getElementById('accuracy-value');
  accuracyEl.textContent =
    totals.attempted > 0 ? `${Math.round((totals.correct / totals.attempted) * 100)}%` : '—';
}

const MASTERY_LEVEL_LABEL = {
  master: 'Mastered',
  intermediate: 'Progressing',
  beginner: 'Started',
  new: 'Not started',
};

function renderTopicMastery(mastery) {
  const list = document.getElementById('topic-mastery-list');

  if (!mastery.length) {
    list.innerHTML = '<p class="pq-muted pq-small">No questions available yet to measure mastery.</p>';
    return;
  }

  const attempted = mastery.filter((topic) => topic.answered > 0);
  const rows = (attempted.length ? attempted : mastery).slice(0, 8);

  list.innerHTML = rows
    .map(
      (topic) => `
        <div class="pq-mastery" data-level="${topic.level}">
          <span>${escapeHTML(topic.topic)}<small class="pq-mastery__level">${MASTERY_LEVEL_LABEL[topic.level] || topic.level}</small></span>
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
          <h3 class="pq-heading fold-card__title">${escapeHTML(topic.topic)}</h3>
          <p class="pq-muted pq-small">Accuracy so far: ${topic.accuracy}%</p>
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
      return `<div class="achievement-card ${unlocked.has(key) ? 'unlocked' : 'locked'}">
        <i class="fas ${meta.icon}"></i>
        <span>${meta.label}</span>
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
      <p class="pq-muted" style="margin: 6px 0 16px">Not completed yet — one question, new every day.</p>
      <a href="/daily.html" class="primary-btn">Answer today's</a>`;
  }
}

async function handleLogout() {
  try {
    await api.logout();
  } catch (error) {
    console.error('Logout request failed:', error);
  }
  localStorage.removeItem('adminToken');
  document.cookie = 'guestMode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  window.location.href = '/login.html';
}
