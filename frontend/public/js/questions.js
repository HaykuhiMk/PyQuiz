import API_BASE_URL from "./config.js";

window.fetchTopicsDebug = async function() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/questions/topics`);
        const text = await response.text();
    } catch (error) {
        console.error("🔧 Debug fetch error:", error);
    }
};

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
    const darkModeBtn = document.getElementById("dark-mode-btn");

    let allTopics = [];
    let currentQuestion = null;
    let selectedOption = null;
    let attempts = 0;
    let selectedTopics = [];
    const totalQuestions = 146;
    const isGuest = getCookie("guestMode") === "true";
    const answeredQuestions = isGuest ? null : new Set();

    const categoryMapping = {
        'basics': ['Variables', 'Data Types', 'Basic Arithmetic', 'Strings', 'Input/Output', 'Control Flow', 'Loops'],
        'data-structures': ['Lists', 'Tuples', 'Dictionaries', 'Sets', 'Arrays', 'Queues', 'Stacks'],
        'functions': ['Functions', 'Lambda Functions', 'Recursion', 'Arguments', 'Return Values'],
        'ooad': ['Classes', 'Objects', 'Inheritance', 'Polymorphism', 'Encapsulation'],
        'advanced': ['Generators', 'Decorators', 'Context Managers', 'Metaclasses', 'Async/Await']
    };

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
            
            const response = await fetch(`${API_BASE_URL}/api/questions/topics`, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch topics: ${response.status} - ${errorText}`);
            }
            
            const topics = await response.json();
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
            topicsList.innerHTML = `
                <div style="color: red; padding: 10px; text-align: center;">
                    <p>Error loading topics: ${error.message}</p>
                    <button onclick="fetchTopics()" 
                            style="margin-top: 10px; padding: 8px 16px; 
                                   background: #ff4444; color: white; 
                                   border: none; border-radius: 4px; 
                                   cursor: pointer;">
                        Try Again
                    </button>
                </div>
            `;
        }
    }

    startQuizBtn.onclick = () => {
        topicSelectionContainer.style.display = "none";
        quizContainer.style.display = "block";
        fetchQuestion();
    };

    async function fetchQuestion(retries = 5) {
        try {
            if (!isGuest) await fetchUserProgress();

            const topicsParam = selectedTopics.length > 0 ? `topics=${selectedTopics.join(',')}` : '';
            const queryParams = [];
            
            if (topicsParam) queryParams.push(topicsParam);
            
            if (!isGuest && answeredQuestions && answeredQuestions.size > 0) {
                const excludeIds = Array.from(answeredQuestions).join(',');
                if (excludeIds) queryParams.push(`excludeIds=${excludeIds}`);
            }
            
            const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
            
            const response = await fetch(`${API_BASE_URL}/api/questions/random${queryString}`, {
                method: "GET",
                credentials: "include",
            });

            const data = await response.json();

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

            if (!response.ok) {
                throw new Error(data.error || "Failed to fetch question");
            }

            currentQuestion = data;
            displayQuestion(currentQuestion);
            resetUI();
        } catch (error) {
            console.error("Error fetching question:", error);
            resultContainer.innerHTML = `
                <div style="color: red; padding: 10px; text-align: center;">
                    <p>Error loading question: ${error.message}</p>
                    <button onclick="fetchQuestion()" 
                            style="margin-top: 10px; padding: 8px 16px; 
                                   background: #ff4444; color: white; 
                                   border: none; border-radius: 4px; 
                                   cursor: pointer;">
                        Try Again
                    </button>
                </div>
            `;
        }
    }

    async function fetchUserProgress() {
        try {
            const token = getCookie("auth_token");
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            const response = await fetch(`${API_BASE_URL}/api/users/user-progress`, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login.html';
                    return;
                }
                throw new Error("Failed to fetch user progress");
            }

            const data = await response.json();
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

        const correctAnswerIndex = currentQuestion.options.indexOf(currentQuestion.correctAnswer);

        if (selectedOption === correctAnswerIndex) {
            resultContainer.innerText = "✅ Correct!";
            submitBtn.disabled = true;
            showExplanation();

            if (!isGuest) {
                try {
                    await updateUserProgress(currentQuestion._id);
                    answeredQuestions.add(currentQuestion._id);
                } catch (error) {
                    console.error("Error updating progress:", error);
                }
            }
        } else {
            attempts++;
            resultContainer.innerText = "❌ Wrong! Try again.";
            if (attempts >= 3) giveUpBtn.style.display = "block";
        }
    };

    giveUpBtn.onclick = async () => {
        resultContainer.innerHTML = `<strong>Correct Answer:</strong> ${currentQuestion.correctAnswer}`;
        submitBtn.disabled = true;
        giveUpBtn.style.display = "none";
        showExplanation();

        if (!isGuest) {
            try {
                await updateUserProgress(currentQuestion._id);
                answeredQuestions.add(currentQuestion._id);
            } catch (error) {
                console.error("Error updating progress:", error);
            }
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
        submitBtn.style.display = "block";
        submitBtn.disabled = false;
        nextBtn.style.display = "block";
    }

    async function updateUserProgress(questionId) {
        try {
            const token = getCookie("auth_token");
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            const response = await fetch(`${API_BASE_URL}/api/users/user-progress`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ questionId })
            });

            if (!response.ok) {
                const errorData = await response.text();
                
                if (response.status === 401) {
                    window.location.href = '/login.html';
                    return;
                }
                throw new Error(`Server returned ${response.status}: ${errorData}`);
            }

            const data = await response.json();
            await fetchUserProgress();
        } catch (error) {
            console.error("Failed to update user progress:", error);
            resultContainer.innerHTML += `<br><small style="color: red;">Failed to save progress: ${error.message}</small>`;
            
            if (error.message.includes("401") || error.message.includes("unauthorized")) {
                window.location.href = '/login.html';
            }
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

    function toggleDarkMode() {
        document.body.classList.toggle("dark-mode");
        topicSelectionContainer.classList.toggle("dark-mode");
        localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
    }

    if (darkModeBtn) {
        darkModeBtn.onclick = toggleDarkMode;
        if (localStorage.getItem("darkMode") === "true") {
            document.body.classList.add("dark-mode");
            topicSelectionContainer.classList.add("dark-mode");
        }
    }

    fetchTopics();
});
