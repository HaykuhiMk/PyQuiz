// @ts-check
// The dashboard shows two different accuracy measures, with different
// labels and help text: "Questions answered correctly" (one count per
// resolved question, from the account's stats) and the per-topic
// "Attempts correct" (every attempt, from AnswerEvent). This test creates a
// history where the two differ and checks each label shows its own number.
const { test, expect, API, registerUser, logIn } = require('./fixtures');

test('dashboard labels per-question and per-attempt accuracy separately, each with its own number', async ({
  page,
  request,
}) => {
  await logIn(page, await registerUser(request));
  // page.request shares the browser's cookies; the CSRF token comes from /auth/me.
  const api = page.request;
  const csrf = (await (await api.get(`${API}/api/v1/auth/me`)).json()).data.csrfToken;
  const post = async (path, data) =>
    (await api.post(`${API}${path}`, { data, headers: { 'X-CSRF-Token': csrf } })).json();

  // Known answers from Study mode (login-only; excludes today's Daily set).
  const study = (await (await api.get(`${API}/api/v1/questions/study?limit=50`)).json()).data;
  const correctIndexById = new Map(study.map((q) => [q._id, q.options.indexOf(q.answer)]));

  // Starting a session also serves its first question.
  const started = (await post('/api/v1/quiz/sessions', { mode: 'classic', topics: [] })).data;
  const { sessionId } = started;
  let question = started.question;

  // First known question: three wrong attempts, then reveal (resolved as
  // incorrect, 3 attempts). Second known question: right first time.
  let wrongDone = false;
  let rightDone = false;
  for (let guard = 0; guard < 20 && !(wrongDone && rightDone); guard += 1) {
    const correct = correctIndexById.get(question._id);
    const answer = (selectedIndex) =>
      post(`/api/v1/quiz/sessions/${sessionId}/answer`, { questionId: question._id, selectedIndex });

    if (correct !== undefined && !wrongDone) {
      const wrong = [0, 1, 2, 3].filter((i) => i !== correct && i < question.options.length).slice(0, 3);
      for (const i of wrong) await answer(i);
      await post(`/api/v1/quiz/sessions/${sessionId}/reveal`, {});
      wrongDone = true;
    } else if (correct !== undefined) {
      await answer(correct);
      rightDone = true;
    } else {
      // Today's Daily question (answer not in Study): resolve it without guessing.
      for (let i = 0; i < 3; i += 1) {
        const res = (await answer(i)).data;
        if (res.resolved) break;
        if (res.attemptsRemaining === 0) await post(`/api/v1/quiz/sessions/${sessionId}/reveal`, {});
      }
    }
    const next = (await post(`/api/v1/quiz/sessions/${sessionId}/next`, {})).data;
    if (!next?.question) break;
    question = next.question;
  }
  expect(wrongDone && rightDone).toBe(true);

  const { stats } = (await (await api.get(`${API}/api/v1/users/me`)).json()).data;
  const perQuestion = Math.round((stats.totalCorrect / stats.totalAnswered) * 100);
  const { weakTopics } = (await (await api.get(`${API}/api/v1/users/topic-mastery`)).json()).data;
  expect(weakTopics.length).toBeGreaterThan(0);
  const weakest = weakTopics[0];
  expect(weakest.accuracy).not.toBe(perQuestion); // the two measures really differ here

  await page.goto('/account.html');
  const tile = page.locator('.pq-stat', { has: page.locator('#accuracy-value') });
  await expect(tile.locator('.pq-stat__l')).toHaveText('Questions answered correctly');
  await expect(page.locator('#accuracy-help')).toContainText('Each question counts once');
  await expect(page.locator('#accuracy-value')).toHaveText(`${perQuestion}%`);

  await expect(page.locator('#attempts-correct-help')).toContainText('counts every try');
  // Mastery rows carry stable topic ids; the card shows the display name.
  const taxonomy = (await (await api.get(`${API}/api/v1/topics`)).json()).data;
  const weakestName = taxonomy.find((t) => t.id === weakest.topic).name;
  const card = page.locator('#weak-topics-grid .fold-card', { hasText: weakestName });
  await expect(card).toContainText(`Attempts correct: ${weakest.accuracy}%`);
  await expect(page.getByText(/Accuracy so far/)).toHaveCount(0);
});
