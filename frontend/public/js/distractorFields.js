import { api } from "./api.js";
import { getValidationRules } from "./validationRules.js";

// Admin question forms: one row per WRONG option, to tag it with a
// misconception from the concept graph (GET /api/v1/concept-graph) and/or
// short targeted feedback. Saved as Question.distractors, matched to an
// option by its exact text. Learners never see these yet
// (docs/CONCEPT_GRAPH.md Stage 2).

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function parseOptions(text) {
    return text.split("\n").map((option) => option.trim()).filter(Boolean);
}

// Misconceptions grouped by topic, in graph order, as <optgroup>s.
function misconceptionOptionsHTML(graph) {
    return graph.nodes
        .map((node) => {
            const items = graph.misconceptions.filter((m) => m.topic === node.id);
            if (!items.length) return "";
            const options = items
                .map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(`${m.id}: ${m.belief}`)}</option>`)
                .join("");
            return `<optgroup label="${escapeHTML(node.name)}">${options}</optgroup>`;
        })
        .join("");
}

// If the concept graph can't be loaded, the rest of the form still works:
// getValue() then returns undefined, so the request leaves distractors out.
export async function createDistractorFields({ container, optionsInput, answerInput }) {
    let graph;
    let rules;
    try {
        [graph, rules] = await Promise.all([api.getConceptGraph(), getValidationRules()]);
    } catch (error) {
        container.innerHTML = `<p class="distractor-hint">Couldn't load the misconception list: ${escapeHTML(error.message)}</p>`;
        return { getValue: () => undefined, setValue: () => {} };
    }
    const maxLength = rules?.distractor?.feedbackMaxLength;
    const choicesHTML = misconceptionOptionsHTML(graph);
    // Current values by option text, kept across re-renders while typing.
    let state = new Map();

    function capture() {
        container.querySelectorAll(".distractor-row").forEach((row) => {
            state.set(row.dataset.option, {
                misconceptionId: row.querySelector("select").value,
                feedback: row.querySelector("input").value,
            });
        });
    }

    function render() {
        capture();
        const answer = answerInput.value.trim();
        const wrong = parseOptions(optionsInput.value).filter((option) => option !== answer);
        if (!wrong.length) {
            container.innerHTML = `<p class="distractor-hint">Enter the options and the correct answer to tag the wrong options.</p>`;
            return;
        }
        container.innerHTML = wrong
            .map((option, index) => `
                <div class="distractor-row" data-option="${escapeHTML(option)}">
                    <code class="distractor-option">${escapeHTML(option)}</code>
                    <label for="${container.id}-m${index}">Misconception</label>
                    <select id="${container.id}-m${index}"><option value="">None</option>${choicesHTML}</select>
                    <label for="${container.id}-f${index}">Feedback (optional)</label>
                    <input type="text" id="${container.id}-f${index}"${maxLength ? ` maxlength="${maxLength}"` : ""} />
                </div>`)
            .join("");
        container.querySelectorAll(".distractor-row").forEach((row) => {
            const saved = state.get(row.dataset.option);
            if (!saved) return;
            row.querySelector("select").value = saved.misconceptionId || "";
            row.querySelector("input").value = saved.feedback || "";
        });
    }

    optionsInput.addEventListener("input", render);
    answerInput.addEventListener("input", render);
    render();

    return {
        // Only rows with a misconception or feedback; the server rejects
        // entries with neither.
        getValue() {
            capture();
            const answer = answerInput.value.trim();
            return parseOptions(optionsInput.value)
                .filter((option) => option !== answer)
                .map((option) => {
                    const { misconceptionId = "", feedback = "" } = state.get(option) || {};
                    const entry = { option };
                    if (misconceptionId) entry.misconceptionId = misconceptionId;
                    if (feedback.trim()) entry.feedback = feedback.trim();
                    return entry;
                })
                .filter((entry) => entry.misconceptionId || entry.feedback);
        },
        // Replaces all values (after the options and answer inputs are set).
        setValue(distractors = []) {
            state = new Map(distractors.map((d) => [d.option, { misconceptionId: d.misconceptionId, feedback: d.feedback }]));
            container.innerHTML = "";
            render();
        },
    };
}
