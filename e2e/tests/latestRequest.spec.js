// @ts-check
// Paged and filtered lists show the result of the latest request only. An
// earlier request can answer after a later one (a slow first page, a page
// clicked past); it used to replace the newer result with stale rows. Each
// test holds one request back until a newer one is on screen, then lets it
// answer and checks the newer result stays.
const { test, expect, adminLogIn, registerUser, logIn } = require('./fixtures');

// A held-back response: route requests through it, call release() later.
function holdBack() {
  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  return { released, release: () => release() };
}

// Admin pager: page 1 answers, page 2 is held, Next again shows page 3, then
// page 2 answers late.
async function pagerStaysOnLatest(page, { path, apiPath, rowsFor, rowText }) {
  const held = holdBack();
  await page.route(`**${apiPath}?*`, async (route) => {
    const pageNo = Number(new URL(route.request().url()).searchParams.get('page'));
    if (pageNo === 2) await held.released;
    await route.fulfill({ json: { success: true, data: rowsFor(pageNo), error: null, meta: { total: 100, page: pageNo, limit: 20, hasNextPage: true } } });
  });
  await page.goto(path);
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toContainText(rowText(1));
  await page.click('#next-page-btn'); // page 2: held back
  await page.click('#next-page-btn'); // page 3: answers at once
  await expect(page.locator('#page-label')).toHaveText('Page 3');
  await expect(rows.first()).toContainText(rowText(3));

  const late = page.waitForResponse((res) => res.url().includes(apiPath) && new URL(res.url()).searchParams.get('page') === '2');
  held.release();
  await late;
  await page.waitForTimeout(300);
  await expect(page.locator('#page-label')).toHaveText('Page 3');
  await expect(rows.first()).toContainText(rowText(3));
  await expect(rows).toHaveCount(20);
}

test('admin users: a late answer for an earlier page does not replace the latest page', async ({ page }) => {
  await adminLogIn(page);
  await pagerStaysOnLatest(page, {
    path: '/users.html',
    apiPath: '/api/v1/admin/users',
    rowsFor: (p) =>
      Array.from({ length: 20 }, (_, i) => ({
        _id: `65000000000000000000${String(p).padStart(2, '0')}${String(i).padStart(2, '0')}`,
        username: `page${p}user${i}`,
        email: `page${p}user${i}@example.com`,
        role: 'user',
        banned: false,
        stats: { totalPoints: 0, totalAnswered: 0 },
      })),
    rowText: (p) => `page${p}user0`,
  });
});

test('admin contacts: a late answer for an earlier page does not replace the latest page', async ({ page }) => {
  await adminLogIn(page);
  await pagerStaysOnLatest(page, {
    path: '/contacts.html',
    apiPath: '/api/v1/admin/contacts',
    rowsFor: (p) =>
      Array.from({ length: 20 }, (_, i) => ({
        _id: `66000000000000000000${String(p).padStart(2, '0')}${String(i).padStart(2, '0')}`,
        name: `Page ${p} sender ${i}`,
        email: `page${p}sender${i}@example.com`,
        message: `message ${i}`,
        createdAt: '2026-10-01T12:00:00.000Z',
      })),
    rowText: (p) => `Page ${p} sender 0`,
  });
});

test('Study: a late answer for the first, unfiltered load does not replace the filtered cards', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  // Hold back the unfiltered load Study makes on arrival.
  const held = holdBack();
  await page.route('**/api/v1/questions/study?*', async (route) => {
    if (!new URL(route.request().url()).searchParams.get('difficulty')) await held.released;
    await route.continue();
  });
  await page.goto('/study.html');
  await page.selectOption('#study-difficulty', 'hard');
  const filtered = page.waitForResponse((res) => new URL(res.url()).searchParams.get('difficulty') === 'hard');
  await page.click('#study-load-btn');
  await filtered;
  const badges = page.locator('#study-cards .study-card .badge');
  await expect(badges.first()).toHaveText(/hard/i);

  const late = page.waitForResponse((res) => res.url().includes('/api/v1/questions/study?') && !new URL(res.url()).searchParams.get('difficulty'));
  held.release();
  await late;
  await page.waitForTimeout(300);
  const difficulties = await badges.allInnerTexts();
  expect(difficulties.length).toBeGreaterThan(0);
  for (const text of difficulties) expect(text).toMatch(/hard/i);
  await expect(page.locator('#study-cards')).toHaveAttribute('aria-busy', 'false');
});
