document.addEventListener("DOMContentLoaded", () => {
    function getCookie(name) {
        const cookies = document.cookie.split("; ");
        for (const cookie of cookies) {
            const [key, value] = cookie.split("=");
            if (key === name) {
                return value;
            }
        }
        return null;
    }

    const token = getCookie("token"); 
    if (token) {
        window.location.href = "account.html";  
        return;
    }

    document.getElementById("login-btn").addEventListener("click", () => {
        window.location.href = "login.html";
    });

    document.getElementById("register-btn").addEventListener("click", () => {
        window.location.href = "registration.html";
    });

    document.getElementById("guest-btn").addEventListener("click", () => {
        document.cookie = "guestMode=true"; 
        window.location.href = "questions.html";
    });
});
