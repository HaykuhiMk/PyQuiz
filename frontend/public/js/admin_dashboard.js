import API_BASE_URL from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
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
                const response = await fetch(`${API_BASE_URL}/api/admin/add-question`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem("adminToken")}` 
                    },
                    body: JSON.stringify(questionData),
                });

                const result = await response.json();
                if (response.ok) {
                    document.getElementById("question-success").textContent = "Question added successfully!";
                    questionForm.reset(); 
                } else {
                    alert("Error: " + (result.error || "Failed to add question"));
                }
            } catch (error) {
                console.error("Error submitting question:", error);
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

            console.log("Before logout:", localStorage.getItem("adminToken"));
            localStorage.removeItem("adminToken");
            console.log("After logout:", localStorage.getItem("adminToken"));

            window.location.href = "admin_login.html";
        });
    } else {
        console.error("Logout button not found!"); 
    }
});
