import { api, requireAuth } from './api.js';
import { countUp } from './ui.js';
import { icon } from './icons.js';

let challenge = null;
let currentIndex = 0;
let selectedIndex = null;
let resetInterval = null;
const answers = [];

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, (match) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match])
  );
}

function capitalize(str = '') {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function formatChallengeDate(dateKey) {
  // dateKey is the server's UTC day (YYYY-MM-DD); format it in UTC too so
  // the label never drifts to the previous/next day in the viewer's zone.
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}

function formatCountdown(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `Resets in ${hours}h ${String(minutes).padStart(2, '0')}m`;
}

// Counts down to the server's next-reset instant (Asia/Yerevan midnight),
// rendered in the viewer's own clock — no timezone math needed client-side,
// since `nextResetAt` is already an absolute UTC timestamp.
function startResetCountdown(nextResetAtIso) {
  clearInterval(resetInterval);
  const badge = document.getElementById('daily-reset');
  if (!badge || !nextResetAtIso) return;

  const deadline = new Date(nextResetAtIso).getTime();
  if (Number.isNaN(deadline)) return;

  const render = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      badge.textContent = 'Resets soon';
      clearInterval(resetInterval);
      return;
    }
    badge.textContent = formatCountdown(remaining);
  };

  badge.hidden = false;
  render();
  resetInterval = setInterval(render, 30000);
}

function verdict(accuracy) {
  if (accuracy >= 80) return 'Nicely done';
  if (accuracy >= 50) return 'Good effort';
  return 'Keep practicing';
}

const statusEl = () => document.getElementById('daily-status');
const quizEl = () => document.getElementById('daily-quiz');
const resultEl = () => document.getElementById('daily-result');

function banner(tone, html, action = '') {
  const mark =
    tone === 'sun'
      ? '<span class="pq-disc-mark" aria-hidden="true"></span>'
      : icon(tone === 'coral' ? 'alert' : 'info');
  const toneClass = tone === 'brand' ? '' : ` pq-banner--${tone}`;
  return `<div class="pq-banner${toneClass}">${mark}<span class="pq-banner__text">${html}</span>${action}</div>`;
}

function renderLoading() {
  statusEl().innerHTML = '';
  quizEl().hidden = false;
  quizEl().setAttribute('aria-busy', 'true');
  quizEl().innerHTML = `
    <div class="pq-question" aria-hidden="true"><div class="pq-question__in">
      <div class="pq-skel pq-skel--line" style="width:30%"></div>
      <div class="pq-skel pq-skel--title"></div>
      <div class="pq-skel" style="height:56px"></div>
      <div class="pq-skel" style="height:56px"></div>
    </div></div>
    <span class="pq-sr-only">Loading today's challenge</span>`;
}

function renderRibbon() {
  const total = challenge.questions.length;
  const cells = Array.from({ length: total }, (_, index) => {
    if (index < currentIndex) return '<i class="done"></i>';
    if (index === currentIndex) return '<i class="now"></i>';
    return '<i></i>';
  }).join('');
  return `
    <div class="daily-progress">
      <div class="pq-ribbon-label">
        <span>Question ${currentIndex + 1} of ${total}</span>
        <span>${currentIndex} answered</span>
      </div>
      <div class="pq-ribbon" aria-hidden="true">${cells}</div>
    </div>`;
}

function renderQuestion() {
  const question = challenge.questions[currentIndex];
  const isLast = currentIndex === challenge.questions.length - 1;
  selectedIndex = null;

  const container = quizEl();
  container.hidden = false;
  container.removeAttribute('aria-busy');
  container.innerHTML = `
    ${renderRibbon()}
    <article class="pq-question">
      <div class="pq-question__in">
        <div class="pq-question__meta">
          ${question.difficulty ? `<span class="badge">${escapeHTML(capitalize(question.difficulty))}</span>` : ''}
          ${(() => {
            const topics = [question.primaryTopic, ...(question.secondaryTopics || [])].filter(Boolean);
            return topics.length ? `<span>${escapeHTML(topics.join(', '))}</span>` : '';
          })()}
        </div>
        <h2 class="pq-title" id="daily-question-title" tabindex="-1">${escapeHTML(question.question)}</h2>
        ${
          question.code
            ? `<pre class="pq-code"><code class="language-python">${escapeHTML(question.code.trim())}</code></pre>`
            : ''
        }
        <div class="pq-answers" role="group" aria-labelledby="daily-question-title">
          ${question.options
            .map(
              (option, index) => `
            <button type="button" class="pq-answer" data-index="${index}" aria-pressed="false">
              <span class="pq-answer__key" aria-hidden="true">${String.fromCharCode(65 + index)}</span>
              <span>${escapeHTML(option)}</span>
            </button>`
            )
            .join('')}
        </div>
        <div class="pq-question__foot">
          <span class="pq-small pq-muted">Answers are scored when you submit the challenge.</span>
          <button type="button" class="primary-btn daily-next" id="daily-next" disabled>
            ${isLast ? 'Submit challenge' : 'Next question'}
          </button>
        </div>
      </div>
    </article>`;

  if (window.Prism) Prism.highlightAllUnder(container);

  const optionButtons = container.querySelectorAll('.pq-answer');
  const nextBtn = container.querySelector('#daily-next');

  optionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedIndex = Number(button.dataset.index);
      optionButtons.forEach((el) => {
        const isSelected = el === button;
        el.classList.toggle('is-selected', isSelected);
        el.setAttribute('aria-pressed', String(isSelected));
      });
      nextBtn.disabled = false;
    });
  });

  nextBtn.addEventListener('click', () => {
    if (selectedIndex === null) return;
    answers[currentIndex] = {
      questionId: question._id,
      selectedIndex,
    };
    currentIndex += 1;
    if (currentIndex < challenge.questions.length) {
      renderQuestion();
      document.getElementById('daily-question-title')?.focus();
    } else {
      submitChallenge();
    }
  });
}

