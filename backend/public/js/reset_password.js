document.addEventListener("DOMContentLoaded", function () {
    const urlParams = new URLSearchParams(window.location.search);
    const resetKey = urlParams.get("resetKey");

    if (!resetKey) {
        document.getElementById("helper-text").innerText = "❌ Reset key is missing. Please check the URL.";
        return;
    }

    document.getElementById("resetPasswordForm").addEventListener("submit", async function (event) {
        event.preventDefault();

        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {
            document.getElementById("helper-text").innerText = "❌ Passwords do not match!";
            return;
        }

        try {
            const response = await fetch(`/api/auth/reset_password/${resetKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password })
            });
            

            const result = await response.json();
            document.getElementById("helper-text").innerText = result.message;

            if (response.ok) {
                setTimeout(() => {
                    window.location.href = "/login.html"; // Redirect to login after success
                }, 2000);
            }
        } catch (error) {
            document.getElementById("helper-text").innerText = "❌ Error resetting password. Please try again.";
        }
    });
});
