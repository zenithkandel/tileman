(function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.style = "position:fixed;top:20px;right:20px;width:300px;height:300px;z-index:10000;pointer-events:none;border:2px solid #00d4ff;background:rgba(8,11,18,0.9);border-radius:8px;box-shadow:0 0 15px #000;";
    document.body.appendChild(canvas);

    let players = {}, myId = null, isHoming = false;
    const SCALE = 0.5;

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'RADAR_UPDATE') {
            if (msg.source === 'server') {
                const [id, x, y, dir, ts, unk, lx, ly, trail] = msg.data;
                players[id] = { id, x, y, dir, trail: trail || [], lastUpdate: Date.now(), isMe: false };
            } else {
                const [dir, x, y, ts, id] = msg.data;
                myId = id;
                players[id] = { id, x, y, dir, isMe: true, lastUpdate: Date.now() };
            }
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'h') {
            const me = players[myId];
            if (!me) {
                console.log("Radar: Can't home, haven't identified 'YOU' yet.");
                return;
            }

            isHoming = true;
            const target = (me.trail && me.trail.length > 0) ? me.trail[0] : [me.x, me.y];

            let keyCode = 38; // Default Up
            let keyChar = "";

            // Logic to decide which key to "tap" based on coordinates
            if (Math.abs(me.x - target[0]) > 0.5) {
                if (me.x > target[0]) { keyCode = 37; keyChar = "a"; } // Left/A
                else { keyCode = 39; keyChar = "d"; } // Right/D
            } else if (Math.abs(me.y - target[1]) > 0.5) {
                if (me.y > target[1]) { keyCode = 38; keyChar = "w"; } // Up/W
                else { keyCode = 40; keyChar = "s"; } // Down/S
            }

            console.log("Radar: Injecting Hardware KeyCode", keyCode);

            chrome.runtime.sendMessage({
                type: "INJECT_KEY",
                code: keyCode,
                text: keyChar
            });

            setTimeout(() => { isHoming = false; }, 500);
        }
    });
    function draw() {
        ctx.clearRect(0, 0, 300, 300);
        const now = Date.now();
        const me = players[myId];
        let danger = false;

        Object.keys(players).forEach(pId => {
            const p = players[pId];
            if (now - p.lastUpdate > 3000) return;

            const x = (p.x * SCALE) % 300;
            const y = (p.y * SCALE) % 300;

            if (me && !p.isMe && Math.hypot(me.x - p.x, me.y - p.y) < 60) danger = true;

            ctx.strokeStyle = p.isMe ? "#39d353" : "#ff4f00";
            ctx.beginPath();
            if (p.trail) {
                p.trail.forEach((pt, i) => {
                    const tx = (pt[0] * SCALE) % 300, ty = (pt[1] * SCALE) % 300;
                    i === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
                });
            }
            ctx.stroke();

            ctx.fillStyle = p.isMe ? "#39d353" : "#ff4f00";
            ctx.beginPath(); ctx.arc(x, y, p.isMe ? 5 : 4, 0, Math.PI * 2); ctx.fill();

            ctx.fillStyle = "white";
            ctx.font = "9px monospace";
            ctx.fillText(p.isMe ? "YOU" : `ID:${pId}`, x + 8, y);
        });

        canvas.style.borderColor = danger ? "#ff4f00" : (isHoming ? "#39d353" : "#00d4ff");
        requestAnimationFrame(draw);
    }
    draw();
})();