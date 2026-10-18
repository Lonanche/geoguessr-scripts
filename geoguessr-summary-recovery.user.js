// ==UserScript==
// @name         GeoGuessr Old Duel Summaries
// @namespace    geoguessr-summary-recovery
// @author       trausi
// @homepageURL  https://github.com/lonanche/geoguessr-scripts
// @supportURL   https://github.com/lonanche/geoguessr-scripts/issues
// @updateURL    https://raw.githubusercontent.com/lonanche/geoguessr-scripts/main/geoguessr-summary-recovery.user.js
// @downloadURL  https://raw.githubusercontent.com/lonanche/geoguessr-scripts/main/geoguessr-summary-recovery.user.js
// @version      1.0.2
// @description  Restore summaries for old duels that no longer display.
// @match        https://www.geoguessr.com/*
// @match        https://geoguessr.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      game-server.geoguessr.com
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const w = unsafeWindow;
  const route = /^\/(?:[a-z]{2}\/)?duels\/([a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/summary)?\/?$/i;
  const idNow = () => location.pathname.match(route)?.[1];
  const errorSelector = '[class*="error_errorPage__"]';
  let previousId, attempted = false, busy = false;
  let visit = 0;

  function syncVisit() {
    const id = idNow();
    if (id !== previousId) {
      previousId = id;
      attempted = false;
      visit++;
    }
    return id;
  }

  function status(message) {
    const page = document.querySelector(errorSelector);
    if (!page) return;
    let line = page.querySelector('[data-summary-recovery]');
    if (!line) {
      line = document.createElement('p');
      line.dataset.summaryRecovery = '';
      line.className = page.querySelector('p')?.className || '';
      line.setAttribute('role', 'status');
      line.style.marginTop = '12px';
      page.append(line);
    }
    line.textContent = message;
  }

  function getData(id) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: 'GET', url: 'https://game-server.geoguessr.com/api/duels/' + id,
      timeout: 20000,
      onload(r) {
        try {
          if (r.status !== 200) throw new Error('Duel API: HTTP ' + r.status);
          const g = JSON.parse(r.responseText);
          if (g.gameId !== id || g.status !== 'Finished' || !Array.isArray(g.rounds) || !Array.isArray(g.teams))
            throw new Error('Finished duel data unavailable.');
          resolve(g);
        } catch (e) { reject(e); }
      },
      onerror: () => reject(new Error('Duel API request failed.')),
      ontimeout: () => reject(new Error('Duel API request timed out.'))
    }));
  }

  function summaryShape(g) {
    const o = g.options || {};
    // The API can include pre-generated locations for rounds never played.
    const rounds = g.rounds.filter(r => r.startTime || r.endTime ||
      g.teams.some(t => (t.roundResults || []).some(result => result.roundNumber === r.roundNumber)));
    return {
      gameId: g.gameId, context: g.context ?? null,
      finishedAt: Date.parse(rounds.at(-1)?.endTime) || undefined,
      options: {
        competitiveGameMode: o.competitiveGameMode,
        countAllGuesses: !!o.countAllGuesses, isRated: !!o.isRated,
        isTeamDuels: !!o.isTeamDuels, mapName: o.map?.name || 'Recovered duel',
        mapSlug: o.mapSlug || o.map?.slug,
        mode: o.movementOptions?.forbidRotating ? 'NoMoveNoZoom' : o.movementOptions?.forbidMoving ? 'NoMove' : 'Moving',
        roundWinMultiplierIncrement: o.roundWinMultiplierIncrement || 0
      },
      teams: g.teams.map(t => ({id: t.id, name: t.name,
        players: t.players.map(p => ({playerId: p.playerId, guesses: p.guesses || []})),
        roundResults: t.roundResults || []})),
      rounds: rounds.map(r => ({roundNumber: r.roundNumber,
        isHealingRound: !!r.isHealingRound, multiplier: r.multiplier ?? r.damageMultiplier ?? 1,
        lat: r.panorama?.lat ?? r.lat, lng: r.panorama?.lng ?? r.lng,
        panorama: {lat: r.panorama?.lat ?? r.lat, lng: r.panorama?.lng ?? r.lng}}))
    };
  }

  function nativeProps(initial, currentProps, g) {
    // Next data responses contain ALL _app props, not just pageProps.
    // In particular GeoGuessr's locale/account/translation contexts live here.
    const shared={...initial.props,...currentProps};
    return {...shared, __N_SSP:true, pageProps:{
      ...initial.props?.pageProps,...currentProps?.pageProps,
      statusCode:200,game:summaryShape(g),
      userId: shared.accountProps?.account?.user?.userId
        ?? currentProps?.pageProps?.userId ?? initial.props?.pageProps?.userId
    }};
  }


  async function repair(g, initial, router, currentVisit) {
    const payload = nativeProps(initial, router.components?.[router.route]?.props, g);
    const original = w.fetch;
    let intercepted = false, timer;
    const wrapper = function(input, init) {
      const url = new URL(typeof input === 'string' ? input : input.url || String(input), location.origin);
      if (visit === currentVisit && idNow() === g.gameId && url.origin === location.origin && url.pathname.includes('/_next/data/') &&
          url.pathname.endsWith('/duels/' + g.gameId + '/summary.json')) {
        intercepted = true;
        return Promise.resolve(new w.Response(JSON.stringify(payload), {
          status: 200, headers: {'content-type':'application/json'}
        }));
      }
      return original.call(w, input, init);
    };
    const originalUrl = location.pathname + location.search + location.hash;
    const target = new URL(location.href);
    target.pathname = target.pathname.replace(/\/?$/, '').replace(/(?:\/summary)?$/, '/summary');
    target.searchParams.set('gg_summary_recovery', String(Date.now()));
    w.fetch = wrapper;
    try {
      const result = await Promise.race([
        router.replace(target.pathname + target.search + target.hash, undefined, {shallow:false, scroll:false}),
        new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('Native recovery timed out.')), 12000);})
      ]);
      if (visit !== currentVisit || idNow() !== g.gameId) return;
      if (!intercepted || result === false) throw new Error('Native recovery did not complete.');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (visit === currentVisit && idNow() === g.gameId && document.querySelector(errorSelector))
        throw new Error('The summary is still unavailable.');
    } finally {
      clearTimeout(timer);
      if (w.fetch === wrapper) w.fetch = original;
      if (visit === currentVisit && idNow() === g.gameId) w.history.replaceState(w.history.state, '', originalUrl);
    }
  }

  async function check() {
    const id = syncVisit();
    const currentVisit = visit;
    const router = w.next?.router;
    if (!id || busy || attempted || !router?.isReady) return;
    try {
      const initial = JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent || '{}');
      const current = router.components?.[router.route]?.props?.pageProps;
      const broken = current?.statusCode === 404 ||
        (initial.query?.token === id && initial.props?.pageProps?.statusCode === 404) ||
        /Game not found|This game couldn't be found/i.test(document.body?.innerText || '');
      if (!broken) return;
      attempted = true;
      busy = true;
      status('Trying to display this summary…');
      const game = await getData(id);
      if (visit === currentVisit && idNow() === id) await repair(game, initial, router, currentVisit);
    } catch (error) {
      console.error('[GeoGuessr summary recovery]', error);
      if (visit === currentVisit && idNow() === id) status('Could not display this summary: ' + error.message);
    } finally {
      busy = false;
      if (visit !== currentVisit) scheduleCheck();
    }
  }
  let scheduled = false;
  function scheduleCheck() {
    syncVisit();
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (idNow() && document.querySelector(errorSelector)) void check();
    });
  }

  const observer = new MutationObserver(records => {
    syncVisit();
    if (!idNow() || attempted) return;
    const containsError = node => node.nodeType === 1 &&
      (node.matches(errorSelector) || node.querySelector(errorSelector));
    if (records.some(record => {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (element?.closest('[data-summary-recovery]')) return false;
      return element?.closest(errorSelector) || [...record.addedNodes].some(containsError);
    })) scheduleCheck();
  });
  observer.observe(document.documentElement, {childList: true, subtree: true, characterData: true});
  w.next?.router?.events?.on('routeChangeComplete', scheduleCheck);
  window.addEventListener('popstate', scheduleCheck);
  scheduleCheck();
})();
