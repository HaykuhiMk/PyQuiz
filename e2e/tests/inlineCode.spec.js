// @ts-check
// Explanations written with `inline code` show it as code (QA finding
// F-10: the backticks used to appear literally). The text is escaped first,
// so HTML in an explanation is shown as text, never interpreted.
const { test, expect, API, ADMIN, PASSWORD, registerUser, logIn } = require('./fixtures');

const HOSTILE = 'Use `<b>x</b>` here.\n<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script> & done `a & b`';

test('renderInlineCode escapes everything and only adds <code> wrappers', async ({ page }) => {
  await page.goto('/index.html');
  const out = await page.evaluate(async () => {
    const { renderInlineCode } = await import('/js/inlineCode.js');
    return [
      renderInlineCode('`set(ls)` removes duplicates'),
      renderInlineCode('<b>bold</b> & "quotes"'),
      renderInlineCode('`<img src=x onerror=alert(1)>`'),
      renderInlineCode('a lone ` backtick'),
      renderInlineCode('no `span\nacross lines`'),
      renderInlineCode(''),
    ];
  });
  expect(out).toEqual([
    '<code class="pq-inline">set(ls)</code> removes duplicates',
    '&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot;',
    '<code class="pq-inline">&lt;img src=x onerror=alert(1)&gt;</code>',
    'a lone ` backtick',
    'no `span\nacross lines`',
    '',
  ]);
});

test('Study: backtick spans render as code; HTML in an explanation is shown as text', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  await page.route('**/api/v1/questions/study?*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data[0].explanation = HOSTILE;
    await route.fulfill({ response, json: body });
  });
  await page.goto('/study.html');
  const explain = page.locator('.study-card').first().locator('.study-card__explain p');
  await expect(explain).toBeVisible();
  await expect(explain.locator('code.pq-inline')).toHaveText(['<b>x</b>', 'a & b']);
  await expect(explain.locator('b, img, script')).toHaveCount(0);
  await expect(explain).toContainText('<img src=x onerror="window.__pwned=1"><script>');
  expect(await explain.innerText()).not.toContain('`');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('quiz page: the explanation renders inline code, HTML stays text', async ({ page, request, playwright }) => {
  await logIn(page, await registerUser(request));
  await page.route('**/api/v1/quiz/sessions/*/answer', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.explanation = HOSTILE;
    await route.fulfill({ response, json: body });
  });
  await page.goto('/questions.html');
  await page.click('[data-mode="classic"]');
  await page.click('#select-all-btn');
  const start = page.waitForResponse((r) => r.url().endsWith('/api/v1/quiz/sessions'));
  await page.click('#start-quiz-btn');
  const question = (await (await start).json()).data.question;

  // The right option, through the admin API; a correct answer shows the explanation.
  const admin = await playwright.request.newContext({ baseURL: API });
  await admin.post('/api/v1/admin/login', { data: { username: ADMIN.username, password: PASSWORD } });
  const full = (await (await admin.get(`/api/v1/admin/questions/${question._id}`)).json()).data;
  await admin.dispose();
  await page.locator('#options .pq-answer').nth(full.options.indexOf(full.answer)).click();
  const answered = page.waitForResponse((r) => r.url().includes('/answer'));
  await page.click('#submit-btn');
  await answered;

  const explain = page.locator('#explanation p');
  await expect(explain).toBeVisible();
  await expect(explain.locator('code.pq-inline')).toHaveText(['<b>x</b>', 'a & b']);
  await expect(explain.locator('b, img, script')).toHaveCount(0);
  await expect(explain).toContainText('<img src=x onerror="window.__pwned=1"><script>');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});
