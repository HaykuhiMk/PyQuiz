import { api, requireAuth } from './api.js';

let challenge = null;
let currentIndex = 0;
const answers = [];

function escapeHTML(str = '') {
  return str.replace(/[&<>"']/g, (match) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match])
  );
}

function renderQuestion() {
  const question = challenge.questions[currentIndex];
  const container = document.getElementById('daily-quiz');
  container.style.display = 'block';
  container.innerHTML = `
    <p>Question ${currentIndex + 1} of ${challenge.questions.length}</p>
    <h3>${escapeHTML(question.question)}</h3>
    ${
      question.code
        ? `<pre><code class="language-python">${escapeHTML(question.code.trim())}</code></pre>`
        : ''
    }
    <div class="options">
      ${question.options
        .map(
          (option, index) =>
            `<button class="secondary-btn option-btn" data-index="${index}">${escapeHTML(option)}</button>`
        )
        .join('')}
    </div>`;

  if (window.Prism) Prism.highlightAll();

  container.querySelectorAll('.option-btn').forEach((button) => {
    button.addEventListener('click', () => {
      answers[currentIndex] = {
        questionId: question._id,
        selectedIndex: Number(button.dataset.index),
      };
      currentIndex += 1;
      if (currentIndex < challenge.questions.length) {
        renderQuestion();
      } else {
        submitChallenge();
      }
    });
  });
}

async function submitChallenge() {
  const resultBox = document.getElementById('daily-result');
  document.getElementById('daily-quiz').style.display = 'none';
  resultBox.style.display = 'block';
  resultBox.innerHTML = '<div class="empty-state">Submitting your daily score...</div>';

  try {
    const result = await api.submitDailyChallenge(answers);
    resultBox.innerHTML = `
      <h2>Daily Challenge Complete!</h2>
      <p>You scored <strong>${result.score}/${result.total}</strong></p>
      <p>+${result.pointsAwarded} bonus points</p>
      <div class="action-row">
        <a class="primary-btn" href="/leaderboard.html">View Leaderboard</a>
        <a class="secondary-btn" href="/account.html">My Dashboard</a>
      </div>`;
  } catch (error) {
    resultBox.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

async function init() {
  if (!requireAuth()) return;

  const status = document.getElementById('daily-status');
  try {
    challenge = await api.getDailyChallenge();
    if (challenge.completed) {
      status.innerHTML = `
        <h3>Already completed today</h3>
        <p>Your score: <strong>${challenge.score}/${challenge.total}</strong></p>
        <p>Come back tomorrow for a new challenge.</p>`;
      return;
    }

    status.innerHTML = `<p>Today's challenge has <strong>${challenge.total}</strong> questions. Good luck!</p>`;
    renderQuestion();
  } catch (error) {
    status.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
