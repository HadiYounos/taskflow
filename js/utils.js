/**
 * utils.js — shared helpers
 * DOM helpers, SVG icons, date logic, task-state predicates, modal and toast UI.
 *
 * All scripts are plain (non-module) files exposed on window.TaskFlow, so the
 * project also works when index.html is opened directly from the file system.
 */
(function (global) {
  'use strict';

  const TaskFlow = (global.TaskFlow = global.TaskFlow || {});

  const PRIORITIES = ['Low', 'Medium', 'High'];
  const STATUSES = ['Todo', 'In Progress', 'Completed'];
  const PRIORITY_WEIGHT = { Low: 1, Medium: 2, High: 3 };
  const DAY_MS = 86400000;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------ */
  /* Icons (stroke-based, 24x24). Built with createElementNS, never innerHTML. */
  /* ------------------------------------------------------------------ */

  const ICON_PATHS = {
    layout: ['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
    check: ['M20 6 9 17l-5-5'],
    'check-circle': ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
    tag: ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', 'M7 7h.01'],
    sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
    'log-out': ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
    search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M21 21l-4.35-4.35'],
    plus: ['M12 5v14', 'M5 12h14'],
    bell: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
    sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M6.34 17.66l-1.41 1.41', 'M19.07 4.93l-1.41 1.41'],
    moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
    menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
    x: ['M18 6 6 18', 'M6 6l12 12'],
    edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'],
    trash: ['M3 6h18', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6', 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'],
    clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6v6l4 2'],
    alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
    info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 16v-4', 'M12 8h.01'],
    flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
    'trending-up': ['M23 6l-9.5 9.5-5-5L1 18', 'M17 6h6v6'],
    'hard-drive': ['M22 12H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z', 'M6 16h.01', 'M10 16h.01'],
    inbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
    loader: ['M21 12a9 9 0 1 1-6.22-8.56'],
    'arrow-right': ['M5 12h14', 'M12 5l7 7-7 7'],
    code: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
    shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
    zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  };

  function createIcon(name, className) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', className ? `icon ${className}` : 'icon');
    (ICON_PATHS[name] || []).forEach((definition) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', definition);
      svg.appendChild(path);
    });
    return svg;
  }

  /** Fills every [data-icon] host with its SVG (static markup stays tiny). */
  function hydrateIcons(scope) {
    (scope || document).querySelectorAll('[data-icon]').forEach((host) => {
      if (host.dataset.iconReady) return;
      host.prepend(createIcon(host.dataset.icon));
      host.dataset.iconReady = '1';
    });
  }

  /* ------------------------------------------------------------------ */
  /* DOM helpers                                                         */
  /* ------------------------------------------------------------------ */

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.from((scope || document).querySelectorAll(selector));
  }

  /** Creates an element with textContent (safe for user data) and children. */
  function createElement(tag, options, children) {
    const settings = options || {};
    const element = document.createElement(tag);
    if (settings.className) element.className = settings.className;
    if (settings.text !== undefined) element.textContent = settings.text;
    if (settings.attrs) {
      Object.entries(settings.attrs).forEach(([name, value]) => {
        if (value === undefined || value === null || value === false) return;
        element.setAttribute(name, value === true ? '' : String(value));
      });
    }
    if (settings.dataset) {
      Object.entries(settings.dataset).forEach(([name, value]) => {
        element.dataset[name] = value;
      });
    }
    [].concat(children || []).forEach((child) => {
      if (child) element.append(child);
    });
    return element;
  }

  function debounce(callback, delay) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => callback.apply(this, args), delay);
    };
  }

  function pluralize(count, singular, plural) {
    return count === 1 ? singular : plural || `${singular}s`;
  }

  function generateId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Builds a radio-based color swatch group. Colors: [{ value, label }]. */
  function buildSwatchGroup(container, { name, colors, selected }) {
    const fragment = document.createDocumentFragment();
    colors.forEach((color, index) => {
      const input = createElement('input', {
        className: 'swatch__input',
        attrs: {
          type: 'radio',
          name,
          value: color.value,
          'aria-label': color.label,
          checked: color.value === selected || (!selected && index === 0),
        },
      });
      const dot = createElement('span', { className: 'swatch__dot' });
      dot.style.backgroundColor = color.value;
      fragment.append(createElement('label', { className: 'swatch' }, [input, dot]));
    });
    container.replaceChildren(fragment);
  }

  /* ------------------------------------------------------------------ */
  /* Dates and times (all local time, ISO-like strings)                  */
  /* ------------------------------------------------------------------ */

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function parseLocalDate(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(isoDate, amount) {
    const date = parseLocalDate(isoDate);
    date.setDate(date.getDate() + amount);
    return toISODate(date);
  }

  function isValidDateString(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    return toISODate(parseLocalDate(value)) === value;
  }

  function isValidTimeString(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  /** Due moment for a task. A date without a time means "end of that day". */
  function getDueDateTime(task) {
    if (!task.dueDate) return null;
    const [year, month, day] = task.dueDate.split('-').map(Number);
    const [hours, minutes] = (task.dueTime || '23:59').split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }

  function formatTime(time) {
    const [hours, minutes] = time.split(':').map(Number);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }

  /** Returns { day, time } such as { day: 'Today', time: '6:00 PM' }. */
  function formatDueParts(task) {
    if (!task.dueDate) return { day: 'No due date', time: '' };
    const today = parseLocalDate(todayISO());
    const due = parseLocalDate(task.dueDate);
    const difference = Math.round((due - today) / DAY_MS);
    let day;
    if (difference === 0) day = 'Today';
    else if (difference === 1) day = 'Tomorrow';
    else if (difference === -1) day = 'Yesterday';
    else {
      const options = { month: 'short', day: 'numeric' };
      if (due.getFullYear() !== today.getFullYear()) options.year = 'numeric';
      day = due.toLocaleDateString('en-US', options);
    }
    return { day, time: task.dueTime ? formatTime(task.dueTime) : '' };
  }

  function formatLongDate(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function formatRelativeTime(isoString) {
    const minutes = Math.floor((Date.now() - Date.parse(isoString)) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* ------------------------------------------------------------------ */
  /* Task state predicates                                               */
  /* ------------------------------------------------------------------ */

  function isCompleted(task) {
    return task.status === 'Completed';
  }

  function isOverdue(task, now) {
    if (isCompleted(task)) return false;
    const due = getDueDateTime(task);
    return due !== null && due < (now || new Date());
  }

  function isDueToday(task) {
    return task.dueDate === todayISO();
  }

  function isUpcoming(task) {
    return !isCompleted(task) && Boolean(task.dueDate) && task.dueDate > todayISO();
  }

  /** Open task due within the next 24 hours and not yet overdue. */
  function isDueSoon(task, now) {
    if (isCompleted(task) || isOverdue(task, now)) return false;
    const due = getDueDateTime(task);
    if (!due) return false;
    return due - (now || new Date()) <= DAY_MS;
  }

  /* ------------------------------------------------------------------ */
  /* Modals (accessible: focus trap, Escape, focus restore)              */
  /* ------------------------------------------------------------------ */

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function getFocusable(container) {
    return $$(FOCUSABLE, container).filter((element) => !element.hidden && element.getClientRects().length > 0);
  }

  function trapFocus(event, modal) {
    const focusable = getFocusable(modal);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Wires backdrop click, [data-close-modal] buttons, Escape and Tab trapping. */
  function initModal(modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-close-modal]')) closeModal(modal);
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeModal(modal);
      } else if (event.key === 'Tab') {
        trapFocus(event, modal);
      }
    });
  }

  function openModal(modal) {
    if (modal._closeTimer) {
      clearTimeout(modal._closeTimer);
      modal._closeTimer = null;
      modal.hidden = true;
    }
    if (!modal.hidden) return;
    modal._returnFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('has-modal');
    requestAnimationFrame(() => {
      modal.classList.add('is-open');
      const target = $('[data-autofocus]', modal) || getFocusable(modal)[0];
      if (target) target.focus();
    });
  }

  function closeModal(modal) {
    if (modal.hidden || modal._closeTimer) return;
    modal.classList.remove('is-open');
    modal.dispatchEvent(new CustomEvent('modal:close'));
    modal._closeTimer = setTimeout(() => {
      modal._closeTimer = null;
      modal.hidden = true;
      if (!document.querySelector('.modal:not([hidden])')) document.body.classList.remove('has-modal');
      const previous = modal._returnFocus;
      modal._returnFocus = null;
      const fallback = document.getElementById('main');
      if (previous && document.contains(previous) && typeof previous.focus === 'function') previous.focus();
      else if (fallback) fallback.focus({ preventScroll: true });
    }, 180);
  }

  /** Shows the shared confirmation dialog. Resolves true (confirmed) or false. */
  function confirmAction({ title, message, detail, confirmLabel }) {
    const modal = $('#confirmModal');
    const acceptButton = $('#confirmAccept');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    const detailElement = $('#confirmDetail');
    detailElement.textContent = detail || '';
    detailElement.hidden = !detail;
    acceptButton.textContent = confirmLabel || 'Confirm';

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        acceptButton.removeEventListener('click', onAccept);
        modal.removeEventListener('modal:close', onClose);
        if (result) closeModal(modal);
        resolve(result);
      };
      const onAccept = () => finish(true);
      const onClose = () => finish(false);
      acceptButton.addEventListener('click', onAccept);
      modal.addEventListener('modal:close', onClose);
      openModal(modal);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Toasts                                                              */
  /* ------------------------------------------------------------------ */

  const TOAST_ICONS = { success: 'check-circle', error: 'alert', info: 'info' };

  function dismissToast(toast) {
    if (!toast.isConnected || toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  }

  function showToast(message, type, duration) {
    const region = $('#toastRegion');
    if (!region) return;
    const kind = type || 'success';
    const closeButton = createElement('button', {
      className: 'toast__close',
      attrs: { type: 'button', 'aria-label': 'Dismiss notification' },
    }, [createIcon('x')]);
    const toast = createElement('div', { className: `toast toast--${kind}` }, [
      createIcon(TOAST_ICONS[kind] || 'info', 'toast__icon'),
      createElement('p', { className: 'toast__message', text: message }),
      closeButton,
    ]);
    closeButton.addEventListener('click', () => dismissToast(toast));
    region.append(toast);
    while (region.children.length > 4) region.firstElementChild.remove();
    setTimeout(() => dismissToast(toast), duration || 3500);
  }

  TaskFlow.Utils = {
    PRIORITIES,
    STATUSES,
    PRIORITY_WEIGHT,
    $,
    $$,
    createElement,
    createIcon,
    hydrateIcons,
    buildSwatchGroup,
    debounce,
    pluralize,
    generateId,
    toISODate,
    todayISO,
    addDays,
    parseLocalDate,
    isValidDateString,
    isValidTimeString,
    getDueDateTime,
    formatTime,
    formatDueParts,
    formatLongDate,
    formatRelativeTime,
    isCompleted,
    isOverdue,
    isDueToday,
    isUpcoming,
    isDueSoon,
    initModal,
    openModal,
    closeModal,
    confirmAction,
    showToast,
  };
})(window);
