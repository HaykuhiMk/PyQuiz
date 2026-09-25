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
  // Real counts from the public API. If they can't be loaded, the stat
  // keeps its "—" placeholder rather than showing a made-up number.
  try {
    const [topicsRes, studyRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/v1/questions/topics`),
      fetch(`${API_BASE_URL}/api/v1/questions/study?page=1&limit=1`),
    ]);
    if (!topicsRes.ok || !studyRes.ok) return;

    const topicsPayload = await topicsRes.json();
    const studyPayload = await studyRes.json();

    const topicCount = topicsPayload.data?.length;
    const questionCount = studyPayload.meta?.total;

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
