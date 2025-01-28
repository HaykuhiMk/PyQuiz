// Get the registration form and its elements
const form = document.getElementById('registration-form');
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const repeatPasswordInput = document.getElementById('repeat-password');
const helperText = document.getElementById('helper-text');

// Helper function to validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Helper function to display error messages
function showError(message) {
    helperText.textContent = message;
    helperText.style.color = 'red';
}

// Helper function to clear error messages
function clearError() {
    helperText.textContent = 'All fields are required';
    helperText.style.color = 'white';
}
// Form submission handler
form.addEventListener('submit', function (event) {
    // Prevent default form submission behavior
    event.preventDefault();

    // Get input values
    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const repeatPassword = repeatPasswordInput.value.trim();

    // Validate inputs
    if (!username || !email || !password || !repeatPassword) {
        showError('All fields must be filled out.');
        return;
    }

    if (!isValidEmail(email)) {
        showError('Please enter a valid email address.');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters long.');
        return;
    }

    if (password !== repeatPassword) {
        showError('Passwords do not match.');
        return;
    }

    // Clear errors
    clearError();

    // Send registration data to the server using fetch
    fetch('http://localhost:5000/api/users/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: username,
            email: email,
            password: password
        })
    })
    .then(response => response.json())
    .then(data => {
        // Handle the response
        if (data.message) {
            // Show success message
            alert('Registration successful!');
            // Redirect to the login page
            window.location.href = './login.html'; // Adjust the path if needed
        } else if (data.error) {
            // Show error message if something went wrong
            showError(data.error);
        }
    })
    .catch(error => {
        // Catch any errors during the fetch
        console.error('Error:', error);
        showError('An error occurred during registration.');
    });

    // Optionally, reset the form
    form.reset();
});
