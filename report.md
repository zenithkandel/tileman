# tileman.io Client Reverse-Engineering Report

**Target:** `tileman/tileman.io/hra.min.js` (obfuscated game client, javascript-obfuscator output, ~212 KB single line, 777-entry string array)
**Date:** 2026-10-26
**Method:** static string-array decode + annotated-source analysis + live traffic capture (`Network.txt` from git history) + dynamic jsdom harness running the real client

---

## 1. Overview

Tileman.io is a paper.io-style territory-capture game. The client is a fully obfuscated single-file JS bundle; the mirror in this repo also contains offline-support files (workbox service worker, regional subdomains as static captures). The client connects to a regional Node server over socket.io (EIO=3, websocket-only) on namespace `/p`, with the game mode encoded in the socket.io **path**.

Three independent evidence sources were used and they fully agree:

1. **Static decode** — the obfuscator's string-array decoder was extracted and executed (`decode.js`), producing a fully annotated client (`hra_annotated.js`).
2. **Live capture** — `Network.txt` (commit `db73163`), real packet log from asia server, fast4x mode.
3. **Dynamic harness** — the real `hra.min.js` booted in jsdom against a fake socket (`harness.js`); the client joined, spawned, rendered, and emitted movement packets live.

---

## 2. Connection

```js
io("eu1.tileman.io/p", {            // host + namespace "/p"
  transports: ["websocket"],
  upgrade: false,
  reconnection: false,
  forceNew: true,
  path: "/socket.io/" + mode,       // "classic" | "rats" | "fast4x" | ...
  query: {
    n: nick,                        // player name
    c: color,                       // color key, e.g. "a"
    l: "en-US",                     // language
    ab: true,                       // A/B flag
    u: userId,                      // localStorage "uu" (random 25-char)
    f: fingerprint,                 // Fingerprint2 x64hash128, 32 hex chars
    pw: JSON.stringify(pw),         // "{}" normally
    v: 1.2                          // protocol version
  }
})
```

- Regions: `usa` / `eu1` / `asia.tileman.io`; URL shapes like `wss://asia.tileman.io/socket.io/rats/?...`.
- Engine.io handshake: server opens `0{"sid":...,"upgrades":[],"pingInterval":1000,"pingTimeout":50000}`; namespace connect `40` / `40/p,`; heartbeats are raw `2` (client) / `3` (server).
- Play-button flow: click → 50 ms debounce → ad-preroll branch (skipped if `novideoads` in localStorage or CrazyGames build) → `setTimeout(connect, 750 - elapsedSinceBoot)`.

### Invisible Unicode in Packet Names

The join and movement event names contain U+202D/LTR-override control characters **on the wire** (verified in capture: `42/p,["ΓÇ¡0ΓÇ¡",{...}]`, `ΓÇ¡ΓÇ¡1ΓÇ¡`):

| Logical name | Actual wire string |
|---|---|
| join | `"‭0‭"` (U+202D + `0` + U+202C) |
| movement | `"‭‭1‭"` (U+202D U+202D + `1` + U+202C) |

A faithful client/server must reproduce these bytes exactly. Likely origin: pasted strings picked up direction-override marks from a bidi-confused editor; kept because server and client share them.

---

## 3. Client → Server Events

| Event | Payload | Notes |
|---|---|---|
| `"‭0‭"` (join) | `{n: name, c: color, pw: {}}` | sent once on play click, re-sent on every `wd` |
| `"‭‭1‭"` (move) | `[dir, x, y, floor(serverTime), 50]` | `50` = `wd.r` (base64 `"NTA="`); x/y are tile-centered floats (e.g. `167.5`) |
| `"2"` (emote) | `N` | Space→−4, Z→1, X→2; 50 ms client rate limit |
| `"9"` (focus) | `true`/`false` | `true` on window focus, `false` on blur and on `wd` receipt |
| `"lagtoserver"` | — | probe; server answers `"pong"` with a value; client shows RTT and keeps min RTT/2 |

### Movement details

