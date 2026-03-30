(function () {
    // ... (Keep your existing Canvas and Player logic from the previous version) ...

    let myTrail = []; // Track our own active tail
    let isAutoHoming = false;

    // 1. Capture our own trail from the "self" update
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'RADAR_UPDATE') {
            if (msg.source === 'self') {
                const [dir, x, y, ts, id] = msg.data;
                myId = id;
                // Update our local knowledge of where we are
                players[id] = { id, x, y, dir, isMe: true, lastUpdate: Date.now() };
            }
            // ... (rest of your existing msg listener) ...
        }
    });

    // 2. Pathfinding Logic: "Safe Return"
    function getHomePath(currentX, currentY) {
        // This is a simplified 'greedy' grid search
        // In Tileman, 'safe' blocks are where your trail ends/starts.
        // For this example, we assume coordinate (0,0) is center/safe, 
        // but you should replace this with your nearest captured block.
        const targetX = 0;
        const targetY = 0;

        let moves = [];
        if (currentX !== targetX) moves.push(currentX > targetX ? 3 : 1); // West or East
        if (currentY !== targetY) moves.push(currentY > targetY ? 0 : 2); // North or South

        return moves;
    }

    // 3. The "H" Key Trigger
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'h') {
            const me = players[myId];
            if (!me) return;

            isAutoHoming = true;
            const path = getHomePath(me.x, me.y);

            if (path.length > 0) {
                console.log("Auto-Home Initiated. Recommended Direction:", path[0]);

                // Inject the move packet via the background script
                // We send the first necessary direction to start the turn
                chrome.runtime.sendMessage({
                    type: "INJECT_PACKET",
                    payload: `42/p,["1",[${path[0]}, ${me.x}, ${me.y}, ${Date.now()}, ${myId}]]`
                });
            }
        }
    });

    // 4. Update the Draw Loop to show the "Home Path"
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // ... (existing radar draw code) ...

        if (isAutoHoming) {
            ctx.strokeStyle = "#39d353";
            ctx.lineWidth = 3;
            ctx.strokeRect(0, 0, 300, 300); // Flash radar green when active

            ctx.fillStyle = "#39d353";
            ctx.font = "bold 12px monospace";
            ctx.fillText("AUTO-HOMING ACTIVE", 10, 20);
        }

        requestAnimationFrame(draw);
    }
    draw();
})();