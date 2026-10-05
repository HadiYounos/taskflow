/**
 * storage.js — persistence layer
 * The only module that touches localStorage. It validates everything it reads,
 * falls back to in-memory storage if the browser blocks localStorage, and
 * never throws: a broken store degrades to default state instead of crashing.
 */
(function (global) {
  'use strict';

  const TaskFlow = global.TaskFlow;
  const { Utils } = TaskFlow;

  const KEYS = {
    tasks: 'taskflow.tasks',
    categories: 'taskflow.categories',
    theme: 'taskflow.theme',
    settings: 'taskflow.settings',
    notifications: 'taskflow.notifications',
    seeded: 'taskflow.seeded',
  };

  const MAX_NOTIFICATIONS = 50;
  const FALLBACK_CATEGORY_COLOR = '#64748B';
  const FILTER_IDS = ['all', 'today', 'upcoming', 'completed', 'in-progress', 'overdue'];

  const DEFAULT_CATEGORIES = [
    { name: 'Work', color: '#2563EB' },
    { name: 'Personal', color: '#7C3AED' },
    { name: 'Study', color: '#B45309' },
    { name: 'Development', color: '#0F766E' },
    { name: 'Design', color: '#BE185D' },
  ];

  const CATEGORY_COLORS = [
    { value: '#2563EB', label: 'Blue' },
    { value: '#7C3AED', label: 'Violet' },
    { value: '#B45309', label: 'Amber' },
    { value: '#0F766E', label: 'Teal' },
    { value: '#BE185D', label: 'Pink' },
    { value: '#DC2626', label: 'Red' },
    { value: '#4D7C0F', label: 'Green' },
    { value: '#475569', label: 'Slate' },
  ];

  const AVATAR_COLORS = [
    { value: '#0F766E', label: 'Teal' },
    { value: '#2563EB', label: 'Blue' },
    { value: '#7C3AED', label: 'Violet' },
    { value: '#BE185D', label: 'Pink' },
    { value: '#B45309', label: 'Amber' },
    { value: '#475569', label: 'Slate' },
  ];

  const DEFAULT_SETTINGS = {
    name: 'Alex Morgan',
    email: 'alex@example.com',
    avatarColor: '#0F766E',
    notificationsEnabled: true,
    defaultTaskFilter: 'all',
  };

  /* In-memory overlay: used when localStorage is blocked or a write fails. */
  const memoryStore = new Map();
  const errorListeners = [];
  let persistent = detectLocalStorage();
  let tasksCache = null;
  let categoriesCache = null;

  function detectLocalStorage() {
    try {
      const probe = '__taskflow_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (error) {
      return false;
    }
  }

  function isPersistent() {
    return persistent;
  }

  function onError(listener) {
    errorListeners.push(listener);
  }

  function reportError(error) {
    console.warn('[TaskFlow] Storage problem:', error);
    errorListeners.forEach((listener) => listener(error));
  }

  function readJSON(key, fallback) {
    try {
      const raw = memoryStore.has(key)
        ? memoryStore.get(key)
        : persistent
          ? global.localStorage.getItem(key)
          : null;
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`[TaskFlow] Ignoring unreadable data for "${key}".`, error);
      return fallback;
    }
  }

  /** Returns true when the value reached localStorage. */
  function writeJSON(key, value) {
    const raw = JSON.stringify(value);
    if (!persistent) {
      memoryStore.set(key, raw);
      return false;
    }
    try {
      global.localStorage.setItem(key, raw);
      memoryStore.delete(key);
      return true;
    } catch (error) {
      memoryStore.set(key, raw);
      reportError(error);
      return false;
    }
  }

  function removeKey(key) {
    memoryStore.delete(key);
    if (!persistent) return;
    try {
      global.localStorage.removeItem(key);
    } catch (error) {
      reportError(error);
    }
  }

  function invalidateCache() {
    tasksCache = null;
    categoriesCache = null;
  }

  /* ------------------------------------------------------------------ */
  /* Tasks                                                               */
  /* ------------------------------------------------------------------ */

  function sanitizeTask(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) return null;
    const createdAt =
      typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
        ? raw.createdAt
        : new Date().toISOString();
    return {
      id: raw.id !== undefined && raw.id !== null ? String(raw.id) : Utils.generateId(),
      title: title.slice(0, 120),
      description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : '',
      category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'Personal',
      priority: Utils.PRIORITIES.includes(raw.priority) ? raw.priority : 'Medium',
      status: Utils.STATUSES.includes(raw.status) ? raw.status : 'Todo',
      dueDate: Utils.isValidDateString(raw.dueDate) ? raw.dueDate : '',
      dueTime: Utils.isValidTimeString(raw.dueTime) ? raw.dueTime : '',
      createdAt,
      completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : '',
    };
  }

  /** Treat the returned array and its objects as read-only. */
  function getTasks() {
    if (tasksCache) return tasksCache;
    const stored = readJSON(KEYS.tasks, []);
    tasksCache = Array.isArray(stored) ? stored.map(sanitizeTask).filter(Boolean) : [];
    return tasksCache;
  }

  function saveTasks(tasks) {
    tasksCache = tasks;
    return writeJSON(KEYS.tasks, tasks);
  }

  function getTaskById(id) {
    return getTasks().find((task) => task.id === id) || null;
  }

  function addTask(data) {
    const task = sanitizeTask({ ...data, id: Utils.generateId() });
    if (!task) return null;
    saveTasks([...getTasks(), task]);
    return task;
  }

  function updateTask(id, changes) {
    const tasks = getTasks();
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return null;
    const updated = sanitizeTask({ ...tasks[index], ...changes, id });
    if (!updated) return null;
    const next = tasks.slice();
    next[index] = updated;
    saveTasks(next);
    return updated;
  }

  function deleteTask(id) {
    const tasks = getTasks();
    const next = tasks.filter((task) => task.id !== id);
    if (next.length === tasks.length) return false;
    saveTasks(next);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Categories                                                          */
  /* ------------------------------------------------------------------ */

  function sanitizeCategory(raw) {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) return null;
    const color = typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : FALLBACK_CATEGORY_COLOR;
    return { name: raw.name.trim().slice(0, 24), color };
  }

  function getCategories() {
    if (categoriesCache) return categoriesCache;
    const stored = readJSON(KEYS.categories, null);
    const seen = new Set();
    const valid = Array.isArray(stored)
      ? stored.map(sanitizeCategory).filter((category) => {
          if (!category || seen.has(category.name.toLowerCase())) return false;
          seen.add(category.name.toLowerCase());
          return true;
        })
      : [];
    categoriesCache = valid.length ? valid : DEFAULT_CATEGORIES.map((category) => ({ ...category }));
    return categoriesCache;
  }

  function saveCategories(categories) {
    categoriesCache = categories;
    return writeJSON(KEYS.categories, categories);
  }

  function addCategory(name, color) {
    const category = sanitizeCategory({ name, color });
    if (!category) return null;
    saveCategories([...getCategories(), category]);
    return category;
  }

  function removeCategory(name) {
    const categories = getCategories();
    if (categories.length <= 1) return false;
    const next = categories.filter((category) => category.name !== name);
    if (next.length === categories.length) return false;
    saveCategories(next);
    return true;
  }

  function getCategoryColorMap() {
    return new Map(getCategories().map((category) => [category.name, category.color]));
  }

  function getCategoryColor(name) {
    return getCategoryColorMap().get(name) || FALLBACK_CATEGORY_COLOR;
  }

  /* ------------------------------------------------------------------ */
  /* Settings and theme                                                  */
  /* ------------------------------------------------------------------ */

  function getSettings() {
    const stored = readJSON(KEYS.settings, {});
    const settings = { ...DEFAULT_SETTINGS };
    if (!stored || typeof stored !== 'object') return settings;
    if (typeof stored.name === 'string' && stored.name.trim()) settings.name = stored.name.trim().slice(0, 40);
    if (typeof stored.email === 'string' && stored.email.trim()) settings.email = stored.email.trim().slice(0, 80);
    if (AVATAR_COLORS.some((color) => color.value === stored.avatarColor)) {
      settings.avatarColor = stored.avatarColor;
    }
    if (typeof stored.notificationsEnabled === 'boolean') settings.notificationsEnabled = stored.notificationsEnabled;
    if (FILTER_IDS.includes(stored.defaultTaskFilter)) settings.defaultTaskFilter = stored.defaultTaskFilter;
    return settings;
  }

  function saveSettings(changes) {
    const next = { ...getSettings(), ...changes };
    writeJSON(KEYS.settings, next);
    return next;
  }

  function getTheme() {
    const theme = readJSON(KEYS.theme, null);
    return theme === 'light' || theme === 'dark' ? theme : null;
  }

  function setTheme(theme) {
    writeJSON(KEYS.theme, theme);
  }

  /* ------------------------------------------------------------------ */
  /* Notifications                                                       */
  /* ------------------------------------------------------------------ */

  function sanitizeNotification(raw) {
    if (!raw || typeof raw.message !== 'string' || !raw.message) return null;
    return {
      id: typeof raw.id === 'string' ? raw.id : Utils.generateId(),
      type: ['created', 'completed', 'soon', 'overdue', 'info'].includes(raw.type) ? raw.type : 'info',
      message: raw.message.slice(0, 200),
      key: typeof raw.key === 'string' ? raw.key : '',
      createdAt:
        typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
          ? raw.createdAt
          : new Date().toISOString(),
      read: Boolean(raw.read),
    };
  }

  function getNotifications() {
    const stored = readJSON(KEYS.notifications, []);
    return Array.isArray(stored) ? stored.map(sanitizeNotification).filter(Boolean) : [];
  }

  function saveNotifications(notifications) {
    return writeJSON(KEYS.notifications, notifications.slice(0, MAX_NOTIFICATIONS));
  }

  /** Newest first. A repeated `key` is ignored so alerts fire once. */
  function addNotification({ type, message, key }) {
    const list = getNotifications();
    if (key && list.some((item) => item.key === key)) return null;
    const entry = sanitizeNotification({
      id: Utils.generateId(),
      type,
      message,
      key: key || '',
      createdAt: new Date().toISOString(),
      read: false,
    });
    if (!entry) return null;
    saveNotifications([entry, ...list]);
    return entry;
  }

  /* ------------------------------------------------------------------ */
  /* Demo data (first run only) and reset                                */
  /* ------------------------------------------------------------------ */

  function hoursAgo(hours) {
    return new Date(Date.now() - hours * 3600000).toISOString();
  }

  function buildDemoTasks() {
    const today = Utils.todayISO();
    const shift = (days) => Utils.addDays(today, days);
    return [
      { title: 'Complete Portfolio', description: 'Polish the case studies and ship the portfolio homepage.', category: 'Development', priority: 'High', status: 'In Progress', dueDate: today, dueTime: '', createdAt: hoursAgo(96) },
      { title: 'Study JavaScript', description: 'Review closures, promises and the event loop.', category: 'Study', priority: 'Medium', status: 'Todo', dueDate: today, dueTime: '21:00', createdAt: hoursAgo(80) },
      { title: 'Review pull requests', description: 'Leave feedback on the open pull requests.', category: 'Work', priority: 'Low', status: 'Completed', dueDate: today, dueTime: '10:00', createdAt: hoursAgo(72), completedAt: hoursAgo(2) },
      { title: 'Update LinkedIn profile', description: 'Add the latest projects and refresh the headline.', category: 'Personal', priority: 'Medium', status: 'Todo', dueDate: today, dueTime: '', createdAt: hoursAgo(60) },
      { title: 'Design Landing Page', description: 'Sketch the hero and feature sections in Figma.', category: 'Design', priority: 'High', status: 'Todo', dueDate: shift(1), dueTime: '12:00', createdAt: hoursAgo(48) },
      { title: 'Prepare interview talking points', description: 'Write short stories about three recent projects.', category: 'Work', priority: 'High', status: 'Todo', dueDate: shift(2), dueTime: '09:30', createdAt: hoursAgo(36) },
      { title: 'Finish Project Documentation', description: 'Complete the README and add setup instructions.', category: 'Work', priority: 'Medium', status: 'In Progress', dueDate: shift(3), dueTime: '17:00', createdAt: hoursAgo(30) },
      { title: 'Plan weekend trip', description: 'Pick a destination and book transport.', category: 'Personal', priority: 'Low', status: 'Todo', dueDate: shift(6), dueTime: '', createdAt: hoursAgo(20) },
      { title: 'Fix navbar bug', description: 'The mobile menu does not close after selecting a link.', category: 'Development', priority: 'High', status: 'Todo', dueDate: shift(-1), dueTime: '16:00', createdAt: hoursAgo(120) },
      { title: 'Read about CSS container queries', description: 'Take notes on two articles.', category: 'Study', priority: 'Low', status: 'Completed', dueDate: shift(-1), dueTime: '', createdAt: hoursAgo(110), completedAt: hoursAgo(26) },
    ];
  }

  /** Adds demo tasks once, and only when no tasks exist yet. */
  function seedDemoDataIfNeeded() {
    if (readJSON(KEYS.seeded, false)) return false;
    const existing = readJSON(KEYS.tasks, null);
    const hasTasks = Array.isArray(existing) && existing.length > 0;
    writeJSON(KEYS.seeded, true);
    if (hasTasks) return false;
    tasksCache = null;
    saveTasks(buildDemoTasks().map(sanitizeTask).filter(Boolean));
    addNotification({ type: 'info', message: 'Welcome to TaskFlow! We added a few demo tasks to get you started.' });
    return true;
  }

  /** Clears tasks, categories, settings and notifications. Theme is kept. */
  function resetAll() {
    [KEYS.tasks, KEYS.categories, KEYS.settings, KEYS.notifications, KEYS.seeded].forEach(removeKey);
    invalidateCache();
  }

  TaskFlow.Storage = {
    KEYS,
    DEFAULT_CATEGORIES,
    CATEGORY_COLORS,
    AVATAR_COLORS,
    FILTER_IDS,
    isPersistent,
    onError,
    invalidateCache,
    getTasks,
    saveTasks,
    getTaskById,
    addTask,
    updateTask,
    deleteTask,
    getCategories,
    saveCategories,
    addCategory,
    removeCategory,
    getCategoryColorMap,
    getCategoryColor,
    getSettings,
    saveSettings,
    getTheme,
    setTheme,
    getNotifications,
    saveNotifications,
    addNotification,
    seedDemoDataIfNeeded,
    resetAll,
  };
})(window);
