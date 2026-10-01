// @ts-check
// Every page declares the site icon, so browsers stop requesting the missing
// /favicon.ico (a 404 on every visit before).
const { test, expect } = require('./fixtures');

test('pages link the favicon, it is served as SVG, and no request 404s for an icon', async ({ page }) => {
  const notFound = [];
  page.on('response', (r) => { if (r.status() === 404) notFound.push(new URL(r.url()).pathname); });
  for (const path of ['/index.html', '/about.html', '/login.html', '/questions.html']) {
    await page.goto(path);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/images/favicon.svg');
  }
  const icon = await page.request.get('/images/favicon.svg');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toMatch(/image\/svg\+xml/);
  expect(notFound).toEqual([]);
});
