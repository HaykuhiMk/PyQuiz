import { api } from "./api.js";

const forgotPasswordForm = document.getElementById('forgot-password-form');
const emailInput = document.getElementById('email');
const helperText = document.getElementById('helper-text');

const submitBtn = forgotPasswordForm.querySelector('button[type="submit"]');

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

forgotPasswordForm.addEventListener('submit', function (event) {
    event.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
        showError('Email is required.');
        return;
    }

    // The registration page's rule: every address it accepts must be able
    // to request a reset ("+" in the name, top-level domains over 6 letters).
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
        showError('Please enter a valid email address.');
        return;
    }

    clearError();
    setBusy(true);
    api.forgotPassword(email)
    .then(() => {
        window.location.href = 'password_reset_link_success.html';
    })
    .catch(error => {
        console.error('Error:', error);
        showError(`Couldn't send the reset link. ${error.message}`);
        setBusy(false);
    });

});
