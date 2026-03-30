(function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.style = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;pointer-events:none;";
    document.body.appendChild(canvas);

    const players = {};
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'RADAR_UPDATE') {
            const p = msg.player;
            const id = p.isMe ? 'self' : p.id;
            players[id] = { ...p, ts: Date.now() };
        }
    });

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // DRAW MINI-MAP BACKGROUND
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(20, 20, 200, 200);

        for (const id in players) {
            const p = players[id];
            if (Date.now() - p.ts > 5000) continue; // Hide inactive players

            // Map game coords to the 200x200 mini-map
            // Assuming map size is ~400 units, scale is 0.5
            const mapX = 20 + (p.x * 0.5);
            const mapY = 20 + (p.y * 0.5);

            ctx.fillStyle = p.isMe ? "#00FF00" : "#FF0000";
            ctx.beginPath();
            ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        requestAnimationFrame(draw);
    }
    draw();
})();