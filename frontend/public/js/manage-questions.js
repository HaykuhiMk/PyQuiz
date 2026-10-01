import { api } from "./api.js";
import { getTopicTaxonomy, getTopicNamer } from "./topics.js";
import { createDistractorFields } from "./distractorFields.js";

// Option values are stable topic ids; the visible text is the display name.
function populateTopicOptions(select, topics) {
    select.innerHTML += topics
        .map((topic) => `<option value="${escapeTopicText(topic.id)}">${escapeTopicText(topic.name)}</option>`)
        .join("");
}

function escapeTopicText(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await api.getAdminMe();
    } catch {
        window.location.href = "admin_login.html";
        return;
    }

    const PAGE_SIZE = 10;
    let currentPage = 1;
    let hasNextPage = false;
    let editingId = null;

    const tableBody = document.getElementById("question-list-body");
    const pageLabel = document.getElementById("page-label");
    const prevBtn = document.getElementById("prev-page-btn");
    const nextBtn = document.getElementById("next-page-btn");
    const filterTopic = document.getElementById("filter-topic");
    const filterDifficulty = document.getElementById("filter-difficulty");
    const filterBtn = document.getElementById("filter-btn");
    const editSection = document.getElementById("edit-question-section");
    const editForm = document.getElementById("edit-question-form");
    const editStatus = document.getElementById("edit-status");
    const cancelEditBtn = document.getElementById("cancel-edit-btn");
    const editPrimaryTopicSelect = document.getElementById("edit-primary-topic");
    const editSecondaryTopicsSelect = document.getElementById("edit-secondary-topics");

    const taxonomy = await getTopicTaxonomy();
    const topicName = await getTopicNamer();
    populateTopicOptions(filterTopic, taxonomy);
    populateTopicOptions(editPrimaryTopicSelect, taxonomy);
    populateTopicOptions(editSecondaryTopicsSelect, taxonomy);
    const distractorFields = await createDistractorFields({
        container: document.getElementById("edit-distractor-fields"),
        optionsInput: document.getElementById("edit-options"),
        answerInput: document.getElementById("edit-answer"),
    });

    function escapeHTML(str = "") {
        return String(str).replace(/[&<>"']/g, (match) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[match]));
    }

    // Next is enabled only when the server says another page exists (a
    // full page used to be taken as "there's more", which left an empty last
    // page whenever the total was a multiple of the page size).
    function updatePager() {
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = !hasNextPage;
    }

    async function loadQuestions() {
        tableBody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
        try {
            const topics = filterTopic.value ? [filterTopic.value] : [];
            const difficulty = filterDifficulty.value;
            const { items: questions, meta } = await api.getAdminQuestionsPage({
                topics,
                difficulty,
                page: currentPage,
                limit: PAGE_SIZE,
            });

            hasNextPage = Boolean(meta.hasNextPage);
            pageLabel.textContent = `Page ${currentPage}`;
            updatePager();

            if (!questions.length) {
                tableBody.innerHTML = `<tr><td colspan="7">No questions found.</td></tr>`;
                return;
            }

            tableBody.innerHTML = questions
                .map(
                    (q) => `
                <tr>
                    <td><code class="question-id">${escapeHTML(String(q._id))}</code></td>
                    <td>${escapeHTML(q.question)}</td>
                    <td><code class="question-code-line" title="${escapeHTML(firstCodeLine(q.code, Infinity))}">${escapeHTML(firstCodeLine(q.code))}</code></td>
                    <td>${escapeHTML(q.difficulty)}</td>
                    <td>${escapeHTML(q.primaryTopic ? topicName(q.primaryTopic) : "")}</td>
                    <td>${escapeHTML((q.secondaryTopics || []).map(topicName).join(", "))}</td>
                    <td>
                        <button type="button" class="secondary-btn edit-btn" data-id="${q._id}">
                            <i class="fas fa-pen"></i> Edit
                        </button>
                        <button type="button" class="danger-btn delete-btn" data-id="${q._id}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `
                )
                .join("");

            tableBody.querySelectorAll(".edit-btn").forEach((btn) => {
                btn.addEventListener("click", () => startEdit(btn.dataset.id));
            });
            tableBody.querySelectorAll(".delete-btn").forEach((btn) => {
                btn.addEventListener("click", () => handleDelete(btn.dataset.id));
            });
        } catch (error) {
            console.error("Error loading questions:", error);
            hasNextPage = false;
            updatePager();
            tableBody.innerHTML = `<tr><td colspan="7">Error: ${escapeHTML(error.message)}</td></tr>`;
        }
    }

    // Every production question has the same prompt, so the list also shows
    // the id and the first line of code to tell questions apart.
    function firstCodeLine(code, max = 80) {
        const line = String(code || "").split("\n").find((l) => l.trim()) || "";
        const text = line.replace(/\t/g, "    ").trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    }

    // Loads a question into the edit form; resolves to false (and alerts)
    // if it can't be loaded, unless `quiet` (then the caller reports it).
    async function startEdit(id, { quiet = false } = {}) {
        try {
            const question = await api.getAdminQuestion(id);
            editingId = id;
            document.getElementById("edit-question-id").textContent = `Editing question ${id}`;
            document.getElementById("edit-question-text").value = question.question;
            document.getElementById("edit-code").value = question.code || "";
            document.getElementById("edit-options").value = (question.options || []).join("\n");
            document.getElementById("edit-answer").value = question.answer;
            document.getElementById("edit-difficulty").value = question.difficulty;
            editPrimaryTopicSelect.value = question.primaryTopic || "";
            const secondary = new Set(question.secondaryTopics || []);
            Array.from(editSecondaryTopicsSelect.options).forEach((option) => {
                option.selected = secondary.has(option.value);
            });
            document.getElementById("edit-explanation").value = question.explanation;
            distractorFields.setValue(question.distractors || []);
            editStatus.textContent = "";
            editSection.hidden = false;
            editSection.scrollIntoView({ behavior: "smooth" });
            return true;
        } catch (error) {
            if (quiet) throw error;
            alert("Error loading question: " + error.message);
            return false;
        }
    }

    const findForm = document.getElementById("find-question-form");
    const findInput = document.getElementById("find-question-id");
    const findStatus = document.getElementById("find-question-status");
    findForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const id = findInput.value.trim();
        if (!/^[a-f0-9]{24}$/i.test(id)) {
            findStatus.textContent = "A question id is 24 characters, 0-9 and a-f.";
            return;
        }
        findStatus.textContent = "";
        try {
            await startEdit(id.toLowerCase(), { quiet: true });
        } catch (error) {
            findStatus.textContent = error.status === 404 ? `No question with id ${id}.` : `Couldn't open it: ${error.message}`;
        }
    });

    async function handleDelete(id) {
        if (!confirm("Delete this question? This cannot be undone.")) return;
        try {
            await api.deleteQuestion(id);
            if (editingId === id) {
                editingId = null;
                editSection.hidden = true;
            }
            await loadQuestions();
        } catch (error) {
            alert("Error deleting question: " + error.message);
        }
    }

    editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!editingId) return;

        const options = document
            .getElementById("edit-options")
            .value.trim()
            .split("\n")
            .map((option) => option.trim())
            .filter(Boolean);
        const answer = document.getElementById("edit-answer").value.trim();

        if (!options.includes(answer)) {
            alert("Correct answer must be one of the options!");
            return;
        }
        if (new Set(options).size !== options.length) {
            alert("Options must all be different!");
            return;
        }
        if (!distractorFields.confirmDroppedTags()) return;

        const primaryTopic = editPrimaryTopicSelect.value;
        const secondaryTopics = Array.from(editSecondaryTopicsSelect.selectedOptions)
            .map((option) => option.value)
            .filter((topic) => topic !== primaryTopic);

        const payload = {
            question: document.getElementById("edit-question-text").value.trim(),
            code: document.getElementById("edit-code").value.trim(),
            options,
            answer,
            difficulty: document.getElementById("edit-difficulty").value,
            primaryTopic,
            secondaryTopics,
            explanation: document.getElementById("edit-explanation").value.trim(),
            distractors: distractorFields.getValue(),
        };

        try {
            await api.updateQuestion(editingId, payload);
            editStatus.textContent = "Question updated successfully!";
            await loadQuestions();
        } catch (error) {
            alert("Error updating question: " + error.message);
        }
    });

    cancelEditBtn.addEventListener("click", () => {
        editingId = null;
        editForm.reset();
        distractorFields.setValue([]);
        editSection.hidden = true;
    });

    filterBtn.addEventListener("click", () => {
        currentPage = 1;
        loadQuestions();
    });

    prevBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage -= 1;
            loadQuestions();
        }
    });

    nextBtn.addEventListener("click", () => {
        if (hasNextPage) {
            currentPage += 1;
            loadQuestions();
        }
    });

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to log out?")) return;
            await api.adminLogout().catch(() => {});
            window.location.href = "admin_login.html";
        });
    }

    loadQuestions();
});
