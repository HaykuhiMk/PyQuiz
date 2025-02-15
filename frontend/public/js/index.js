document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");

    // Redirect logged-in users to the quiz page
    if (token) {
        window.location.href = "index.html";
    }

    // Redirect to login or register pages
    document.getElementById("login-btn").addEventListener("click", () => {
        window.location.href = "login.html";
    });

    document.getElementById("register-btn").addEventListener("click", () => {
        window.location.href = "registration.html";
    });

    // Start Guest Mode (store flag and redirect)
    document.getElementById("guest-btn").addEventListener("click", () => {
        localStorage.setItem("guestMode", "true");
        window.location.href = "questions.html";
    });
});
