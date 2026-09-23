import { api } from "./api.js";

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

    function isValidPassword(password) {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_])[A-Za-z\d@$!%*?&_]{8,}$/;
        return passwordRegex.test(password);
    }

    function showError(message) {
        helperText.textContent = message;
        helperText.style.color = 'red';
    }

    function clearError() {
        helperText.textContent = 'All fields are required';
        helperText.style.color = 'white';
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();

        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const repeatPassword = repeatPasswordInput.value.trim();

        if (!username || !email || !password || !repeatPassword) {
            showError('All fields must be filled out.');
            return;
        }

        if (!isValidEmail(email)) {
            showError('Please enter a valid email address.');
            return;
        }

        if (!isValidPassword(password)) {
            showError('Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character (@, $, !, %, *, ?, &, _).');
            return;
        }

        if (password !== repeatPassword) {
            showError('Passwords do not match.');
            return;
        }

        clearError();

        api.register({ username, email, password })
        .then((data) => {
            if (data.message) {
                form.reset();
                window.location.href = './login.html';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError(error.message || 'An error occurred during registration.');
        });
    });

    window.togglePasswordVisibility = function (fieldId) {
        const passwordInput = document.getElementById(fieldId);
        const toggleIcon = document.getElementById(`toggle-${fieldId}`);

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.src = '/images/hide-password.png';
        } else {
            passwordInput.type = 'password';
            toggleIcon.src = '/images/show-password.png';
        }
    };
});
