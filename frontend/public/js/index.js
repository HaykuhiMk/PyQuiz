import { getSession } from "./api.js";

document.addEventListener("DOMContentLoaded", async () => {
    function getCookie(name) {
        const cookies = document.cookie.split("; ");
        for (const cookie of cookies) {
            const [key, value] = cookie.split("=");
            if (key === name) {
                return value;
            }
        }
        return null;
    }

    document.getElementById("login-btn").addEventListener("click", () => {
        window.location.href = "login.html";
    });

    document.getElementById("register-btn").addEventListener("click", () => {
        window.location.href = "registration.html";
    });

    document.getElementById("guest-btn").addEventListener("click", () => {
        document.cookie = "guestMode=true"; 
        window.location.href = "questions.html";
    });

    // Confirmed server-side rather than from cookie presence, so an expired
    // or revoked session doesn't bounce the visitor to a dashboard that
    // then fails to load (docs/AUDIT.md Phase 4). Runs after the buttons are
    // wired up: awaiting it first left them dead until /auth/me answered.
    const isGuest = getCookie("guestMode") === "true";
    if (!isGuest && (await getSession())) {
        window.location.href = "account.html";
    }
});
