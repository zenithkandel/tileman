(function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.style = "position:fixed;top:20px;right:20px;width:300px;height:300px;z-index:10000;pointer-events:none;border:2px solid #00d4ff;background:rgba(8,11,18,0.9);border-radius:8px;";
    document.body.appendChild(canvas);

    let players = {}, myId = null, isHoming = false;
    const SCALE = 0.5;

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'RADAR_UPDATE') {
            if (msg.source === 'server') {
                const [id, x, y, dir, ts, unk, lx, ly, trail] = msg.data;
                // If we don't have an ID yet, the first active 'put' we see is likely us
                if (!myId && dir !== 4) myId = id;

                players[id] = { id, x, y, dir, trail: trail || [], lastUpdate: Date.now(), isMe: (id === myId) };
            } else if (msg.source === 'self') {
                const [dir, x, y, ts, id] = msg.data;
                myId = id; // Confirmed ID from outgoing packet
                players[id] = { id, x, y, dir, isMe: true, lastUpdate: Date.now() };
            }
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'h') {
            const me = players[myId];
            if (!me) return console.warn("Radar: Still waiting for player ID...");

            isHoming = true;
            // Target is where your trail starts (territory exit point)
            const target = (me.trail && me.trail.length > 0) ? me.trail[0] : [me.x, me.y];

            let code = 38, char = "w";
            if (Math.abs(me.x - target[0]) > 0.5) {
                if (me.x > target[0]) { code = 37; char = "a"; }
                else { code = 39; char = "d"; }
            } else if (Math.abs(me.y - target[1]) > 0.5) {
                if (me.y > target[1]) { code = 38; char = "w"; }
                else { code = 40; char = "s"; }
            }

            chrome.runtime.sendMessage({ type: "INJECT_KEY", code: code, text: char });
            setTimeout(() => { isHoming = false; }, 500);
        }
    });

    function draw() {
        ctx.clearRect(0, 0, 300, 300);
        const now = Date.now();
        const me = players[myId];

        Object.keys(players).forEach(pId => {
            const p = players[pId];
            if (now - p.lastUpdate > 3000) return;
            const x = (p.x * SCALE) % 300, y = (p.y * SCALE) % 300;

            ctx.strokeStyle = p.isMe ? "#39d353" : "#ff4f00";
            ctx.beginPath();
            if (p.trail) p.trail.forEach((pt, i) => {
                const tx = (pt[0] * SCALE) % 300, ty = (pt[1] * SCALE) % 300;
                i === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
            });
            ctx.stroke();

            ctx.fillStyle = p.isMe ? "#39d353" : "#ff4f00";
            ctx.beginPath(); ctx.arc(x, y, p.isMe ? 5 : 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "white";
            ctx.fillText(p.isMe ? "YOU" : `ID:${pId}`, x + 8, y);
        });
        requestAnimationFrame(draw);
    }
    draw();
})();