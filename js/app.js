/**
 * app.js — bootstrap
 * Theme handling (shared by both pages), landing-page behavior (mobile menu,
 * scroll state, interactive hero preview) and dashboard start-up.
 * Loaded last, after every other module has registered itself.
 */
(function (global) {
  'use strict';

  const TaskFlow = global.TaskFlow;
  const { Utils, Storage } = TaskFlow;
  const { $, $$ } = Utils;

  /* ------------------------------------------------------------------ */
  /* Theme                                                               */
  /* ------------------------------------------------------------------ */

  const Theme = (function createTheme() {
    function getCurrent() {
      return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    }

    function apply(theme) {
      document.documentElement.dataset.theme = theme;
      $$('[data-theme-toggle]').forEach((button) => {
        button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      });
      document.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme } }));
    }

    function set(theme) {
      Storage.setTheme(theme);
      apply(theme);
    }

    function toggle() {
      set(getCurrent() === 'dark' ? 'light' : 'dark');
    }

    function init() {
      const prefersDark = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
      apply(Storage.getTheme() || (prefersDark ? 'dark' : 'light'));
      $$('[data-theme-toggle]').forEach((button) => button.addEventListener('click', toggle));
    }

    return { init, getCurrent, set, toggle };
  })();

  TaskFlow.Theme = Theme;

  /* ------------------------------------------------------------------ */
  /* Landing page                                                        */
  /* ------------------------------------------------------------------ */

  function initNavbar() {
    const header = $('.site-header');
    const toggle = $('#navToggle');
    const menu = $('#navMenu');
    if (!header || !toggle || !menu) return;

    const setOpen = (open) => {
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!header.contains(event.target)) setOpen(false);
    });
    global.matchMedia('(min-width: 861px)').addEventListener('change', (event) => {
      if (event.matches) setOpen(false);
    });

    const updateScrollState = () => header.classList.toggle('is-scrolled', global.scrollY > 8);
    global.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
  }

  /** Highlights the nav link of the section currently in view. */
  function initScrollSpy() {
    if (!('IntersectionObserver' in global)) return;
    const links = $$('.nav__links a[href^="#"]');
    const sections = links.map((link) => $(link.getAttribute('href'))).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => {
            const active = link.getAttribute('href') === `#${entry.target.id}`;
            if (active) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
          });
        });
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    sections.forEach((section) => observer.observe(section));
  }

  /** The hero mockup is a small working demo: tick a task, progress updates. */
  function initHeroPreview() {
    const root = $('[data-preview]');
    if (!root) return;
    const boxes = $$('input[type="checkbox"]', root);
    const percent = $('[data-preview-percent]', root);
    const fill = $('[data-preview-fill]', root);
    const bar = $('[role="progressbar"]', root);
    const caption = $('[data-preview-caption]', root);

    const update = () => {
      const done = boxes.filter((box) => box.checked).length;
      const value = Math.round((done / boxes.length) * 100);
      percent.textContent = `${value}%`;
      fill.style.width = `${value}%`;
      bar.setAttribute('aria-valuenow', String(value));
      caption.textContent = `${done} of ${boxes.length} done`;
      boxes.forEach((box) => box.closest('.preview-task').classList.toggle('is-done', box.checked));
    };

    boxes.forEach((box) => box.addEventListener('change', update));
    update();
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  document.addEventListener('DOMContentLoaded', () => {
    Theme.init();
    Utils.hydrateIcons();
    $$('[data-year]').forEach((element) => {
      element.textContent = String(new Date().getFullYear());
    });

    const page = document.body.dataset.page;
    if (page === 'landing') {
      initNavbar();
      initScrollSpy();
      initHeroPreview();
    }
    if (page === 'dashboard') {
      try {
        TaskFlow.Dashboard.init();
      } catch (error) {
        console.error('[TaskFlow] Failed to start the dashboard.', error);
        Utils.showToast('Something went wrong while loading TaskFlow. Please refresh the page.', 'error', 8000);
      }
    }
  });
})(window);
