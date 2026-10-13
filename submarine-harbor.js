/* A single ambient shoreline. The fleet and its timers are read-only here. */
(function () {
  'use strict';
  const KEY = 'ff14_submarine_planner_v1';
  const dock = document.getElementById('mini-harbor');
  if (!dock) return;
  const fleetEl = document.getElementById('harbor-fleet');
  const liveStatus = document.getElementById('harbor-clock');
  const startPositions = [8, 14, 20, 26];
  const endPosition = 89;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function formatDate(ms) {
    return new Date(ms).toLocaleString('zh-TW', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    });
  }
  // Four flags correspond to four real berths, not four separate progress strips.
  fleetEl.innerHTML = startPositions.map((start, i) =>
    '<div class="harbor-boat" data-harbor-ship="' + i +
    '" style="left:' + start + '%;--boat-bottom:' + (37 + (i % 2) * 3) +
    'px;--boat-bottom-mobile:' + (29 + (i % 2) * 2) + 'px" aria-hidden="true">' +
      '<div class="harbor-sprite"><span class="harbor-hull"></span>' +
      '<span class="harbor-cabin"></span><span class="harbor-periscope"></span>' +
      '<span class="harbor-boat-flag"><span>' + (i + 1) + '</span></span></div>' +
    '</div>'
  ).join('');
  const boats = [...fleetEl.querySelectorAll('[data-harbor-ship]')];
  function render() {
    const data = read();
    const ships = Array.isArray(data.ships) ? data.ships : [];
    const now = Date.now();
    let activeCount = 0;
    const text = [];
    boats.forEach((boat, i) => {
      const ship = ships[i] || {};
      const v = ship.voyage;
      const departedAt = Number(v?.departedAt);
      const etaAt = Number(v?.etaAt);
      const timed = Boolean(ship.voyaging && v &&
        Number.isFinite(departedAt) && departedAt > 0 &&
        Number.isFinite(etaAt) && etaAt > departedAt);
      const fraction = timed ? Math.min(1, Math.max(0, (now - departedAt) / (etaAt - departedAt))) : 0;
      const progress = fraction <= 0.5 ? fraction * 2 : (1 - fraction) * 2;
      const x = startPositions[i] + (endPosition - startPositions[i]) * progress;
      const registered = Boolean(ship.registered);
      const active = Boolean(ship.voyaging);
      if (active) activeCount++;
      boat.hidden = !registered && !active;
      boat.style.left = x.toFixed(4) + '%';
      boat.classList.toggle('is-sailing', timed && fraction < 1);
      boat.classList.toggle('is-returning', timed && fraction > 0.5 && fraction < 1);
      boat.classList.toggle('is-awaiting', active && timed && fraction >= 1);
      const label = (typeof ship.name === 'string' && ship.name.trim()) ?
        ship.name.trim() : '潛水艇 ' + (i + 1);
      const status = !registered && !active ? '泊位空置' : !active ? '停泊中' :
        !timed ? '航行中，未記錄出航時間' :
        fraction >= 1 ? '預計已返航，等待結算' : '預計 ' + formatDate(etaAt) + ' 返航';
      text.push(label + '：' + status);
    });
    // Accessible text, without adding a visible floating panel.
    liveStatus.textContent = (activeCount ? '目前有 ' + activeCount + ' 艘潛水艇出航。' : '碼頭目前沒有航行中的潛水艇。') +
      ' ' + text.join('；');
  }
  ['submarine-state-updated', 'submarine-build-state-updated',
    'submarine-settlement-saved', 'submarine-data-imported',
    'submarine-voyage-started'].forEach(event => window.addEventListener(event, render));
  window.addEventListener('storage', event => { if (event.key === KEY) render(); });
  window.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  render();
  window.setInterval(() => { if (!document.hidden) render(); }, 30000);
})();
