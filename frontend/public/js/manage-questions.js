import { api } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem("adminToken")) {
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

    function escapeHTML(str = "") {
        return String(str).replace(/[&<>"']/g, (match) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[match]));
    }

    async function loadQuestions() {
        tableBody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
        try {
            const topics = filterTopic.value.trim() ? [filterTopic.value.trim()] : [];
            const difficulty = filterDifficulty.value;
            const questions = await api.getAdminQuestions({
                topics,
                difficulty,
                page: currentPage,
                limit: PAGE_SIZE,
            });

            hasNextPage = questions.length === PAGE_SIZE;
            pageLabel.textContent = `Page ${currentPage}`;

            if (!questions.length) {
                tableBody.innerHTML = `<tr><td colspan="4">No questions found.</td></tr>`;
                return;
            }

            tableBody.innerHTML = questions
                .map(
                    (q) => `
                <tr>
                    <td>${escapeHTML(q.question)}</td>
                    <td>${escapeHTML(q.difficulty)}</td>
                    <td>${escapeHTML((q.topics || []).join(", "))}</td>
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
            tableBody.innerHTML = `<tr><td colspan="4">Error: ${escapeHTML(error.message)}</td></tr>`;
        }
    }

    async function startEdit(id) {
        try {
            const question = await api.getAdminQuestion(id);
            editingId = id;
            document.getElementById("edit-question-text").value = question.question;
            document.getElementById("edit-code").value = question.code || "";
            document.getElementById("edit-options").value = (question.options || []).join("\n");
            document.getElementById("edit-answer").value = question.answer;
            document.getElementById("edit-difficulty").value = question.difficulty;
            document.getElementById("edit-topics").value = (question.topics || []).join(", ");
            document.getElementById("edit-explanation").value = question.explanation;
            editStatus.textContent = "";
            editSection.hidden = false;
            editSection.scrollIntoView({ behavior: "smooth" });
        } catch (error) {
            alert("Error loading question: " + error.message);
        }
    }

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

        const payload = {
            question: document.getElementById("edit-question-text").value.trim(),
            code: document.getElementById("edit-code").value.trim(),
            options,
            answer,
            difficulty: document.getElementById("edit-difficulty").value,
            topics: document
                .getElementById("edit-topics")
                .value.split(",")
                .map((topic) => topic.trim())
                .filter(Boolean),
            explanation: document.getElementById("edit-explanation").value.trim(),
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
        logoutBtn.addEventListener("click", () => {
            if (!confirm("Are you sure you want to log out?")) return;
            localStorage.removeItem("adminToken");
            window.location.href = "admin_login.html";
        });
    }

    loadQuestions();
});
