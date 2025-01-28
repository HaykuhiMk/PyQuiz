// Get the login form and its elements
const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
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
form.addEventListener('submit', function (event) {
    // Prevent default form submission behavior
    event.preventDefault();

    // Get input values
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    // Validate inputs
    if (!email || !password) {
        showError('Both fields are required.');
        return;
    }

    // Clear previous errors
    clearError();

    // Send login data to the server using fetch
    fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        email: email,
        password: password
    })
    })
    .then(response => response.json())
    .then(data => {
        if (data.token) {
            // Store token in localStorage or sessionStorage if successful
            localStorage.setItem('token', data.token);
            alert('Login successful!');
            // Redirect user to the home page or dashboard
            window.location.href = '/dashboard.html'; // Adjust this URL as needed
        } else {
            showError(data.error || 'Login failed!');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showError('An error occurred during login.');
    });

});
