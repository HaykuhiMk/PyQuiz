// Question text written with Markdown-style inline code (`set(ls)`), as
// in explanations and misconception feedback: returns HTML that shows the
// backtick spans as <code class="pq-inline"> and everything else as plain
// text. The whole text is escaped FIRST, so nothing in it (a tag, an
// attribute, an entity) can become HTML; only the <code> wrappers added
// here are markup. A span stays on one line; a lone backtick stays literal.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function renderInlineCode(text = '') {
  const escaped = String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
  return escaped.replace(/`([^`\n]+)`/g, '<code class="pq-inline">$1</code>');
}
