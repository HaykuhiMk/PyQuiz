const TOAST_DURATION = 3200;

function ensureToastRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  return root;
}

export function showToast(message, type = 'success') {
  const root = ensureToastRoot();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  root.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('exit');
    toast.addEventListener('animationend', () => toast.remove());
  }, TOAST_DURATION);
}

function addRipple(event) {
  const host = event.currentTarget;
  if (!host.classList.contains('ripple-host')) {
    host.classList.add('ripple-host');
  }
  const rect = host.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  host.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

const RIPPLE_SELECTOR =
  '.primary-btn, .secondary-btn, .mode-btn, .action-btn, #start-quiz-btn, .buttons button';

export function initRipples() {
  document.querySelectorAll(RIPPLE_SELECTOR).forEach((el) => {
    if (el.dataset.rippleBound) return;
    el.dataset.rippleBound = '1';
    el.addEventListener('click', addRipple);
  });
}

export function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal, .reveal-stagger, .card, .feature, .stat-card').forEach((el) => {
    if (!el.classList.contains('reveal') && !el.classList.contains('reveal-stagger')) {
      el.classList.add('reveal');
    }
    observer.observe(el);
  });
}

export function countUp(el, to, ms = 900) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    el.textContent = Math.round(to).toLocaleString('en-US');
    return;
  }

  const t0 = performance.now();
  function step(t) {
    const k = Math.min(1, (t - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(to * eased).toLocaleString('en-US');
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export function setActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav ul li a').forEach((link) => {
    const href = link.getAttribute('href')?.replace(/^\//, '');
    if (href === path) link.classList.add('active');
  });
}

export function celebrateQuizComplete() {
  // Purely decorative, so skipped entirely for reduced motion.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let canvas = document.getElementById('confetti-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    document.body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = Array.from({ length: 80 }, () => ({
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: (Math.random() - 0.5) * 12,
    vy: (Math.random() - 1) * 12,
    color: Math.random() > 0.5 ? '#3776AB' : '#FFD43B',
    size: Math.random() * 6 + 3,
    life: 1,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.012;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
    });
    frame += 1;
    if (frame < 120) requestAnimationFrame(draw);
    else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    }
  }
  draw();
  showToast('Quiz completed — great work!', 'success');
}

export function initUI() {
  document.body.classList.add('page-enter');
  // The animation's fill-mode holds its final `transform` on <body> after it
  // finishes, which turns <body> into the containing block for every
  // position:fixed descendant (headers, the sidebar, drawers, toasts...)
  // instead of the viewport. Drop the class once the entrance is done.
  document.body.addEventListener(
    'animationend',
    () => document.body.classList.remove('page-enter'),
    { once: true }
  );
  initRipples();
  initReveal();
  setActiveNav();
}

