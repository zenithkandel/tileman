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

    // AUTO-HOME LOGIC
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'h') {
            const me = players[myId];
            if (!me) return;

            isHoming = true;
            // Target: Start of your trail (your last safe exit point)
            const target = me.trail.length > 0 ? me.trail[0] : [0, 0];

            // Manhattan Distance Pathfinding (prevents diagonal death)
            let nextDir = me.dir;
            if (Math.abs(me.x - target[0]) > 1) {
                nextDir = me.x > target[0] ? 3 : 1; // 3: West, 1: East
            } else if (Math.abs(me.y - target[1]) > 1) {
                nextDir = me.y > target[1] ? 0 : 2; // 0: North, 2: South
            }

            chrome.runtime.sendMessage({
                type: "INJECT_PACKET",
                payload: [nextDir, me.x, me.y, Date.now(), myId]
            });

            setTimeout(() => { isHoming = false; }, 1000);
        }
    });

    function draw() {
        ctx.clearRect(0, 0, 300, 300);
        const me = players[myId];
        let danger = false;

        Object.values(players).forEach(p => {
            if (Date.now() - p.lastUpdate > 3000) return;
            const x = (p.x * SCALE) % 300, y = (p.y * SCALE) % 300;

            // Proximity Check
            if (me && !p.isMe && Math.hypot(me.x - p.x, me.y - p.y) < 60) danger = true;

            // Draw Trail & Dot
            ctx.strokeStyle = p.isMe ? "#39d353" : "#ff4f00";
            ctx.beginPath();
            p.trail.forEach((pt, i) => {
                const tx = (pt[0] * SCALE) % 300, ty = (pt[1] * SCALE) % 300;
                i === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
            });
            ctx.stroke();

            ctx.fillStyle = p.isMe ? "#39d353" : "#ff4f00";
            ctx.beginPath(); ctx.arc(x, y, p.isMe ? 5 : 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillText(p.isMe ? "YOU" : id, x + 8, y);
        });

        canvas.style.borderColor = danger ? "#ff4f00" : (isHoming ? "#39d353" : "#00d4ff");
        requestAnimationFrame(draw);
    }
    draw();
})();