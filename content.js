(function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.style = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;pointer-events:none;";
    document.body.appendChild(canvas);

    let players = {};
    let namesMap = {}; // Maps score/rank to names (best guess logic)

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'PUT') {
            const [id, x, y, dir, ts, unknown, lastX, lastY, trail] = msg.data;
            if (!players[id]) players[id] = {};

            players[id] = {
                ...players[id],
                x, y, dir,
                trail: trail || [], // Capture the lines they are drawing
                lastUpdate: Date.now()
            };
        }
        else if (msg.type === 'LEADERBOARD') {
            // The game usually sends leaderboard as a list. 
            // We use this to keep a fresh list of active names.
            msg.data.forEach(p => {
                namesMap[p.na] = p.sco;
            });
        }
        else if (msg.type === 'REMOVE') {
            delete players[msg.id];
        }
    });

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const now = Date.now();
        for (const id in players) {
            const p = players[id];
            if (now - p.lastUpdate > 3000) continue; // Cleanup old data

            // COORDINATE MAPPING
            // tileman.io usually uses a coordinate system that needs scaling
            // We'll use a 1:15 scale for this overlay
            const screenX = (p.x * 15) % canvas.width;
            const screenY = (p.y * 15) % canvas.height;

            // 1. DRAW TRAILS (The lines they are making)
            if (p.trail && p.trail.length > 0) {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                p.trail.forEach((point, i) => {
                    const tx = (point[0] * 15) % canvas.width;
                    const ty = (point[1] * 15) % canvas.height;
                    if (i === 0) ctx.moveTo(tx, ty);
                    else ctx.lineTo(tx, ty);
                });
                ctx.stroke();
            }

            // 2. DRAW PLAYER INDICATOR
            ctx.fillStyle = (id == "28614") ? "#00FF00" : "#FF4444"; // Highlight specific ID if known
            ctx.beginPath();
            ctx.arc(screenX, screenY, 6, 0, Math.PI * 2);
            ctx.fill();

            // 3. DRAW TEXT (Name and ID)
            ctx.fillStyle = "white";
            ctx.font = "bold 12px Inter, sans-serif";
            ctx.shadowBlur = 4;
            ctx.shadowColor = "black";

            // Display ID and status
            const status = p.dir === 4 ? "[PAUSED]" : "";
            ctx.fillText(`ID: ${id} ${status}`, screenX + 10, screenY - 5);

            // 4. DRAW COORDINATES
            ctx.font = "9px JetBrains Mono";
            ctx.fillStyle = "#00d4ff";
            ctx.fillText(`X: ${Math.round(p.x)} Y: ${Math.round(p.y)}`, screenX + 10, screenY + 8);
        }
        requestAnimationFrame(draw);
    }
    draw();
})();