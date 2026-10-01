// @ts-check
// Hovered brand buttons keep readable text: at least 4.5:1 (WCAG AA) in both
// themes. In the dark theme the hover used to be --fold-deep (#6fa0dc),
// 2.7:1 with white (QA finding F-04).
const { test, expect, registerUser, logIn } = require('./fixtures');

// Contrast between an element's text color and its (opaque) background.
async function contrast(locator) {
  return locator.evaluate((el) => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const style = getComputedStyle(el);
    const [a, b] = [lum(style.color), lum(style.backgroundColor)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

async function setTheme(page, theme) {
  await page.addInitScript((t) => localStorage.setItem('pyquiz-theme', t), theme);
}

for (const theme of ['dark', 'light']) {
  test(`${theme} theme: a hovered primary button has at least 4.5:1 contrast`, async ({ page }) => {
    await setTheme(page, theme);
    await page.goto('/login.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const button = page.locator('#login-form button[type="submit"]');
    expect(await contrast(button)).toBeGreaterThanOrEqual(4.5);
    await button.hover();
    // Past the background transition.
    await page.waitForTimeout(400);
    expect(await contrast(button)).toBeGreaterThanOrEqual(4.5);
  });
}

test('dark theme: the hovered active sidebar link has at least 4.5:1 contrast', async ({ page, request }) => {
  await setTheme(page, 'dark');
  await logIn(page, await registerUser(request));
  const link = page.locator('.pq-sidelink.is-active').first();
  await link.hover();
  await page.waitForTimeout(400);
  expect(await contrast(link)).toBeGreaterThanOrEqual(4.5);
});
