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
        return { getValue: () => undefined, setValue: () => {}, confirmDroppedTags: () => true };
    }
    const maxLength = rules?.distractor?.feedbackMaxLength;
    const choicesHTML = misconceptionOptionsHTML(graph);
    const misconceptionById = new Map(graph.misconceptions.map((m) => [m.id, m]));
    // Current values by option text, kept across re-renders while typing, so
    // restoring an option's text brings its tag back.
    let state = new Map();

    function wrongOptions() {
        const answer = answerInput.value.trim();
        return parseOptions(optionsInput.value).filter((option) => option !== answer);
    }

    // Tags whose option no longer exists as a wrong option (its text was
    // edited or removed, or it became the answer). Saving drops them.
    function orphanedTags() {
        const wrong = new Set(wrongOptions());
        return Array.from(state, ([option, value]) => ({ option, ...value })).filter(
            (tag) => !wrong.has(tag.option) && (tag.misconceptionId || (tag.feedback || "").trim())
        );
    }

    function describeTag(tag) {
        const parts = [];
        if (tag.misconceptionId) parts.push(misconceptionById.get(tag.misconceptionId)?.id || tag.misconceptionId);
        if ((tag.feedback || "").trim()) parts.push("feedback");
        return `"${tag.option}" (${parts.join(", ")})`;
    }

    function capture() {
        container.querySelectorAll(".distractor-row").forEach((row) => {
            state.set(row.dataset.option, {
                misconceptionId: row.querySelector("select").value,
                feedback: row.querySelector("input").value,
            });
        });
    }

    function warningHTML() {
        const orphans = orphanedTags();
        if (!orphans.length) return "";
        return `<p class="distractor-warning" role="status">Saving will remove the tag on ${escapeHTML(
            orphans.map(describeTag).join(", ")
        )}: that option is no longer a wrong option. Restore its text to keep the tag.</p>`;
    }

    function render() {
        capture();
        const wrong = wrongOptions();
        if (!wrong.length) {
            container.innerHTML = `${warningHTML()}<p class="distractor-hint">Enter the options and the correct answer to tag the wrong options.</p>`;
            return;
        }
        container.innerHTML = warningHTML() + wrong
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
            return wrongOptions()
                .map((option) => {
                    const { misconceptionId = "", feedback = "" } = state.get(option) || {};
                    const entry = { option };
                    if (misconceptionId) entry.misconceptionId = misconceptionId;
                    if (feedback.trim()) entry.feedback = feedback.trim();
                    return entry;
                })
                .filter((entry) => entry.misconceptionId || entry.feedback);
        },
        // Asks before saving would drop tags (see orphanedTags); true to go ahead.
        confirmDroppedTags() {
            capture();
            const orphans = orphanedTags();
            if (!orphans.length) return true;
            return confirm(`Saving will remove ${orphans.length === 1 ? "this tag" : "these tags"}: ${orphans
                .map(describeTag)
                .join(", ")}. That option is no longer a wrong option. Save anyway?`);
        },
        // Replaces all values (after the options and answer inputs are set).
        setValue(distractors = []) {
            state = new Map(distractors.map((d) => [d.option, { misconceptionId: d.misconceptionId, feedback: d.feedback }]));
            container.innerHTML = "";
            render();
        },
    };
}
