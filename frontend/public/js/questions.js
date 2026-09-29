import { api, getAchievementMeta, isLoggedIn } from "./api.js";
import { celebrateQuizComplete, initRipples, countUp } from "./ui.js";
import { mountIcons } from "./icons.js";

const BLITZ_SECONDS = 45;

const ICON_CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
const ICON_CROSS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

document.addEventListener("DOMContentLoaded", () => {
    mountIcons(document.getElementById("topic-selection"));
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
    const finishBtn = document.getElementById("finish-btn");

    let allTopics = [];
    let currentQuestion = null;
    let selectedOption = null;
    let sessionId = null;
    let attemptsRemaining = null;
    let selectedTopics = [];
    let quizMode = "classic";
    let difficulty = "";
    let timerInterval = null;
    let blitzDeadline = 0;
    const emptySession = () => ({ correct: 0, wrong: 0, points: 0, streak: 0, bestStreak: 0, answered: 0, history: [] });
    let session = emptySession();
    const isGuest = getCookie("guestMode") === "true";

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
                    <input type="checkbox" id="topic-${escapeHTML(topic)}" class="topic-checkbox" value="${escapeHTML(topic)}">
                    <label for="topic-${escapeHTML(topic)}" class="topic-label">${escapeHTML(topic)}</label>
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
            topicsList.innerHTML = `<p class="pq-status error" role="alert">Couldn't load topics. ${escapeHTML(String(error.message || ""))}</p>`;
        }
    }

    startQuizBtn.onclick = async () => {
        if (!isGuest && !isLoggedIn()) {
            window.location.href = '/login.html';
            return;
        }

        document.getElementById("mode-selection").style.display = "none";
        topicSelectionContainer.style.display = "none";
        quizContainer.style.display = "block";
        document.getElementById("hud-mode").textContent = quizMode[0].toUpperCase() + quizMode.slice(1);
        document.getElementById("timer-wrap").style.display = quizMode === "blitz" ? "grid" : "none";
        session = emptySession();
        finishBtn.style.display = "none";
        sessionId = null;
        await startSession();
    };

    function topicsForApi() {
        if (!selectedTopics.length) return [];
        if (allTopics.length && selectedTopics.length >= allTopics.length) return [];
        return selectedTopics;
    }

    async function startSession({ practiceMode = false } = {}) {
        try {
            const data = await api.startQuizSession({
                mode: quizMode,
                topics: topicsForApi(),
                difficulty,
                practiceMode,
            });
            handleSessionQuestion(data);
        } catch (error) {
            console.error("Error starting quiz session:", error);
            resultContainer.innerHTML = `<p class="pq-status error" role="alert">Couldn't start the quiz. ${escapeHTML(String(error.message || ""))}</p>`;
        }
    }

    function handleSessionQuestion(data) {
        if (data.noMoreQuestions) {
            showNoMoreQuestions(data);
            return;
        }

        sessionId = data.sessionId || sessionId;
        attemptsRemaining = data.attemptsRemaining;
        currentQuestion = data.question;
        displayQuestion(currentQuestion);
        resetUI();
        if (quizMode === "blitz" && data.deadlineAt) {
            startBlitzTimer(new Date(data.deadlineAt).getTime());
        }
    }

    function showNoMoreQuestions(data) {
        const selectedTopicsText = selectedTopics.length > 0
            ? selectedTopics.join(', ')
            : 'all topics';

        const progressText = data.totalAnswered
            ? `You've answered ${data.totalAnswered} questions in this category!`
            : '';

        // Classic specifically excludes only questions already mastered
        // (answered correctly on a first attempt); once that pool is
        // exhausted, offer replaying them (never for points, so the button
        // says so) alongside the option to widen the filters instead.
        const primaryAction = data.canPracticeAgain
            ? '<button type="button" id="practice-again-btn" class="primary-btn">Practice again (no points)</button>'
            : '<button type="button" onclick="window.location.reload()" class="primary-btn">Choose New Topics</button>';
        const secondaryAction = data.canPracticeAgain
            ? '<button type="button" onclick="window.location.reload()" class="secondary-btn">Widen filters</button>'
            : '<button type="button" onclick="window.location.href=\'/account.html\'" class="secondary-btn">View Progress</button>';
        const headline = data.canPracticeAgain
            ? "You've mastered every question for"
            : "You've completed all available questions for";

        resultContainer.innerHTML = `
            <div class="quiz-summary">
                <h2>All caught up!</h2>
                <p>${headline} ${selectedTopicsText}.</p>
                <p>${progressText}</p>
                <div class="action-row">
                    ${primaryAction}
                    ${secondaryAction}
                </div>
            </div>
        `;
        submitBtn.style.display = "none";
        nextBtn.style.display = "none";

        if (data.canPracticeAgain) {
            document.getElementById("practice-again-btn").addEventListener("click", () => {
                session = emptySession();
                sessionId = null;
                startSession({ practiceMode: true });
            });
        }
    }

    function showExplanation() {
        if (currentQuestion.explanation) {
            explanationContainer.innerHTML =
                '<span class="pq-disc-mark" aria-hidden="true"></span><div><h4>Explanation</h4><p></p></div>';
            explanationContainer.querySelector("p").textContent = currentQuestion.explanation;
            explanationContainer.className = "pq-explain show";
            explanationContainer.style.display = "grid";
        } else {
            explanationContainer.style.display = "none";
        }
    }

    function renderRibbon() {
        const positionEl = document.getElementById("quiz-position");
        const correctCountEl = document.getElementById("quiz-correct-count");
        const ribbon = document.getElementById("quiz-ribbon");

        positionEl.textContent = `Question ${session.answered + 1}`;
        correctCountEl.textContent = `${session.correct} correct`;

        const recentHistory = session.history.slice(-9);
        ribbon.innerHTML =
            recentHistory.map((outcome) => `<i class="${outcome}"></i>`).join("") + '<i class="now"></i>';
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

        renderRibbon();

        optionsContainer.innerHTML = "";
        question.options.forEach((option, index) => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "pq-answer";
            btn.dataset.optionText = option;
            btn.innerHTML = `<span class="pq-answer__key">${String.fromCharCode(65 + index)}</span><span>${escapeHTML(option)}</span>`;
            btn.addEventListener("click", () => {
                optionsContainer.querySelectorAll(".pq-answer").forEach((el) => {
                    el.classList.remove("is-selected", "is-wrong");
                });
                btn.classList.add("is-selected");
                selectedOption = index;
            });
            li.appendChild(btn);
            optionsContainer.appendChild(li);
        });
        initRipples();
    }

    function lockOptions() {
        optionsContainer.querySelectorAll(".pq-answer").forEach((btn) => {
            btn.disabled = true;
        });
    }

    function dimOtherOptions(...keepIndexes) {
        optionsContainer.querySelectorAll(".pq-answer").forEach((btn, index) => {
            if (!keepIndexes.includes(index)) btn.classList.add("is-dim");
        });
    }

    function markAnswerState(index, state, tagText) {
        const btn = optionsContainer.querySelectorAll(".pq-answer")[index];
        if (!btn) return;
        btn.classList.remove("is-selected");
        btn.classList.add(state);
        const keyEl = btn.querySelector(".pq-answer__key");
        if (keyEl) keyEl.innerHTML = state === "is-correct" ? ICON_CHECK : ICON_CROSS;
        if (tagText) {
            const tag = document.createElement("span");
            tag.className = "pq-answer__tag";
            tag.textContent = tagText;
            btn.appendChild(tag);
        }
    }

    function normalizeAnswerText(str) {
        return (str ?? "").trim().replace(/\s+/g, " ");
    }

    function findOptionIndexByText(text) {
        const target = normalizeAnswerText(text);
        const buttons = Array.from(optionsContainer.querySelectorAll(".pq-answer"));
        return buttons.findIndex((btn) => normalizeAnswerText(btn.dataset.optionText) === target);
    }

    function markCorrectAnswerByText(correctText) {
        if (!correctText) return;
        const index = findOptionIndexByText(correctText);
        if (index !== -1) markAnswerState(index, "is-correct", "Correct answer");
    }

    async function submitAnswer({ isTimeout = false } = {}) {
        if (selectedOption === null && !isTimeout) {
            resultContainer.innerText = "Please select an option.";
            return;
        }

        submitBtn.disabled = true;

        let result;
        try {
            result = await api.submitQuizAnswer(sessionId, {
                questionId: currentQuestion._id,
                selectedIndex: selectedOption,
            });
        } catch (error) {
            console.error("Failed to submit answer:", error);
            resultContainer.innerText = `Couldn't submit your answer. ${error.message}`;
            submitBtn.disabled = false;
            return;
        }

        attemptsRemaining = result.attemptsRemaining;

        if (result.resolved) {
            clearBlitzTimer();
            if (result.isCorrect) {
                markAnswerState(selectedOption, "is-correct", "Correct answer");
                dimOtherOptions(selectedOption);
            } else {
                if (selectedOption !== null) {
                    markAnswerState(selectedOption, "is-wrong", "Your answer");
                }
                if (result.outcome === "timeout") {
                    resultContainer.innerText = "Time's up!";
                }
                markCorrectAnswerByText(result.correctAnswer);
                const correctIndex = findOptionIndexByText(result.correctAnswer);
                dimOtherOptions(selectedOption, correctIndex);
            }
            currentQuestion.explanation = result.explanation;
            lockOptions();
            applyOutcome(result.isCorrect, result);
        } else {
            optionsContainer.querySelectorAll(".pq-answer")[selectedOption]?.classList.add("is-wrong");
            resultContainer.innerText = `Wrong — try again. (${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} left)`;
            selectedOption = null;
            submitBtn.disabled = false;
            if (attemptsRemaining <= 0) giveUpBtn.style.display = "block";
        }
    }

    submitBtn.onclick = () => submitAnswer();

    giveUpBtn.onclick = async () => {
        clearBlitzTimer();
        submitBtn.disabled = true;
        giveUpBtn.style.display = "none";

        let result = {};
        try {
            result = await api.revealQuizAnswer(sessionId);
        } catch (error) {
            console.error("Failed to reveal answer:", error);
        }

        const correctAnswer = result.correctAnswer ?? "N/A";
        resultContainer.innerHTML = `<strong>Correct Answer:</strong> ${escapeHTML(correctAnswer)}`;
        if (selectedOption !== null) {
            markAnswerState(selectedOption, "is-wrong", "Your answer");
        }
        markCorrectAnswerByText(correctAnswer);
        const correctIndex = findOptionIndexByText(correctAnswer);
        dimOtherOptions(selectedOption, correctIndex);
        lockOptions();
        currentQuestion.explanation = result.explanation;
        showExplanation();
        applyOutcome(false, result);
    };

    nextBtn.onclick = async () => {
        nextBtn.disabled = true;
        try {
            const data = await api.getNextQuizQuestion(sessionId);
            handleSessionQuestion(data);
        } catch (error) {
            console.error("Error fetching next question:", error);
            resultContainer.innerHTML = `<p class="pq-status error" role="alert">Couldn't load the next question. ${escapeHTML(String(error.message || ""))}</p>`;
        } finally {
            nextBtn.disabled = false;
        }
    };

    finishBtn.onclick = () => showQuizSummary("Session complete");

    function resetUI() {
        resultContainer.innerText = "";
        explanationContainer.style.display = "none";
        explanationContainer.classList.remove("show");
        explanationContainer.innerText = "";
        selectedOption = null;
        giveUpBtn.style.display = "none";
        submitBtn.style.display = "block";
        submitBtn.disabled = false;
        nextBtn.style.display = "block";
    }

    // Trusts the server's isCorrect/points/streak — the client no longer
    // computes anything that affects scoring, only local display state
    // (this run's own correct/wrong/streak tally and answer ribbon).
    function applyOutcome(isCorrect, result) {
        session.answered += 1;
        session.history.push(isCorrect ? "r" : "w");
        if (isCorrect) {
            session.correct += 1;
            session.streak += 1;
            session.bestStreak = Math.max(session.bestStreak, session.streak);
            if (!resultContainer.innerText) resultContainer.innerText = "Correct!";
            showExplanation();
        } else {
            session.wrong += 1;
            session.streak = 0;
        }

        if (!isGuest) {
            if (typeof result.totalPoints === "number") session.points = result.totalPoints;
            if (result.newAchievements?.length) {
                const labels = result.newAchievements.map((key) => escapeHTML(getAchievementMeta(key).label));
                resultContainer.innerHTML += `<br><small>Achievement unlocked: ${labels.join(", ")}</small>`;
            }
            if (result.pointsWithheldReason === "already_mastered") {
                resultContainer.innerHTML += `<br><small>Already mastered — no points for repeat correct answers.</small>`;
            } else if (result.pointsWithheldReason === "not_first_attempt") {
                resultContainer.innerHTML += `<br><small>Correct, but only a first-attempt answer earns points.</small>`;
            }
        }

        updateHud(isGuest ? undefined : result.currentStreak);
        renderRibbon();

        if (quizMode !== "survival" && session.answered > 0) {
            finishBtn.style.display = "inline-flex";
        }

        if (result.sessionStatus === "ended") {
            showQuizSummary(result.endedReason === "mistake" ? "Survival run ended" : "Session complete");
        }
    }

    function updateHud(streakOverride) {
        document.getElementById("hud-score").textContent = `${session.correct}/${session.answered}`;
        document.getElementById("hud-streak").textContent = streakOverride ?? session.streak;
        document.getElementById("hud-points").textContent = session.points;
    }

    function resultsVerdict(accuracy) {
        if (accuracy >= 80) return "Nicely done";
        if (accuracy >= 50) return "Good effort";
        return "Keep practicing";
    }

    function showQuizSummary(reason = "Session complete") {
        clearBlitzTimer();
        const accuracy = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;
        const modeLabel = quizMode.charAt(0).toUpperCase() + quizMode.slice(1);
        celebrateQuizComplete();

        const statsHtml = `
            <div class="pq-stat"><span class="pq-stat__l">Accuracy</span><span class="pq-stat__v">${accuracy}%</span></div>
            <div class="pq-stat"><span class="pq-stat__l">Best streak</span><span class="pq-stat__v">${session.bestStreak}</span></div>
            ${isGuest ? "" : '<div class="pq-stat"><span class="pq-stat__l">Total points</span><span class="pq-stat__v" id="results-xp">0</span></div>'}`;

        resultContainer.innerHTML = `
            <div class="pq-results">
                <div class="pq-score-disc">
                    <span class="pq-small">Score</span>
                    <b id="results-score">0</b>
                    <span class="pq-results__of">of ${session.answered}</span>
                </div>
                <div class="pq-stack pq-results__meta">
                    <span class="badge badge-brand">${modeLabel} mode</span>
                    <h1 class="pq-display-xl">${resultsVerdict(accuracy)}</h1>
                    <p class="pq-body-lg pq-muted">${reason} — you answered ${session.correct} out of ${session.answered} questions correctly.</p>
                    <div class="pq-stats" style="grid-template-columns: repeat(${isGuest ? 2 : 3}, 1fr)">${statsHtml}</div>
                    <div>
                        <div class="pq-ribbon-label"><span>Your answers</span><span>${session.correct} correct</span></div>
                        <div class="pq-ribbon" id="results-ribbon"></div>
                    </div>
                    <div class="pq-row action-row">
                        <button type="button" onclick="window.location.reload()" class="primary-btn">Play Again</button>
                        ${isGuest ? "" : `<button type="button" onclick="window.location.href='/account.html'" class="secondary-btn">Dashboard</button>`}
                        <button type="button" onclick="window.location.href='/leaderboard.html'" class="secondary-btn">Leaderboard</button>
                    </div>
                </div>
            </div>`;

        submitBtn.style.display = "none";
        nextBtn.style.display = "none";
        giveUpBtn.style.display = "none";
        finishBtn.style.display = "none";
        initRipples();
        animateResults(accuracy);
    }

    function animateResults(accuracy) {
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const scoreEl = document.getElementById("results-score");
        const xpEl = document.getElementById("results-xp");
        const ribbon = document.getElementById("results-ribbon");

        countUp(scoreEl, session.correct, 800);
        if (xpEl) countUp(xpEl, session.points, 1000);

        const cells = session.history.map(() => document.createElement("i"));
        cells.forEach((cell) => ribbon.appendChild(cell));

        if (prefersReducedMotion) {
            cells.forEach((cell, index) => (cell.className = session.history[index]));
            return;
        }

        session.history.forEach((outcome, index) => {
            setTimeout(() => {
                cells[index].className = outcome;
            }, 200 + index * 120);
        });
    }

    function formatTimer(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
    }

    // Counts down against the server-issued deadline (fixed when the
    // question was served) so a throttled/backgrounded tab can't slow the
    // clock. The deadline never pauses or extends on a wrong retry — the
    // server enforces the same fixed cutoff regardless of how many attempts
    // are used against it.
    function startBlitzTimer(deadlineTimestamp) {
        clearBlitzTimer();
        blitzDeadline = deadlineTimestamp;
        const ring = document.getElementById("timer-wrap");
        const label = document.getElementById("timer-label");

        const render = () => {
            const remainingSec = Math.max(0, Math.ceil((blitzDeadline - Date.now()) / 1000));
            ring.style.setProperty("--p", Math.max(0, remainingSec / BLITZ_SECONDS));
            ring.classList.toggle("is-low", remainingSec <= 10);
            label.textContent = formatTimer(remainingSec);
            return remainingSec;
        };
        render();

        timerInterval = setInterval(() => {
            const remainingSec = render();
            if (remainingSec <= 0) {
                clearBlitzTimer();
                resultContainer.innerText = "Time's up!";
                submitAnswer({ isTimeout: true });
            }
        }, 250);
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
