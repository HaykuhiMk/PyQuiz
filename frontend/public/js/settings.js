import { api, requireAuth } from './api.js';
import { getPasswordRule, showPasswordRequirements, getAvatarRule } from './validationRules.js';
import { showToast } from './ui.js';
import { icon, mountIcons } from './icons.js';
import { setTheme, getActiveTheme } from './theme.js';

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await requireAuth())) return;

  mountIcons(document.querySelector('main'));
  bindSettings();
  bindThemeChoice();

  try {
    const profile = await api.getMe();
    updateUI(profile);
  } catch (error) {
    // Only a missing or expired session (or a deleted account) means
    // logging in again; otherwise say what went wrong and offer a retry.
    if (error.status === 401 || error.status === 404) {
      window.location.href = '/login.html';
      return;
    }
    const banner = document.createElement('div');
    banner.className = 'pq-banner pq-banner--coral';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `${icon('alert')}<span class="pq-banner__text"></span><button type="button" class="secondary-btn">Try again</button>`;
    banner.querySelector('.pq-banner__text').textContent = `Your settings couldn't be loaded. ${error.message}`;
    banner.querySelector('button').addEventListener('click', () => window.location.reload());
    document.querySelector('main').prepend(banner);
  }
});

function updateUI(profile) {
  const email = profile.email || 'N/A';

  document.getElementById('settings-display-name').textContent = profile.username;
  document.getElementById('settings-email-readonly').textContent = email;
  document.getElementById('settings-email-display').textContent = email;
  document.getElementById('settings-username').value = profile.username || '';

  renderAvatar(profile.avatar);
}

function renderAvatar(avatar) {
  const img = document.getElementById('avatar-image');
  const icon = document.getElementById('avatar-icon');
  const removeBtn = document.getElementById('remove-avatar-btn');

  if (avatar) {
    img.src = avatar;
    img.hidden = false;
    icon.hidden = true;
    removeBtn.hidden = false;
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    icon.hidden = false;
    removeBtn.hidden = true;
  }
}

function setStatus(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = `settings-status pq-status ${isError ? 'error' : 'success'}`;
}

function bindSettings() {
  showPasswordRequirements(document.getElementById('new-password-help'));
  getAvatarRule().then((rule) => {
    const help = document.getElementById('avatar-help');
    if (rule && help) help.textContent = `JPG, PNG or WebP, up to ${Math.floor(rule.maxFileBytes / 1024)} KB.`;
  });
  const avatarInput = document.getElementById('avatar-input');
  const uploadBtn = document.getElementById('upload-avatar-btn');
  const removeBtn = document.getElementById('remove-avatar-btn');

  uploadBtn.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    // The server's real limit (GET /validation-rules): checked before the
    // file is even read, and again on the encoded data URL, so an oversized
    // image never gets uploaded.
    const avatarRule = await getAvatarRule();
    if (avatarRule && file.size > avatarRule.maxFileBytes) {
      setStatus('avatar-status', avatarRule.tooLargeMessage, true);
      avatarInput.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (avatarRule && dataUrl.length > avatarRule.maxDataUrlLength) {
        setStatus('avatar-status', avatarRule.tooLargeMessage, true);
        return;
      }
      await api.updateProfile({ avatar: dataUrl });
      renderAvatar(dataUrl);
      setStatus('avatar-status', 'Photo updated.');
      showToast('Profile photo updated', 'success');
    } catch (error) {
      setStatus('avatar-status', error.message, true);
    } finally {
      avatarInput.value = '';
    }
  });

  removeBtn.addEventListener('click', async () => {
    try {
      await api.updateProfile({ avatar: null });
      renderAvatar(null);
      setStatus('avatar-status', 'Photo removed.');
      showToast('Profile photo removed', 'success');
    } catch (error) {
      setStatus('avatar-status', error.message, true);
    }
  });

  document.getElementById('username-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('settings-username').value.trim();
    try {
      const result = await api.updateProfile({ username });
      document.getElementById('settings-display-name').textContent = result.username;
      setStatus('username-status', 'Name saved.');
      showToast('Display name updated', 'success');
    } catch (error) {
      setStatus('username-status', error.message, true);
    }
  });

  document.getElementById('password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
      setStatus('password-status', 'New passwords do not match.', true);
      return;
    }

    // The server's own rule (see validationRules.js), checked here so the
    // message is specific; if it couldn't be loaded, the API still validates.
    const passwordRule = await getPasswordRule();
    if (passwordRule && !passwordRule.test(newPassword)) {
      setStatus('password-status', `New password requirements: ${passwordRule.requirements}`, true);
      return;
    }

    try {
      await api.changePassword({ currentPassword, newPassword });
      // Changing the password invalidates every session, including this
      // browser's own current one (docs/AUDIT.md Phase 4) — log out and
      // send the user to log back in with the new password, rather than
      // leaving them on a page whose session cookie no longer works.
      await api.logout().catch((error) => console.error('Logout request failed:', error));
      window.location.href = '/login.html?passwordChanged=1';
    } catch (error) {
      setStatus('password-status', error.message, true);
    }
  });

  document.getElementById('delete-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const confirmed = window.confirm(
      'Are you sure? This will permanently delete your account and all progress.'
    );
    if (!confirmed) return;

    const password = document.getElementById('delete-password').value;
    try {
      await api.deleteAccount({ password });
      await api.logout().catch((error) => console.error('Logout request failed:', error));
      document.cookie = 'guestMode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      window.location.href = '/login.html';
    } catch (error) {
      setStatus('delete-status', error.message, true);
    }
  });
}

// Mirrors the existing theme preference (theme.js); the top-bar toggle and
// this control stay in sync by watching <html data-theme>.
function bindThemeChoice() {
  const group = document.getElementById('settings-theme');
  if (!group) return;
  const buttons = group.querySelectorAll('[data-theme-choice]');

  const sync = () => {
    const active = getActiveTheme();
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === active));
    });
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => setTheme(button.dataset.themeChoice));
  });

  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  sync();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
