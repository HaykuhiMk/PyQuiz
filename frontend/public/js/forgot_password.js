const forgotPasswordForm = document.getElementById('forgot-password-form');
const emailInput = document.getElementById('email');
const helperText = document.getElementById('helper-text');

// Helper function to display error messages
function showError(message) {
    helperText.textContent = message;
    helperText.style.color = 'red';
}

// Helper function to clear error messages
function clearError() {
    helperText.textContent = '';
    helperText.style.color = 'white';
}

// Form submission handler
forgotPasswordForm.addEventListener('submit', function (event) {
    // Prevent default form submission behavior
    event.preventDefault();

    // Get input values
    const email = emailInput.value.trim();

    // Validate inputs
    if (!email) {
        showError('Email is required.');
        return;
    }

    // Simple email validation
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailRegex.test(email)) {
        showError('Please enter a valid email address.');
        return;
    }

    // Clear previous errors
    clearError();

    // Send the email to the server using fetch
    fetch('http://localhost:5000/api/auth/forgot_password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
    })
    .then(response => {
        // Check if the response is okay
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || 'Something went wrong.');
            });
        }
        return response.json();
    })
    .then(data => {
        // Handle the success response
        if (data.message) {
            alert('Password reset link has been sent to your email!');
            window.location.href = 'http://localhost:5000/password_reset_link_success.html';
        } else {
            showError(data.error || 'Something went wrong. Please try again.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showError('An error occurred while sending the password reset link.');
    });
});
