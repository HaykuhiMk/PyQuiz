const questionContainer = document.getElementById('question');
const questionCode = document.getElementById('question-code');
const optionsContainer = document.getElementById('options');
const resultContainer = document.getElementById('result');
const submitBtn = document.getElementById('submit-btn');
const nextBtn = document.getElementById('next-btn');
const giveUpBtn = document.getElementById('give-up-btn');
const statsContainer = document.getElementById('stats');

let currentQuestion = null;
let selectedOption = null;
let attempts = 0;

// Statistics
let totalQuestions = 46; // Placeholder
let correctAnswers = 0;
const answeredQuestions = new Set(); // To track answered questions

// Fetch random question
async function fetchQuestion() {
    const response = await fetch('http://localhost:5000/api/questions/random');
    currentQuestion = await response.json();

    // Skip already answered questions
    if (answeredQuestions.has(currentQuestion.id)) {
        fetchQuestion();
        return;
    }

    displayQuestion(currentQuestion);
    resetUI();
}

// Escape HTML to prevent XSS vulnerabilities
function escapeHTML(str) {
    return str.replace(/[&<>"']/g, (match) => {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return escapeMap[match];
    });
}

// Display question and options
function displayQuestion(question) {
    questionContainer.innerText = question.question;

    // Display code block
    if (question.code) {
        const formattedCode = escapeHTML(question.code);
        questionCode.innerHTML = `<pre><code class="language-python">${formattedCode}</code></pre>`;
    } else {
        questionCode.innerHTML = '';
    }

    // Syntax highlighting
    Prism.highlightAll();

    // Display options as dropdown
    optionsContainer.innerHTML = '';
    const selectElement = document.createElement('select');
    selectElement.onchange = () => {
        selectedOption = selectElement.value;
    };

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.innerText = 'Select an answer...';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    selectElement.appendChild(placeholderOption);

    question.options.forEach((option, index) => {
        const optionElement = document.createElement('option');
        optionElement.value = index;
        optionElement.innerText = option;
        selectElement.appendChild(optionElement);
    });

    optionsContainer.appendChild(selectElement);
}

// Submit answer
submitBtn.onclick = () => {
    if (!selectedOption) {
        resultContainer.innerText = 'Please select an option.';
        return;
    }

    const correctAnswerIndex = currentQuestion.options.indexOf(currentQuestion.answer);

    if (parseInt(selectedOption) === correctAnswerIndex) {
        correctAnswers++;
        resultContainer.innerText = 'Correct!';
        answeredQuestions.add(currentQuestion.id);
        submitBtn.disabled = true; // Disable submit button after correct answer
    } else {
        attempts++;
        resultContainer.innerText = 'Wrong! Try again.';
        if (attempts >= 3) giveUpBtn.style.display = 'block';
    }

    updateStats();
};

// Show the correct answer when the user gives up
giveUpBtn.onclick = () => {
    const correctAnswerIndex = currentQuestion.options.indexOf(currentQuestion.answer);
    resultContainer.innerText = `The correct answer is: ${currentQuestion.answer}`;
    submitBtn.disabled = true; // Disable submit button after giving up
    giveUpBtn.style.display = 'none'; // Hide the give up button after it's clicked
    answeredQuestions.add(currentQuestion.id); // Mark question as answered
    updateStats();
};

// Next question (always visible)
nextBtn.onclick = fetchQuestion;

// Reset UI and enable submit button for the next question
function resetUI() {
    resultContainer.innerText = '';
    selectedOption = null;
    attempts = 0;
    giveUpBtn.style.display = 'none';
    submitBtn.disabled = false; // Enable submit button when loading a new question
    updateStats();
}

// Update statistics
function updateStats() {
    statsContainer.innerText = `You've answered ${correctAnswers} of ${totalQuestions} questions correctly.`;
}

// Load initial question
fetchQuestion();
