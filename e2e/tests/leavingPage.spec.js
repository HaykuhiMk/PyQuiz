// @ts-check
// When a page is left while its requests are still running, the browser
// cancels them. Firefox and WebKit still run the old page's handlers for
// those failures (Chromium stops the page first), which used to send the
// browser to the login page in the middle of the user's navigation (CI run
// #8: NS_BINDING_ABORTED in Firefox), render an empty list, or raise an
// uncaught error (WebKit). These tests recreate that order of events in any
// browser: the page starts leaving (beforeunload), then a request fails.
const { test, expect, registerUser, logIn } = require('./fixtures');

test('a session check that fails while the page is being left does not redirect to the login page', async ({ page, request }) => {
  await logIn(page, await registerUser(request));
  // Load the dashboard again with its session check held back.
  let releaseMe;
  const meHeld = new Promise((resolve) => {
    releaseMe = resolve;
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await meHeld;
    await route.abort('aborted');
  });
  await page.goto('/account.html');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  releaseMe();
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/account\.html$/);
});

test('a response that cannot be read while the page is being left is not treated as an empty answer', async ({ page }) => {
  await page.goto('/about.html');
  await page.route('**/api/v1/topics', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data": [' }));
  const outcome = await page.evaluate(async () => {
    const { api } = await import('/js/api.js');
    window.dispatchEvent(new Event('beforeunload'));
    const settled = api.getTopicTaxonomy().then(
      (data) => `resolved: ${JSON.stringify(data)}`,
      (error) => `rejected: ${error.message}`
    );
    return Promise.race([settled, new Promise((resolve) => setTimeout(() => resolve('still pending'), 1000))]);
  });
  expect(outcome).toBe('still pending');
});

test('a request that fails while the page stays is still reported', async ({ page }) => {
  await page.goto('/about.html');
  await page.route('**/api/v1/topics', (route) => route.abort('failed'));
  const outcome = await page.evaluate(async () => {
    const { api } = await import('/js/api.js');
    return api.getTopicTaxonomy().then(
      () => 'resolved',
      (error) => `rejected: ${error.message}`
    );
  });
  expect(outcome).toBe("rejected: Couldn't reach PyQuiz. Check your connection and try again.");
});
