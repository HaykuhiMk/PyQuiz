import { api } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("admin-login-form");
    const loginError = document.getElementById("login-error");

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const username = document.getElementById("admin-username").value.trim();
        const password = document.getElementById("admin-password").value.trim();

        if (!username || !password) {
            loginError.textContent = "Username and password are required!";
            return;
        }

        try {
            await api.adminLogin({ username, password });
            window.location.href = "admin_dashboard.html";
        } catch (error) {
            console.error("Login error:", error);
            loginError.textContent = error.message || "Invalid login credentials!";
        }
    });
});
