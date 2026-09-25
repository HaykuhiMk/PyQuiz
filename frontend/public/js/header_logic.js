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

function isUserLoggedIn() {
    // The auth token itself lives only in an httpOnly cookie (invisible to
    // JS); the readable csrfToken cookie is set alongside it on login and
    // cleared on logout, so its presence doubles as a "logged in" signal.
    const hasSession = Boolean(getCookie("csrfToken"));
    const isGuest = getCookie("guestMode") === "true";
    return hasSession && !isGuest;
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

function initializeHeaderLogic() {
    const logoLink = document.querySelector(".logo a");
    if (logoLink && !logoLink.dataset.redirectBound) {
        logoLink.dataset.redirectBound = "true";
        logoLink.addEventListener("click", function(event) {
            event.preventDefault();
            if (isUserLoggedIn()) {
                window.location.href = "/account.html";
            } else {
                window.location.href = "/index.html";
            }
        });
    }

    const loggedIn = isUserLoggedIn();
    const authActions = document.getElementById("topbar-auth-actions");
    if (authActions) {
        authActions.hidden = loggedIn;
    }
    const appActions = document.getElementById("topbar-app-actions");
    if (appActions) {
        appActions.hidden = !loggedIn;
    }

    markCurrentLink();
}

// Initialize when the script loads
initializeHeaderLogic();

// Re-initialize when the header is dynamically loaded
document.addEventListener("DOMContentLoaded", initializeHeaderLogic);

// Export for use in other modules if needed
export { initializeHeaderLogic, isUserLoggedIn };
