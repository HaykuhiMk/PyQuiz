import { api, isLoggedIn } from "./api.js";
import { celebrateQuizComplete, initRipples } from "./ui.js";

const BLITZ_SECONDS = 45;

document.addEventListener("DOMContentLoaded", () => {
    const topicSelectionContainer = document.getElementById("topic-selection");
    const topicsList = document.getElementById("topics-list");
    const topicSearch = document.getElementById("topic-search");
    const categoryButtons = document.querySelectorAll(".category-btn");
    const selectedCountSpan = document.getElementById("selected-count");
    const startQuizBtn = document.getElementById("start-quiz-btn");
    const selectAllBtn = document.getElementById("select-all-btn");
    const clearAllBtn = document.getElementById("clear-all-btn");
    const quizContainer = document.getElementById("quiz-container");
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

    let allTopics = [];
    let currentQuestion = null;
    let selectedOption = null;
    let attempts = 0;
    let selectedTopics = [];
    let quizMode = "classic";
    let difficulty = "";
    let timerInterval = null;
    let questionStartedAt = Date.now();
    let session = { correct: 0, wrong: 0, points: 0, streak: 0, answered: 0 };
    const isGuest = getCookie("guestMode") === "true";
    const answeredQuestions = isGuest ? null : new Set();

    const categoryMapping = {
        'basics': ['Data Types', 'Basic Arithmetic', 'Strings', 'Integers', 'Integer', 'Bool', 'String', 'Comparison Operators', 'Type Conversion', 'Assignment', 'Variable Assignment', 'Case Sensitivity', 'print', 'stdout', 'Files', 'None'],
        'data-structures': ['Lists', 'Tuples', 'Dictionaries', 'Sets', 'Nested Lists', 'Data Structures', 'List Methods', 'Set Methods', 'Dictionary Methods', 'dict_keys', 'Keys', 'Slicing', 'List Slicing', 'Indexing', 'List Manipulation', 'List Modification', 'List Multiplication', 'List References', 'List Unpacking', 'Extended Unpacking', 'Tuple Unpacking', 'String Unpacking', 'Multiple Assignment', 'Duplicate Removal', 'Mutability', 'Mutable', 'Immutable', 'Aliasing', 'len'],
        'functions': ['map', 'zip', 'enumerate', 'chr', 'ord', 'maketrans', 'translate', 'strip', 'removeprefix', 'removesuffix', 'swapcase'],
        'ooad': ['Identity Operators', 'Type Checking', 'Boolean Logic', 'Identity', 'Equality', 'Hashing', 'Reference Counting', 'Memory Management'],
        'advanced': ['Sorting', 'Sorting with key function', 'String Translation', 'string formatting', 'string manipulation', 'string slicing', 'boolean indexing', 'Exponentiation Operator', 'Modulo Operator', 'Range', 'Range Function', 'Step Values', 'Loops', 'For Loop', 'while loop', 'Break Statement', 'Continue Statement', 'Control Statements', 'Conditional Statements', 'Iteration', 'String Concatenation', 'String Indexing', 'String Iteration']
    };

    document.querySelectorAll(".mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".mode-btn").forEach((item) => item.classList.remove("active"));
            btn.classList.add("active");
            quizMode = btn.dataset.mode;
        });
    });

    document.getElementById("difficulty-filter").addEventListener("change", (event) => {
        difficulty = event.target.value;
    });

    if (isGuest) {
        guestWarning.style.display = "block";
        backToAccountBtn.innerText = "Back to Menu";
        backToAccountBtn.onclick = () => window.location.href = "./index.html";
    } else {
        backToAccountBtn.innerText = "Back to Account";
        backToAccountBtn.onclick = () => window.location.href = "./account.html";
    }

    selectAllBtn.addEventListener('click', () => {
        const visibleTopics = Array.from(document.querySelectorAll('.topic-item'))
            .filter(item => item.style.display !== 'none')
            .map(item => item.querySelector('.topic-checkbox'));
        
        visibleTopics.forEach(checkbox => {
            checkbox.checked = true;
        });
        
        selectedTopics = visibleTopics.map(cb => cb.value);
        updateSelectedCount();
        
        selectAllBtn.classList.add('animate');
        setTimeout(() => selectAllBtn.classList.remove('animate'), 300);
    });

    clearAllBtn.addEventListener('click', () => {
        const visibleTopics = Array.from(document.querySelectorAll('.topic-item'))
            .filter(item => item.style.display !== 'none')
            .map(item => item.querySelector('.topic-checkbox'));
        
        visibleTopics.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        selectedTopics = Array.from(document.querySelectorAll('.topic-checkbox:checked'))
            .map(cb => cb.value);
        updateSelectedCount();
        
        clearAllBtn.classList.add('animate');
        setTimeout(() => clearAllBtn.classList.remove('animate'), 300);
    });

    topicSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterTopics(searchTerm, getCurrentCategory());
    });

    categoryButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterTopics(topicSearch.value.toLowerCase(), btn.dataset.category);
        });
    });

    function getCurrentCategory() {
        return document.querySelector('.category-btn.active').dataset.category;
    }

    function filterTopics(searchTerm, category) {
        const topicElements = document.querySelectorAll('.topic-item');
        let delay = 0;
        let visibleCount = 0;

        topicElements.forEach(topicElement => {
            const label = topicElement.querySelector('.topic-label');
            const topicText = label.textContent.toLowerCase();
            const matchesSearch = topicText.includes(searchTerm);
            const matchesCategory = category === 'all' || 
                categoryMapping[category]?.some(cat => topicText.includes(cat.toLowerCase()));

            if (matchesSearch && matchesCategory) {
                topicElement.style.display = 'block';
                topicElement.style.animation = 'none';
                topicElement.offsetHeight;
                topicElement.style.animation = `fadeIn 0.3s ease-out ${delay}s forwards`;
                delay += 0.05;
                visibleCount++;
            } else {
                topicElement.style.display = 'none';
            }
        });

        selectAllBtn.style.display = visibleCount > 0 ? 'flex' : 'none';
        clearAllBtn.style.display = visibleCount > 0 ? 'flex' : 'none';
    }

    function updateSelectedCount() {
        const count = selectedTopics.length;
        selectedCountSpan.textContent = count;
        startQuizBtn.disabled = count === 0;

        selectedCountSpan.style.animation = 'none';
        selectedCountSpan.offsetHeight;
        selectedCountSpan.style.animation = 'fadeIn 0.3s ease-out';
    }

    async function fetchTopics() {
        try {
            topicsList.innerHTML = '<div class="loading-spinner"></div>';
            
            const topics = await api.getTopics();
            allTopics = topics.filter(topic => topic.trim()).sort();

            let delay = 0;
            const topicsHtml = allTopics.map(topic => `
                <div class="topic-item" style="animation-delay: ${delay}s">
                    <input type="checkbox" id="topic-${topic}" class="topic-checkbox" value="${topic}">
                    <label for="topic-${topic}" class="topic-label">${topic}</label>
                </div>
            `).join('');
            
            topicsList.innerHTML = topicsHtml;

            document.querySelectorAll('.topic-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    selectedTopics = Array.from(document.querySelectorAll('.topic-checkbox:checked'))
                        .map(cb => cb.value);
                    updateSelectedCount();
                });
            });
            
        } catch (error) {
            console.error("Error fetching topics:", error);
            topicsList.innerHTML = `<div style="color: red; padding: 10px; text-align: center;"><p>Error loading topics: ${error.message}</p></div>`;
        }
    }

    startQuizBtn.onclick = () => {
        document.getElementById("mode-selection").style.display = "none";
        topicSelectionContainer.style.display = "none";
        quizContainer.style.display = "block";
        document.getElementById("hud-mode").textContent = quizMode[0].toUpperCase() + quizMode.slice(1);
        document.getElementById("timer-wrap").style.display = quizMode === "blitz" ? "block" : "none";
        session = { correct: 0, wrong: 0, points: 0, streak: 0, answered: 0 };
        fetchQuestion();
    };

    function topicsForApi() {
        if (!selectedTopics.length) return [];
        if (allTopics.length && selectedTopics.length >= allTopics.length) return [];
        return selectedTopics;
    }

    async function fetchQuestion(retries = 5) {
        try {
            if (!isGuest) await fetchUserProgress();

            const excludeIds =
                !isGuest && answeredQuestions && quizMode === "classic"
                    ? Array.from(answeredQuestions)
                    : [];

            const data = await api.getRandomQuestion({
                topics: topicsForApi(),
                difficulty,
                excludeIds,
            });

            if (data.noMoreQuestions) {
                const selectedTopicsText = selectedTopics.length > 0 
                    ? selectedTopics.join(', ')
                    : 'all topics';

                const progressText = data.totalAnswered 
                    ? `You've answered ${data.totalAnswered} questions in this category!` 
                    : '';

                resultContainer.innerHTML = `
                    <div style="text-align: center; padding: 20px;">
                        <h3>Congratulations! 🎉</h3>
                        <p>You've completed all available questions for ${selectedTopicsText}!</p>
                        ${progressText}
                        <div style="margin-top: 20px;">
                            <button onclick="window.location.reload()" 
                                    style="margin: 10px; padding: 10px 20px; 
                                           background: #4CAF50; color: white; 
                                           border: none; border-radius: 4px; 
                                           cursor: pointer;">
                                Choose New Topics
                            </button>
                            <button onclick="window.location.href='/account.html'" 
                                    style="margin: 10px; padding: 10px 20px; 
                                           background: #2196F3; color: white; 
                                           border: none; border-radius: 4px; 
                                           cursor: pointer;">
                                View Progress
                            </button>
                        </div>
                    </div>
                `;
                submitBtn.style.display = "none";
                nextBtn.style.display = "none";
                return;
            }

            currentQuestion = data;
            displayQuestion(currentQuestion);
            resetUI();
            questionStartedAt = Date.now();
            if (quizMode === "blitz") startBlitzTimer();
        } catch (error) {
            console.error("Error fetching question:", error);
            resultContainer.innerHTML = `<div style="color: red; padding: 10px; text-align: center;"><p>Error loading question: ${error.message}</p></div>`;
        }
    }

    async function fetchUserProgress() {
        try {
            if (!isLoggedIn()) {
                window.location.href = '/login.html';
                return;
            }

            const data = await api.getProgress();
            if (data.answeredQuestions) {
                answeredQuestions.clear();
                data.answeredQuestions.forEach(q => answeredQuestions.add(q));
            }
        } catch (error) {
            console.error("Error fetching user progress:", error);
            if (error.message.includes("401") || error.message.includes("unauthorized")) {
                window.location.href = '/login.html';
            }
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
        difficultyContainer.querySelector("span").textContent = question.difficulty || "Unknown";
        topicsContainer.querySelector("span").textContent = question.topics?.join(", ") || "None";

        if (question.code) {
            questionCode.textContent = question.code.trim();
        } else {
            questionCode.textContent = "";
        }

        Prism.highlightAll();

        optionsContainer.innerHTML = "";
        question.options.forEach((option, index) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "quiz-option";
            btn.textContent = option;
            btn.addEventListener("click", () => {
                optionsContainer.querySelectorAll(".quiz-option").forEach((el) => el.classList.remove("selected"));
                btn.classList.add("selected");
                selectedOption = index;
            });
            optionsContainer.appendChild(btn);
        });
        initRipples();
    }

    submitBtn.onclick = async () => {
        if (selectedOption === null) {
            resultContainer.innerText = "Please select an option.";
            return;
        }

        clearBlitzTimer();
        submitBtn.disabled = true;

        let checkResult;
        try {
            checkResult = await api.checkAnswer(currentQuestion._id, { selectedIndex: selectedOption });
        } catch (error) {
            console.error("Failed to check answer:", error);
            resultContainer.innerText = `Error checking answer: ${error.message}`;
            submitBtn.disabled = false;
            return;
        }

        const isCorrect = checkResult.isCorrect;

        if (isCorrect) {
            currentQuestion.explanation = checkResult.explanation;
            optionsContainer.querySelectorAll(".quiz-option")[selectedOption]?.classList.add("correct");
            await handleAnswerResult(true, selectedOption);
        } else if (quizMode === "survival") {
            optionsContainer.querySelectorAll(".quiz-option")[selectedOption]?.classList.add("incorrect");
            await handleAnswerResult(false, selectedOption);
            showQuizSummary("Survival run ended.");
        } else {
            attempts++;
            resultContainer.innerText = "❌ Wrong! Try again.";
            submitBtn.disabled = false;
            if (attempts >= 3) giveUpBtn.style.display = "block";
            if (quizMode === "blitz") startBlitzTimer();
        }
    };

    giveUpBtn.onclick = async () => {
        clearBlitzTimer();
        submitBtn.disabled = true;
        giveUpBtn.style.display = "none";

        let checkResult = {};
        try {
            checkResult = await api.checkAnswer(currentQuestion._id, { reveal: true });
        } catch (error) {
            console.error("Failed to reveal answer:", error);
        }

        const correctAnswer = checkResult.correctAnswer ?? "N/A";
        resultContainer.innerHTML = `<strong>Correct Answer:</strong> ${escapeHTML(correctAnswer)}`;
        currentQuestion.explanation = checkResult.explanation;
        showExplanation();
        await handleAnswerResult(false, null);
        if (quizMode === "survival") showQuizSummary("Survival run ended.");
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
        submitBtn.style.display = "block";
        submitBtn.disabled = false;
        nextBtn.style.display = "block";
    }

    async function handleAnswerResult(isCorrect, selectedIndex) {
        session.answered += 1;
        if (isCorrect) {
            session.correct += 1;
            session.streak += 1;
            resultContainer.innerText = "✅ Correct!";
            submitBtn.disabled = true;
            showExplanation();
        } else {
            session.wrong += 1;
            session.streak = 0;
        }
        updateHud();

        if (!isGuest) {
            try {
                const timeSpentSec = Math.max(1, Math.round((Date.now() - questionStartedAt) / 1000));
                const result = await api.updateProgress({
                    questionId: currentQuestion._id,
                    selectedIndex,
                    mode: quizMode,
                    timeSpentSec,
                });
                session.points = result.totalPoints || session.points;
                if (result.pointsAwarded) session.points = result.totalPoints;
                if (result.newAchievements?.length) {
                    resultContainer.innerHTML += `<br><small>🏆 Unlocked: ${result.newAchievements.join(", ")}</small>`;
                }
                answeredQuestions.add(currentQuestion._id);
                updateHud(result.currentStreak);
        } catch (error) {
            console.error("Failed to update user progress:", error);
            }
        }
    }

    function updateHud(streakOverride) {
        document.getElementById("hud-score").textContent = `${session.correct}/${session.answered}`;
        document.getElementById("hud-streak").textContent = streakOverride ?? session.streak;
        document.getElementById("hud-points").textContent = session.points;
    }

    function showQuizSummary(reason = "Session complete") {
        clearBlitzTimer();
        const accuracy = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;
        celebrateQuizComplete();
        resultContainer.innerHTML = `
            <div class="quiz-summary">
                <div class="score-ring" style="--score-pct: ${accuracy}%"><span>${accuracy}%</span></div>
                <h2>${reason}</h2>
                <p>Score: <strong>${session.correct} / ${session.answered}</strong></p>
                <p>Total points: <strong>${session.points}</strong></p>
                <div class="action-row">
                    <button type="button" onclick="window.location.reload()" class="primary-btn">Play Again</button>
                    <button type="button" onclick="window.location.href='/account.html'" class="secondary-btn">Dashboard</button>
                    <button type="button" onclick="window.location.href='/leaderboard.html'" class="secondary-btn">Leaderboard</button>
                </div>
            </div>`;
        submitBtn.style.display = "none";
        nextBtn.style.display = "none";
        giveUpBtn.style.display = "none";
        initRipples();
    }

    function startBlitzTimer() {
        clearBlitzTimer();
        let remaining = BLITZ_SECONDS;
        const fill = document.getElementById("timer-fill");
        const label = document.getElementById("timer-label");
        timerInterval = setInterval(() => {
            remaining -= 1;
            const pct = (remaining / BLITZ_SECONDS) * 100;
            fill.style.width = `${pct}%`;
            label.textContent = `${remaining}s`;
            if (remaining <= 0) {
                clearBlitzTimer();
                resultContainer.innerText = "⏰ Time's up!";
                handleAnswerResult(false, null).then(() => fetchQuestion());
            }
        }, 1000);
    }

    function clearBlitzTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
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

    fetchTopics();
});
