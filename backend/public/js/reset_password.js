document.addEventListener('DOMContentLoaded', () => {
    console.log('reset_password.js script loaded successfully'); // Confirm script is running

    // Get the reset token from the URL (5th segment in the path)
    const pathSegments = window.location.pathname.split("/");
    console.log('Path Segments:', pathSegments); // Debugging: Log path segments

    // Extract the token (5th segment, index 4)
    const resetToken = pathSegments[4];
    console.log('\nExtracted Reset Token:', resetToken, '\n');  // Debugging: Log the token

    if (!resetToken) {
        alert('Reset token is missing. Please check the URL.');
        return;
    }

    // Remaining code for handling the reset form...
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const form = document.getElementById('resetPasswordForm');
    const helperText = document.getElementById('helper-text');

    form.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent the form from submitting normally

        const newPassword = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        helperText.textContent = '';

        try {
            const response = await fetch(`/api/auth/reset_password/${resetToken}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password: newPassword }),
            });

            if (response.ok) {
                const result = await response.json();
                alert(result.message || 'Password reset successfully.');
                window.location.href = '/login.html';
            } else {
                const errorData = await response.json();
                alert(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Error during password reset:', error);
            alert('An error occurred while resetting your password. Please try again.');
        }
    });
});
