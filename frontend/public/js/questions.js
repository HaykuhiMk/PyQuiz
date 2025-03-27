import API_BASE_URL from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
    const questionContainer = document.getElementById("question");
    const questionCode = document.getElementById("question-code");
    const optionsContainer = document.getElementById("options");
    const resultContainer = document.getElementById("result");
    const difficultyContainer = document.getElementById("difficulty");
    const topicsContainer = document.getElementById("topics");
    const explanationContainer = document.getElementById("explanation");
    const submitBtn = document.getElementById("submit-btn");
    const nextBtn = document.getElementById("next-btn");
    const giveUpBtn = document.getElementById("give-up-btn");
    const guestWarning = document.getElementById("guest-warning");
    const backToAccountBtn = document.getElementById("back-to-account-btn");
    const darkModeBtn = document.getElementById("dark-mode-btn");

    let currentQuestion = null;
    let selectedOption = null;
    let attempts = 0;
    const totalQuestions = 146;
    const isGuest = getCookie("guestMode") === "true";
    const answeredQuestions = isGuest ? null : new Set();

    if (isGuest) {
        guestWarning.style.display = "block";
        backToAccountBtn.innerText = "Back to Menu";
        backToAccountBtn.onclick = () => window.location.href = "./index.html";
    } else {
        backToAccountBtn.innerText = "Back to Account";
        backToAccountBtn.onclick = () => window.location.href = "./account.html";
    }

    async function fetchQuestion(retries = 5) {
        try {
            if (!isGuest) await fetchUserProgress();

            const response = await fetch(`${API_BASE_URL}/api/questions/random`, {
                method: "GET",
                credentials: "include",
            });

            if (!response.ok) throw new Error("Failed to fetch question");
            currentQuestion = await response.json();

            if (!isGuest && answeredQuestions.has(currentQuestion._id)) {
                if (answeredQuestions.size >= totalQuestions || retries <= 0) {
                    resultContainer.innerText = "You've answered all available questions!";
                    return;
                }
                return fetchQuestion(retries - 1);
            }

            displayQuestion(currentQuestion);
            resetUI();
        } catch (error) {
            console.error("Error fetching question:", error);
            resultContainer.innerText = "Error loading question. Try again later.";
        }
    }

    async function fetchUserProgress() {
        try {
            const token = getCookie("token");
            if (!token) return;

            const response = await fetch(`${API_BASE_URL}/api/users/user-progress`, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) throw new Error("Failed to fetch user progress");

            const data = await response.json();
            if (data.answeredQuestions) {
                answeredQuestions.clear();
                data.answeredQuestions.forEach(q => answeredQuestions.add(q));
            }
        } catch (error) {
            console.error("Error fetching user progress:", error);
        }
    }

    function showExplanation() {
        if (currentQuestion.explanation) {
            explanationContainer.innerText = currentQuestion.explanation;
            explanationContainer.style.display = "block";
            explanationContainer.classList.add("show");
        } else {
            explanationContainer.style.display = "none";
        }
    }

    function displayQuestion(question) {
        questionContainer.innerText = question.question;
        difficultyContainer.innerText = question.difficulty || "Unknown";
        topicsContainer.innerText = question.topics?.join(", ") || "None";

        if (question.code) {
            questionCode.innerHTML = `<pre><code class="language-python">${escapeHTML(question.code.trim())}</code></pre>`;
        } else {
            questionCode.innerHTML = "";
        }

        Prism.highlightAll();

        optionsContainer.innerHTML = "";
        const selectElement = document.createElement("select");
        selectElement.onchange = () => {
            selectedOption = selectElement.value ? parseInt(selectElement.value) : null;
        };

        const placeholderOption = document.createElement("option");
        placeholderOption.value = "";
        placeholderOption.innerText = "Select an answer...";
        placeholderOption.disabled = true;
        placeholderOption.selected = true;
        selectElement.appendChild(placeholderOption);

        question.options.forEach((option, index) => {
            const optionElement = document.createElement("option");
            optionElement.value = index;
            optionElement.innerText = option;
            selectElement.appendChild(optionElement);
        });

        optionsContainer.appendChild(selectElement);
    }

    submitBtn.onclick = async () => {
        if (selectedOption === null) {
            resultContainer.innerText = "Please select an option.";
            return;
        }

        const correctAnswerIndex = currentQuestion.options.indexOf(currentQuestion.answer);

        if (selectedOption === correctAnswerIndex) {
            resultContainer.innerText = "✅ Correct!";
            submitBtn.disabled = true;
            showExplanation();

            if (!isGuest) {
                answeredQuestions.add(currentQuestion._id);
                await updateUserProgress(currentQuestion._id);
            }
        } else {
            attempts++;
            resultContainer.innerText = "❌ Wrong! Try again.";
            if (attempts >= 3) giveUpBtn.style.display = "block";
        }
    };

    giveUpBtn.onclick = () => {
        resultContainer.innerHTML = `<strong>Correct Answer:</strong> ${currentQuestion.answer}`;
        submitBtn.disabled = true;
        giveUpBtn.style.display = "none";
        showExplanation();

        if (!isGuest) {
            answeredQuestions.add(currentQuestion._id);
            updateUserProgress(currentQuestion._id);
        }
    };

    nextBtn.onclick = fetchQuestion;

    function resetUI() {
        resultContainer.innerText = "";
        explanationContainer.style.display = "none";
        explanationContainer.classList.remove("show");
        explanationContainer.innerText = "";
        selectedOption = null;
        attempts = 0;
        giveUpBtn.style.display = "none";
        submitBtn.disabled = false;
    }

    async function updateUserProgress(questionId) {
        try {
            await fetch(`${API_BASE_URL}/api/users/user-progress`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Authorization": `Bearer ${getCookie("token")}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ questionId })
            });
        } catch (error) {
            console.error("Failed to update user progress:", error);
        }
    }

    function escapeHTML(str) {
        return str.replace(/[&<>\"']/g, match => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[match]));
    }

    function getCookie(name) {
        return document.cookie.split("; ").find(row => row.startsWith(name + "="))?.split("=")[1] || null;
    }

    function toggleDarkMode() {
        document.body.classList.toggle("dark-mode");
        localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
    }

    if (darkModeBtn) {
        darkModeBtn.onclick = toggleDarkMode;
        if (localStorage.getItem("darkMode") === "true") {
            document.body.classList.add("dark-mode");
        }
    }

    fetchQuestion();
});
