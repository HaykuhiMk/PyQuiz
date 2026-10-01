import { api } from "./api.js";

// The Python version question answers assume, from one backend constant
// (GET /api/v1/python-version, backend/config/pythonVersion.js). Fills every
// [data-python-note] with the note for learners and every
// [data-python-author-hint] with the hint for question authors. The elements
// stay hidden if it can't be loaded.
async function showPythonVersion() {
    const learner = document.querySelectorAll("[data-python-note]");
    const author = document.querySelectorAll("[data-python-author-hint]");
    if (!learner.length && !author.length) return;
    let info;
    try {
        info = await api.getPythonVersion();
    } catch {
        return;
    }
    const fill = (elements, text) => {
        elements.forEach((element) => {
            element.textContent = text;
            element.hidden = !text;
        });
    };
    fill(learner, info.learnerNote);
    fill(author, info.authorHint);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showPythonVersion);
} else {
    showPythonVersion();
}
