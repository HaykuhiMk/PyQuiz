import API_BASE_URL from "./config.js";

const forgotPasswordForm = document.getElementById('forgot-password-form');
const emailInput = document.getElementById('email');
const helperText = document.getElementById('helper-text');

function showError(message) {
    helperText.textContent = message;
    helperText.style.color = 'red';
}

function clearError() {
    helperText.textContent = '';
    helperText.style.color = 'white';
}

forgotPasswordForm.addEventListener('submit', function (event) {
    event.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
        showError('Email is required.');
        return;
    }

    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailRegex.test(email)) {
        showError('Please enter a valid email address.');
        return;
    }

    clearError();
    fetch(`${API_BASE_URL}/api/auth/forgot_password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
    })
    .then(response => {
        return response.json(); 
    })
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        window.location.href = 'password_reset_link_success.html';
    })
    .catch(error => {
        console.error('Error:', error);
        showError('An error occurred while sending the password reset link.');
    });

});
