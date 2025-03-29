import API_BASE_URL from "./config.js";

document.addEventListener("DOMContentLoaded", function () {
    const urlParams = new URLSearchParams(window.location.search);
    const resetKey = urlParams.get("resetKey");

    const helperTextElement = document.getElementById("helper-text");

    function showMessage(message, color) {
        helperTextElement.innerText = message;
        helperTextElement.style.color = color;
    }

    if (!resetKey) {
        showMessage("❌ Reset key is missing. Please check the URL.", "red");
        return;
    }

    document.getElementById("resetPasswordForm").addEventListener("submit", async function (event) {
        event.preventDefault();

        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {
            showMessage("❌ Passwords do not match!", "red");
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_])[A-Za-z\d@$!%*?&_]{8,}$/;
        if (!passwordRegex.test(password)) {
            showMessage("❌ Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character (@, $, !, %, *, ?, &, _).", "red");
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/reset_password/${resetKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "❌ Error resetting password. Please try again.");
            }

            showMessage("✅ Password successfully reset! Redirecting...", "green");

            setTimeout(() => {
                window.location.href = "./login.html";
            }, 2000);
        } catch (error) {
            showMessage(error.message, "red");
        }
    });
});

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('toggle-password');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.src = './images/hide-password.png'; 
    } else {
        passwordInput.type = 'password';
        toggleIcon.src = './images/show-password.png'; 
    }
}

function toggleConfirmPasswordVisibility() {
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const toggleIcon = document.getElementById('toggle-confirm-password');

    if (confirmPasswordInput.type === 'password') {
        confirmPasswordInput.type = 'text';
        toggleIcon.src = './images/hide-password.png';
    } else {
        confirmPasswordInput.type = 'password';
        toggleIcon.src = './images/show-password.png'; 
    }
}

window.togglePasswordVisibility = togglePasswordVisibility;
window.toggleConfirmPasswordVisibility = toggleConfirmPasswordVisibility;
