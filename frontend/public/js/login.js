import { api } from "./api.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const helperText = document.getElementById("helper-text");

const submitBtn = form.querySelector('button[type="submit"]');

if (new URLSearchParams(window.location.search).get('passwordChanged') === '1') {
    helperText.textContent = 'Password changed. Please log in again.';
}

function showError(message) {
    helperText.textContent = message;
    helperText.classList.add("error");
}

function clearError() {
    helperText.textContent = "";
    helperText.classList.remove("error");
}

function setBusy(busy) {
    submitBtn.disabled = busy;
    if (busy) submitBtn.setAttribute("aria-busy", "true");
    else submitBtn.removeAttribute("aria-busy");
}

form.addEventListener("submit", (event) => {
    event.preventDefault(); 

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showError("Email and password are required.");
        return;
    }

    clearError();
    setBusy(true);

    api.login({ email, password })
    .then(() => {
        window.location.href = "./account.html";
    })
    .catch(error => {
        console.error("🚨 Login Error:", error.message);  
        showError(error.message || "An error occurred during login.");
        setBusy(false);
    });
});

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleButton = document.getElementById('toggle-password');
    const reveal = passwordInput.type === 'password';

    passwordInput.type = reveal ? 'text' : 'password';
    toggleButton.textContent = reveal ? 'Hide' : 'Show';
    toggleButton.setAttribute('aria-pressed', String(reveal));
}

// Bound here rather than via inline onclick attributes, which the
// frontend's Content-Security-Policy blocks (docs/AUDIT.md Phase 4).
document.getElementById('toggle-password').addEventListener('click', togglePasswordVisibility);
document.getElementById('forgot-password-btn').addEventListener('click', () => {
    window.location.href = './forgot_password.html';
});
