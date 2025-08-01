import API_BASE_URL from "./config.js";

document.addEventListener("DOMContentLoaded", async () => {
    const token = localStorage.getItem("token");
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
    
    const answered = data.answered || 0;
    const unanswered = data.unanswered || 0;
    const totalQuestions = answered + unanswered;
    
    // Update counts
    document.getElementById("answered-count").textContent = answered;
    document.getElementById("unanswered-count").textContent = unanswered;
    
    // Update progress
    document.getElementById("progress-completed").textContent = answered;
    document.getElementById("progress-total").textContent = totalQuestions;
    
    const progress = totalQuestions > 0 ? (answered / totalQuestions) * 100 : 0;
    updateProgressBar(progress);
    
    // Update achievements
    document.getElementById("badges").innerHTML = getAchievements(answered);
}

async function startQuiz(token) {
    try {
        window.location.href = "./questions.html";
    } catch (error) {
        console.error("Error starting quiz:", error);
        alert(`An error occurred: ${error.message}`);
    }
}

function getAchievements(answered) {
    if (answered >= 50) return "<li>🏆 Master Quizzer!</li>";
    if (answered >= 30) return "<li>🥇 Advanced Thinker!</li>";
    if (answered >= 10) return "<li>🎖️ Knowledge Explorer!</li>";
    return "<li>🌱 New Learner!</li>";
}

function updateProgressBar(progress) {
    const progressFill = document.getElementById("progress-fill");
    const progressPercentage = document.getElementById("progress-percentage");
    const roundedProgress = Math.round(progress);
    
    progressFill.style.width = `${roundedProgress}%`;
    progressPercentage.textContent = `${roundedProgress}%`;
    
    // Update color based on progress
    if (progress >= 80) {
        progressFill.style.background = 'linear-gradient(90deg, var(--success), var(--success))';
    } else if (progress >= 50) {
        progressFill.style.background = 'linear-gradient(90deg, var(--python-yellow), var(--dark-yellow))';
    } else {
        progressFill.style.background = 'linear-gradient(90deg, var(--python-blue), var(--dark-blue))';
    }
}

function handleLogout() {
    localStorage.removeItem("token");
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "guestMode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    document.cookie = "guestMode=; path=/frontend/public; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    redirectToLogin();
}

function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
}

function redirectToLogin() {
    window.location.href = "./login.html";
}
