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

    // Confirmed server-side rather than from cookie presence, so an expired
    // or revoked session doesn't bounce the visitor to a dashboard that
    // then fails to load (docs/AUDIT.md Phase 4).
    const isGuest = getCookie("guestMode") === "true";
    if (!isGuest && (await getSession())) {
        window.location.href = "account.html";
        return;
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
});
