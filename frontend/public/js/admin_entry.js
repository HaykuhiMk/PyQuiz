import { api } from "./api.js";

// Admin auth now rides an httpOnly cookie, not a readable localStorage
// token (docs/AUDIT.md Phase 4), so this has to ask the server whether the
// current session is actually a valid admin session.
(async () => {
    try {
        await api.getAdminMe();
        window.location.href = "admin_dashboard.html";
    } catch {
        window.location.href = "admin_login.html";
    }
})();
