import { api } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("admin-login-form");
    const loginError = document.getElementById("login-error");

    const passwordInput = document.getElementById("admin-password");
    const toggleButton = document.getElementById("toggle-admin-password");
    toggleButton.addEventListener("click", () => {
        const reveal = passwordInput.type === "password";
        passwordInput.type = reveal ? "text" : "password";
        toggleButton.textContent = reveal ? "Hide" : "Show";
        toggleButton.setAttribute("aria-pressed", String(reveal));
    });

    // A Caps Lock warning while typing the password.
    const capsNote = document.getElementById("caps-lock-note");
    const updateCaps = (event) => {
        if (typeof event.getModifierState === "function") capsNote.hidden = !event.getModifierState("CapsLock");
    };
    passwordInput.addEventListener("keydown", updateCaps);
    passwordInput.addEventListener("keyup", updateCaps);
    passwordInput.addEventListener("blur", () => { capsNote.hidden = true; });

    const submitButton = loginForm.querySelector('button[type="submit"]');

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const username = document.getElementById("admin-username").value.trim();
        // Never trimmed: the password must match exactly as it was set.
        const password = document.getElementById("admin-password").value;

        if (!username || !password) {
            loginError.textContent = "Enter your username and password.";
            return;
        }

        loginError.textContent = "";
        submitButton.disabled = true;
        submitButton.textContent = "Signing in…";
        try {
            await api.adminLogin({ username, password });
            window.location.href = "admin_dashboard.html";
        } catch (error) {
            console.error("Login error:", error);
            loginError.textContent = error.message || "Invalid username or password.";
            submitButton.disabled = false;
            submitButton.textContent = "Sign in";
        }
    });
});
