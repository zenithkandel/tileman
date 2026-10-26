// ==UserScript==
// @name         Tileman Fun Pack
// @namespace    tileman-fun
// @version      1.0.0
// @description  Rainbow mode, live full-map minimap, detailed HUD + kill feed, nick cycler
// @match        *://tileman.io/*
// @match        *://*.tileman.io/*
// @match        *://localhost/*
// @match        *://127.0.0.1/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
/*
 * Install: Tampermonkey -> add script -> open tileman.io.  Or paste into the
 * browser console on the LOCAL mirror before the page finishes loading.
 *
 * Keys (ignored while typing in a field):
 *   R  toggle rainbow mode (animated hue-rotate on the game canvas)
 *   M  toggle minimap / stats / kill-feed panel
 *   N  randomize the nick field (applies to your NEXT spawn)
 *
 * The script is cosmetic + information only: it changes nothing the server
 * sees except the nick YOU type before pressing play.  Movement speed is
 * server-authoritative (wd.sp + put reconciliation), so no speed module.
 */
(() => {
  'use strict';
  if (window.__tmfun) return; // already installed

  // ---------------------------------------------------------------- config
  const CFG_KEY = 'tmfun_cfg_v1';
  const cfg = Object.assign(
    { rainbow: false, panel: true, hueSpeed: 1.6, feed: true },
    (() => { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } })()
  );
  const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} };

  // ---------------------------------------------------------------- state
  const state = {
    world: { sz: null, sp: null, mode: null, ts: null },   // from 'wd'
    players: new Map(),                                    // id -> {x,y,name,color,m,dead,t}
    me: { id: null, x: null, y: null },
    territory: new Map(),                                  // "tx,ty" -> hex color
    feed: [],                                              // {t, tag, text}
    session: { kills: 0, captures: 0, tiles: 0, deaths: 0, joins: 0, started: Date.now() },
    socket: null,
  };
  const TERRITORY_CAP = 150000;

  const now = () => Date.now();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function pushFeed(tag, text) {
    state.feed.unshift({ t: now(), tag, text });
    if (state.feed.length > 40) state.feed.length = 40;
    if (cfg.feed) renderFeed();
  }

  // ------------------------------------------------- module 1: io() capture
  // The game creates its socket via a global io(url, opts).  Wrapping that
  // global (before or after the socket.io client loads) lets us observe every
  // server event with exact payloads — wd gives map size, pst/put give player
  // positions and names, ki/ca/rp give the kill & capture feed.
  function wrapSocket(sock, url, opts) {
    state.socket = sock;
    const origOn = sock.on.bind(sock);
    sock.on = function (ev, fn) {
      if (typeof fn === 'function') {
        const wrapped = function (...args) {
          try { capture(ev, args); } catch (e) { /* never break the game */ }
          return fn.apply(this, args);
        };
        return origOn(ev, wrapped);
      }
      return origOn(ev, fn);
    };
    const origEmit = sock.emit.bind(sock);
    sock.emit = function (ev, ...args) {
      try { captureEmit(ev, args); } catch (e) {}
      return origEmit(ev, ...args);
    };
    pushFeed('net', 'connect ' + String(url).slice(0, 40));
    return sock;
  }

  const ioHolder = { fn: null };
  function wrapIoFactory(fn) {
    return function ioWrapped(u, o) {
      const sock = fn(u, o);
      try { return wrapSocket(sock, u, o); } catch (e) { return sock; }
    };
  }
  function installIoHook() {
    if (typeof window.io === 'function' && !ioHolder.fn) {
      // page already loaded socket.io before us (console paste) — wrap in place
      ioHolder.fn = wrapIoFactory(window.io);
      try {
        Object.defineProperty(window, 'io', {
          configurable: true,
          get() { return ioHolder.fn; },
          set(fn) { ioHolder.fn = wrapIoFactory(fn); },
        });
      } catch (e) {}
      return;
    }
    try {
      Object.defineProperty(window, 'io', {
        configurable: true,
        get() { return ioHolder.fn; },
        set(fn) { ioHolder.fn = wrapIoFactory(fn); },
      });
    } catch (e) {}
  }
  installIoHook();

  const nameOf = (id) => { const p = state.players.get(id); return p && p.name ? p.name : '#' + id; };
  const short = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function capture(ev, args) {
    switch (ev) {
      case 'wd': {
        const w = args[0] || {};
        state.world.sz = w.sz != null ? w.sz : state.world.sz;
        state.world.sp = w.sp != null ? w.sp : state.world.sp;
        state.world.m = w.m;
        state.world.ts = w.ts;
        state.session.joins++;
        pushFeed('world', `size ${state.world.sz} speed ${state.world.sp} ks ${w.ks}`);
        break;
      }
      case 'pst': {
        // [id,x,y,dir,name,color,m,trail,flag]
        const [id, x, y, dir, name, color, m] = args[0] || [];
        state.players.set(id, { x, y, name, color, m: !!m, dead: false, t: now() });
        if (m) { state.me.id = id; state.me.x = x; state.me.y = y; }
        break;
      }
      case 'put': {
        // [id,x,y,dir,ts,seq,lx,ly,trail,flag]
        const [id, x, y] = args[0] || [];
        let p = state.players.get(id);
        if (!p) { p = { name: '#' + id, color: '#888', m: false, dead: false }; state.players.set(id, p); }
        p.x = x; p.y = y; p.t = now(); p.dead = false;
        if (state.me.id === id) { state.me.x = x; state.me.y = y; }
        break;
      }
      case 'pr': {
        const id = args[0] && args[0].id;
        state.players.delete(id);
        break;
      }
      case 'pd': {
        const d = args[0] || {};
        const p = state.players.get(d.id);
        if (p) p.dead = true;
        if (state.me.id === d.id) state.session.deaths++;
        break;
      }
      case 'ki': {
        // [killScore, victimName?]
        const a = args[0] || [];
        state.session.kills++;
        pushFeed('kill', `+${a[0]} ${a[1] != null ? '→ ' + short(a[1], 14) : ''}`.trim());
        break;
      }
      case 'ca': {
        // [tiles, combo]
        const a = args[0] || [];
        state.session.captures++;
        state.session.tiles += (a[0] | 0);
        pushFeed('capt', `${a[0]} tiles (combo ${a[1]})`);
        break;
      }
      case 'rp': {
        pushFeed('rp', String(args[0]).slice(0, 40));
        break;
      }
      case 'sc': {
        const s = args[0] || {};
        pushFeed('score', `b${s.b} k${s.k} tr${s.tr} ti${s.ti}`);
        break;
      }
      case 'lr': {
        // leaderboard — keep top name for feed; panel reads DOM anyway
        break;
      }
      case 'crash': pushFeed('srv', 'SERVER CRASHED'); break;
      case 'ex': pushFeed('srv', 'world closed'); break;
      case 'fu': pushFeed('srv', 'server full'); break;
      default: break;
    }
  }

  function captureEmit(ev, args) {
    // join / move event names carry invisible U+202D/U+202C marks — detect loosely
    const s = String(ev);
    if (s.indexOf('0') >= 0 && s.length <= 4 && args[0] && args[0].n !== undefined) {
      pushFeed('me', `join as "${short(args[0].n, 14)}"`);
    } else if (s.indexOf('1') >= 0 && s.length <= 4) {
      // movement — too chatty for the feed; skip
    } else if (s === '2') {
      pushFeed('me', `emote ${args[0]}`);
    }
  }

  // ------------------------------------- module 2: territory via fillRect hook
  // Tiles are drawn with small square fillRects under a camera transform.
  // Inverting ctx.getTransform() maps each rect back to world coordinates,
  // letting us rebuild a whole-map territory heatmap without touching internals.
  const OrigCtx = window.CanvasRenderingContext2D;
  let territoryHooked = false;
  function installTerritoryHook() {
    if (territoryHooked || !OrigCtx || !OrigCtx.prototype) return;
    const orig = OrigCtx.prototype.fillRect;
    OrigCtx.prototype.fillRect = function (x, y, w, h) {
      try {
        if (cfg.panel && state.world.sz && w > 0 && w < 60 && h > 0 && h < 60 && Math.abs(w - h) < 3) {
          const t = this.getTransform ? this.getTransform() : null;
          const cs = this.fillStyle;
          if (t && typeof cs === 'string' && cs.charAt(0) === '#') {
            const det = t.a * t.d - t.b * t.c;
            if (det) {
              const wx = (t.d * x - t.c * y + (t.c * t.f - t.d * t.e)) / det;
              const wy = (-t.b * x + t.a * y + (t.b * t.e - t.a * t.f)) / det;
              if (wx >= -4 && wy >= -4 && wx <= state.world.sz + 4 && wy <= state.world.sz + 4) {
                const key = Math.floor(wx) + ',' + Math.floor(wy);
                if (state.territory.get(key) !== cs) {
                  state.territory.set(key, cs);
                  if (state.territory.size > TERRITORY_CAP) {
                    // Map iterates in insertion order — drop the oldest quarter
                    let drop = (TERRITORY_CAP / 4) | 0;
                    for (const k of state.territory.keys()) { state.territory.delete(k); if (--drop <= 0) break; }
                  }
                }
              }
            }
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    territoryHooked = true;
  }
  installTerritoryHook();

  // ---------------------------------------------------------------- rainbow
  let hue = 0;
  let rainbowRaf = 0;
  const gameCanvas = () => document.getElementById('canvas');

  function rainbowTick() {
    hue = (hue + cfg.hueSpeed) % 360;
    const c = gameCanvas();
    if (c) c.style.filter = 'hue-rotate(' + hue.toFixed(1) + 'deg)';
    rainbowRaf = requestAnimationFrame(rainbowTick);
  }
  function setRainbow(on) {
    cfg.rainbow = !!on;
    saveCfg();
    const c = gameCanvas();
    if (cfg.rainbow) {
      if (!rainbowRaf) rainbowRaf = requestAnimationFrame(rainbowTick);
      pushFeed('fx', 'rainbow ON');
    } else {
      if (rainbowRaf) { cancelAnimationFrame(rainbowRaf); rainbowRaf = 0; }
      if (c) c.style.filter = '';
      pushFeed('fx', 'rainbow OFF');
    }
    syncPanelHeader();
  }

  // ---------------------------------------------------------------- nick
  const NICKS = [
    'tile god', 'not a bot', 'sd卡', 'Hue Shift', 'Mr. Minimap', 'free candy',
    'lag wizard', ' Territory ', '0xRGB', 'paper cut', 'trail mix', 'spawn camped',
    'CTRL+Z', 'void walker', 'rgb gang', 'captcha passed',
  ];
  function randomNick() {
    const n = NICKS[(Math.random() * NICKS.length) | 0].trim();
    const el = document.getElementById('nick');
    if (el) { el.value = n; el.dispatchEvent(new Event('input', { bubbles: true })); }
    pushFeed('me', 'nick → "' + short(n, 16) + '" (applies next spawn)');
  }

  // ---------------------------------------------------------------- panel
  let panel = null, pBody = null, pMap = null, pStats = null, pFeed = null;
  let statsTimer = 0, mapTimer = 0;

  const CSS = [
    '#tmfun-panel{position:fixed;top:12px;right:12px;z-index:2147483647;width:248px;',
    'background:rgba(12,14,20,.82);color:#cfe3ff;font:12px/1.45 ui-monospace,Consolas,monospace;',
    'border:1px solid rgba(120,170,255,.35);border-radius:8px;backdrop-filter:blur(4px);',
    'user-select:none;box-shadow:0 6px 24px rgba(0,0,0,.45)}',
    '#tmfun-panel *{box-sizing:border-box}',
    '#tmfun-hd{cursor:move;padding:6px 10px;font-weight:700;letter-spacing:.4px;color:#9ecbff;',
    'border-bottom:1px solid rgba(120,170,255,.25);display:flex;justify-content:space-between}',
    '#tmfun-hd b{color:#fff}',
    '#tmfun-body{padding:8px 10px 10px}',
    '#tmfun-map{width:100%;aspect-ratio:1;display:block;background:#0a0c10;',
    'border:1px solid rgba(120,170,255,.3);border-radius:4px;image-rendering:pixelated}',
    '#tmfun-stats{margin:8px 0 4px;white-space:pre}',
    '#tmfun-stats b{color:#fff}',
    '#tmfun-leaders{margin:2px 0 6px;color:#9fb6d8;font-size:11px}',
    '#tmfun-feed{list-style:none;margin:4px 0 0;padding:4px 0 0;border-top:1px solid rgba(120,170,255,.2);',
    'max-height:132px;overflow:hidden;font-size:11px}',
    '#tmfun-feed li{padding:1px 0;color:#b9cdea}',
    '#tmfun-feed .tg{display:inline-block;width:40px;color:#6fa8ff}',
    '#tmfun-feed .tm{color:#5c6f8c;margin-right:4px}',
    '#tmfun-panel.dead{opacity:.55}',
  ].join('');

  function ensurePanel() {
    if (panel && panel.isConnected) return;
    const st = document.createElement('style');
    st.id = 'tmfun-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);

    panel = document.createElement('div');
    panel.id = 'tmfun-panel';
    panel.innerHTML =
      '<div id="tmfun-hd"><b>TILEMAN FUN</b><span id="tmfun-badge">R rainbow · M panel · N nick</span></div>' +
      '<div id="tmfun-body">' +
      '<canvas id="tmfun-map" width="224" height="224"></canvas>' +
      '<div id="tmfun-stats">booting…</div>' +
      '<div id="tmfun-leaders"></div>' +
      '<ul id="tmfun-feed"></ul>' +
      '</div>';
    (document.body || document.documentElement).appendChild(panel);
    pBody = panel.querySelector('#tmfun-body');
    pMap = panel.querySelector('#tmfun-map');
    pStats = panel.querySelector('#tmfun-stats');
    pFeed = panel.querySelector('#tmfun-feed');
    makeDraggable(panel, panel.querySelector('#tmfun-hd'));

    if (!statsTimer) statsTimer = setInterval(refreshStats, 400);
    if (!mapTimer) mapTimer = setInterval(drawMinimap, 120);
  }

  function removePanel() {
    if (panel) { panel.remove(); panel = null; }
    if (statsTimer) { clearInterval(statsTimer); statsTimer = 0; }
    if (mapTimer) { clearInterval(mapTimer); mapTimer = 0; }
  }

  function setPanel(on) {
    cfg.panel = !!on;
    saveCfg();
    if (cfg.panel) { ensurePanel(); refreshStats(); drawMinimap(); renderFeed(); }
    else removePanel();
    syncPanelHeader();
  }

  function syncPanelHeader() {
    const b = document.getElementById('tmfun-badge');
    if (b) b.textContent = (cfg.rainbow ? '🌈 ' : '') + 'R rainbow · M panel · N nick';
    if (panel) panel.classList.toggle('dead', !!state.me.id && state.players.get(state.me.id) && state.players.get(state.me.id).dead);
  }

  function makeDraggable(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
      el.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
      el.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  const txt = (id) => { const e = document.getElementById(id); return e ? (e.textContent || '').trim() : ''; };

  function refreshStats() {
    if (!pStats) return;
    const s = state.session;
    const alive = ((now() - s.started) / 1000) | 0;
    const mm = (alive / 60) | 0, ss = alive % 60;
    const sz = state.world.sz || '?';
    pStats.innerHTML =
      'score <b>' + esc(txt('score') || '0') + '</b>   kills <b>' + esc(txt('kills') || '0') + '</b>\n' +
      'tiles <b>' + esc(txt('captured') || '—') + '</b>  rank <b>' + esc(txt('rank') || '—') + '</b>\n' +
      'fps <b>' + esc(txt('fps') || '?') + '</b>  ping <b>' + esc(txt('latency') || '?') + '</b>  srv <b>' + esc(txt('latencytoserver') || '?') + '</b>\n' +
      'map <b>' + sz + '×' + sz + '</b> sp <b>' + (state.world.sp != null ? state.world.sp : '?') + '</b>\n' +
      'pos <b>' + (state.me.x != null ? state.me.x.toFixed(1) + ',' + state.me.y.toFixed(1) : '—') + '</b>\n' +
      'session: K <b>' + s.kills + '</b> D <b>' + s.deaths + '</b> capt <b>' + s.captures + '</b> (' + s.tiles + ')\n' +
      'alive <b>' + mm + ':' + (ss < 10 ? '0' : '') + ss + '</b>  tracked <b>' + state.players.size + '</b> players\n' +
      'tiles cached <b>' + state.territory.size + '</b>';
    pStats.style.whiteSpace = 'pre';
    const ld = document.getElementById('leaders');
    const leaders = panel.querySelector('#tmfun-leaders');
    if (leaders && ld) leaders.textContent = (ld.innerText || ld.textContent || '').split('\n').filter(Boolean).slice(0, 5).join(' · ');
    syncPanelHeader();
  }

  function renderFeed() {
    if (!pFeed) return;
    pFeed.innerHTML = state.feed.slice(0, 12).map((f) => {
      const d = new Date(f.t);
      const ts = String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
      return '<li><span class="tm">' + ts + '</span><span class="tg">' + esc(f.tag) + '</span>' + esc(f.text) + '</li>';
    }).join('');
  }

  function drawMinimap() {
    if (!pMap) return;
    const ctx = pMap.getContext && pMap.getContext('2d');
    if (!ctx) return;
    const W = pMap.width, H = pMap.height;
    const sz = state.world.sz;
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, W, H);
    if (!sz) {
      ctx.fillStyle = '#44608c';
      ctx.font = '11px monospace';
      ctx.fillText('waiting for wd…', 12, H / 2);
      return;
    }
    const k = W / sz;
    // grid
    ctx.strokeStyle = 'rgba(90,130,200,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const p = ((W / 8) * i) | 0;
      ctx.moveTo(p, 0); ctx.lineTo(p, H);
      ctx.moveTo(0, p); ctx.lineTo(W, p);
    }
    ctx.stroke();
    // territory (reconstructed from fillRect hook)
    for (const [key, color] of state.territory) {
      const c = key.indexOf(',');
      const tx = +key.slice(0, c), ty = +key.slice(c + 1);
      ctx.fillStyle = color;
      ctx.fillRect(tx * k, ty * k, Math.max(1, k), Math.max(1, k));
    }
    // players
    const t = now();
    for (const p of state.players.values()) {
      if (p.x == null || p.y == null) continue;
      if (t - p.t > 15000 && !p.m) continue; // hide stale ghosts
      ctx.beginPath();
      ctx.arc(p.x * k, p.y * k, p.m ? 3.4 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = p.dead ? '#666' : (p.color || '#adf');
      ctx.fill();
      if (p.m) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        ctx.fillText('YOU', p.x * k + 5, p.y * k - 4);
      } else if (p.name) {
        ctx.fillStyle = 'rgba(200,220,255,.75)';
        ctx.font = '8px monospace';
        ctx.fillText(short(p.name, 10), p.x * k + 4, p.y * k + 3);
      }
    }
  }

  // ---------------------------------------------------------------- keys
  function typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    const k = e.code;
    if (k === 'KeyR') { setRainbow(!cfg.rainbow); e.preventDefault(); }
    else if (k === 'KeyM') { setPanel(!cfg.panel); e.preventDefault(); }
    else if (k === 'KeyN') { randomNick(); e.preventDefault(); }
  }, true);

  // ---------------------------------------------------------------- boot
  function boot() {
    if (cfg.panel) ensurePanel();
    if (cfg.rainbow) setRainbow(true); // restart animation if persisted on
    pushFeed('fx', 'Tileman Fun Pack ready');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // debug handle
  window.__tmfun = {
    state, cfg,
    setRainbow, setPanel, randomNick,
    capture, // exposed for testing
    version: '1.0.0',
  };
})();
