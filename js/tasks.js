/**
 * tasks.js — task operations and task UI
 * Create / edit / complete / delete, the task modal with validation, and the
 * card renderer. After every change it emits `tasks:changed` on document;
 * other modules (dashboard, notifications) react to that event, so this file
 * never needs to know about them.
 */
(function (global) {
  'use strict';

  const TaskFlow = global.TaskFlow;
  const { Utils, Storage } = TaskFlow;
  const { $, createElement, createIcon } = Utils;

  const FIELD_NAMES = ['title', 'description', 'category', 'priority', 'dueDate', 'dueTime', 'status'];
  const state = { editingId: null, flashId: null };
  let dom = null;

  /* ------------------------------------------------------------------ */
  /* Form helpers                                                        */
  /* ------------------------------------------------------------------ */

  function fieldId(name) {
    return `task${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }

  function getField(name) {
    return document.getElementById(fieldId(name));
  }

  function getErrorElement(name) {
    return document.getElementById(`${fieldId(name)}Error`);
  }

  function clearFieldError(name) {
    if (!FIELD_NAMES.includes(name)) return;
    const field = getField(name);
    const error = getErrorElement(name);
    if (!field || !error) return;
    field.removeAttribute('aria-invalid');
    field.closest('.field').classList.remove('field--invalid');
    error.hidden = true;
    error.textContent = '';
  }

  function clearAllErrors() {
    FIELD_NAMES.forEach(clearFieldError);
  }

  function showErrors(errors) {
    clearAllErrors();
    let firstInvalid = null;
    FIELD_NAMES.forEach((name) => {
      if (!errors[name]) return;
      const field = getField(name);
      const error = getErrorElement(name);
      field.setAttribute('aria-invalid', 'true');
      field.closest('.field').classList.add('field--invalid');
      error.textContent = errors[name];
      error.hidden = false;
      if (!firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) firstInvalid.focus();
  }

  function readFormValues() {
    return {
      title: getField('title').value.trim(),
      description: getField('description').value.trim(),
      category: getField('category').value,
      priority: getField('priority').value,
      dueDate: getField('dueDate').value,
      dueTime: getField('dueTime').value,
      status: getField('status').value,
    };
  }

  /**
   * Returns an object of { fieldName: message }. Empty object means valid.
   * `original` is the task being edited: an unchanged past date stays valid.
   */
  function validateTask(values, original) {
    const errors = {};
    if (!values.title) errors.title = 'Task title is required.';
    else if (values.title.length < 3) errors.title = 'Task title must be at least 3 characters.';

    if (!values.category) errors.category = 'Please choose a category.';
    if (!Utils.PRIORITIES.includes(values.priority)) errors.priority = 'Please choose a priority.';
    if (!Utils.STATUSES.includes(values.status)) errors.status = 'Please choose a status.';

    if (values.dueDate) {
      if (!Utils.isValidDateString(values.dueDate)) {
        errors.dueDate = 'Enter a valid due date.';
      } else if (values.dueDate < Utils.todayISO() && (!original || original.dueDate !== values.dueDate)) {
        errors.dueDate = 'Due date can’t be in the past.';
      }
    }

    if (values.dueTime && !values.dueDate) errors.dueTime = 'Choose a due date to go with this time.';
    else if (values.dueTime && !Utils.isValidTimeString(values.dueTime)) errors.dueTime = 'Enter a valid time.';

    return errors;
  }

  function refreshCategoryOptions() {
    if (!dom) return;
    const select = getField('category');
    const current = select.value;
    const fragment = document.createDocumentFragment();
    fragment.append(createElement('option', { text: 'Select a category', attrs: { value: '' } }));
    Storage.getCategories().forEach((category) => {
      fragment.append(createElement('option', { text: category.name, attrs: { value: category.name } }));
    });
    select.replaceChildren(fragment);
    select.value = Array.from(select.options).some((option) => option.value === current) ? current : '';
  }

  function ensureOption(select, value) {
    if (Array.from(select.options).some((option) => option.value === value)) return;
    select.append(createElement('option', { text: value, attrs: { value } }));
  }

  function setModalMode(isEditing) {
    $('#taskModalTitle').textContent = isEditing ? 'Edit Task' : 'New Task';
    dom.submit.textContent = isEditing ? 'Save Changes' : 'Create Task';
  }

  function openCreateModal() {
    state.editingId = null;
    dom.form.reset();
    clearAllErrors();
    setModalMode(false);
    getField('dueDate').min = Utils.todayISO();
    Utils.openModal(dom.modal);
  }

  function openEditModal(id) {
    const task = Storage.getTaskById(id);
    if (!task) return;
    state.editingId = id;
    dom.form.reset();
    clearAllErrors();
    setModalMode(true);
    ensureOption(getField('category'), task.category);
    getField('title').value = task.title;
    getField('description').value = task.description;
    getField('category').value = task.category;
    getField('priority').value = task.priority;
    getField('dueDate').value = task.dueDate;
    getField('dueDate').removeAttribute('min');
    getField('dueTime').value = task.dueTime;
    getField('status').value = task.status;
    Utils.openModal(dom.modal);
  }

  /* ------------------------------------------------------------------ */
  /* Operations                                                          */
  /* ------------------------------------------------------------------ */

  function emitChange(type, task) {
    document.dispatchEvent(new CustomEvent('tasks:changed', { detail: { type, task } }));
  }

  function createTask(values) {
    const now = new Date().toISOString();
    const task = Storage.addTask({
      ...values,
      createdAt: now,
      completedAt: values.status === 'Completed' ? now : '',
    });
    if (!task) {
      Utils.showToast('Couldn’t create the task. Please check the form.', 'error');
      return null;
    }
    state.flashId = task.id;
    emitChange('created', task);
    state.flashId = null;
    Utils.showToast('Task created successfully.');
    return task;
  }

  function editTask(id, values) {
    const original = Storage.getTaskById(id);
    if (!original) {
      Utils.showToast('That task no longer exists.', 'error');
      return null;
    }
    const wasCompleted = Utils.isCompleted(original);
    const now = new Date().toISOString();
    let completedAt = '';
    if (values.status === 'Completed') completedAt = wasCompleted ? original.completedAt || now : now;

    const updated = Storage.updateTask(id, { ...values, completedAt });
    if (!updated) {
      Utils.showToast('Couldn’t save your changes.', 'error');
      return null;
    }
    state.flashId = id;
    emitChange(Utils.isCompleted(updated) && !wasCompleted ? 'completed' : 'updated', updated);
    state.flashId = null;
    Utils.showToast('Task updated successfully.');
    return updated;
  }

  /** Toggles between Completed and Todo. */
  function completeTask(id) {
    const task = Storage.getTaskById(id);
    if (!task) return;
    if (Utils.isCompleted(task)) {
      const reopened = Storage.updateTask(id, { status: 'Todo', completedAt: '' });
      emitChange('reopened', reopened);
      Utils.showToast('Task reopened.', 'info');
      return;
    }
    const completed = Storage.updateTask(id, { status: 'Completed', completedAt: new Date().toISOString() });
    state.flashId = id;
    emitChange('completed', completed);
    state.flashId = null;
    Utils.showToast('Task completed successfully.');
  }

  /** Asks for confirmation first; nothing is deleted without it. */
  async function deleteTask(id) {
    const task = Storage.getTaskById(id);
    if (!task) return;
    const confirmed = await Utils.confirmAction({
      title: 'Delete Task',
      message: 'Are you sure you want to delete this task?',
      detail: task.title,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    if (Storage.deleteTask(id)) {
      emitChange('deleted', task);
      Utils.showToast('Task deleted successfully.');
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const values = readFormValues();
    const original = state.editingId ? Storage.getTaskById(state.editingId) : null;
    const errors = validateTask(values, original);
    if (Object.keys(errors).length > 0) {
      showErrors(errors);
      return;
    }
    const result = state.editingId ? editTask(state.editingId, values) : createTask(values);
    if (result) Utils.closeModal(dom.modal);
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function buildEmptyState({ icon, title, text, actionLabel, action, compact }) {
    const children = [
      createElement('span', { className: 'empty-state__icon' }, [createIcon(icon || 'inbox')]),
      createElement('p', { className: 'empty-state__title', text: title }),
      createElement('p', { className: 'empty-state__text', text }),
    ];
    if (actionLabel) {
      children.push(
        createElement('button', {
          className: 'btn btn-primary',
          text: actionLabel,
          attrs: { type: 'button' },
          dataset: { action },
        })
      );
    }
    return createElement('div', { className: `empty-state${compact ? ' empty-state--compact' : ''}` }, children);
  }

  function buildTaskCard(task, categoryColors) {
    const completed = Utils.isCompleted(task);
    const overdue = Utils.isOverdue(task);
    const classes = ['task-card'];
    if (completed) classes.push('is-completed');
    if (overdue) classes.push('is-overdue');
    if (state.flashId === task.id) classes.push('is-flash');

    const checkbox = createElement('input', {
      attrs: {
        type: 'checkbox',
        'aria-label': `Mark “${task.title}” as ${completed ? 'not completed' : 'completed'}`,
        checked: completed,
      },
      dataset: { action: 'toggle' },
    });
    const check = createElement('label', { className: 'task-check' }, [
      checkbox,
      createElement('span', { className: 'task-check__box' }, [createIcon('check')]),
    ]);

    const priorityBadge = createElement(
      'span',
      { className: `badge badge--${task.priority.toLowerCase()}` },
      [createIcon('flag'), createElement('span', { text: task.priority })]
    );

    const categoryTag = createElement('span', { className: 'chip-tag' }, [
      createElement('span', { className: 'dot' }),
      createElement('span', { text: task.category }),
    ]);
    categoryTag.style.setProperty('--cat-color', categoryColors.get(task.category) || '#64748B');

    const parts = Utils.formatDueParts(task);
    const dueText = `${overdue ? 'Overdue: ' : ''}${parts.day}${parts.time ? `, ${parts.time}` : ''}`;
    const due = createElement('span', { className: `due${overdue ? ' due--overdue' : ''}` }, [
      createIcon(overdue ? 'alert' : 'clock'),
      createElement('span', { text: dueText }),
    ]);

    const statusSlug = task.status.toLowerCase().replace(/\s+/g, '-');
    const statusBadge = createElement('span', { className: `badge badge--status-${statusSlug}`, text: task.status });

    const body = createElement('div', { className: 'task-card__body' }, [
      createElement('h3', { className: 'task-card__title', text: task.title }),
      task.description ? createElement('p', { className: 'task-card__desc', text: task.description }) : null,
      createElement('div', { className: 'task-card__meta' }, [priorityBadge, categoryTag, due, statusBadge]),
    ]);

    const completeLabel = completed ? 'Reopen' : 'Complete';
    const actions = createElement('div', { className: 'task-card__actions' }, [
      createElement(
        'button',
        {
          className: 'btn btn-ghost btn-sm task-card__complete',
          attrs: { type: 'button', 'aria-label': `${completeLabel} task: ${task.title}` },
          dataset: { action: 'complete' },
        },
        [createIcon('check'), createElement('span', { className: 'btn__label', text: completeLabel })]
      ),
      createElement(
        'button',
        {
          className: 'icon-btn',
          attrs: { type: 'button', 'aria-label': `Edit task: ${task.title}`, title: 'Edit' },
          dataset: { action: 'edit' },
        },
        [createIcon('edit')]
      ),
      createElement(
        'button',
        {
          className: 'icon-btn icon-btn--danger',
          attrs: { type: 'button', 'aria-label': `Delete task: ${task.title}`, title: 'Delete' },
          dataset: { action: 'delete' },
        },
        [createIcon('trash')]
      ),
    ]);

    return createElement('article', { className: classes.join(' '), dataset: { id: task.id } }, [check, body, actions]);
  }

  /** Renders `tasks` into `container`, or an empty state when there are none. */
  function renderTasks(container, tasks, emptyState) {
    const fragment = document.createDocumentFragment();
    if (tasks.length === 0) {
      fragment.append(
        buildEmptyState(
          emptyState || {
            icon: 'inbox',
            title: 'No tasks yet',
            text: 'Create your first task and start organizing your day.',
            actionLabel: 'Create Task',
            action: 'create-task',
          }
        )
      );
    } else {
      const categoryColors = Storage.getCategoryColorMap();
      tasks.forEach((task) => fragment.append(buildTaskCard(task, categoryColors)));
    }
    container.replaceChildren(fragment);
  }

  /** One delegated listener per list instead of one per button. */
  function bindTaskList(container) {
    container.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-action]');
      const card = trigger && trigger.closest('.task-card');
      if (!card || !container.contains(card)) return;
      const id = card.dataset.id;
      if (trigger.dataset.action === 'complete') completeTask(id);
      else if (trigger.dataset.action === 'edit') openEditModal(id);
      else if (trigger.dataset.action === 'delete') deleteTask(id);
    });
    container.addEventListener('change', (event) => {
      if (!event.target.matches('input[data-action="toggle"]')) return;
      const card = event.target.closest('.task-card');
      if (card) completeTask(card.dataset.id);
    });
  }

  function init() {
    dom = {
      modal: $('#taskModal'),
      form: $('#taskForm'),
      submit: $('#taskSubmit'),
      confirmModal: $('#confirmModal'),
    };
    Utils.initModal(dom.modal);
    Utils.initModal(dom.confirmModal);
    refreshCategoryOptions();

    dom.form.addEventListener('submit', handleSubmit);
    ['input', 'change'].forEach((type) => {
      dom.form.addEventListener(type, (event) => clearFieldError(event.target.name));
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('[data-action="create-task"]')) return;
      event.preventDefault();
      openCreateModal();
    });
    document.addEventListener('categories:changed', refreshCategoryOptions);
  }

  TaskFlow.Tasks = {
    init,
    createTask,
    editTask,
    completeTask,
    deleteTask,
    renderTasks,
    bindTaskList,
    openCreateModal,
    openEditModal,
    validateTask,
    refreshCategoryOptions,
  };
})(window);
