import { api } from "./api.js";

document.addEventListener("DOMContentLoaded", function () {
    const urlParams = new URLSearchParams(window.location.search);
    const resetKey = urlParams.get("resetKey");

    const helperTextElement = document.getElementById("helper-text");

    const form = document.getElementById("resetPasswordForm");
    const submitBtn = form.querySelector('button[type="submit"]');

    function showMessage(message, tone) {
        helperTextElement.innerText = message;
        helperTextElement.classList.toggle("error", tone === "error");
        helperTextElement.classList.toggle("success", tone === "success");
    }

    // Registered before the key check so the form can never fall back to a
    // native submit, which would put the passwords in the URL.
    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!resetKey) return;

        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {
            showMessage("Passwords do not match.", "error");
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_])[A-Za-z\d@$!%*?&_]{8,}$/;
        if (!passwordRegex.test(password)) {
            showMessage("Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character (@, $, !, %, *, ?, &, _).", "error");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.setAttribute("aria-busy", "true");

        try {
            await api.resetPassword(resetKey, password);

            showMessage("Password successfully reset. Redirecting to log in…", "success");

            setTimeout(() => {
                window.location.href = "./login.html";
            }, 2000);
        } catch (error) {
            showMessage(error.message, "error");
            submitBtn.disabled = false;
        } finally {
            submitBtn.removeAttribute("aria-busy");
        }
    });

    if (!resetKey) {
        showMessage("Reset key is missing. Please check the URL.", "error");
        submitBtn.disabled = true;
    }
});

function toggleVisibility(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    const reveal = input.type === 'password';

    input.type = reveal ? 'text' : 'password';
    button.textContent = reveal ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(reveal));
}

function togglePasswordVisibility() {
    toggleVisibility('password', 'toggle-password');
}

function toggleConfirmPasswordVisibility() {
    toggleVisibility('confirmPassword', 'toggle-confirm-password');
}

window.togglePasswordVisibility = togglePasswordVisibility;
window.toggleConfirmPasswordVisibility = toggleConfirmPasswordVisibility;
