import { api } from "./api.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const helperText = document.getElementById("helper-text");

function showError(message) {
    helperText.textContent = message;
    helperText.style.color = "red";
}

function clearError() {
    helperText.textContent = "";
}

form.addEventListener("submit", (event) => {
    event.preventDefault(); 

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showError("Email and password are required.");
        return;
    }

    api.login({ email, password })
    .then(() => {
        window.location.href = "./account.html";
    })
    .catch(error => {
        console.error("🚨 Login Error:", error.message);  
        showError(error.message || "An error occurred during login.");
    });
});

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('toggle-password');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.src = '/images/hide-password.png';
    } else {
        passwordInput.type = 'password';
        toggleIcon.src = '/images/show-password.png';
    }
}

window.togglePasswordVisibility = togglePasswordVisibility;
