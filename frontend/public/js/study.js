import { api } from './api.js';

let page = 1;
let topics = [];
let hasNext = false;

function escapeHTML(str = '') {
  return str.replace(/[&<>"']/g, (match) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match])
  );
}

function renderCard(question) {
  return `
    <article class="card study-card">
      <div class="study-meta">
        <span class="badge">${question.difficulty}</span>
        <span>${(question.topics || []).join(', ')}</span>
      </div>
      <h3>${escapeHTML(question.question)}</h3>
      ${
        question.code
          ? `<pre><code class="language-python">${escapeHTML(question.code.trim())}</code></pre>`
          : ''
      }
      <div class="answer-block">
        <strong>Answer:</strong> ${escapeHTML(question.answer)}
      </div>
      <p class="explanation">${escapeHTML(question.explanation || 'No explanation provided.')}</p>
    </article>`;
}

async function loadCards() {
  const container = document.getElementById('study-cards');
  container.innerHTML = '<div class="empty-state">Loading study cards...</div>';

  const search = document.getElementById('study-search').value.trim().toLowerCase();
  const difficulty = document.getElementById('study-difficulty').value;
  const filteredTopics = search
    ? topics.filter((topic) => topic.toLowerCase().includes(search))
    : [];

  try {
    const questions = await api.getStudyQuestions({
      topics: filteredTopics,
      difficulty,
      page,
      limit: 6,
    });
    hasNext = questions.length === 6;
    document.getElementById('study-page-label').textContent = `Page ${page}`;

    if (!questions.length) {
      container.innerHTML = '<div class="empty-state">No study cards found for these filters.</div>';
      return;
    }

    container.innerHTML = questions.map(renderCard).join('');
    if (window.Prism) Prism.highlightAll();
  } catch (error) {
    container.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    topics = await api.getTopics();
  } catch {
    topics = [];
  }

  document.getElementById('study-load-btn').addEventListener('click', () => {
    page = 1;
    loadCards();
  });
  document.getElementById('study-prev').addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      loadCards();
    }
  });
  document.getElementById('study-next').addEventListener('click', () => {
    if (hasNext) {
      page += 1;
      loadCards();
    }
  });

  loadCards();
});
