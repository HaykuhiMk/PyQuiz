import { api } from './api.js';

const ACHIEVEMENT_ICONS = {
  first_correct: 'fa-star',
  streak_5: 'fa-fire',
  streak_10: 'fa-bolt',
  points_100: 'fa-medal',
  points_500: 'fa-crown',
};

function rankClass(rank) {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return '';
}

async function loadLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  try {
    const rows = await api.getLeaderboard(50);
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state">No players on the leaderboard yet. Be the first!</div>';
      return;
    }

    container.innerHTML = rows
      .map(
        (row) => `
      <div class="leaderboard-row">
        <div class="rank-badge ${rankClass(row.rank)}">#${row.rank}</div>
        <div>
          <strong>${row.username}</strong>
          <div class="meta">${row.totalCorrect} correct · best streak ${row.bestStreak}</div>
          <div class="achievements">
            ${(row.achievements || [])
              .map((key) => `<span class="badge unlocked"><i class="fas ${ACHIEVEMENT_ICONS[key] || 'fa-award'}"></i></span>`)
              .join('')}
          </div>
        </div>
        <div class="points">${row.totalPoints} pts</div>
      </div>`
      )
      .join('');
  } catch (error) {
    container.innerHTML = `<div class="empty-state">Failed to load leaderboard: ${error.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', loadLeaderboard);
