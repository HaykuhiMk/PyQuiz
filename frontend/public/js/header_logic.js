import { getSession } from "./api.js";

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

// The auth token lives only in an httpOnly cookie (invisible to JS), and
// a readable cookie can outlive an expired or revoked session, so this asks
// the server (GET /api/v1/auth/me, shared per page by getSession) instead
// of inferring login state from cookie presence (docs/AUDIT.md Phase 4).
async function isUserLoggedIn() {
    if (getCookie("guestMode") === "true") return false;
    return Boolean(await getSession());
}

function markCurrentLink() {
    const path = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".pq-topnav ul a").forEach((link) => {
        const href = link.getAttribute("href")?.replace(/^\//, "");
        if (href === path) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

async function initializeHeaderLogic() {
    const logoLink = document.querySelector(".logo a");
    if (logoLink && !logoLink.dataset.redirectBound) {
        logoLink.dataset.redirectBound = "true";
        logoLink.addEventListener("click", async function(event) {
            event.preventDefault();
            if (await isUserLoggedIn()) {
                window.location.href = "/account.html";
            } else {
                window.location.href = "/index.html";
            }
        });
    }

    markCurrentLink();

    const loggedIn = await isUserLoggedIn();
    const authActions = document.getElementById("topbar-auth-actions");
    if (authActions) {
        authActions.hidden = loggedIn;
    }
    const appActions = document.getElementById("topbar-app-actions");
    if (appActions) {
        appActions.hidden = !loggedIn;
    }
}

// Initialize when the script loads
initializeHeaderLogic();

// Re-initialize when the header is dynamically loaded
document.addEventListener("DOMContentLoaded", initializeHeaderLogic);

// Export for use in other modules if needed
export { initializeHeaderLogic, isUserLoggedIn };
