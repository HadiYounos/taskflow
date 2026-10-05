/**
 * dashboard.js — dashboard controller
 * Hash-based view routing, statistics, today's progress, filtering, search,
 * sorting and the categories view. Rendering of individual task cards is
 * delegated to tasks.js.
 *
 * Routes: #dashboard, #tasks[/filter], #categories, #settings
 * Filter ids: all, today, upcoming, completed, in-progress, overdue
 */
(function (global) {
  'use strict';

  const TaskFlow = global.TaskFlow;
  const { Utils, Storage, Tasks, Notifications, Settings } = TaskFlow;
  const { $, $$, createElement, createIcon } = Utils;

  const SECTION_TITLES = { dashboard: 'Dashboard', tasks: 'My Tasks', categories: 'Categories', settings: 'Settings' };
  const FILTER_ROUTE_TITLES = { today: 'Today', upcoming: 'Upcoming', completed: 'Completed' };
  const DESKTOP_QUERY = '(min-width: 1025px)';
  const REFRESH_INTERVAL_MS = 60000;

  const EMPTY_MESSAGES = {
    today: { icon: 'calendar', title: 'Nothing due today', text: 'Enjoy the breathing room, or add something new.' },
    upcoming: { icon: 'calendar', title: 'No upcoming tasks', text: 'Tasks with a future due date will show up here.' },
    completed: { icon: 'check-circle', title: 'No completed tasks yet', text: 'Finish a task and it will appear here.' },
    'in-progress': { icon: 'loader', title: 'Nothing in progress', text: 'Start a task and mark it as In Progress.' },
    overdue: { icon: 'check-circle', title: 'No overdue tasks', text: 'You’re all caught up.' },
  };

  const state = { section: 'dashboard', routeFilter: null, filter: 'all', search: '', sort: 'newest', category: null };
  let dom = null;
  let lastOverdueSignature = '';
  let warnedAboutStorage = false;

  /* ------------------------------------------------------------------ */
  /* Pure data functions                                                 */
  /* ------------------------------------------------------------------ */

  function matchesFilter(task, filter) {
    switch (filter) {
      case 'today':
        return Utils.isDueToday(task);
      case 'upcoming':
        return Utils.isUpcoming(task);
      case 'completed':
        return Utils.isCompleted(task);
      case 'in-progress':
        return task.status === 'In Progress';
      case 'overdue':
        return Utils.isOverdue(task);
      default:
        return true;
    }
  }

  function filterTasks(tasks, filter) {
    return tasks.filter((task) => matchesFilter(task, filter));
  }

  function searchTasks(tasks, query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return tasks;
    return tasks.filter((task) =>
      [task.title, task.description, task.category].some((text) => text.toLowerCase().includes(needle))
    );
  }

  function compareDueDate(a, b) {
    const dueA = Utils.getDueDateTime(a);
    const dueB = Utils.getDueDateTime(b);
    if (dueA && dueB) return dueA - dueB;
    if (dueA) return -1;
    if (dueB) return 1;
    return 0;
  }

  /** Stable sort: ties keep their stored order. */
  function sortTasks(tasks, sortKey) {
    const indexed = tasks.map((task, index) => ({ task, index }));
    const byTitle = (a, b) => a.task.title.localeCompare(b.task.title, undefined, { sensitivity: 'base' });
    const comparators = {
      newest: (a, b) => Date.parse(b.task.createdAt) - Date.parse(a.task.createdAt) || b.index - a.index,
      oldest: (a, b) => Date.parse(a.task.createdAt) - Date.parse(b.task.createdAt) || a.index - b.index,
      priority: (a, b) =>
        Utils.PRIORITY_WEIGHT[b.task.priority] - Utils.PRIORITY_WEIGHT[a.task.priority] ||
        compareDueDate(a.task, b.task) ||
        byTitle(a, b),
      dueDate: (a, b) => compareDueDate(a.task, b.task) || byTitle(a, b),
      alphabetical: byTitle,
    };
    return indexed.sort(comparators[sortKey] || comparators.newest).map((entry) => entry.task);
  }

  function calculateStats(tasks) {
    return {
      total: tasks.length,
      completed: tasks.filter(Utils.isCompleted).length,
      inProgress: tasks.filter((task) => task.status === 'In Progress').length,
      overdue: tasks.filter((task) => Utils.isOverdue(task)).length,
    };
  }

  /** Progress = completed tasks out of the tasks due today. */
  function calculateProgress(tasks) {
    const dueToday = tasks.filter(Utils.isDueToday);
    const done = dueToday.filter(Utils.isCompleted).length;
    return {
      total: dueToday.length,
      done,
      remaining: dueToday.length - done,
      percent: dueToday.length ? Math.round((done / dueToday.length) * 100) : 0,
    };
  }

  function getVisibleTasks(allTasks) {
    let tasks = filterTasks(allTasks, state.filter);
    if (state.category) tasks = tasks.filter((task) => task.category === state.category);
    return sortTasks(searchTasks(tasks, state.search), state.sort);
  }

  /* ------------------------------------------------------------------ */
  /* Routing                                                             */
  /* ------------------------------------------------------------------ */

  function parseHash() {
    const [section, filter] = global.location.hash.replace(/^#\/?/, '').split('/');
    const validSection = SECTION_TITLES[section] ? section : 'dashboard';
    const routeFilter = validSection === 'tasks' && Storage.FILTER_IDS.includes(filter) ? filter : null;
    return { section: validSection, routeFilter };
  }

  function navigate(route) {
    const target = `#${route}`;
    if (global.location.hash === target) renderRoute(true);
    else global.location.hash = target;
  }

  function isNavLinkActive(route) {
    if (route === 'dashboard' || route === 'categories' || route === 'settings') return state.section === route;
    if (route === 'tasks') return state.section === 'tasks' && !FILTER_ROUTE_TITLES[state.routeFilter];
    return state.section === 'tasks' && state.routeFilter === route;
  }

  function renderRoute(userInitiated) {
    const { section, routeFilter } = parseHash();
    state.section = section;
    state.routeFilter = routeFilter;
    if (section === 'tasks') state.filter = routeFilter || Settings.get().defaultTaskFilter;

    dom.views.forEach((view) => {
      view.hidden = view.dataset.view !== section;
    });
    dom.navLinks.forEach((link) => {
      const active = isNavLinkActive(link.dataset.route);
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    const title = section === 'tasks' && FILTER_ROUTE_TITLES[routeFilter] ? FILTER_ROUTE_TITLES[routeFilter] : SECTION_TITLES[section];
    dom.pageTitle.textContent = title;
    document.title = `${title} | TaskFlow`;

    renderCurrentView();
    setSidebarOpen(false, false);
    if (userInitiated) dom.main.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function renderCurrentView() {
    const focusTarget = captureTaskFocus();
    if (state.section === 'dashboard') renderDashboard();
    else if (state.section === 'tasks') renderTaskView();
    else if (state.section === 'categories') renderCategories();
    restoreTaskFocus(focusTarget);
    lastOverdueSignature = getOverdueSignature();
  }

  /** Keeps keyboard focus on the same task action after a re-render. */
  function captureTaskFocus() {
    const active = document.activeElement;
    if (!active || !active.dataset || !active.dataset.action) return null;
    const card = active.closest('.task-card');
    const list = active.closest('.task-list');
    if (!card || !list) return null;
    return { listId: list.id, taskId: card.dataset.id, action: active.dataset.action };
  }

  function restoreTaskFocus(target) {
    if (!target) return;
    const list = document.getElementById(target.listId);
    const element =
      list && list.querySelector(`.task-card[data-id="${CSS.escape(target.taskId)}"] [data-action="${target.action}"]`);
    if (element) element.focus();
  }

  function getOverdueSignature() {
    return Storage.getTasks()
      .filter((task) => Utils.isOverdue(task))
      .map((task) => task.id)
      .join(',');
  }

  function renderDashboard() {
    const tasks = Storage.getTasks();
    const stats = calculateStats(tasks);
    const progress = calculateProgress(tasks);

    $('#welcomeTitle').textContent = `Welcome back, ${Settings.getFirstName()}!`;
    const openToday = progress.remaining;
    $('#welcomeSub').textContent = `${Utils.formatLongDate(new Date())}. ${
      openToday === 0 ? 'Nothing left to do today.' : `${openToday} ${Utils.pluralize(openToday, 'task')} left for today.`
    }`;

    const completionRate = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
    const statValues = { total: stats.total, completed: stats.completed, inProgress: stats.inProgress, overdue: stats.overdue };
    Object.entries(statValues).forEach(([key, value]) => {
      $(`[data-stat="${key}"]`).textContent = String(value);
    });
    $('[data-stat-note="total"]').textContent = stats.total ? 'Across all categories' : 'Nothing here yet';
    $('[data-stat-note="completed"]').textContent = `${completionRate}% completion rate`;
    $('[data-stat-note="inProgress"]').textContent = stats.inProgress ? 'Currently active' : 'Nothing active';
    $('[data-stat-note="overdue"]').textContent = stats.overdue ? 'Needs attention' : 'All caught up';
    $('[data-stat="overdue"]').closest('.stat').classList.toggle('stat--alert', stats.overdue > 0);

    $('#progressPercent').textContent = `${progress.percent}%`;
    dom.progressFill.style.width = `${progress.percent}%`;
    dom.progressBar.setAttribute('aria-valuenow', String(progress.percent));
    dom.progressBar.setAttribute('aria-valuetext', `${progress.percent}% complete`);
    $('#progressDetail').textContent =
      progress.total === 0
        ? 'No tasks are due today.'
        : progress.percent === 100
          ? `All ${progress.total} tasks done. Nice work.`
          : `${progress.done} of ${progress.total} tasks due today are done.`;

    const recent = sortTasks(tasks, 'newest').slice(0, 5);
    Tasks.renderTasks(dom.recentTasks, recent, {
      icon: 'inbox',
      title: 'No tasks yet',
      text: 'Create your first task and start organizing your day.',
      actionLabel: 'Create Task',
      action: 'create-task',
    });

    const upcoming = sortTasks(filterTasks(tasks, 'upcoming'), 'dueDate').slice(0, 4);
    Tasks.renderTasks(dom.upcomingTasks, upcoming, {
      icon: 'calendar',
      title: 'Nothing coming up',
      text: 'Tasks with a future due date appear here.',
      compact: true,
    });
  }

  function getEmptyState(totalCount) {
    if (totalCount === 0) {
      return {
        icon: 'inbox',
        title: 'No tasks yet',
        text: 'Create your first task and start organizing your day.',
        actionLabel: 'Create Task',
        action: 'create-task',
      };
    }
    if (state.search.trim() || state.category) {
      return {
        icon: 'search',
        title: state.search.trim() ? `No results for “${state.search.trim()}”` : `No tasks in ${state.category}`,
        text: 'Try another keyword or clear your filters.',
        actionLabel: 'Clear Filters',
        action: 'clear-filters',
      };
    }
    const message = EMPTY_MESSAGES[state.filter] || { icon: 'inbox', title: 'No tasks here', text: 'Create a task to get started.' };
    return { ...message, actionLabel: 'Create Task', action: 'create-task' };
  }

  function renderTaskView() {
    const allTasks = Storage.getTasks();
    const visible = getVisibleTasks(allTasks);
    Tasks.renderTasks(dom.taskList, visible, getEmptyState(allTasks.length));

    dom.filterChips.forEach((chip) => {
      const filter = chip.dataset.filter;
      const active = filter === state.filter;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
      $('.chip__count', chip).textContent = String(filterTasks(allTasks, filter).length);
    });

    dom.sortSelect.value = state.sort;
    dom.resultCount.textContent = `${visible.length} ${Utils.pluralize(visible.length, 'task')}`;

    dom.activeFilters.replaceChildren();
    dom.activeFilters.hidden = !state.category;
    if (state.category) {
      const tag = createElement('span', { className: 'chip-tag chip-tag--removable' }, [
        createElement('span', { className: 'dot' }),
        createElement('span', { text: `Category: ${state.category}` }),
        createElement(
          'button',
          { className: 'chip-tag__remove', attrs: { type: 'button', 'aria-label': 'Remove category filter' }, dataset: { action: 'clear-category' } },
          [createIcon('x')]
        ),
      ]);
      tag.style.setProperty('--cat-color', Storage.getCategoryColor(state.category));
      dom.activeFilters.append(tag);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Categories view                                                     */
  /* ------------------------------------------------------------------ */

  function buildCategoryCard(category, tasks, canDelete) {
    const own = tasks.filter((task) => task.category === category.name);
    const done = own.filter(Utils.isCompleted).length;
    const percent = own.length ? Math.round((done / own.length) * 100) : 0;

    const fill = createElement('span', { className: 'mini-progress__fill' });
    fill.style.width = `${percent}%`;

    const actions = [
      createElement(
        'button',
        { className: 'btn btn-secondary btn-sm', text: 'View Tasks', attrs: { type: 'button' }, dataset: { action: 'view-category', name: category.name } }
      ),
    ];
    if (own.length === 0 && canDelete) {
      actions.push(
        createElement(
          'button',
          {
            className: 'icon-btn icon-btn--danger',
            attrs: { type: 'button', 'aria-label': `Delete category: ${category.name}`, title: 'Delete category' },
            dataset: { action: 'delete-category', name: category.name },
          },
          [createIcon('trash')]
        )
      );
    }

    const card = createElement('article', { className: 'category-card' }, [
      createElement('div', { className: 'category-card__head' }, [
        createElement('span', { className: 'dot dot--lg' }),
        createElement('h3', { className: 'category-card__name', text: category.name }),
      ]),
      createElement('p', {
        className: 'category-card__count',
        text: `${own.length} ${Utils.pluralize(own.length, 'task')}, ${own.length - done} open`,
      }),
      createElement('div', { className: 'mini-progress', attrs: { 'aria-hidden': 'true' } }, [fill]),
      createElement('div', { className: 'category-card__actions' }, actions),
    ]);
    card.style.setProperty('--cat-color', category.color);
    return card;
  }

  function renderCategories() {
    const tasks = Storage.getTasks();
    const categories = Storage.getCategories();
    const fragment = document.createDocumentFragment();
    categories.forEach((category) => fragment.append(buildCategoryCard(category, tasks, categories.length > 1)));
    dom.categoryGrid.replaceChildren(fragment);
  }

  function handleCategorySubmit(event) {
    event.preventDefault();
    const name = dom.categoryName.value.trim();
    const duplicate = Storage.getCategories().some((category) => category.name.toLowerCase() === name.toLowerCase());
    let message = '';
    if (!name) message = 'Category name is required.';
    else if (name.length < 2) message = 'Category name must be at least 2 characters.';
    else if (duplicate) message = 'A category with this name already exists.';

    dom.categoryNameError.textContent = message;
    dom.categoryNameError.hidden = !message;
    dom.categoryName.closest('.field').classList.toggle('field--invalid', Boolean(message));
    if (message) {
      dom.categoryName.setAttribute('aria-invalid', 'true');
      dom.categoryName.focus();
      return;
    }
    dom.categoryName.removeAttribute('aria-invalid');

    const color = $('input[name="categoryColor"]:checked', dom.categoryColors);
    Storage.addCategory(name, color ? color.value : Storage.CATEGORY_COLORS[0].value);
    dom.categoryForm.reset();
    document.dispatchEvent(new CustomEvent('categories:changed'));
    Utils.showToast('Category added successfully.');
  }

  async function removeCategory(name) {
    const inUse = Storage.getTasks().some((task) => task.category === name);
    if (inUse) {
      Utils.showToast('Move or delete this category’s tasks first.', 'error');
      return;
    }
    const confirmed = await Utils.confirmAction({
      title: 'Delete Category',
      message: 'Are you sure you want to delete this category?',
      detail: name,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    if (Storage.removeCategory(name)) {
      if (state.category === name) state.category = null;
      document.dispatchEvent(new CustomEvent('categories:changed'));
      Utils.showToast('Category deleted successfully.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Sidebar, search and global events                                   */
  /* ------------------------------------------------------------------ */

  function setSidebarOpen(open, moveFocus) {
    const wasOpen = dom.sidebar.classList.contains('is-open');
    if (open === wasOpen) return;
    dom.sidebar.classList.toggle('is-open', open);
    dom.backdrop.hidden = !open;
    dom.menuToggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('sidebar-open', open);
    if (!moveFocus) return;
    if (open) dom.navLinks[0].focus();
    else dom.menuToggle.focus();
  }

  function clearFilters() {
    state.search = '';
    state.category = null;
    dom.searchInput.value = '';
    renderCurrentView();
  }

  function handleSearchInput() {
    state.search = dom.searchInput.value;
    if (state.search.trim() && state.section !== 'tasks') navigate('tasks/all');
    else if (state.section === 'tasks') renderTaskView();
  }

  function handleMainClick(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    switch (trigger.dataset.action) {
      case 'clear-filters':
        clearFilters();
        break;
      case 'clear-category':
        state.category = null;
        renderTaskView();
        break;
      case 'view-category':
        state.category = trigger.dataset.name;
        navigate('tasks/all');
        break;
      case 'delete-category':
        removeCategory(trigger.dataset.name);
        break;
      default:
    }
  }

  /** Re-renders on the minute only when something actually became overdue. */
  function refreshTimeBasedState() {
    Notifications.syncDeadlineAlerts();
    Notifications.render();
    if (getOverdueSignature() !== lastOverdueSignature) renderCurrentView();
  }

  function handleExternalStorageChange(event) {
    if (!event.key || !event.key.startsWith('taskflow.')) return;
    Storage.invalidateCache();
    Settings.applyProfile();
    Tasks.refreshCategoryOptions();
    Notifications.render();
    renderCurrentView();
  }

  function cacheDom() {
    dom = {
      sidebar: $('#sidebar'),
      backdrop: $('#sidebarBackdrop'),
      menuToggle: $('#menuToggle'),
      main: $('#main'),
      pageTitle: $('#pageTitle'),
      searchInput: $('#searchInput'),
      views: $$('[data-view]'),
      navLinks: $$('.nav-link[data-route]'),
      progressBar: $('#progressBar'),
      progressFill: $('#progressFill'),
      recentTasks: $('#recentTasks'),
      upcomingTasks: $('#upcomingTasks'),
      taskList: $('#taskList'),
      filterGroup: $('#filterGroup'),
      filterChips: $$('#filterGroup [data-filter]'),
      sortSelect: $('#sortSelect'),
      activeFilters: $('#activeFilters'),
      resultCount: $('#resultCount'),
      categoryForm: $('#categoryForm'),
      categoryName: $('#categoryName'),
      categoryNameError: $('#categoryNameError'),
      categoryColors: $('#categoryColors'),
      categoryGrid: $('#categoryGrid'),
    };
  }

  function bindEvents() {
    [dom.recentTasks, dom.upcomingTasks, dom.taskList].forEach(Tasks.bindTaskList);

    global.addEventListener('hashchange', () => renderRoute(true));
    global.addEventListener('storage', handleExternalStorageChange);
    dom.main.addEventListener('click', handleMainClick);

    dom.filterGroup.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter]');
      if (chip) navigate(`tasks/${chip.dataset.filter}`);
    });
    dom.sortSelect.addEventListener('change', () => {
      state.sort = dom.sortSelect.value;
      renderTaskView();
    });

    $('#searchForm').addEventListener('submit', (event) => event.preventDefault());
    dom.searchInput.addEventListener('input', Utils.debounce(handleSearchInput, 120));

    dom.menuToggle.addEventListener('click', () => setSidebarOpen(!dom.sidebar.classList.contains('is-open'), true));
    $('#sidebarClose').addEventListener('click', () => setSidebarOpen(false, true));
    dom.backdrop.addEventListener('click', () => setSidebarOpen(false, true));
    global.matchMedia(DESKTOP_QUERY).addEventListener('change', (event) => {
      if (event.matches) setSidebarOpen(false, false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dom.sidebar.classList.contains('is-open') && !document.querySelector('.modal:not([hidden])')) {
        setSidebarOpen(false, true);
        return;
      }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        dom.searchInput.focus();
      }
    });

    document.addEventListener('tasks:changed', renderCurrentView);
    document.addEventListener('categories:changed', renderCurrentView);
    document.addEventListener('settings:changed', renderCurrentView);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshTimeBasedState();
    });
    global.setInterval(refreshTimeBasedState, REFRESH_INTERVAL_MS);

    dom.categoryForm.addEventListener('submit', handleCategorySubmit);
    dom.categoryName.addEventListener('input', () => {
      $('#categoryNameError').hidden = true;
      dom.categoryName.removeAttribute('aria-invalid');
      dom.categoryName.closest('.field').classList.remove('field--invalid');
    });
  }

  function init() {
    cacheDom();

    Storage.onError(() => {
      if (warnedAboutStorage) return;
      warnedAboutStorage = true;
      Utils.showToast('Couldn’t save to browser storage. Changes may be lost when you close this tab.', 'error', 6000);
    });
    if (!Storage.isPersistent()) {
      warnedAboutStorage = true;
      Utils.showToast('Browser storage is unavailable. Changes won’t be saved after you close this tab.', 'error', 6000);
    }

    Storage.seedDemoDataIfNeeded();
    Utils.buildSwatchGroup(dom.categoryColors, {
      name: 'categoryColor',
      colors: Storage.CATEGORY_COLORS,
      selected: Storage.CATEGORY_COLORS[0].value,
    });

    Tasks.init();
    Settings.init();
    Notifications.init();
    bindEvents();
    renderRoute(false);
  }

  TaskFlow.Dashboard = {
    init,
    filterTasks,
    searchTasks,
    sortTasks,
    calculateStats,
    calculateProgress,
  };
})(window);
