/* Submersible bridge UI enhancements: display-only, no writes to fleet state. */
(function () {
  'use strict';
  const KEY = 'ff14_submarine_planner_v1';
  const get = (id) => document.getElementById(id);
  function display(id, value) {
    const node = get(id);
    if (node) node.textContent = value;
  }
  function renderOverview() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (_) { /* Invalid backups should not break the interface. */ }
    // Mirror initial values from the existing fleet's fresh defaults.
    const ships = Array.isArray(data?.ships) ? data.ships : [{registered:true,rank:1},{},{},{}];
    const active = ships.filter(ship => !!ship && ship.registered).length;
    const maxRank = Math.max(1, ...ships.map(ship => Number(ship?.rank) || 1).filter(Number.isFinite));
    const voyages = Array.isArray(data?.logs) ? data.logs.length : 0;
    const fuel = Number(data?.fuel ?? 1600);
    display('ui-active-ships', active + ' / 4');
    display('ui-max-rank', 'Rank ' + maxRank);
    display('ui-voyages', Number(voyages).toLocaleString('zh-TW'));
    display('ui-fuel', Number.isFinite(fuel) ? Math.max(0, fuel).toLocaleString('zh-TW') : '—');
  }

  // Highlight the section in view; plain anchor links keep working if unsupported.
  const links = [...document.querySelectorAll('.bridge-nav a[href^="#"]')];
  const pairs = links.map(link => ({link, section: document.querySelector(link.getAttribute('href'))})).filter(x => x.section);
  function highlight(id) {
    pairs.forEach(({link, section}) => {
      const selected = section.id === id;
      link.classList.toggle('is-active', selected);
      if (selected) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  }
  if (pairs.length) highlight(pairs[0].section.id);
  if ('IntersectionObserver' in window) {
    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
        else visible.delete(entry.target.id);
      });
      if (visible.size) {
        const top = [...visible].sort((a,b) => Math.abs(a[1]-95) - Math.abs(b[1]-95))[0][0];
        highlight(top);
      }
    }, {rootMargin:'-75px 0px -58% 0px', threshold:0});
    pairs.forEach(({section}) => observer.observe(section));
  }
  links.forEach(link => link.addEventListener('click', () => highlight(link.hash.slice(1))));
  ['submarine-state-updated','submarine-build-state-updated','submarine-settlement-saved','submarine-data-imported'].forEach(name =>
    window.addEventListener(name, renderOverview)
  );
  window.addEventListener('storage', event => { if (event.key === KEY) renderOverview(); });
  renderOverview();
})();
