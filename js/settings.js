/**
 * settings.js — Settings view
 * Appearance (theme), preferences (notifications, default task view) and
 * account (name, email, avatar color). Everything is stored in localStorage.
 */
(function (global) {
  'use strict';

  const TaskFlow = global.TaskFlow;
  const { Utils, Storage } = TaskFlow;
  const { $, $$ } = Utils;

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let dom = null;

  function get() {
    return Storage.getSettings();
  }

  function getInitials(name) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    const first = words[0].charAt(0);
    const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  function getFirstName() {
    return get().name.trim().split(/\s+/)[0] || 'there';
  }

  /** Pushes name, email and avatar to every place they appear. */
  function applyProfile() {
    const settings = get();
    $$('[data-user-name]').forEach((element) => {
      element.textContent = settings.name;
    });
    $$('[data-user-email]').forEach((element) => {
      element.textContent = settings.email;
    });
    $$('[data-user-avatar]').forEach((element) => {
      element.textContent = getInitials(settings.name);
      element.style.backgroundColor = settings.avatarColor;
    });
  }

  function syncForm() {
    const settings = get();
    dom.name.value = settings.name;
    dom.email.value = settings.email;
    dom.notifications.checked = settings.notificationsEnabled;
    dom.defaultFilter.value = settings.defaultTaskFilter;
    Utils.buildSwatchGroup(dom.avatarSwatches, {
      name: 'avatarColor',
      colors: Storage.AVATAR_COLORS,
      selected: settings.avatarColor,
    });
    syncThemeRadios();
    updateAvatarPreview();
  }

  function syncThemeRadios() {
    const theme = TaskFlow.Theme ? TaskFlow.Theme.getCurrent() : 'light';
    dom.themeRadios.forEach((radio) => {
      radio.checked = radio.value === theme;
    });
  }

  function updateAvatarPreview() {
    const checked = $('input[name="avatarColor"]:checked', dom.avatarSwatches);
    dom.avatarPreview.style.backgroundColor = checked ? checked.value : get().avatarColor;
    dom.avatarPreview.textContent = getInitials(dom.name.value || get().name);
  }

  function setFieldError(input, errorElement, message) {
    errorElement.textContent = message || '';
    errorElement.hidden = !message;
    input.closest('.field').classList.toggle('field--invalid', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function handleProfileSubmit(event) {
    event.preventDefault();
    const name = dom.name.value.trim();
    const email = dom.email.value.trim();
    const nameError = name.length < 2 ? 'Enter a name with at least 2 characters.' : '';
    const emailError = !email ? 'Email is required.' : !EMAIL_PATTERN.test(email) ? 'Enter a valid email address.' : '';
    setFieldError(dom.name, dom.nameError, nameError);
    setFieldError(dom.email, dom.emailError, emailError);
    if (nameError || emailError) {
      (nameError ? dom.name : dom.email).focus();
      return;
    }
    const color = $('input[name="avatarColor"]:checked', dom.avatarSwatches);
    Storage.saveSettings({ name, email, avatarColor: color ? color.value : get().avatarColor });
    applyProfile();
    document.dispatchEvent(new CustomEvent('settings:changed'));
    Utils.showToast('Profile saved successfully.');
  }

  async function handleReset() {
    const confirmed = await Utils.confirmAction({
      title: 'Reset all data',
      message: 'This removes all tasks, categories, settings and notifications and restores the demo tasks.',
      confirmLabel: 'Reset Data',
    });
    if (!confirmed) return;
    Storage.resetAll();
    global.location.hash = '#dashboard';
    global.location.reload();
  }

  function init() {
    dom = {
      themeRadios: $$('input[name="theme"]'),
      notifications: $('#settingNotifications'),
      defaultFilter: $('#settingDefaultFilter'),
      profileForm: $('#profileForm'),
      name: $('#profileName'),
      email: $('#profileEmail'),
      nameError: $('#profileNameError'),
      emailError: $('#profileEmailError'),
      avatarSwatches: $('#avatarSwatches'),
      avatarPreview: $('#avatarPreview'),
      resetButton: $('#resetDataButton'),
    };

    syncForm();
    applyProfile();

    dom.themeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        TaskFlow.Theme.set(radio.value);
        Utils.showToast(`${radio.value === 'dark' ? 'Dark' : 'Light'} mode enabled.`, 'info');
      });
    });
    document.addEventListener('theme:changed', syncThemeRadios);

    dom.notifications.addEventListener('change', () => {
      Storage.saveSettings({ notificationsEnabled: dom.notifications.checked });
      document.dispatchEvent(new CustomEvent('settings:changed'));
      Utils.showToast(dom.notifications.checked ? 'Notifications turned on.' : 'Notifications turned off.', 'info');
    });

    dom.defaultFilter.addEventListener('change', () => {
      Storage.saveSettings({ defaultTaskFilter: dom.defaultFilter.value });
      document.dispatchEvent(new CustomEvent('settings:changed'));
      Utils.showToast('Default task view saved.');
    });

    dom.avatarSwatches.addEventListener('change', updateAvatarPreview);
    dom.name.addEventListener('input', () => {
      updateAvatarPreview();
      setFieldError(dom.name, dom.nameError, '');
    });
    dom.email.addEventListener('input', () => setFieldError(dom.email, dom.emailError, ''));
    dom.profileForm.addEventListener('submit', handleProfileSubmit);
    dom.resetButton.addEventListener('click', handleReset);
  }

  TaskFlow.Settings = { init, get, getFirstName, applyProfile, syncForm };
})(window);
