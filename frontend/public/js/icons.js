// PyQuiz line icons from the design-system artifact (24-grid, 2px stroke,
// square caps, miter joins). Only the icons the redesigned pages use are
// included here; the full set lives in the artifact's bundle.js.
const PATHS = {
  search: '<path d="M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z"/><path d="m16 16 5 5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  info: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/><path d="M12 11v6M12 7v1"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 17v1"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  back: '<path d="M20 12H5M11 6l-6 6 6 6"/>',
  user: '<path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  lock: '<path d="M5 11h14v10H5z"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5M20 20v-4h-4"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 14v4M8 21h8"/>',
  flag: '<path d="M5 21V4h12l-2 4 2 4H5"/>',
  clock: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/><path d="M12 7v5l3 3"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  topics: '<path d="M4 4h7v7H4z"/><path d="M13 4h7v7h-7z"/><path d="M4 13h7v7H4z"/><path d="M13 16.5h7M16.5 13v7"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  mail: '<path d="M3 5h18v14H3z"/><path d="m3 5 9 8 9-8"/>',
};

export function icon(name, size = 20) {
  return `<svg class="pq-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${PATHS[name] || ''}</svg>`;
}

// Replaces every <span data-icon="name" data-size="16"> placeholder under root.
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 20);
  });
}