- Direction codes: **0 = right (+x), 1 = down (+y), 2 = left (−x), 3 = up (−y), 4 = stop, 5 = boundary correction** (auto-sent when predicted position leaves `[0, mapSize]`).
- Key map: `D/→/Numpad6`=0, `S/↓/Numpad2`=1, `A/←/Numpad4`=2, `W/↑/Numpad8`=3, `E/P/Numpad5`=4 (stop).
- Client keeps a server-time estimate that only advances while moving; movement is queued (max ~2), deduped against last direction, and includes the estimated server timestamp each send.
- Client-side prediction: position interpolates along the queued direction at `wd.sp` tiles/ms between server `put`s.

---

## 4. Server → Client Events

Registered handlers (offsets in annotated file):

| Event | Payload | Meaning |
|---|---|---|
| `wd` | `{sz, sp, pa, ts, r, m, fw, ks}` | world init: map size (e.g. 300), speed (0.024 tiles/ms), params, server time, `r`=base64 constant (→ 50), mode, fill-width, kill-score threshold. Client builds tile grid, picks spawn, re-emits join + `9 false` |
| `ti` | `[t1, t2]` | clock sync pair (~45 ms apart); client maintains smoothed server clock |
| `pst` | `[id, x, y, dir, name, color, m, trail, flag]` | player spawn/state; `m=1` marks **self**; trail = `[[x,y],...]` polyline |
| `put` | `[id, x, y, dir, ts, seq\|null, lastX, lastY, trail, flag]` | position update; `seq=null` for fresh spawns (`lx/ly=-1`) |
| `ch` | `[colors[], Int16Array RLE]` (binary attachment) | palette + tile-color runs. **First `ch` arms play state** (game UI shows, keys activate) |
| `fa` | `[color, Int16Array RLE]` (binary) | fill-area update (captured territory paint) |
| `m` | `Int16Array` (binary) | map delta: wall/emote flags per row runs |
| `ca` | `[tiles, combo]` | capture event: total tiles + combo count; % = tiles/`sz²`; `sz²==tiles` → "You won!" |
| `ki` | `[killScore, victimName?]` | kill: +combo (5 s window), `+N` popup, "Killed X" message, auto-move on first kill |
| `pr` | `{id}` | remove player from world |
| `pd` | `{id, po:[x,y], t: trail}` | player death: marks dead, leaves death trail |
| `rp` | reason string | kill reason: `"wall"` → "You crashed into the wall", `"suicide"`, `"latereturn"`, `"player:<id>"` → "Player X killed you" |
| `rw` | `[seconds]` | "Return to your territory!" warning, grace = seconds × 1000 ms |
| `lr` | `[{na, sco, m}, ...]` | leaderboard (name, score, mode) |
| `sc` | `{b, k, tr, ti, m}` | score summary (best/last blocks, kills, tiles, time, mode); drives after-game screen + localStorage highscores (`hs`, base64 JSON keyed by mode) |
| `tx` | `message` | server text pushed to message queue |
| `in` | code | disconnect reason: **530** = "You respawn too fast", **1** = "You're disconnected for inactivity", else "Invalid client. Refresh page..." |
| `ex` | — | "World was closed" |
| `crash` | — | "Server crashed. Please report." |
| `fu` | — | "Server is full :( Try later." |
| `pong` | value | lag-probe response |
| `yy` | — | April-Fools flag (random spawn) |
| `apr` | — | April-Fools flag 2 |
| `da` | `{c, cp, p}` | three color arrays drawn on map (borders/special zones) |

Binary frames use socket.io attachment format: `451-/p,["ch",[...]]` + binary blob. Payload integers are little-endian Int16; `ch`/`fa` RLE uses sentinel-prefixed `[colorIdx, start, end]` runs; `-32768`-class sentinels mark run boundaries.

---

## 5. Game Rules (from client strings + handler logic)

