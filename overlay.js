// overlay.js
(function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Styling the overlay
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '9999';
    canvas.style.pointerEvents = 'none'; // Click through to the game
    document.body.appendChild(canvas);

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    const players = {}; // Store player data locally

    // Listen for data from background.js
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'GAME_UPDATE') {
            const [id, x, y, dir] = msg.data;
            players[id] = { x, y, dir, lastUpdate: Date.now() };
            draw();
        }
    });

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Simple Radar/ESP Logic
        for (const id in players) {
            const p = players[id];

            // Map game coords to screen (Adjust 20 based on game zoom)
            const screenX = (p.x * 20) % canvas.width;
            const screenY = (p.y * 20) % canvas.height;

            // Draw Player Indicator
            ctx.fillStyle = id === 'me' ? '#00ff00' : '#ff0000';
            ctx.beginPath();
            ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.fillStyle = 'white';
            ctx.font = '10px Monaco';
            ctx.fillText(`ID: ${id}`, screenX + 10, screenY);
        }
    }
})();