(function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    // Positioned in the top-right so it doesn't block the game's own UI
    canvas.style = "position:fixed;top:20px;right:20px;width:300px;height:300px;z-index:10000;pointer-events:none;border:2px solid #00d4ff;background:rgba(8, 11, 18, 0.85);border-radius:8px;box-shadow: 0 0 15px rgba(0,212,255,0.3);";
    document.body.appendChild(canvas);

    let players = {};
    let namesMap = {};

    const resize = () => {
        canvas.width = 300;
        canvas.height = 300;
    };
    resize();

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'PUT') {
            const [id, x, y, dir, ts, unk, lx, ly, trail] = msg.data;
            if (!players[id]) players[id] = { name: "Unknown" };

            players[id] = {
                ...players[id],
                x, y, dir,
                trail: trail || [],
                lastUpdate: Date.now()
            };
        }
        else if (msg.type === 'LEADERBOARD') {
            // Mapping names to whatever data we have
            msg.data.forEach(p => {
                // If we find a player with a matching score, we assign the name
                namesMap[p.sco] = p.na;
            });
        }
        else if (msg.type === 'REMOVE') {
            delete players[msg.id];
        }
    });

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Grid Lines for the Radar
        ctx.strokeStyle = "rgba(0, 212, 255, 0.1)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 300; i += 50) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 300); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(300, i); ctx.stroke();
        }

        const now = Date.now();
        for (const id in players) {
            const p = players[id];
            if (now - p.lastUpdate > 5000) continue;

            // SCALE LOGIC: Map game world to 300x300 radar
            // Adjust the 0.8 factor if the map feels too zoomed in/out
            const mapX = (p.x * 0.8) % 300;
            const mapY = (p.y * 0.8) % 300;

            // 1. Draw Player Trails on Radar
            if (p.trail && p.trail.length > 0) {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
                ctx.beginPath();
                p.trail.forEach((pt, i) => {
                    const tx = (pt[0] * 0.8) % 300;
                    const ty = (pt[1] * 0.8) % 300;
                    if (i === 0) ctx.moveTo(tx, ty);
                    else ctx.lineTo(tx, ty);
                });
                ctx.stroke();
            }

            // 2. Draw Player Dot
            const isMe = (p.dir !== undefined && p.dir !== 4 && id == "28614");
            ctx.fillStyle = isMe ? "#39d353" : "#ff4f00";
            ctx.beginPath();
            ctx.arc(mapX, mapY, 4, 0, Math.PI * 2);
            ctx.fill();

            // 3. Labels (ID & Name)
            ctx.fillStyle = "white";
            ctx.font = "9px 'JetBrains Mono', monospace";
            const displayName = namesMap[p.score] || `ID:${id}`;
            ctx.fillText(displayName, mapX + 6, mapY - 2);
        }
        requestAnimationFrame(draw);
    }
    draw();
})();