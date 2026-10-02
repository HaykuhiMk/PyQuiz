// @ts-check
// The dashboard shows two different accuracy measures, with different
// labels and help text: "Questions answered correctly" (one count per
// resolved question, from the account's stats) and the per-topic
// "Attempts correct" (every attempt, from AnswerEvent). This test creates a
// history where the two differ and checks each label shows its own number.
const { test, expect, API, ADMIN, PASSWORD, registerUser, logIn } = require('./fixtures');

test('dashboard labels per-question and per-attempt accuracy separately, each with its own number', async ({
  page,
  request,
  playwright,
}) => {
  await logIn(page, await registerUser(request));
  // page.request shares the browser's cookies; the CSRF token comes from /auth/me.
  const api = page.request;
  const csrf = (await (await api.get(`${API}/api/v1/auth/me`)).json()).data.csrfToken;
  const post = async (path, data) =>
    (await api.post(`${API}${path}`, { data, headers: { 'X-CSRF-Token': csrf } })).json();

  // Every question's answer, through the admin API. (Study used to supply
  // them, but it hides today's Daily questions, which then had to be
  // guessed; on some days the guesses made the two measures equal.)
  const admin = await playwright.request.newContext({ baseURL: API });
  await admin.post('/api/v1/admin/login', { data: { username: ADMIN.username, password: PASSWORD } });
  const correctIndexOf = async (id) => {
    const full = (await (await admin.get(`/api/v1/admin/questions/${id}`)).json()).data;
    return full.options.indexOf(full.answer);
  };

  // Only a topic with enough questions (MIN_QUESTIONS_FOR_MASTERY = 3, by
  // primary topic) can be listed as weak, and the session serves questions
  // in random order. So the session is limited to a topic whose every
  // question (the filter matches primary or secondary topics) has such a
  // primary topic: whichever question comes first, its topic can be weak.
  const all = (await (await admin.get('/api/v1/admin/questions?page=1&limit=100')).json()).data;
  const primaryCount = new Map();
  for (const q of all) primaryCount.set(q.primaryTopic, (primaryCount.get(q.primaryTopic) || 0) + 1);
  const servedFor = (topic) => all.filter((q) => q.primaryTopic === topic || (q.secondaryTopics || []).includes(topic));
  const topic = [...primaryCount.keys()]
    .filter((t) => servedFor(t).every((q) => primaryCount.get(q.primaryTopic) >= 3))
    .sort((a, b) => servedFor(b).length - servedFor(a).length)[0];
  expect(topic).toBeTruthy();

  // Starting a session also serves its first question.
  const started = (await post('/api/v1/quiz/sessions', { mode: 'classic', topics: [topic] })).data;
  const { sessionId } = started;
  let question = started.question;

  // Exactly two questions: the first wrong three times, then revealed
  // (resolved as incorrect, 3 attempts); the second right first time. So
  // 50% of questions are correct, while the weakest topic's attempts are
  // 0% (or 25% if both share a topic): the two measures always differ.
  const answer = (selectedIndex) =>
    post(`/api/v1/quiz/sessions/${sessionId}/answer`, { questionId: question._id, selectedIndex });
  const firstCorrect = await correctIndexOf(question._id);
  for (const i of [0, 1, 2, 3].filter((index) => index !== firstCorrect).slice(0, 3)) await answer(i);
  await post(`/api/v1/quiz/sessions/${sessionId}/reveal`, {});
  question = (await post(`/api/v1/quiz/sessions/${sessionId}/next`, {})).data.question;
  expect((await answer(await correctIndexOf(question._id))).data.isCorrect).toBe(true);
  await admin.dispose();

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
