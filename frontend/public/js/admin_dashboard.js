import { api } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem("adminToken")) {
        window.location.href = "admin_login.html";
        return;
    }

    const questionForm = document.getElementById("question-form");

    if (questionForm) {
        questionForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const question = document.getElementById("question-text").value.trim();
            const code = document.getElementById("code").value.trim();
            const optionsInput = document.getElementById("options").value.trim();
            const answer = document.getElementById("answer").value.trim();
            const difficulty = document.getElementById("difficulty").value;
            const topicsInput = document.getElementById("topics").value.trim();
            const explanation = document.getElementById("explanation").value.trim();
            const options = optionsInput.split("\n").map(option => option.trim()).filter(option => option !== "");
            const topics = topicsInput.split(",").map(topic => topic.trim());
            if (!options.includes(answer)) {
                alert("Correct answer must be one of the options!");
                return;
            }

            const questionData = {
                question,
                code,
                options, 
                answer,
                difficulty,
                topics, 
                explanation
            };
            try {
                await api.addQuestion(questionData);
                document.getElementById("question-success").textContent = "Question added successfully!";
                questionForm.reset();
            } catch (error) {
                console.error("Error submitting question:", error);
                alert("Error: " + (error.message || "Failed to add question"));
            }
        });
    } else {
        console.error("Question form not found!"); 
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            const confirmLogout = confirm("Are you sure you want to log out?");
            if (!confirmLogout) return;
            localStorage.removeItem("adminToken");
            window.location.href = "admin_login.html";
        });
    } else {
        console.error("Logout button not found!"); 
    }
});
