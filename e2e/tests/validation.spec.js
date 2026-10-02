// @ts-check
// Client-side checks are derived from the server's rules
// (GET /api/v1/validation-rules), so the pages accept and reject exactly
// what the server does.
const { test, expect, API, PASSWORD, registerUser, logIn } = require('./fixtures');

async function serverRules(request) {
  return (await (await request.get(`${API}/api/v1/validation-rules`)).json()).data;
}

async function fillRegistration(page, password) {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  await page.fill('#username', `reg${suffix}`);
  await page.fill('#email', `reg${suffix}@example.com`);
  await page.fill('#password', password);
  await page.fill('#repeat-password', password);
}

test('registration shows the server rule and accepts a password the old client check rejected', async ({
  page,
  request,
}) => {
  const { password } = await serverRules(request);
  await page.goto('/registration.html');
  await expect(page.locator('#password-help')).toHaveText(password.requirements);

  // "#" plus a required special character: valid on the server, but the old
  // client-side whitelist refused it.
  await fillRegistration(page, 'Passw0rd!#');
  const registered = page.waitForResponse((res) => res.url().endsWith('/api/v1/auth/register'));
  await page.click('#registration-form button[type="submit"]');
  expect((await registered).status()).toBe(201);
  await expect(page).toHaveURL(/\/login\.html$/);
});

test('registration rejects a weak password client-side with the server wording, without calling the API', async ({
  page,
  request,
}) => {
  const { password } = await serverRules(request);
  let registerCalls = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/v1/auth/register')) registerCalls += 1;
  });

  await page.goto('/registration.html');
  await fillRegistration(page, 'password1');
  await page.click('#registration-form button[type="submit"]');

  await expect(page.locator('#helper-text')).toContainText(password.requirements);
  expect(registerCalls).toBe(0);
});

test('settings change-password accepts a password allowed at registration', async ({ page, request }) => {
  const user = await registerUser(request);
  await logIn(page, user);
  await page.goto('/settings.html');

  const { password } = await serverRules(request);
  await expect(page.locator('#new-password-help')).toHaveText(password.requirements);

  await page.fill('#current-password', PASSWORD);
  await page.fill('#new-password', 'N3wPassw0rd!#');
  await page.fill('#confirm-password', 'N3wPassw0rd!#');
  const changed = page.waitForResponse((res) => res.url().endsWith('/api/v1/users/settings/password'));
  await page.click('#password-form button[type="submit"]');
  expect((await changed).status()).toBe(200);
  await expect(page).toHaveURL(/\/login\.html\?passwordChanged=1$/);
});

test('avatar picker refuses a file over the server limit before uploading, and accepts one at the limit', async ({
  page,
  request,
}) => {
  const { avatar } = await serverRules(request);
  await logIn(page, await registerUser(request));
  await page.goto('/settings.html');
  await expect(page.locator('#avatar-help')).toHaveText(`JPG, PNG or WebP, up to ${Math.floor(avatar.maxFileBytes / 1024)} KB.`);

  let profilePatches = 0;
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().endsWith('/api/v1/users/settings/profile')) profilePatches += 1;
  });

  await page.setInputFiles('#avatar-input', {
    name: 'too-big.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(avatar.maxFileBytes + 1, 1),
  });
  await expect(page.locator('#avatar-status')).toHaveText(avatar.tooLargeMessage);
  expect(profilePatches).toBe(0);

  await page.setInputFiles('#avatar-input', {
    name: 'just-fits.png',
    mimeType: 'image/png',
    // The server checks the format by the first bytes: a PNG signature.
    buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(avatar.maxFileBytes - 8, 1)]),
  });
  await expect(page.locator('#avatar-status')).toHaveText('Photo updated.');
  expect(profilePatches).toBe(1);
});

test('a password with leading and trailing spaces works exactly as typed through the forms', async ({ page }) => {
  const spaced = '  Passw0rd! spaced  ';
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const email = `space${suffix}@example.com`;

  await page.goto('/registration.html');
  await page.fill('#username', `space${suffix}`);
  await page.fill('#email', email);
  await page.fill('#password', spaced);
  await page.fill('#repeat-password', spaced);
  await page.click('#registration-form button[type="submit"]');
  await expect(page).toHaveURL(/\/login\.html$/);

  // The trimmed variant must not work: nothing may have trimmed it on the way in.
  await page.fill('#email', email);
  await page.fill('#password', spaced.trim());
  await page.click('#login-form button[type="submit"]');
  await expect(page.locator('#helper-text')).toContainText(/invalid credentials/i);
  await expect(page).toHaveURL(/\/login\.html$/);

  await page.fill('#password', spaced);
  await page.click('#login-form button[type="submit"]');
  await expect(page).toHaveURL(/\/account\.html$/);
});

test('forgot password accepts every address registration accepts ("+" and a long top-level domain)', async ({ page, request }) => {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const email = `fp+${suffix}@example.science`;
  expect((await request.post(`${API}/api/v1/auth/register`, { data: { username: `fp${suffix}`, email, password: PASSWORD } })).status()).toBe(201);

  await page.goto('/forgot_password.html');
  await page.fill('#email', email);
  const sent = page.waitForRequest((req) => req.url().endsWith('/api/v1/auth/forgot-password'), { timeout: 5000 });
  await page.click('#forgot-password-form button[type="submit"]');
  expect(JSON.parse((await sent).postData() || '{}').email).toBe(email);
  await expect(page.locator('#helper-text')).not.toHaveText('Please enter a valid email address.');
});
