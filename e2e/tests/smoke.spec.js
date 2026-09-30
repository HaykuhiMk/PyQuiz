// @ts-check
// Minimal frontend smoke suite (FIX_PLAN.md Phase 5): guest quiz, login and
// logout, one Classic quiz, the Daily Challenge, the theme toggle, the About
// page, and the cross-host CSRF recovery after a reload. Every test also
// fails on any Content-Security-Policy violation or uncaught page error.
const { test, expect, API, registerUser, logIn } = require('./fixtures');

async function answerFirstQuestion(page) {
  // Start stays disabled until at least one topic is selected.
  await expect(page.locator('#topics-list .topic-checkbox').first()).toBeAttached();
  await page.click('#select-all-btn');
  await page.click('#start-quiz-btn');
  const firstOption = page.locator('#options .pq-answer').first();
  await expect(firstOption).toBeVisible();
  await firstOption.click();
  await page.click('#submit-btn');
  await expect(page.locator('#result')).not.toBeEmpty();
}

test('guest can play a quiz without an account', async ({ page }) => {
  // Slow /auth/me down: the landing page's buttons must work immediately,
  // not only once the session check has answered (they used to be wired up
  // only after it, so an early click did nothing).
  await page.route('**/api/v1/auth/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto('/index.html');
  await page.click('#guest-btn');
  await expect(page).toHaveURL(/\/questions\.html$/);

  await answerFirstQuestion(page);
  await expect(page.locator('#guest-warning')).toBeVisible();
});

test('login shows the logged-in state, and logout ends the session', async ({ page, request }) => {
  const user = await registerUser(request);
  await logIn(page, user);
  await expect(page.locator('#sidebar-logout')).toBeVisible();

  await page.click('#sidebar-logout');
  await expect(page).toHaveURL(/\/login\.html$/);

  // The session is gone server-side, so a protected page bounces to login.
  await page.goto('/account.html');
  await expect(page).toHaveURL(/\/login\.html$/);
});

test('a logged-in user can play a Classic quiz', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  await page.goto('/questions.html');
  await page.click('[data-mode="classic"]');

  await answerFirstQuestion(page);
  await expect(page.locator('#hud-mode')).toHaveText(/classic/i);
});

test('a logged-in user can complete the Daily Challenge', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  await page.goto('/daily.html');

  const result = page.locator('#daily-result');
  // Answer every question; the last one's button reads "Submit challenge".
  for (let i = 0; i < 20; i += 1) {
    await page.locator('#daily-quiz .pq-answer').first().click();
    const next = page.locator('#daily-next');
    const isLast = /submit/i.test(await next.innerText());
    await next.click();
    if (isLast) break;
  }

  await expect(result).toBeVisible();
  await expect(page.locator('#results-score')).toHaveText(/^\d+$/);
});

test('the theme toggle switches theme and remembers it', async ({ page }) => {
  await page.goto('/about.html');
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');

  await page.click('#theme-toggle');
  const after = before === 'dark' ? 'light' : 'dark';
  await expect(html).toHaveAttribute('data-theme', after);

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', after);
});

test('the About page shows the live question and topic counts', async ({ page, request }) => {
  const stats = (await (await request.get(`${API}/api/v1/questions/stats`)).json()).data;
  expect(stats.totalQuestions).toBeGreaterThan(0);

  await page.goto('/about.html');
  await expect(page.locator('[data-count-target="questions"]')).toHaveText(String(stats.totalQuestions));
  await expect(page.locator('[data-count-target="topics"]')).toHaveText(String(stats.topicCount));
});

test('after a reload with no readable CSRF cookie, the token is re-fetched from /auth/me', async ({
  page,
  request,
  context,
}) => {
  // Simulates the production cross-host setup, where the page can never
  // read the API's host-only CSRF cookie and in-memory state is lost on
  // every reload.
  await logIn(page, await registerUser(request));
  await context.clearCookies({ name: 'csrfToken' });
  await page.goto('/settings.html');
  await page.reload();

  expect(await page.evaluate(() => document.cookie.includes('csrfToken='))).toBe(false);

  const newName = `renamed${Date.now().toString(36)}`;
  const outcome = await page.evaluate(async (username) => {
    const { api } = await import('/js/api.js');
    try {
      return await api.updateProfile({ username });
    } catch (error) {
      return { error: error.message, status: error.status };
    }
  }, newName);

  expect(outcome).toMatchObject({ username: newName });
});
