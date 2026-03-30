(function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.style = "position:fixed;top:20px;right:20px;width:300px;height:300px;z-index:10000;pointer-events:none;border:2px solid #00d4ff;background:rgba(8, 11, 18, 0.9);border-radius:8px;transition: border-color 0.2s;";
    document.body.appendChild(canvas);

    let players = {};
    let myId = null;

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'PUT') {
            const [id, x, y, dir, ts, unk, lx, ly, trail] = msg.data;
            if (!players[id]) players[id] = { id };
            players[id] = { ...players[id], x, y, dir, trail: trail || [], lastUpdate: Date.now() };
        }
        else if (msg.type === 'LEADERBOARD') {
            // Usually, the first entry in your 'put' updates or the top of the local log 
            // is you. We can also try to find 'me' by looking for specific skin colors.
        }
    });

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const now = Date.now();
        let dangerDetected = false;
        let me = Object.values(players).find(p => p.isMe) || players["28614"]; // Fallback to your ID

        for (const id in players) {
            const p = players[id];
            if (now - p.lastUpdate > 5000) continue;

            const mapX = (p.x * 0.8) % 300;
            const mapY = (p.y * 0.8) % 300;

            // --- ADVANTAGE: PROXIMITY ALERT ---
            if (me && id != me.id) {
                const dist = Math.sqrt(Math.pow(me.x - p.x, 2) + Math.pow(me.y - p.y, 2));
                if (dist < 40) dangerDetected = true; // Enemy is within 40 units
            }

            // Draw Trails
            ctx.strokeStyle = (id == me?.id) ? "rgba(57, 211, 83, 0.4)" : "rgba(255, 79, 0, 0.3)";
            ctx.beginPath();
            p.trail.forEach((pt, i) => {
                const tx = (pt[0] * 0.8) % 300;
                const ty = (pt[1] * 0.8) % 300;
                if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
            });
            ctx.stroke();

            // Draw Dots
            ctx.fillStyle = (id == me?.id) ? "#39d353" : "#ff4f00";
            ctx.shadowBlur = (id == me?.id) ? 10 : 0;
            ctx.shadowColor = ctx.fillStyle;
            ctx.beginPath();
            ctx.arc(mapX, mapY, id == me?.id ? 5 : 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Labels
            ctx.fillStyle = "white";
            ctx.font = "bold 9px monospace";
            ctx.fillText(id == me?.id ? "YOU" : `ID:${id}`, mapX + 8, mapY - 2);
        }

        // Update Radar Border based on Danger
        canvas.style.borderColor = dangerDetected ? "#ff4f00" : "#00d4ff";
        if (dangerDetected) {
            ctx.fillStyle = "rgba(255, 79, 0, 0.1)";
            ctx.fillRect(0, 0, 300, 300); // Slight red overlay when enemy is near
        }

        requestAnimationFrame(draw);
    }
    draw();
})();