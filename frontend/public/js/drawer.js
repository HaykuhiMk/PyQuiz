// The mobile navigation drawer of the app shell: the learner pages'
// sidebar (load_sidebar.js) and the admin pages' (admin_shell.js). Expects
// #pq-sidebar, #sidebar-overlay, #sidebar-toggle and #sidebar-close.

function focusableElements(container) {
    return Array.from(
        container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((el) => el.offsetParent !== null);
}

export function initDrawer() {
    const sidebar = document.getElementById("pq-sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const toggleBtn = document.getElementById("sidebar-toggle");
    const closeBtn = document.getElementById("sidebar-close");
    if (!sidebar || !overlay || !toggleBtn || !closeBtn) return;

    function openDrawer() {
        sidebar.classList.add("is-open");
        overlay.hidden = false;
        toggleBtn.setAttribute("aria-expanded", "true");
        closeBtn.focus();
        document.addEventListener("keydown", onKeydown);
    }

    function closeDrawer() {
        sidebar.classList.remove("is-open");
        overlay.hidden = true;
        toggleBtn.setAttribute("aria-expanded", "false");
        document.removeEventListener("keydown", onKeydown);
        toggleBtn.focus();
    }

    function onKeydown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            closeDrawer();
            return;
        }
        if (event.key === "Tab") {
            const focusable = focusableElements(sidebar);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }

    toggleBtn.addEventListener("click", openDrawer);
    closeBtn.addEventListener("click", closeDrawer);
    overlay.addEventListener("click", closeDrawer);

    // Desktop layout (>=1024px) has no drawer state; keep things tidy if the
    // viewport crosses the breakpoint while the drawer happens to be open.
    window.addEventListener("resize", () => {
        if (window.innerWidth >= 1024 && sidebar.classList.contains("is-open")) {
            closeDrawer();
        }
    });
}
