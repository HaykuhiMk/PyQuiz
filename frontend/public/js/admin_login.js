import API_BASE_URL from "./config.js";

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
            const response = await fetch(`${API_BASE_URL}/api/admin/admin-login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem("adminToken", data.token);
                window.location.href = "admin_dashboard.html"; 
            } else {
                loginError.textContent = data.error || "Invalid login credentials!";
            }
        } catch (error) {
            console.error("Login error:", error);
            loginError.textContent = "An error occurred. Please try again later.";
        }
    });
});
