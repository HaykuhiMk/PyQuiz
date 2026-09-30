import { api } from "./api.js";
import { CANONICAL_TOPICS } from "./topicTaxonomy.js";

function populateTopicOptions(select) {
    select.innerHTML = CANONICAL_TOPICS.map((topic) => `<option value="${topic}">${topic}</option>`).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await api.getAdminMe();
    } catch {
        window.location.href = "admin_login.html";
        return;
    }

    const questionForm = document.getElementById("question-form");
    const primaryTopicSelect = document.getElementById("primary-topic");
    const secondaryTopicsSelect = document.getElementById("secondary-topics");
    if (primaryTopicSelect) populateTopicOptions(primaryTopicSelect);
    if (secondaryTopicsSelect) populateTopicOptions(secondaryTopicsSelect);

    if (questionForm) {
        questionForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const question = document.getElementById("question-text").value.trim();
            const code = document.getElementById("code").value.trim();
            const optionsInput = document.getElementById("options").value.trim();
            const answer = document.getElementById("answer").value.trim();
            const difficulty = document.getElementById("difficulty").value;
            const primaryTopic = primaryTopicSelect.value;
            const secondaryTopics = Array.from(secondaryTopicsSelect.selectedOptions)
                .map((option) => option.value)
                .filter((topic) => topic !== primaryTopic);
            const explanation = document.getElementById("explanation").value.trim();
            const options = optionsInput.split("\n").map(option => option.trim()).filter(option => option !== "");
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
                primaryTopic,
                secondaryTopics,
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
        logoutBtn.addEventListener("click", async () => {
            const confirmLogout = confirm("Are you sure you want to log out?");
            if (!confirmLogout) return;
            await api.adminLogout().catch(() => {});
            window.location.href = "admin_login.html";
        });
    } else {
        console.error("Logout button not found!"); 
    }
});
