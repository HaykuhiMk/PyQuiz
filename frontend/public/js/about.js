import API_BASE_URL from './config.js';

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
  try {
    const [topicsRes, studyRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/v1/questions/topics`),
      fetch(`${API_BASE_URL}/api/v1/questions/study?page=1&limit=1`),
    ]);

    const topicsPayload = await topicsRes.json();
    const studyPayload = await studyRes.json();

    const topicCount = topicsPayload.data?.length ?? 0;
    const questionCount = studyPayload.meta?.total ?? topicsPayload.data?.length ?? 0;

    animateCount('[data-count-target="topics"]', topicCount);
    animateCount('[data-count-target="questions"]', questionCount);
  } catch {
    animateCount('[data-count-target="topics"]', 90);
    animateCount('[data-count-target="questions"]', 47);
  }

  document.querySelectorAll('[data-count]').forEach((el) => {
    animateCount(el, Number(el.dataset.count));
  });
}

function animateCount(selectorOrEl, target) {
  const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
  if (!el || Number.isNaN(target)) return;

  const suffix = el.dataset.suffix || '';
  const duration = 900;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    const value = Math.round(target * eased);
    el.textContent = `${value}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