function renderResult({ score, total, pointsAwarded = null, alreadyCompleted = false }) {
  const accuracy = total ? Math.round((score / total) * 100) : 0;
  const summary = alreadyCompleted
    ? `You answered ${score} out of ${total} correctly today. A new challenge starts tomorrow.`
    : `You answered ${score} out of ${total} correctly. Come back tomorrow for a new challenge.`;

  const stats = [
    `<div class="pq-stat"><span class="pq-stat__l">Accuracy</span><span class="pq-stat__v">${accuracy}%</span></div>`,
  ];
  if (pointsAwarded !== null) {
    stats.push(
      `<div class="pq-stat"><span class="pq-stat__l">Bonus points</span><span class="pq-stat__v"><span>+<span id="daily-points">0</span></span></span></div>`
    );
  }

  const box = resultEl();
  box.hidden = false;
  box.innerHTML = `
    <div class="pq-results">
      <div class="pq-score-disc">
        <span class="pq-small">Score</span>
        <b id="results-score">0</b>
        <span class="pq-results__of">of ${total}</span>
      </div>
      <div class="pq-stack pq-results__meta">
        <span class="badge badge-brand">Daily challenge</span>
        <h2 class="pq-display-xl" id="daily-result-title" tabindex="-1">${verdict(accuracy)}</h2>
        <p class="pq-body-lg pq-muted">${summary}</p>
        <div class="pq-stats" style="grid-template-columns: repeat(${stats.length}, 1fr)">${stats.join('')}</div>
        <div class="pq-row action-row">
          <a class="primary-btn" href="/leaderboard.html">View leaderboard</a>
          <a class="secondary-btn" href="/account.html">Dashboard</a>
        </div>
      </div>
    </div>`;

  countUp(document.getElementById('results-score'), score, 800);
  const pointsEl = document.getElementById('daily-points');
  if (pointsEl) countUp(pointsEl, pointsAwarded, 1000);
}

// Guards against a double click sending the submission twice.
let submitting = false;

async function submitChallenge() {
  if (submitting) return;
  submitting = true;
  quizEl().hidden = true;
  statusEl().innerHTML = banner('brand', 'Submitting your answers…');

  try {
    const result = await api.submitDailyChallenge(answers);
    statusEl().innerHTML = '';
    renderResult({ score: result.score, total: result.total, pointsAwarded: result.pointsAwarded });
    document.getElementById('daily-result-title')?.focus();
  } catch (error) {
    statusEl().innerHTML = banner(
      'coral',
      `We couldn't submit your answers. ${escapeHTML(error.message)}`,
      '<button type="button" class="secondary-btn" id="daily-retry-submit">Try again</button>'
    );
    document.getElementById('daily-retry-submit').addEventListener('click', submitChallenge);
  } finally {
    submitting = false;
  }
}

async function loadChallenge() {
  renderLoading();
  try {
    challenge = await api.getDailyChallenge();

    const dateLabel = formatChallengeDate(challenge.date);
    const dateBadge = document.getElementById('daily-date');
    if (dateLabel) {
      dateBadge.textContent = dateLabel;
      dateBadge.hidden = false;
    }

    startResetCountdown(challenge.nextResetAt);

    if (challenge.completed) {
      quizEl().hidden = true;
      statusEl().innerHTML = banner('sun', "<strong>You've completed today's challenge.</strong> Your score is saved.");
      renderResult({ score: challenge.score, total: challenge.total, alreadyCompleted: true });
      return;
    }

    statusEl().innerHTML = banner(
      'brand',
      `Today's challenge has <strong>${challenge.total}</strong> questions. You can submit it once.`
    );
    renderQuestion();
  } catch (error) {
    if (error.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    quizEl().hidden = true;
    quizEl().removeAttribute('aria-busy');
    statusEl().innerHTML = banner(
      'coral',
      `We couldn't load today's challenge. ${escapeHTML(error.message)}`,
      '<button type="button" class="secondary-btn" id="daily-retry-load">Try again</button>'
    );
    document.getElementById('daily-retry-load').addEventListener('click', loadChallenge);
  }
}

async function init() {
  if (!(await requireAuth())) return;
  loadChallenge();
}

document.addEventListener('DOMContentLoaded', init);
