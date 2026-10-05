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
    const closeEditBtn = document.getElementById("close-edit-btn");
    const editBackdrop = document.getElementById("edit-backdrop");
    const listStatus = document.getElementById("list-status");
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

    // A status line: an error in red, otherwise a confirmation.
    function setStatus(element, message, isError = false) {
        element.textContent = message;
        element.classList.toggle("is-error", isError);
    }

    // The edit form opens as a side panel over the list. Esc, Cancel, the
    // close button or a click outside closes it without saving.
    let returnFocusTo = null;

    function openEditPanel() {
        returnFocusTo = document.activeElement;
        editSection.hidden = false;
        editBackdrop.hidden = false;
        document.body.classList.add("admin-panel-open");
        editSection.scrollTop = 0;
        document.getElementById("edit-question-text").focus({ preventScroll: true });
        document.addEventListener("keydown", onPanelKeydown);
    }

    function closeEditPanel() {
        editingId = null;
        editForm.reset();
        distractorFields.setValue([]);
        editSection.hidden = true;
        editBackdrop.hidden = true;
        document.body.classList.remove("admin-panel-open");
        document.removeEventListener("keydown", onPanelKeydown);
        if (returnFocusTo && document.contains(returnFocusTo)) returnFocusTo.focus();
        returnFocusTo = null;
    }

    function onPanelKeydown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            closeEditPanel();
        }
    }

    // Next is enabled only when the server says another page exists (a
    // full page used to be taken as "there's more", which left an empty last
    // page whenever the total was a multiple of the page size).
    function updatePager() {
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = !hasNextPage;
    }

    // Only the latest load may fill the table: an earlier request (the
    // first page, loaded on arrival, or a page clicked past) can answer after
    // a later one, and would otherwise replace the filtered list with a stale
    // one while the filter still shows the new choice.
    let latestLoad = 0;

    async function loadQuestions() {
        const load = ++latestLoad;
        tableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
        try {
            const topics = filterTopic.value ? [filterTopic.value] : [];
            const difficulty = filterDifficulty.value;
            const { items: questions, meta } = await api.getAdminQuestionsPage({
                topics,
                difficulty,
                page: currentPage,
                limit: PAGE_SIZE,
            });
            if (load !== latestLoad) return;

            hasNextPage = Boolean(meta.hasNextPage);
            pageLabel.textContent = `Page ${currentPage}`;
            updatePager();

            if (!questions.length) {
                tableBody.innerHTML = `<tr><td colspan="6">No questions found.</td></tr>`;
                return;
            }

            tableBody.innerHTML = questions
                .map(
                    (q) => `
                <tr>
                    <td><code class="question-id">${escapeHTML(String(q._id))}</code></td>
                    <td class="question-text">${escapeHTML(q.question)}</td>
                    <td><code class="question-code-line" title="${escapeHTML(firstCodeLine(q.code, Infinity))}">${escapeHTML(firstCodeLine(q.code))}</code></td>
                    <td><span class="badge admin-diff admin-diff--${escapeHTML(q.difficulty)}">${escapeHTML(q.difficulty)}</span></td>
                    <td>
                        <div class="admin-topics">
                            <span>${escapeHTML(q.primaryTopic ? topicName(q.primaryTopic) : "")}</span>
                            ${(q.secondaryTopics || []).length ? `<span class="admin-topics__secondary">${escapeHTML(q.secondaryTopics.map(topicName).join(", "))}</span>` : ""}
                        </div>
                    </td>
                    <td>
                        <div class="admin-actions">
                            <button type="button" class="secondary-btn edit-btn" data-id="${q._id}">Edit</button>
                            <button type="button" class="danger-btn delete-btn" data-id="${q._id}" aria-label="Delete question ${q._id}">Delete</button>
                        </div>
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
            if (load !== latestLoad) return;
            console.error("Error loading questions:", error);
            hasNextPage = false;
            updatePager();
            tableBody.innerHTML = `<tr><td colspan="6">Error: ${escapeHTML(error.message)}</td></tr>`;
        }
    }

    // Every production question has the same prompt, so the list also shows
    // the id and the first line of code to tell questions apart.
    function firstCodeLine(code, max = 80) {
        const line = String(code || "").split("\n").find((l) => l.trim()) || "";
        const text = line.replace(/\t/g, "    ").trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    }

    // Loads a question into the edit panel; resolves to false (and says so
    // above the list) if it can't be loaded, unless `quiet` (then the caller
    // reports it).
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
            setStatus(editStatus, "");
            if (editSection.hidden) openEditPanel();
            return true;
        } catch (error) {
            if (quiet) throw error;
            setStatus(listStatus, `Couldn't open the question. ${error.message}`, true);
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
            if (editingId === id) closeEditPanel();
            setStatus(listStatus, "Question deleted.");
            await loadQuestions();
        } catch (error) {
            setStatus(listStatus, `Couldn't delete the question. ${error.message}`, true);
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
            setStatus(editStatus, "The correct answer must be one of the options.", true);
            return;
        }
        if (new Set(options).size !== options.length) {
            setStatus(editStatus, "The options must all be different.", true);
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
            setStatus(editStatus, "Changes saved.");
            await loadQuestions();
        } catch (error) {
            setStatus(editStatus, `Couldn't save the changes. ${error.message}`, true);
        }
    });

    cancelEditBtn.addEventListener("click", closeEditPanel);
    closeEditBtn.addEventListener("click", closeEditPanel);
    editBackdrop.addEventListener("click", closeEditPanel);

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
