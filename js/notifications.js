/**
 * notifications.js — notification dropdown
 * Notifications are generated locally from task events and deadlines, stored
 * in localStorage, and shown in the topbar dropdown.
 */
(function (global) {
  'use strict';

  const TaskFlow = global.TaskFlow;
  const { Utils, Storage } = TaskFlow;
  const { $, createElement, createIcon } = Utils;

  const TYPE_ICONS = {
    created: 'plus',
    completed: 'check-circle',
    soon: 'clock',
    overdue: 'alert',
    info: 'info',
  };

  let dom = null;
  let isOpen = false;

  function areEnabled() {
    return Storage.getSettings().notificationsEnabled;
  }

  /* ------------------------------------------------------------------ */
  /* Creating notifications                                              */
  /* ------------------------------------------------------------------ */

  function push(entry) {
    if (!areEnabled()) return null;
    return Storage.addNotification(entry);
  }

  /** Adds "due soon" and "overdue" alerts once per task and due moment. */
  function syncDeadlineAlerts() {
    if (!areEnabled()) return;
    let added = false;
    const now = new Date();
    Storage.getTasks().forEach((task) => {
      if (Utils.isCompleted(task) || !task.dueDate) return;
      const dueKey = `${task.id}:${task.dueDate}:${task.dueTime}`;
      if (Utils.isOverdue(task, now)) {
        added = Boolean(push({ type: 'overdue', key: `overdue:${dueKey}`, message: `Task overdue: “${task.title}”.` })) || added;
      } else if (Utils.isDueSoon(task, now)) {
        const parts = Utils.formatDueParts(task);
        const when = `${parts.day.toLowerCase()}${parts.time ? ` at ${parts.time}` : ''}`;
        added =
          Boolean(push({ type: 'soon', key: `soon:${dueKey}`, message: `Deadline approaching: “${task.title}” is due ${when}.` })) ||
          added;
      }
    });
    if (added) render();
  }

  function handleTaskChange(event) {
    const { type, task } = event.detail;
    if (type === 'created') push({ type: 'created', message: `New task created: “${task.title}”.` });
    if (type === 'completed') push({ type: 'completed', message: `Task completed: “${task.title}”.` });
    syncDeadlineAlerts();
    render();
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function buildItem(notification) {
    const icon = createElement('span', { className: `notif-item__icon notif-item__icon--${notification.type}` }, [
      createIcon(TYPE_ICONS[notification.type]),
    ]);
    const text = createElement('span', { className: 'notif-item__text' }, [
      createElement('span', { className: 'notif-item__message', text: notification.message }),
      createElement('span', { className: 'notif-item__time', text: Utils.formatRelativeTime(notification.createdAt) }),
    ]);
    const button = createElement(
      'button',
      {
        className: `notif-item${notification.read ? '' : ' is-unread'}`,
        attrs: { type: 'button' },
        dataset: { id: notification.id },
      },
      [icon, text]
    );
    if (!notification.read) button.append(createElement('span', { className: 'notif-item__dot', attrs: { 'aria-label': 'Unread' } }));
    return createElement('li', {}, [button]);
  }

  function render() {
    if (!dom) return;
    const notifications = Storage.getNotifications();
    const unread = notifications.filter((item) => !item.read).length;

    dom.badge.hidden = unread === 0;
    dom.badge.textContent = unread > 9 ? '9+' : String(unread);
    dom.button.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
    dom.offNote.hidden = areEnabled();
    dom.markAll.disabled = unread === 0;
    dom.clear.disabled = notifications.length === 0;

    const fragment = document.createDocumentFragment();
    if (notifications.length === 0) {
      fragment.append(
        createElement('li', { className: 'notif__empty' }, [
          createElement('p', { text: 'You’re all caught up.' }),
        ])
      );
    } else {
      notifications.forEach((notification) => fragment.append(buildItem(notification)));
    }
    dom.list.replaceChildren(fragment);
  }

  /* ------------------------------------------------------------------ */
  /* Open / close                                                        */
  /* ------------------------------------------------------------------ */

  function setOpen(open, restoreFocus) {
    if (open === isOpen) return;
    isOpen = open;
    dom.button.setAttribute('aria-expanded', String(open));
    if (open) {
      render();
      dom.panel.hidden = false;
      requestAnimationFrame(() => dom.panel.classList.add('is-open'));
    } else {
      dom.panel.classList.remove('is-open');
      setTimeout(() => {
        if (!isOpen) dom.panel.hidden = true;
      }, 150);
      if (restoreFocus) dom.button.focus();
    }
  }

  function markAllRead() {
    Storage.saveNotifications(Storage.getNotifications().map((item) => ({ ...item, read: true })));
    render();
  }

  function clearAll() {
    Storage.saveNotifications([]);
    render();
  }

  function markRead(id) {
    Storage.saveNotifications(
      Storage.getNotifications().map((item) => (item.id === id ? { ...item, read: true } : item))
    );
    render();
  }

  function init() {
    dom = {
      button: $('#notifButton'),
      badge: $('#notifBadge'),
      panel: $('#notifPanel'),
      list: $('#notifList'),
      markAll: $('#notifMarkAll'),
      clear: $('#notifClear'),
      offNote: $('#notifOffNote'),
    };

    dom.button.addEventListener('click', () => setOpen(!isOpen));
    dom.markAll.addEventListener('click', markAllRead);
    dom.clear.addEventListener('click', clearAll);
    dom.list.addEventListener('click', (event) => {
      const item = event.target.closest('.notif-item');
      if (item) markRead(item.dataset.id);
    });
    document.addEventListener('click', (event) => {
      if (isOpen && !dom.panel.contains(event.target) && !dom.button.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen) setOpen(false, true);
    });
    document.addEventListener('tasks:changed', handleTaskChange);
    document.addEventListener('settings:changed', render);

    syncDeadlineAlerts();
    render();
  }

  TaskFlow.Notifications = { init, render, syncDeadlineAlerts };
})(window);
