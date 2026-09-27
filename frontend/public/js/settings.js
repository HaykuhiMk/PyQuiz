import { api, requireAuth } from './api.js';
import { showToast } from './ui.js';
import { mountIcons } from './icons.js';
import { setTheme, getActiveTheme } from './theme.js';

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  mountIcons(document.querySelector('main'));
  bindSettings();
  bindThemeChoice();

  try {
    const profile = await api.getMe();
    updateUI(profile);
  } catch (error) {
    console.error(error);
    window.location.href = '/login.html';
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
  const avatarInput = document.getElementById('avatar-input');
  const uploadBtn = document.getElementById('upload-avatar-btn');
  const removeBtn = document.getElementById('remove-avatar-btn');

  uploadBtn.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      setStatus('avatar-status', 'File must be under 500KB.', true);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
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

    // Same rule the API enforces; checked here so the message is specific.
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_])[A-Za-z\d@$!%*?&_]{8,}$/.test(newPassword)) {
      setStatus('password-status', 'New password must be at least 8 characters long, with an uppercase letter, a lowercase letter, a number and one of @ $ ! % * ? & _.', true);
      return;
    }

    try {
      await api.changePassword({ currentPassword, newPassword });
      event.target.reset();
      setStatus('password-status', 'Password updated.');
      showToast('Password changed successfully', 'success');
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
      localStorage.removeItem('adminToken');
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
