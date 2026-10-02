// @ts-check
// Rate-limit responses use the standard error envelope, so the page shows
// the server's own message rather than a generic "Request failed (429)".
const { test, expect, registerUser, logIn } = require('./fixtures');

test('the contact form shows the real rate-limit message on the sixth submission', async ({ page }) => {
  await page.goto('/contact.html');
  const status = page.locator('#contact-status');

  for (let i = 1; i <= 6; i += 1) {
    await page.fill('#name', 'Rate Tester');
    await page.fill('#email', 'rate.tester@example.com');
    await page.fill('#message', `Message number ${i}`);
    const response = page.waitForResponse((res) => res.url().endsWith('/api/v1/contact'));
    await page.click('#submit-btn');
    const res = await response;
    if (i <= 5) {
      expect(res.status()).toBe(201);
      await expect(status).toContainText('Message sent successfully');
    } else {
      expect(res.status()).toBe(429);
      await expect(status).toContainText('Too many messages sent. Please try again later.');
      await expect(status).not.toContainText('Request failed');
    }
  }
});

test('the general /api rate limit reaches the page as its real message', async ({ page, request }) => {
  // This limiter used to answer with plain text, which api.js could not
  // parse, so users saw "Request failed (429)". The budget is 1000 per user
  // per 15 minutes (QA finding F-01), so this takes over 1000 requests.
  test.setTimeout(120000);
  await logIn(page, await registerUser(request));
  const message = await page.evaluate(async () => {
    const { api } = await import('/js/api.js');
    for (let i = 0; i < 1100; i += 1) {
      try {
        await api.getProgress();
      } catch (error) {
        return `${error.status}: ${error.message}`;
      }
    }
    return 'never limited';
  });
  expect(message).toBe('429: Too many requests. Please try again later.');
});
