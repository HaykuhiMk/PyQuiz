# PyQuiz — Draft Evaluation Questionnaire

> Draft for the user study described in `docs/PYQUIZ_CURRENT_SYSTEM_DESCRIPTION.md` §18.2.
> TODO(author): review every item, decide the final set, and get any approval your institution
> requires before giving this to students. No responses have been collected yet.

## Before you start (for the study coordinator)

TODO(author): fill in before use.

- Study purpose, in one or two sentences, as shown to participants:
- Consent statement and how responses are stored and anonymised:
- Tasks participants complete before answering. Suggested:
  1. Play one Classic quiz.
  2. Open Study mode for a topic.
  3. Complete the Daily Challenge.
  4. Look at the dashboard's topic mastery.
- Approximate time needed:

## Part A — About you (optional)

1. How would you describe your Python experience?
   ☐ None ☐ Beginner (under 3 months) ☐ Intermediate ☐ Advanced
2. How are you currently learning Python?
   ☐ University/school course ☐ Online course ☐ Self-taught ☐ Other: ________
3. Have you used other quiz or practice platforms for programming before? If yes, which?
   ________

## Part B — Usability (SUS-style)

The ten statements below follow the structure of the System Usability Scale (SUS), with "this
system" replaced by "PyQuiz". TODO(author): check each item's wording against the original SUS
source and add the full citation in the thesis before use; the standard scoring below assumes the
items are unchanged.

Rate each statement: 1 = Strongly disagree, 2 = Disagree, 3 = Neutral, 4 = Agree, 5 = Strongly
agree.

| # | Statement | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| B1 | I think that I would like to use PyQuiz frequently. | ☐ | ☐ | ☐ | ☐ | ☐ |
| B2 | I found PyQuiz unnecessarily complex. | ☐ | ☐ | ☐ | ☐ | ☐ |
| B3 | I thought PyQuiz was easy to use. | ☐ | ☐ | ☐ | ☐ | ☐ |
| B4 | I think that I would need the support of a technical person to be able to use PyQuiz. | ☐ | ☐ | ☐ | ☐ | ☐ |
| B5 | I found the various functions in PyQuiz were well integrated. | ☐ | ☐ | ☐ | ☐ | ☐ |
| B6 | I thought there was too much inconsistency in PyQuiz. | ☐ | ☐ | ☐ | ☐ | ☐ |
| B7 | I would imagine that most people would learn to use PyQuiz very quickly. | ☐ | ☐ | ☐ | ☐ | ☐ |
| B8 | I found PyQuiz very cumbersome to use. | ☐ | ☐ | ☐ | ☐ | ☐ |
| B9 | I felt very confident using PyQuiz. | ☐ | ☐ | ☐ | ☐ | ☐ |
| B10 | I needed to learn a lot of things before I could get going with PyQuiz. | ☐ | ☐ | ☐ | ☐ | ☐ |

**Scoring (standard SUS method):**
1. For the odd-numbered items (B1, B3, B5, B7, B9), the contribution is the response minus 1.
2. For the even-numbered items (B2, B4, B6, B8, B10), the contribution is 5 minus the response.
3. Add the ten contributions and multiply by 2.5, giving a score from 0 to 100 per participant.
4. Report the mean (and spread) across participants; don't interpret individual item scores as
   percentages.

## Part C — Learning perception

Same scale: 1 = Strongly disagree … 5 = Strongly agree.

| # | Statement | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| C1 | Answering PyQuiz questions helped me notice gaps in my Python knowledge. | ☐ | ☐ | ☐ | ☐ | ☐ |
| C2 | The explanations after each question helped me understand why an answer is correct. | ☐ | ☐ | ☐ | ☐ | ☐ |
| C3 | The per-topic mastery on the dashboard showed me which topics to practise next. | ☐ | ☐ | ☐ | ☐ | ☐ |
| C4 | Study mode was useful for reviewing a topic before taking a quiz on it. | ☐ | ☐ | ☐ | ☐ | ☐ |
| C5 | Blitz or Survival mode made me recall answers more carefully than untimed practice. | ☐ | ☐ | ☐ | ☐ | ☐ |
| C6 | The Daily Challenge would encourage me to practise regularly. | ☐ | ☐ | ☐ | ☐ | ☐ |
| C7 | Points, streaks and achievements motivated me to keep practising. | ☐ | ☐ | ☐ | ☐ | ☐ |
| C8 | The leaderboard motivated me more than it discouraged me. | ☐ | ☐ | ☐ | ☐ | ☐ |
| C9 | I would use PyQuiz alongside a Python course. | ☐ | ☐ | ☐ | ☐ | ☐ |

## Part D — Open questions

1. What did you find most useful in PyQuiz, and why?
2. What was confusing or frustrating?
3. Which topics or kinds of questions would you like to see added?
4. Anything else you would like to tell us?

## Notes for analysis

TODO(author): decide and document these before the study, not after:
- Minimum number of participants, and how they are recruited.
- Whether Part C is analysed per item, as a combined scale, or both, and which statistics you
  report.
- How open answers are coded (e.g. thematic grouping), and by whom.
- Known limitations: self-reported perception is not a measure of learning. A learning-outcome
  claim would need a separate design (e.g. a pre/post knowledge test).
