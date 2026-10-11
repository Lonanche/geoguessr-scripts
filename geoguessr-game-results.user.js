// ==UserScript==
// @name         GeoGuessr history result links
// @namespace    geoguessr-history-results
// @author       trausi
// @homepageURL  https://github.com/lonanche/geoguessr-scripts
// @supportURL   https://github.com/lonanche/geoguessr-scripts/issues
// @updateURL    https://raw.githubusercontent.com/lonanche/geoguessr-scripts/main/geoguessr-game-results.user.js
// @downloadURL  https://raw.githubusercontent.com/lonanche/geoguessr-scripts/main/geoguessr-game-results.user.js
// @version      1.0.0
// @description  Add result links to your map game history.
// @match        https://www.geoguessr.com/*
// @match        https://geoguessr.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  const games = new Map();
  const originalFetch = window.fetch;
  const endpoint = /\/api\/v3\/scores\/([^/]+)\/me\/games(?:\?|$)/;
  const rowSelector = 'button[class*="map-detail-leaderboard_row__"], button[aria-expanded]';
  let scheduled = false;
  let layoutChanged = true;
  const rowLayouts = new WeakMap();

  function currentMap() {
    return location.pathname.match(/\/maps\/([^/]+)/)?.[1];
  }

  function gameKey(mapId, timestamp, points) {
    return `${mapId}:${Math.floor(timestamp / 1000)}:${points}`;
  }

  function accept(url, data) {
    const match = String(url).match(endpoint);
    if (!match || !Array.isArray(data?.items)) return;
    for (const game of data.items) {
      const timestamp = Date.parse(game.playedAt);
      if (typeof game.gameToken !== 'string' || !Number.isFinite(timestamp) ||
          !Number.isFinite(game.points)) continue;
      const key = gameKey(match[1], timestamp, game.points);
      if (!games.has(key)) games.set(key, new Set());
      games.get(key).add(game.gameToken);
    }
    schedule();
  }

  // Observe the site's requests, including variant changes and pagination.
  window.fetch = async function (...args) {
    const response = await Reflect.apply(originalFetch, this, args);
    try {
      const url = args[0]?.url ?? String(args[0]);
      if (response.ok && endpoint.test(String(url))) {
        response.clone().json().then(data => accept(url, data)).catch(() => {});
      }
    } catch (_) { /* Observation must never break the site's request. */ }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const requestUrls = new WeakMap();
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    requestUrls.set(this, String(url));
    return Reflect.apply(originalOpen, this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const url = requestUrls.get(this);
    if (endpoint.test(url || '')) {
      this.addEventListener('load', () => {
        try {
          if (this.status >= 200 && this.status < 300) {
            accept(url, this.responseType === 'json' ? this.response : JSON.parse(this.responseText));
          }
        } catch (_) { /* Ignore responses that are not JSON. */ }
      }, { once: true });
    }
    return Reflect.apply(originalSend, this, args);
  };

  function update() {
    const mapId = currentMap();
    if (!mapId || games.size === 0) return;
    for (const row of document.querySelectorAll(rowSelector)) {
      const date = row.querySelector('[class*="cellDate__"] [title]') ||
        [...row.querySelectorAll('[title]')].find(el => Number.isFinite(Date.parse(el.title)));
      if (!date) continue;
      const points = row.querySelector('[class*="cellPoints__"]');
      const timestamp = Date.parse(date.title);
      const scoreText = points?.textContent || row.textContent.match(/([\d,\s]+)\s*pts\b/i)?.[1];
      const digits = scoreText?.replace(/[^0-9]/g, '');
      const score = digits ? Number(digits) : NaN;
      // Generic expandable buttons are only history rows with a date and score.
      if (!Number.isFinite(timestamp) || !Number.isFinite(score)) continue;
      const container = row.parentElement;
      const oldAction = container.querySelector(':scope > .gg-result-action');
      const oldLink = oldAction?.querySelector('a');
      const tokens = games.get(gameKey(mapId, timestamp, score));
      // Never guess by row order: sorting and filtering can change it.
      if (tokens?.size !== 1) {
        oldAction?.remove();
        container.classList.remove('gg-result-row');
        continue;
      }
      const href = `${location.origin}/results/${encodeURIComponent(tokens.values().next().value)}`;
      container.classList.add('gg-result-row');
      const arrow = row.querySelector('[class*="expandButton__"]') || row.lastElementChild;
      const expanded = row.getAttribute('aria-expanded');
      const previousLayout = rowLayouts.get(row);
      if (arrow && (layoutChanged || !previousLayout || previousLayout.arrow !== arrow || previousLayout.expanded !== expanded)) {
        const rowBox = row.getBoundingClientRect();
        const arrowBox = arrow.getBoundingClientRect();
        container.style.setProperty('--gg-icon-right', `${Math.max(24, rowBox.right - arrowBox.left + 8)}px`);
        rowLayouts.set(row, { arrow, expanded });
      }
      if (oldLink?.href === href) continue;
      oldAction?.remove();
      const link = document.createElement('a');
      link.className = 'next-link_anchor__l0EcX map-detail-leaderboard_breakdownLink__JLCzy gg-result-link';
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'View game result');
      link.title = 'Open game result in a new tab';
      link.addEventListener('click', event => event.stopPropagation());
      const icon = document.createElement('img');
      icon.alt = '';
      icon.width = 18;
      icon.height = 18;
      icon.addEventListener('error', () => {
        // Self-contained fallback: no dependency on GeoGuessr's asset filename.
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7" r="1" fill="white" stroke="none"/></svg>';
        icon.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
      }, { once: true });
      icon.src = '/_next/static/media/info.1c18ae42.svg';
      link.appendChild(icon);
      const tooltip = document.createElement('span');
      tooltip.className = 'tooltip_reference___tWvM';
      tooltip.appendChild(link);
      const action = document.createElement('div');
      action.className = 'map-detail-leaderboard_rowActions__AD1KV gg-result-action';
      action.appendChild(tooltip);
      row.insertAdjacentElement('afterend', action);
    }
    layoutChanged = false;
  }

  function schedule() {
    if (scheduled || !currentMap()) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; update(); }, 80);
  }

  function start() {
    const style = document.createElement('style');
    style.textContent = `
      .gg-result-row {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr);
        align-items: center;
      }
      .gg-result-row > button {
        grid-column: 1;
        grid-row: 1;
        min-width: 0;
        width: 100%;
      }
      .gg-result-row > :not(button):not(.gg-result-action) {
        grid-column: 1 / -1;
      }
      .gg-result-row > .gg-result-action {
        grid-column: 1;
        grid-row: 1;
        align-self: center;
        justify-self: end;
        z-index: 1;
        margin: 0 var(--gg-icon-right, 36px) 0 0;
        padding: 0;
        background: transparent;
      }
      .gg-result-row > button > :last-child {
        margin-left: 34px !important;
        flex-shrink: 0;
        transition: none !important;
      }
      .gg-result-row:has(> button:hover) > button,
      .gg-result-row:has(> .gg-result-action:hover) > button {
        background: rgba(255, 255, 255, .07) !important;
      }
      /* Low specificity lets the native classes supply their own appearance. */
      :where(.gg-result-action) { display: flex; align-items: center; }
      :where(.gg-result-link) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        color: white;
        opacity: .75;
        text-decoration: none;
      }
      :where(.gg-result-link:hover) { opacity: 1; background: #ffffff15; }
      :where(.gg-result-link:focus-visible) { outline: 2px solid #a896ff; outline-offset: 2px; }
      :where(.gg-result-link img) { display: block; width: 18px; height: 18px; }
    `;
    document.head.appendChild(style);
    const relevant = `${rowSelector}, [class*="map-detail-leaderboard_"]`;
    new MutationObserver(records => {
      if (!currentMap()) return;
      const changed = records.some(record => {
        if (record.type === 'attributes') return record.target.matches(rowSelector + ', [title]');
        if (record.target.closest?.('.gg-result-action')) return false;
        return [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === 1 && !node.matches('.gg-result-action') &&
          (node.matches(relevant) || node.querySelector(relevant))
        );
      });
      if (changed) schedule();
    }).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'aria-expanded']
    });
    window.addEventListener('resize', () => { layoutChanged = true; schedule(); });
    window.addEventListener('popstate', schedule);
    schedule();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else start();
})();
