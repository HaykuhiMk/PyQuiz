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
  }
});

function updateUI(profile) {
  const stats = profile.stats || {};

  document.getElementById('username').textContent = profile.username;
  document.getElementById('email').textContent = profile.email || 'N/A';
  document.getElementById('rank').textContent = profile.rank || 'Beginner';
  document.getElementById('answered-count').textContent = profile.answered || 0;
  document.getElementById('unanswered-count').textContent = profile.unanswered || 0;
  document.getElementById('points-count').textContent = stats.totalPoints || 0;
  document.getElementById('streak-count').textContent = stats.currentStreak || 0;
  document.getElementById('best-streak-count').textContent = stats.bestStreak || 0;

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
    box.innerHTML = `<strong>Today's challenge:</strong> ${dailyChallenge.score}/${dailyChallenge.total} completed`;
  } else {
    box.innerHTML = `<strong>Today's challenge:</strong> not completed yet · <a href="/daily.html">Play now</a>`;
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