- Grid of size `sz × sz` (e.g. 300×300); each tile belongs to a color; spawn grants a small base (capture log shows `ca [9,0]` at spawn).
- Leave your territory → trail forms; return to claim area (`fa` paints it). Trail cut / wall crash / out-of-bounds → death.
- `rw` gives a timed "return to your territory" window; missing it → late-return death message.
- Kill scoring: `ki` adds to a combo within a 5 s window; `ks` in `wd` is the kill-score constant (200 seen).
- Capturing every tile (`sz²`) wins ("You won!").
- Anti-fast-respawn: server kicks with code 530; inactivity kick code 1.
- Modes: classic / fast4x / rats / arena / blind; each has its own socket.io path and server instance.
- Emotes: heart/circle/skull buttons (ids −4/1/2) with client-side 50 ms limit.

---

## 6. Client Internals / Behaviors

- **Time model:** client runs a fake "server clock" (`ts` seeded from `wd`/`ti`, advanced locally while moving, nudged by `put`s); movement sends `floor(clock)`.
- **Interpolation & reconciliation:** remote players interpolate between `put`s at speed `sp`; own position reconciles against server `put` with threshold-based snap vs. smooth.
- **Prediction queue:** local direction changes queue up to ~2 moves; duplicate directions suppressed; `dir=4` stops.
- **Storage:** `uu` (user id), `novideoads`, `hs` (highscores), `n` (last nick), settings object merged into `history.state.storage`.
- **Focus handling:** window blur clears key queues and emits `9 false`; visibilitychange resets counters.
- **Anti-tamper:** inert equality self-checks (`"X"==="X"` dead branches from control-flow flattening); the `in`-event "Invalid client" message for unrecognized disconnect codes.
- **UI wiring:** `dyn-script` element hosts CrazyGames SDK loader; `aiptag` ad system (`aipPlayer`, preroll → `AIP_COMPLETE`); gtag analytics events on play.
- **Key handling:** keydown listeners on nick input, a container, and play area; movement keys return `"move"` only when play state is armed (first `ch`); `Escape`/`Enter`/`F` for menu/submit actions.

---

## 7. Tooling Produced

| File | Purpose |
|---|---|
| `tmharness/decode.js` | Extracts + runs the obfuscator string-array decoder in a `vm`; modes: `idx`, `region`, `all`, `bulk` |
| `hra_annotated.js` | Whole client with every string-array lookup replaced by its decoded value |
| `tmharness/harness.js` | jsdom boot of the real client with fake socket/canvas/ads/fingerprint; scripted full session |
| `tmharness/find*.js` | Context-window search helpers over the annotated source |
| `network_captured.txt` | Live traffic dump restored from git (`db73163:Network.txt`) |

Harness verification highlights:

```
[io()] eu1.tileman.io/p {"transports":["websocket"],...,"path":"/socket.io/classic"}
[SOCKET.EMIT] ‭0‭ {"n":"BOT","c":"a","pw":{}}
[SERVER→CLIENT] wd {"sz":300,"sp":0.024,...,"r":"NTA=",...}
[SOCKET.EMIT] 9 false
[SOCKET.EMIT] ‭0‭ {"n":"BOT","c":"a","pw":{}}
[STATE] captured "111 (0.12%)"          # 111 / 300²
[SOCKET.EMIT] ‭‭1‭ [3,101,109.5,61758892,50]   # W
[SOCKET.EMIT] ‭‭1‭ [0,101,105.5,61759121,50]   # D
[SOCKET.EMIT] ‭‭1‭ [1,106.5,105,61759340,50]   # S
[SOCKET.EMIT] ‭‭1‭ [2,107,109.5,61759562,50]   # A
[SOCKET.EMIT] ‭‭1‭ [4,102.5,110,61759788,50]   # E (stop)
```

---

## 8. Open Questions / Next Steps

- Exact RLE sentinel scheme for `ch`/`fa`/`m` binary payloads (structure known, boundary constants not fully enumerated).
- Full render pipeline details (canvas draw order, trail glow, emote sprites) — mapped but not exhaustively documented.
- Server-side logic (collision, scoring cadence, `lr` update interval ~1 s observed) — inferred from traffic, not present in this repo.
- Possible deliverable: an offline server implementing this protocol for the mirror.
