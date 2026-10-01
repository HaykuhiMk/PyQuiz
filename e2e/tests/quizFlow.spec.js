// @ts-check
// Classic and Survival can't move on before the question is resolved (the
// server refuses), so Next is disabled until then; Blitz may skip. After the
// last attempt, Submit is disabled and the page says to reveal the answer
// (it used to say "try again" with 0 attempts left).
const { test, expect, API, ADMIN, PASSWORD, registerUser, logIn } = require('./fixtures');

async function startQuiz(page, mode) {
  await page.goto('/questions.html');
  await page.click(`[data-mode="${mode}"]`);
  await page.click('#select-all-btn');
  const start = page.waitForResponse((r) => r.url().endsWith('/api/v1/quiz/sessions'));
  await page.click('#start-quiz-btn');
  return (await (await start).json()).data.question;
}

test('Classic: Next waits for the answer; the last wrong attempt asks to reveal', async ({ page, request, playwright }) => {
  await logIn(page, await registerUser(request));
  const question = await startQuiz(page, 'classic');
  await expect(page.locator('#next-btn')).toBeDisabled();

  // Find wrong options through the admin API.
  const admin = await playwright.request.newContext({ baseURL: API });
  await admin.post('/api/v1/admin/login', { data: { username: ADMIN.username, password: PASSWORD } });
  const full = (await (await admin.get(`/api/v1/admin/questions/${question._id}`)).json()).data;
  await admin.dispose();
  const wrong = full.options.map((o, i) => [o, i]).filter(([o]) => o !== full.answer).map(([, i]) => i);

  for (const [n, index] of wrong.slice(0, 3).entries()) {
    await page.locator('#options .pq-answer').nth(index).click();
    const answered = page.waitForResponse((r) => r.url().includes('/answer'));
    await page.click('#submit-btn');
    await answered;
    if (n < 2) {
      await expect(page.locator('#result')).toContainText('try again');
      await expect(page.locator('#submit-btn')).toBeEnabled();
      await expect(page.locator('#next-btn')).toBeDisabled();
    }
  }
  await expect(page.locator('#result')).toHaveText('Wrong. No attempts left — reveal the answer to continue.');
  await expect(page.locator('#submit-btn')).toBeDisabled();
  await expect(page.locator('#next-btn')).toBeDisabled();

  await page.click('#give-up-btn');
  await expect(page.locator('#result')).toContainText('Correct Answer:');
  await expect(page.locator('#next-btn')).toBeEnabled();
  await page.click('#next-btn');
  await expect(page.locator('#next-btn')).toBeDisabled();
});

test('Blitz: Next stays available before answering (moving on counts as a timeout)', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  await startQuiz(page, 'blitz');
  await expect(page.locator('#next-btn')).toBeEnabled();
});

test('Classic: a correct retry replaces the earlier "try again" message', async ({ page, request, playwright }) => {
  await logIn(page, await registerUser(request));
  const question = await startQuiz(page, 'classic');

  const admin = await playwright.request.newContext({ baseURL: API });
  await admin.post('/api/v1/admin/login', { data: { username: ADMIN.username, password: PASSWORD } });
  const full = (await (await admin.get(`/api/v1/admin/questions/${question._id}`)).json()).data;
  await admin.dispose();
  const right = full.options.indexOf(full.answer);
  const wrong = full.options.findIndex((o) => o !== full.answer);

  const options = page.locator('#options .pq-answer');
  await options.nth(wrong).click();
  let answered = page.waitForResponse((r) => r.url().includes('/answer'));
  await page.click('#submit-btn');
  await answered;
  await expect(page.locator('#result')).toContainText('try again');

  await options.nth(right).click();
  answered = page.waitForResponse((r) => r.url().includes('/answer'));
  await page.click('#submit-btn');
  await answered;
  await expect(page.locator('#result')).toContainText('Correct!');
  await expect(page.locator('#result')).not.toContainText('try again');
});
