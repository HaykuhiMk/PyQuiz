// Rules for Question.distractors (docs/CONCEPT_GRAPH.md Stage 2): optional
// tags on a question's WRONG options, each matched to an option by its exact
// text (like `answer`), carrying a misconceptionId and/or short feedback.

// Why a question's distractors don't fit its options and answer, or null.
// Shared by the add-question validator and the update merge check, so both
// apply the same rule.
function distractorProblem({ options = [], answer, distractors = [] }) {
  const seen = new Set();
  for (const { option } of distractors) {
    if (!options.includes(option)) return 'Each distractor must name one of the options';
    if (option === answer) return 'Only wrong options can carry a misconception or feedback';
    if (seen.has(option)) return 'Each option can have at most one distractor entry';
    seen.add(option);
  }
  return null;
}

// The misconceptionId of the option a learner chose, or null: for no answer
// (a timeout), the correct option, or a wrong option without a tag.
function chosenMisconceptionId(question, selectedIndex) {
  if (selectedIndex === undefined || selectedIndex === null) return null;
  const option = (question.options || [])[Number(selectedIndex)];
  if (option === undefined || option === question.answer) return null;
  const tag = (question.distractors || []).find((distractor) => distractor.option === option);
  return (tag && tag.misconceptionId) || null;
}

module.exports = { distractorProblem, chosenMisconceptionId };
