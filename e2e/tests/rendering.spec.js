// @ts-check
// Question rendering for content the production bank has: explanations of
// several lines keep their line breaks, and tab-indented code renders at
// Python's usual 4 columns (browsers default to 8).
const { test, expect, registerUser, logIn } = require('./fixtures');

test('Study cards keep explanation line breaks and render tabs as 4 columns', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  await page.goto('/study.html');
  await expect(page.locator('#study-cards article.study-card').first()).toBeVisible();

  // Study hides today's Daily Challenge questions, so which cards are on the
  // first page depends on the date (the first 7 seed questions have one-line
  // explanations). Page on until a card has a multi-line explanation.
  const multiline = page.locator('.study-card__explain p').filter({ hasText: /\S\n|\n\S/ });
  for (let i = 0; i < 10 && !(await multiline.count()); i += 1) {
    await expect(page.locator('#study-next')).toBeEnabled();
    const label = await page.locator('#study-page-label').innerText();
    await page.click('#study-next');
    await expect(page.locator('#study-page-label')).not.toHaveText(label);
  }
  const p = multiline.first();
  await expect(p).toBeVisible();
  const style = await p.evaluate((el) => ({
    whiteSpace: getComputedStyle(el).whiteSpace,
    // innerText follows the rendering: the stored line breaks are kept.
    renderedLines: el.innerText.split('\n').filter((line) => line.trim()).length,
    tabSize: getComputedStyle(document.querySelector('.pq-code code') || document.querySelector('.pq-code')).tabSize,
  }));
  expect(style.whiteSpace).toBe('pre-line');
  expect(style.renderedLines).toBeGreaterThan(1);
  expect(style.tabSize).toBe('4');
});
