// Helpers shared by the admin question forms (Add a question, and the edit
// panel on Questions): pick the correct answer from the options with one
// click, and choose secondary topics with checkboxes instead of a
// Ctrl-click multi-select. Both keep the original inputs (#answer, the
// <select multiple>) as the source of truth, so the form scripts read them
// as before.

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function parseOptions(text) {
    return text.split("\n").map((option) => option.trim()).filter(Boolean);
}

// Under the answer input: one button per option; clicking one makes it the
// correct answer. Also says when the typed answer matches none of them, and
// when two options are the same.
export function createAnswerPicker({ optionsInput, answerInput, container }) {
    function render() {
        const options = parseOptions(optionsInput.value);
        const answer = answerInput.value.trim();
        if (!options.length) {
            container.innerHTML = `<p class="answer-picker__hint">Your options will appear here: click one to make it the correct answer.</p>`;
            return;
        }
        const duplicates = options.length !== new Set(options).size;
        const matched = options.includes(answer);
        let note = "";
        if (duplicates) note = `<p class="answer-picker__note is-warning">Two options are the same: every option must be different.</p>`;
        else if (answer && !matched) note = `<p class="answer-picker__note is-warning">This answer isn't one of the options yet.</p>`;
        container.innerHTML = `
            <p class="answer-picker__hint">Click the correct option:</p>
            <div class="answer-picker__list">${options
                .map((option) => {
                    const isAnswer = option === answer;
                    return `<button type="button" class="answer-chip${isAnswer ? " is-answer" : ""}" aria-pressed="${isAnswer}" data-option="${escapeHTML(option)}">${isAnswer ? '<span class="answer-chip__tick" aria-hidden="true">✓</span>' : ""}<span>${escapeHTML(option)}</span></button>`;
                })
                .join("")}</div>${note}`;
        container.querySelectorAll(".answer-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                answerInput.value = chip.dataset.option;
                // The wrong-option tags (distractorFields.js) listen for input.
                answerInput.dispatchEvent(new Event("input", { bubbles: true }));
                container.querySelector(`.answer-chip[data-option="${CSS.escape(chip.dataset.option)}"]`)?.focus();
            });
        });
    }

    optionsInput.addEventListener("input", render);
    answerInput.addEventListener("input", render);
    render();
    return { refresh: render };
}

// Secondary topics as checkboxes. The <select multiple> stays (hidden) and
// is kept in sync, so it is still what the form reads. The primary topic
// can't also be a secondary one, so its checkbox is disabled.
export function createTopicChips({ select, primarySelect, container }) {
    select.hidden = true;
    container.innerHTML = Array.from(select.options)
        .map((option, index) => {
            const id = `${container.id}-${index}`;
            return `<label class="topic-chip" for="${id}"><input type="checkbox" id="${id}" value="${escapeHTML(option.value)}" /><span>${escapeHTML(option.textContent)}</span></label>`;
        })
        .join("");
    const boxes = Array.from(container.querySelectorAll("input[type=checkbox]"));

    function refresh() {
        const primary = primarySelect.value;
        boxes.forEach((box) => {
            const option = Array.from(select.options).find((o) => o.value === box.value);
            if (box.value === primary && option) option.selected = false;
            box.checked = Boolean(option?.selected);
            box.disabled = box.value === primary;
            box.closest(".topic-chip").title = box.disabled ? "Already the primary topic" : "";
        });
    }

    boxes.forEach((box) => {
        box.addEventListener("change", () => {
            const option = Array.from(select.options).find((o) => o.value === box.value);
            if (option) option.selected = box.checked;
        });
    });
    primarySelect.addEventListener("change", refresh);
    refresh();
    return { refresh };
}
