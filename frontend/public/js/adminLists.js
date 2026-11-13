// Shared bits of the admin list pages (Questions, Users, Messages): the
// count next to the page title and "of N" next to the page number, both
// from the list response's meta ({ total, totalPages }).

// labels: [singular, plural]. A null total hides the count.
export function showListCount(total, labels = ["item", "items"]) {
    const el = document.getElementById("list-count");
    if (!el) return;
    if (typeof total !== "number") {
        el.hidden = true;
        return;
    }
    el.textContent = `${total.toLocaleString()} ${total === 1 ? labels[0] : labels[1]}`;
    el.hidden = false;
}

export function showPageTotal(meta = {}) {
    const el = document.getElementById("page-total");
    if (!el) return;
    el.textContent = meta.totalPages > 1 ? `of ${meta.totalPages}` : "";
}

// Initials for a user's avatar circle.
export function initials(name = "") {
    const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : String(name).trim().slice(0, 2);
    return letters.toUpperCase() || "?";
}
