function getCookie(name) {
    const value = document.cookie.split("; ")
        .find(row => row.startsWith(name + "="))
        ?.split("=")[1];
    
    if (!value) return null;
    
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function isUserLoggedIn() {
    const authToken = getCookie("auth_token");
    const isGuest = getCookie("guestMode") === "true";
    return authToken && !isGuest;
}

function initializeHeaderLogic() {
    const logoLink = document.querySelector(".logo a");
    if (logoLink) {
        logoLink.addEventListener("click", function(event) {
            event.preventDefault();
            if (isUserLoggedIn()) {
                window.location.href = "/account.html";
            } else {
                window.location.href = "/index.html";
            }
        });
    }
}

// Initialize when the script loads
initializeHeaderLogic();

// Re-initialize when the header is dynamically loaded
document.addEventListener("DOMContentLoaded", initializeHeaderLogic);

// Export for use in other modules if needed
export { initializeHeaderLogic, isUserLoggedIn }; 