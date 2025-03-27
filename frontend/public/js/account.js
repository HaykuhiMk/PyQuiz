import API_BASE_URL from "./config.js";

document.addEventListener("DOMContentLoaded", async () => {
    const token = getCookie("token"); 
    if (!token) {
        console.warn("No token found. Redirecting to login...");
        redirectToLogin();
        return;
    }
    try {
        await fetchUserData(token); 
    } catch (error) {
        console.error("Error loading user data:", error);
        redirectToLogin();
        return;
    }

    document.getElementById("logout").addEventListener("click", handleLogout);
    document.getElementById("start-quiz").addEventListener("click", () => startQuiz(token));
    document.getElementById("dark-mode-toggle").addEventListener("click", toggleDarkMode);

    if (localStorage.getItem("darkMode") === "true") {
        document.body.classList.add("dark-mode");
    }
});

async function fetchUserData(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/me`, {
            method: "GET",
            credentials: "include",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            console.warn("Unauthorized access or failed request. Redirecting...");
            throw new Error("Unauthorized");
        }

        const data = await response.json();
        if (!data || !data.username) {
            throw new Error("Invalid user data");
        }
        updateUI(data);
    } catch (error) {
        console.error("Error fetching user data:", error);
        throw error;
    }
}

function updateUI(data) {
    document.getElementById("username").textContent = data.username;
    document.getElementById("email").textContent = data.email || "N/A";
    document.getElementById("rank").textContent = data.rank || "Newbie";
    document.getElementById("answered-count").textContent = data.answered || 0;
    document.getElementById("unanswered-count").textContent = data.unanswered || 0;
    const totalQuestions = (data.answered || 0) + (data.unanswered || 0);
    const progress = totalQuestions > 0 ? (data.answered / totalQuestions) * 100 : 0;
    updateProgressBar(progress);
    document.getElementById("badges").innerHTML = getAchievements(data.answered || 0);
}

async function startQuiz(token) {
    console.log("Start Quiz button clicked!");

    try {
        const response = await fetch(`${API_BASE_URL}/api/start-quiz`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || "Failed to start quiz");
        }

        console.log("Quiz started successfully!");
        window.location.href = "./questions.html"; 
    } catch (error) {
        console.error("Error starting quiz:", error);
        alert(`An error occurred: ${error.message}`);
    }
}

async function reloadProgress() {
    console.log("Reloading progress...");
    const token = getCookie("token");
    if (token) await fetchUserData(token);
}

function getCookie(name) {
    const cookies = document.cookie.split(";").map(c => c.trim());
    const match = cookies.find(cookie => cookie.startsWith(`${name}=`));
    return match ? match.split("=")[1] : null;
}

function getAchievements(answered) {
    if (answered >= 50) return "<li>🏆 Master Quizzer!</li>";
    if (answered >= 30) return "<li>🥇 Advanced Thinker!</li>";
    if (answered >= 10) return "<li>🎖️ Knowledge Explorer!</li>";
    return "<li>🌱 New Learner!</li>";
}

function updateProgressBar(progress) {
    const progressFill = document.getElementById("progress-fill");
    progressFill.style.width = `${progress}%`;
    progressFill.textContent = `${Math.round(progress)}% Completed`;
}
function handleLogout() {
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "guestMode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    document.cookie = "guestMode=; path=/frontend/public; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    console.log("User logged out. Redirecting to login...");
    redirectToLogin();
}

function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
}

function redirectToLogin() {
    window.location.href = "./login.html";
}
