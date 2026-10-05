# TaskFlow

A personal task manager built with plain **HTML5, CSS3 and vanilla JavaScript (ES6+)**: no frameworks, no libraries, no build step. It has a marketing landing page and a full dashboard, and keeps all data in the browser with `localStorage`.

## Features

- **Task management**: create, edit, complete (and reopen) and delete tasks, with a confirmation before deleting
- **Filtering**: All, Today, Upcoming, Completed, In Progress, Overdue
- **Search**: live results across title, description and category
- **Sorting**: Newest, Oldest, Priority, Due Date, Alphabetical
- **Categories** with colors; add your own
- **Priorities**: Low, Medium, High
- **Dashboard**: live statistics and today's progress bar
- **Dark mode** that restyles every surface and remembers your choice
- **Notifications** dropdown (created, completed, due soon, overdue)
- **Settings**: appearance, preferences, account name, email and avatar color
- **Toasts, empty states, form validation and error handling**
- **Responsive** from 375px to 1920px, keyboard accessible, `prefers-reduced-motion` respected
- **LocalStorage** persistence with demo tasks on first run only

## Technologies

HTML5, CSS3 (custom properties, Grid, Flexbox), JavaScript ES6+.

## Project structure

```
TaskFlow/
├── index.html            Landing page
├── dashboard.html        Dashboard app (all views live here)
├── css/
│   ├── style.css         Design tokens, shared components, landing page
│   ├── dashboard.css     App shell, task cards, categories, settings
│   └── responsive.css    All breakpoints
├── js/
│   ├── utils.js          DOM, icons, dates, modals, toasts, task predicates
│   ├── storage.js        The only module that touches localStorage
│   ├── tasks.js          Create/edit/complete/delete, modal form, card rendering
│   ├── notifications.js  Notification dropdown and deadline alerts
│   ├── settings.js       Settings view
│   ├── dashboard.js      Routing, stats, progress, filter, search, sort, categories
│   └── app.js            Bootstrap, theme, landing page behavior
├── assets/
└── README.md
```

## Architecture notes

- **Plain scripts, one namespace.** Files attach to `window.TaskFlow` and load in dependency order, so the project also works by double-clicking `index.html` (ES modules need a server).
- **Event-driven.** `tasks.js` emits `tasks:changed`; the dashboard and notifications react to it. Modules never call each other's rendering code directly.
- **Event delegation.** One listener per task list instead of one per button.
- **Safe rendering.** User text is only written with `textContent`; no `innerHTML`, no `eval`.
- **Storage never throws.** Data read from localStorage is validated and sanitized; corrupt data falls back to defaults, and if storage is blocked the app keeps working in memory and warns the user.
- **Derived status.** "Overdue" is computed from the due date and time, not stored. A task due without a time is due at the end of that day.

## How to run

Open `index.html` in a modern browser, or serve the folder (for example with the VS Code **Live Server** extension, or `npx serve`). Click **Get Started** to open the dashboard.

Login and Logout are visual only (there is no backend); your data stays in the browser.

## Testing checklist

1. Open `index.html`; the mobile menu opens and closes at narrow widths, and the hero demo updates its progress when you tick a task.
2. **Get Started** opens the dashboard with demo tasks. Reload: the tasks are still there and are not duplicated.
3. Add a task: validation messages show for an empty/short title, a missing category or priority, and a past due date.
4. Edit a task, then complete it from both the checkbox and the Complete button. Stats and progress update.
5. Delete shows a confirmation; Cancel keeps the task, Delete removes it.
6. Filters, search (for example "portfolio") and every sort option work.
7. Add a category, use it on a task, view its tasks from Categories.
8. Toggle dark mode from the topbar and from Settings; reload and check it persists.
9. Notifications show events; Mark all as read and Clear all work.
10. Settings: change name, email and avatar; toggle notifications; Reset Data restores the demo.
11. Check widths 1920, 1440, 768, 425 and 375: no horizontal scrolling or clipped content.
12. Tab through everything with the keyboard: focus is visible, modals trap focus and close with Escape.

## Future improvements

- Backend and database (Node/Express or a serverless API)
- Authentication
- Cloud storage and sync across devices
- Team collaboration and shared projects
- Real-time and push notifications
- Drag-and-drop ordering, recurring tasks, import/export
