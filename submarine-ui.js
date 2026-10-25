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
    try { data = JSON.parse(FF14Data.readRaw(KEY) || 'null'); }
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

/* Small, display-only dock effects. Never delay or intercept planner actions. */
(function () {
  'use strict';
  if (!Element.prototype.animate || !window.matchMedia) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const live = new Set();
  let lastBurst = -Infinity;
  function particle(x, y, sonar, closing, index) {
    if (live.size >= 24) return;
    const el = document.createElement('span');
    el.className = sonar ? 'dock-fx-sonar' : 'dock-fx-bubble';
    el.setAttribute('aria-hidden', 'true');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (closing) el.style.borderColor = '#879da9';
    document.body.appendChild(el);
    live.add(el);
    const frames = sonar
      ? [{transform:'translate(-50%,-50%) scale(.35)',opacity:.75},
         {transform:'translate(-50%,-50%) scale(2.5)',opacity:0}]
      : [{transform:'translate(-50%,-50%) translate(0,0) scale(.6)',opacity:0},
         {opacity:.85,offset:.2},
         {transform:'translate(-50%,-50%) translate(' + ((index-1)*16) + 'px,-42px) scale(1)',opacity:0}];
    const animation = el.animate(frames, {duration:sonar?650:550+index*65,easing:'ease-out'});
    const cleanup = () => {el.remove();live.delete(el)};
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  }
  // Capture coordinates before existing handlers re-render map buttons.
  // Rendering happens next frame; the real click handler runs immediately.
  document.addEventListener('click', event => {
    if (reduced.matches || document.hidden) return;
    const button = event.target.closest?.('button');
    if (!button || button.disabled) return;
    const sonar = button.matches('.map-point');
    if (!sonar && !button.matches('#calc-routes,#calc-item-routes,#calculator-panel .route-card button')) return;
    const now = performance.now();
    if (now-lastBurst < 180) return;
    lastBurst = now;
    const rect = button.getBoundingClientRect();
    const x = sonar || event.detail === 0 ? rect.left+rect.width/2 : event.clientX;
    const y = sonar || event.detail === 0 ? rect.top+rect.height/2 : event.clientY;
    const closing = sonar && button.getAttribute('aria-pressed') === 'true';
    requestAnimationFrame(() => {
      if (reduced.matches || document.hidden) return;
      for (let i=0;i<(sonar?1:3);i++) particle(x,y,sonar,closing,i);
    });
  }, {capture:true,passive:true});
  // Animate only newly rendered result cards; no recurring timer.
  for (const id of ['calc-result','item-route-result']) {
    const root = document.getElementById(id);
    if (!root) continue;
    new MutationObserver(() => {
      if (reduced.matches || document.hidden) return;
      root.querySelectorAll('.route-card').forEach((card,index) => {
        const rect = card.getBoundingClientRect();
        if (rect.bottom<0 || rect.top>window.innerHeight) return;
        card.animate([{opacity:.65,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],
          {duration:220,delay:Math.min(index,4)*35,easing:'ease-out'});
      });
    }).observe(root,{childList:true});
  }
  function clearEffects() {for(const el of live) el.remove();live.clear()}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearEffects()});
  reduced.addEventListener('change',()=>{if(reduced.matches)clearEffects()});
})();
