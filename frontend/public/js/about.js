import API_BASE_URL from './config.js';
import { countUp } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  initFaqAccordion();
  loadLiveStats();
});

function initFaqAccordion() {
  document.querySelectorAll('.faq-item').forEach((item) => {
    const button = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');

    button.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item.open').forEach((openItem) => {
        if (openItem !== item) closeFaqItem(openItem);
      });

      if (isOpen) {
        closeFaqItem(item);
      } else {
        item.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
        answer.style.maxHeight = `${answer.scrollHeight}px`;
      }
    });
  });
}

function closeFaqItem(item) {
  const button = item.querySelector('.faq-question');
  const answer = item.querySelector('.faq-answer');
  item.classList.remove('open');
  button.setAttribute('aria-expanded', 'false');
  answer.style.maxHeight = '0';
}

async function loadLiveStats() {
  // Real counts from the public stats endpoint (aggregate numbers only). If
  // they can't be loaded, the stat keeps its "—" placeholder rather than
  // showing a made-up number. This used to read the total from Study mode,
  // which has required login since Phase 2, so it always failed.
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/questions/stats`);
    if (!res.ok) return;

    const { data } = await res.json();
    const topicCount = data?.topicCount;
    const questionCount = data?.totalQuestions;

    if (Number.isFinite(topicCount)) {
      countUp(document.querySelector('[data-count-target="topics"]'), topicCount);
    }
    if (Number.isFinite(questionCount)) {
      countUp(document.querySelector('[data-count-target="questions"]'), questionCount);
    }
  } catch {
    // Leave the placeholders in place.
  }
}
