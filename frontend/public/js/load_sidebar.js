import { initUI } from './ui.js';
import { initThemeToggle } from './theme.js';
import { api, getSession } from './api.js';

function getCookie(name) {
    const value = document.cookie.split("; ")
        .find(row => row.startsWith(name + "="))
        ?.split("=")[1];
    if (!value) return null;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

// Confirmed server-side (GET /api/v1/auth/me), not inferred from a cookie
// that can outlive an expired or revoked session (docs/AUDIT.md Phase 4).
async function isLoggedIn() {
    return getCookie("guestMode") !== "true" && Boolean(await getSession());
}

function isGuest() {
    return getCookie("guestMode") === "true";
}

function setActiveSidelink() {
    const path = window.location.pathname.split("/").pop() || "account.html";
    document.querySelectorAll(".pq-sidelink").forEach((link) => {
        const href = link.getAttribute("href")?.replace(/^\//, "");
        if (href === path) {
            link.classList.add("is-active");
            link.setAttribute("aria-current", "page");
        }
    });
}

async function renderAccountArea() {
    const area = document.getElementById("sidebar-account-area");
    if (!area) return;

    if (await isLoggedIn()) {
        area.innerHTML = `
            <a href="/account.html" class="pq-side__identity">
                <span class="pq-side__avatar" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>
                </span>
                <span>My Account</span>
            </a>
            <button id="sidebar-logout" class="secondary-btn pq-side__logout" type="button">Logout</button>`;
        document.getElementById("sidebar-logout").addEventListener("click", handleLogout);
    } else if (isGuest()) {
        area.innerHTML = `
            <p class="pq-small pq-muted" style="margin: 0">You're in Guest Mode. Progress isn't saved.</p>
            <a href="/login.html" class="primary-btn">Log in</a>`;
    } else {
        area.innerHTML = `
            <a href="/login.html" class="secondary-btn">Log in</a>
            <a href="/registration.html" class="primary-btn">Sign up</a>`;
    }
}

async function handleLogout() {
    try {
        await api.logout();
    } catch (error) {
        console.error("Logout request failed:", error);
    }
    document.cookie = "guestMode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = "/login.html";
}

function focusableElements(container) {
    return Array.from(
        container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((el) => el.offsetParent !== null);
}

function initDrawer() {
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

document.addEventListener("DOMContentLoaded", async function () {
    try {
        const shellResponse = await fetch("app_shell.html");
        const shellData = await shellResponse.text();
        document.getElementById("header-container").innerHTML = shellData;

        const titleEl = document.getElementById("app-page-title");
        if (titleEl) titleEl.textContent = document.body.dataset.pageTitle || "";

        setActiveSidelink();
        renderAccountArea();
        initDrawer();
        initUI();
        initThemeToggle();
    } catch (error) {
        console.error("Error loading app shell:", error);
    }

    try {
        const footerResponse = await fetch("footer.html");
        const footerData = await footerResponse.text();
        document.getElementById("footer-container").innerHTML = footerData;
    } catch (error) {
        console.error("Error loading footer:", error);
    }
});
