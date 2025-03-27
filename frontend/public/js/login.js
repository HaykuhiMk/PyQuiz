import API_BASE_URL from "./config.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const helperText = document.getElementById("helper-text");

function showError(message) {
    helperText.textContent = message;
    helperText.style.color = "red";
}

function clearError() {
    helperText.textContent = "";
}

function setCookie(name, value, hours) {
    const expires = new Date();
    expires.setTime(expires.getTime() + hours * 60 * 60 * 1000); 
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax;Secure`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.indexOf(nameEQ) === 0) {
            return cookie.substring(nameEQ.length);
        }
    }
    return null;
}

form.addEventListener("submit", (event) => {
    event.preventDefault(); 

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showError("Email and password are required.");
        return;
    }

    fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
    })
    .then(response => {
        return response.json().then(data => {
            console.log("📡 Server Response:", response.status, data); 
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            return data;
        });
    })
    .then(data => {
        setCookie("token", data.token, 1);
        document.cookie = "guestMode=false; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT";
        document.cookie = "guestMode=; path=/frontend/public; expires=Thu, 01 Jan 1970 00:00:00 UTC;";

        window.location.href = "./account.html";
    })
    .catch(error => {
        console.error("🚨 Login Error:", error.message);  
        showError(error.message || "An error occurred during login.");
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

window.togglePasswordVisibility = togglePasswordVisibility;
