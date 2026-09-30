import { api } from "./api.js";
import { getPasswordRule, showPasswordRequirements } from "./validationRules.js";

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById('registration-form');
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const repeatPasswordInput = document.getElementById('repeat-password');
    const helperText = document.getElementById('helper-text');

    function isValidEmail(email) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email);
    }

    showPasswordRequirements(document.getElementById('password-help'));

    const submitBtn = form.querySelector('button[type="submit"]');

    function showError(message) {
        helperText.textContent = message;
        helperText.classList.add('error');
    }

    function clearError() {
        helperText.textContent = '';
        helperText.classList.remove('error');
    }

    function setBusy(busy) {
        submitBtn.disabled = busy;
        if (busy) submitBtn.setAttribute('aria-busy', 'true');
        else submitBtn.removeAttribute('aria-busy');
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();

        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        // Never trimmed: spaces are valid password characters, and the server
        // stores and checks the password exactly as typed.
        const password = passwordInput.value;
        const repeatPassword = repeatPasswordInput.value;

        if (!username || !email || !password || !repeatPassword) {
            showError('All fields must be filled out.');
            return;
        }

        if (!isValidEmail(email)) {
            showError('Please enter a valid email address.');
            return;
        }

        // The server's own rule (see validationRules.js); if it couldn't be
        // loaded, the server still validates on submit.
        const passwordRule = await getPasswordRule();
        if (passwordRule && !passwordRule.test(password)) {
            showError(`Password requirements: ${passwordRule.requirements}`);
            return;
        }

        if (password !== repeatPassword) {
            showError('Passwords do not match.');
            return;
        }

        clearError();
        setBusy(true);

        api.register({ username, email, password })
        .then((data) => {
            if (data.message) {
                form.reset();
                window.location.href = './login.html';
            } else {
                setBusy(false);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError(error.message || 'An error occurred during registration.');
            setBusy(false);
        });
    });

    function togglePasswordVisibility(fieldId) {
        const passwordInput = document.getElementById(fieldId);
        const toggleButton = document.getElementById(`toggle-${fieldId}`);
        const reveal = passwordInput.type === 'password';

        passwordInput.type = reveal ? 'text' : 'password';
        toggleButton.textContent = reveal ? 'Hide' : 'Show';
        toggleButton.setAttribute('aria-pressed', String(reveal));
    }

    // Bound here rather than via inline onclick attributes, which the
    // frontend's Content-Security-Policy blocks (docs/AUDIT.md Phase 4).
    for (const fieldId of ['password', 'repeat-password']) {
        document.getElementById(`toggle-${fieldId}`).addEventListener('click', () => togglePasswordVisibility(fieldId));
    }
});
