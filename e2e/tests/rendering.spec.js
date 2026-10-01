// @ts-check
// Question rendering for content the production bank has: explanations of
// several lines keep their line breaks, and tab-indented code renders at
// Python's usual 4 columns (browsers default to 8).
const { test, expect, registerUser, logIn } = require('./fixtures');

test('Study cards keep explanation line breaks and render tabs as 4 columns', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  await page.goto('/study.html');
  await expect(page.locator('#study-cards article.study-card').first()).toBeVisible();
  const style = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.study-card__explain p')].find((el) => el.textContent.includes('\n'));
    const code = document.querySelector('.pq-code code') || document.querySelector('.pq-code');
    return { whiteSpace: getComputedStyle(p).whiteSpace, tabSize: getComputedStyle(code).tabSize, multiline: p.textContent.includes('\n') };
  });
  expect(style).toEqual({ whiteSpace: 'pre-line', tabSize: '4', multiline: true });
});
