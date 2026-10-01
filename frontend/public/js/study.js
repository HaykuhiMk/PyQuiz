import { api, requireAuth } from './api.js';
import { icon, mountIcons } from './icons.js';
import { getTopicNamer } from './topics.js';

const PAGE_SIZE = 6;

let page = 1;
// Topics with questions, as [{ id, name }]; the search matches names and the
// filter sends ids. topicName turns stored ids into display names.
let topics = [];
let topicName = (id) => id;
let hasNext = false;

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, (match) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match])
  );
}

function capitalize(str = '') {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function matchingTopics() {
  const search = document.getElementById('study-search').value.trim().toLowerCase();
  if (!search) return { search, matches: [] };
  return { search, matches: topics.filter((topic) => topic.name.toLowerCase().includes(search)) };
}

function updateSearchHelp() {
  const help = document.getElementById('study-search-help');
  const { search, matches } = matchingTopics();
  if (!search) {
    help.textContent = 'Leave empty to include every topic.';
  } else if (matches.length) {
    help.textContent = `Matches ${matches.length} topic${matches.length === 1 ? '' : 's'}: ${matches.slice(0, 4).map((topic) => topic.name).join(', ')}${matches.length > 4 ? '…' : ''}`;
  } else {
    help.textContent = 'No topic matches, so every topic is included.';
  }
}

function renderExplanation(answer, explanation) {
  return `
    <div class="pq-explain study-card__explain">
      <span class="pq-disc-mark" aria-hidden="true"></span>
      <div>
        <h3 class="study-card__answer">Answer: <code class="pq-inline">${escapeHTML(answer)}</code></h3>
        <p>${escapeHTML(explanation || 'No explanation provided.')}</p>
      </div>
    </div>`;
}

function renderCard(question) {
  const topicsLabel = [question.primaryTopic, ...(question.secondaryTopics || [])].filter(Boolean).map(topicName).join(', ');
  const hasAnswer = question.answer !== undefined && question.answer !== null;
  const correctIndex = hasAnswer ? (question.options || []).indexOf(question.answer) : -1;
  return `
    <article class="card study-card">
      <div class="card__meta">
        ${question.difficulty ? `<span class="badge">${escapeHTML(capitalize(question.difficulty))}</span>` : '<span></span>'}
        ${topicsLabel ? `<span class="study-card__topics">${escapeHTML(topicsLabel)}</span>` : ''}
      </div>
      <h2 class="pq-heading study-card__q">${escapeHTML(question.question)}</h2>
      ${
        question.code
          ? `<pre class="pq-code"><code class="language-python">${escapeHTML(question.code.trim())}</code></pre>`
          : ''
      }
      ${
        question.options?.length
          ? `<ol class="pq-answers study-options">
          ${question.options
            .map(
              (option, index) => `
            <li class="pq-answer study-option${index === correctIndex ? ' is-correct' : ''}">
              <span class="pq-answer__key" aria-hidden="true">${String.fromCharCode(65 + index)}</span>
              <span>${escapeHTML(option)}</span>
              ${index === correctIndex ? '<span class="pq-answer__tag">Correct</span>' : ''}
            </li>`
            )
            .join('')}
        </ol>`
          : ''
      }
      ${hasAnswer ? renderExplanation(question.answer, question.explanation) : ''}
    </article>`;
}

function renderSkeletons() {
  return Array.from(
    { length: 2 },
    () => `
    <div class="card study-card" aria-hidden="true">
      <div class="pq-skel pq-skel--line" style="width:30%"></div>
      <div class="pq-skel pq-skel--title"></div>
      <div class="pq-skel" style="height:88px"></div>
      <div class="pq-skel" style="height:72px"></div>
    </div>`
  ).join('');
}

function banner(tone, text) {
  const toneClass = tone === 'coral' ? ' pq-banner--coral' : '';
  return `<div class="pq-banner${toneClass}">${icon(tone === 'coral' ? 'alert' : 'info')}<span class="pq-banner__text">${text}</span></div>`;
}

function updatePager() {
  document.getElementById('study-page-label').textContent = `Page ${page}`;
  document.getElementById('study-prev').disabled = page <= 1;
  document.getElementById('study-next').disabled = !hasNext;
}

async function loadCards() {
  const container = document.getElementById('study-cards');
  const feedback = document.getElementById('study-feedback');
  feedback.innerHTML = '';
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = renderSkeletons();

  const difficulty = document.getElementById('study-difficulty').value;
  const { matches: filteredTopics } = matchingTopics();

  try {
    const { items: questions, meta } = await api.getStudyQuestionsPage({
      topics: filteredTopics.map((topic) => topic.id),
      difficulty,
      page,
      limit: PAGE_SIZE,
    });
    // The server says whether another page exists; a full page doesn't mean
    // there's more (the total can be a multiple of the page size).
    hasNext = Boolean(meta.hasNextPage);
    updatePager();

    if (!questions.length) {
      container.innerHTML = '';
      feedback.innerHTML = banner('brand', 'No study cards match these filters. Try another topic or difficulty.');
      return;
    }

    container.innerHTML = questions.map(renderCard).join('');
    if (window.Prism) Prism.highlightAllUnder(container);
  } catch (error) {
    if (error.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    hasNext = false;
    updatePager();
    container.innerHTML = '';
    feedback.innerHTML = banner('coral', `We couldn't load study cards. ${escapeHTML(error.message)}`);
  } finally {
    container.setAttribute('aria-busy', 'false');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await requireAuth())) return;
  mountIcons(document.querySelector('main'));

  try {
    [topics, topicName] = await Promise.all([api.getTopics(), getTopicNamer()]);
  } catch {
    topics = [];
  }

  document.getElementById('study-search').addEventListener('input', updateSearchHelp);
  document.getElementById('study-filters').addEventListener('submit', (event) => {
    event.preventDefault();
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

  updateSearchHelp();
  loadCards();
});
