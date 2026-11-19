/* Persistent light/dark theme control for every workspace page. */
(() => {
  'use strict';
  const KEY = 'are_theme';
  const root = document.documentElement;
  const saved = localStorage.getItem(KEY);
  const initial = saved === 'dark' ? 'dark' : 'light';
  root.dataset.theme = initial;

  function mount() {
    if (document.getElementById('theme-switch')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'theme-switch';
    button.className = 'theme-switch';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', 'Switch color theme');
    button.innerHTML = '<span class="theme-icon theme-sun" aria-hidden="true">☀</span><span class="theme-icon theme-moon" aria-hidden="true">☾</span><span class="theme-knob" aria-hidden="true"></span>';
    const update = (theme) => {
      root.dataset.theme = theme;
      button.setAttribute('aria-checked', String(theme === 'dark'));
      button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    };
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      update(next);
    });
    document.body.appendChild(button);
    update(initial);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();