import { initThemeToggle } from './theme.js';
import { initDrawer } from './drawer.js';

// The admin pages' app shell (same look as the learner pages' sidebar):
// marks the current page in the sidebar and wires the mobile drawer and the
// theme toggle. Each page's own script wires #logout-btn.
function markCurrentPage() {
  const page = window.location.pathname.split('/').pop() || 'admin_dashboard.html';
  document.querySelectorAll('.pq-sidelink[data-page]').forEach((link) => {
    if (link.dataset.page === page) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

// The top bar shows the page's own title (its <h1>).
function showPageTitle() {
  const title = document.querySelector('.pq-app-topbar__title');
  const heading = document.querySelector('main h1');
  if (title && heading) title.textContent = heading.textContent.trim();
}

document.addEventListener('DOMContentLoaded', () => {
  markCurrentPage();
  showPageTitle();
  initDrawer();
  initThemeToggle();
});
