import { api, getAchievementMeta, isLoggedIn } from './api.js';
import { icon } from './icons.js';

const LIMIT = 50;

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, (match) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match])
  );
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function isGuest() {
  return document.cookie.split('; ').some((row) => row === 'guestMode=true');
}

// The leaderboard API returns no user id and usernames aren't unique, so
// the current user's row is identified only when exactly one row matches
// their username *and* all three stats from /users/me. Any ambiguity means
// no row is highlighted rather than guessing.
function findCurrentUserRank(rows, me) {
  if (!me) return null;
  const stats = me.stats || {};
  const matches = rows.filter(
    (row) =>
      row.username === me.username &&
      row.totalPoints === (stats.totalPoints || 0) &&
      row.bestStreak === (stats.bestStreak || 0) &&
      row.totalCorrect === (stats.totalCorrect || 0)
  );
  return matches.length === 1 ? matches[0].rank : null;
}

async function loadCurrentUser() {
  if (!isLoggedIn() || isGuest()) return null;
  try {
    return await api.getMe();
  } catch {
    return null;
  }
}

function rankMark(rank) {
  const tier = rank === 1 ? ' lb-rank--first' : rank <= 3 ? ' lb-rank--podium' : '';
  return `<span class="lb-rank${tier}">${rank}</span>`;
}

function achievementsCell(keys = []) {
  if (!keys.length) return '<span class="pq-muted">—</span>';
  const labels = keys.map((key) => getAchievementMeta(key).label).join(', ');
  return `<span class="lb-ach" title="${escapeHTML(labels)}"><b>${keys.length}</b><span class="pq-sr-only">: ${escapeHTML(labels)}</span></span>`;
}

function renderRow(row, isMe) {
  const name = escapeHTML(row.username);
  const initial = escapeHTML((row.username || '?').trim().charAt(0).toUpperCase() || '?');
  return `
    <tr class="${isMe ? 'is-me' : ''}"${isMe ? ' aria-current="true"' : ''}>
      <td class="lb-col-rank" data-label="Rank">${rankMark(row.rank)}</td>
      <td class="lb-col-player">
        <span class="lb-player">
          <span class="lb-avatar" aria-hidden="true">${initial}</span>
          <span class="lb-name">${name}</span>
          ${isMe ? '<span class="badge badge-brand lb-you">You</span>' : ''}
        </span>
      </td>
      <td class="num lb-col-correct" data-label="Correct">${formatNumber(row.totalCorrect)}</td>
      <td class="num lb-col-streak" data-label="Best streak">${formatNumber(row.bestStreak)}</td>
      <td class="num lb-col-ach" data-label="Achievements">${achievementsCell(row.achievements)}</td>
      <td class="num lb-col-points" data-label="Points">${formatNumber(row.totalPoints)}<span class="lb-unit"> pts</span></td>
    </tr>`;
}

function renderTable(rows, myRank) {
  return `
    <div class="card lb-table-card">
      <table class="pq-table lb-table">
        <caption class="pq-sr-only">Top ${rows.length} players by points</caption>
        <thead>
          <tr>
            <th scope="col" class="lb-col-rank">Rank</th>
            <th scope="col" class="lb-col-player">Player</th>
            <th scope="col" class="num lb-col-correct">Correct</th>
            <th scope="col" class="num lb-col-streak">Best streak</th>
            <th scope="col" class="num lb-col-ach">Achievements</th>
            <th scope="col" class="num lb-col-points">Points</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => renderRow(row, row.rank === myRank)).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderSkeleton() {
  const rows = Array.from(
    { length: 6 },
    () => `
    <div class="lb-skel-row">
      <div class="pq-skel" style="width:28px;height:28px"></div>
      <div class="pq-skel pq-skel--line" style="width:40%"></div>
      <div class="pq-skel pq-skel--line" style="width:56px;margin-left:auto"></div>
    </div>`
  ).join('');
  return `<div class="card lb-table-card" aria-hidden="true">${rows}</div><span class="pq-sr-only">Loading leaderboard</span>`;
}

function banner(tone, html, action = '') {
  const toneClass = tone === 'coral' ? ' pq-banner--coral' : '';
  const mark = icon(tone === 'coral' ? 'alert' : 'info');
  return `<div class="pq-banner${toneClass}">${mark}<span class="pq-banner__text">${html}</span>${action}</div>`;
}

async function loadLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  const feedback = document.getElementById('leaderboard-feedback');
  const countBadge = document.getElementById('leaderboard-count');
  feedback.innerHTML = '';
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = renderSkeleton();

  try {
    const [rows, me] = await Promise.all([api.getLeaderboard(LIMIT), loadCurrentUser()]);

    if (!rows.length) {
      container.innerHTML = '';
      countBadge.hidden = true;
      feedback.innerHTML = banner('brand', 'No players on the leaderboard yet.');
      return;
    }

    const myRank = findCurrentUserRank(rows, me);
    countBadge.textContent = rows.length === LIMIT ? `Top ${LIMIT}` : `${rows.length} player${rows.length === 1 ? '' : 's'}`;
    countBadge.hidden = false;

    if (myRank) {
      const myRow = rows.find((row) => row.rank === myRank);
      feedback.innerHTML = banner(
        'brand',
        `You're ranked <strong>#${myRank}</strong> with <strong>${formatNumber(myRow.totalPoints)}</strong> points.`
      );
    }

    container.innerHTML = renderTable(rows, myRank);
  } catch (error) {
    container.innerHTML = '';
    countBadge.hidden = true;
    feedback.innerHTML = banner(
      'coral',
      `We couldn't load the leaderboard. ${escapeHTML(error.message)}`,
      '<button type="button" class="secondary-btn" id="leaderboard-retry">Try again</button>'
    );
    document.getElementById('leaderboard-retry').addEventListener('click', loadLeaderboard);
  } finally {
    container.setAttribute('aria-busy', 'false');
  }
}

document.addEventListener('DOMContentLoaded', loadLeaderboard);
