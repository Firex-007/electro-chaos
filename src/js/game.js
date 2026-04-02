
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

// ── INPUT ──────────────────────────────────────────────────────────────────
const keys = new Set();

// Early Audio Unlock mechanism for the Intro Cinematic
window.addEventListener('click', () => {
    if (gameState === 'intro' && window.audioManager && !window.audioManager.isInitialized) {
        window.audioManager.initAudio();
        window.audioManager.startMusic();
    }
}, { once: true });

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'escape'].includes(k)) e.preventDefault();
    onKey(k);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

const SHELLS = [
    { n: 1, name: 'INNER CORE', Zeff: 11.5, color: '#bc13fe', targetR: 5500, enemies: 3, drainMult: 2.5 },
    { n: 2, name: 'PHONON LATTICE', Zeff: 7.2, color: '#4b0082', targetR: 13000, enemies: 6, drainMult: 1.8 },
    { n: 3, name: 'DELOCALIZED BAND', Zeff: 2.10, color: '#e6e6fa', targetR: 24000, enemies: 10, drainMult: 1.2 },
    { n: 4, name: 'VACUUM EDGE', Zeff: 0.30, color: '#00f0ff', targetR: 42000, enemies: 14, drainMult: 0.6 },
];

// Balance constants
const MAX_SPEED = 780;   // terminal velocity – cannot exceed this regardless of thrust
const BOOST_COOLDOWN = 1.8;   // seconds between photon kicks
const BOOST_IMPULSE = 900;   // instantaneous impulse on kick
const BREAKTHROUGH_REQ = 2.2;  // seconds you must hover at boundary to tunnel through

// ── STATE ──────────────────────────────────────────────────────────────────
let gameState = 'start';
let shellIdx = 0;
let coherence = 100;
let isWaveMode = false;
let isShieldMode = false;
let totalTime = 0;
let score = 0;
let lastTime = performance.now();
let shakeX = 0, shakeY = 0, shakeMag = 0;
let dangerLevel = 0;
let boostCooldown = 0;
let teleportCooldown = 0;
let breakthroughTimer = 0;
let overheatFlash = 0;
let isEscaping = false; // set true only briefly during old code — kept for safety
let escapeTimer = 0;

// ── TELEMETRY ──────────────────────────────────────────────────────────────
let telemetry = {
    timeInWave: 0,
    photonsAbsorbed: 0,
    highestSpeedC: 0,
    killsMitigated: 0,
    damageTaken: 0,
    causeOfCollapse: 'Energy Depletion'
};

const player = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    r: 12,
    momentum: 0.955,   // more drag than before – you shed speed quicker
    trail: [],
    invincible: 0,
};

let camera = { x: 0, y: 0 };
let enemies = [];
let lattices = [];
let photons = [];
let foam = [];
let particles = [];
let fluxFields = []; // The localized Lorentz & Wind fields
let fieldLines = [];  // electric field visualization

// ── TOAST ──────────────────────────────────────────────────────────────────
const TOASTS = [
    { t: 2, html: 'Push <span class="hl">outward</span> — break the Coulomb grip. Enemies are incoming.' },
    { t: 12, html: '<span class="hr">Hostile electrons</span> repel you like a cannon. Press <span class="hl">Q</span> to go Ghost-Wave and slip past them.' },
    { t: 26, html: 'Hold <span class="hl">SPACE</span> for a turbo Photon Kick. Collect <span class="hy">free photons</span> to restore coherence.' },
];
let toastIdx = 0;
const toastEl = document.getElementById('toast');
let toastTimer = 0;

function showToast(html) {
    toastEl.innerHTML = html;
    toastEl.style.opacity = '1';
    toastTimer = 5;
}

// ── ENEMY ELECTRON ─────────────────────────────────────────────────────────
function spawnEnemy(shellR) {
    const a = Math.random() * Math.PI * 2;
    const r = shellR * (0.2 + Math.random() * 0.65);
    const type = Math.random();
    return {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 400,
        vy: (Math.random() - 0.5) * 400,
        r: 9 + Math.random() * 5,
        // Patrol orbit angle
        orbitAngle: a,
        orbitSpeed: (0.3 + Math.random() * 0.8) * (Math.random() < 0.5 ? 1 : -1),
        orbitR: r,
        // Behavior: 0=patrol, 1=hunter, 2=blocker
        behavior: type < 0.4 ? 'patrol' : type < 0.7 ? 'hunter' : 'blocker',
        chargeTime: 0,  // for hunter burst
        alerting: false,
        phase: Math.random() * Math.PI * 2,
        age: 0,
    };
}

function spawnEnemiesForShell(idx) {
    const count = SHELLS[idx].enemies;
    enemies = [];
    const pAngle = (player.x === 0 && player.y === 0) ? 0 : Math.atan2(player.y, player.x);
    for (let i = 0; i < count; i++) {
        let a = Math.random() * Math.PI * 2;
        let r = SHELLS[idx].targetR * (0.2 + Math.random() * 0.65);
        if (idx === 3) {
            // Cluster Shell 4 enemies in front of the player
            a = pAngle + (Math.random() - 0.5) * 1.5;
            r = 25000 + Math.random() * 10000;
        }
        let e = spawnEnemy(SHELLS[idx].targetR);
        e.x = Math.cos(a) * r;
        e.y = Math.sin(a) * r;
        if (idx === 3) { e.behavior = 'hunter'; e.r = 14 + Math.random() * 5; } // Vacuum Edge exclusively hunters
        enemies.push(e);
    }
}

function spawnFluxFieldsForShell(idx) {
    fluxFields = [];
    const count = idx * 2 + 1; // More fields deeper out
    const shell = SHELLS[idx];
    for (let i = 0; i < count; i++) {
        let a = Math.random() * Math.PI * 2;
        let r = shell.targetR * (0.3 + Math.random() * 0.5);
        const isAnomaly = (idx === 3 && Math.random() < 0.4);
        
        if (idx === 3) {
            // Cluster anomalies in the player's path
            const pAngle = Math.atan2(player.y, player.x);
            a = pAngle + (Math.random() - 0.5) * 1.0;
            r = 26000 + Math.random() * 12000;
        }

        fluxFields.push({
            x: Math.cos(a) * r,
            y: Math.sin(a) * r,
            radius: isAnomaly ? 3500 + Math.random()*1500 : (800 + Math.random() * 1500),
            type: isAnomaly ? 'anomaly' : (Math.random() > 0.4 ? 'magnetic' : 'electric'),
            strength: (Math.random() < 0.5 ? 1 : -1) * (150 + Math.random() * 200),
            dirX: Math.random() - 0.5,
            dirY: Math.random() - 0.5
        });
    }
}

// ── START / FLOW ───────────────────────────────────────────────────────────
function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    player.x = 0; player.y = 280;
    camera.x = player.x; camera.y = player.y;
    player.vx = 0; player.vy = 0;
    player.trail = []; player.invincible = 0;
    coherence = 100; score = 0; shellIdx = 0;
    isWaveMode = false; isShieldMode = false; totalTime = 0;
    // Reset Telemetry
    telemetry = {
        timeInWave: 0,
        photonsAbsorbed: 0,
        highestSpeedC: 0,
        killsMitigated: 0,
        damageTaken: 0,
        causeOfCollapse: 'Energy Depletion'
    };
    boostCooldown = 0; teleportCooldown = 0; breakthroughTimer = 0; overheatFlash = 0;
    isEscaping = false; escapeTimer = 0; // legacy reset
    enemies = []; lattices = []; photons = []; foam = []; particles = []; fluxFields = [];
    spawnEnemiesForShell(0);
    spawnFluxFieldsForShell(0);
    gameState = 'playing';
    lastTime = performance.now();

    // Boot Engine (Triggered by direct user click)
    if (window.audioManager) {
        window.audioManager.initAudio();
        window.audioManager.startMusic();
        updateMuteUI();
    }

    showToast(TOASTS[0].html);
    toastIdx = 1;
    requestAnimationFrame(gameLoop);
}

function togglePause() {
    if (gameState === 'playing') {
        gameState = 'paused';
        document.getElementById('pause-screen').style.display = 'flex';
    } else if (gameState === 'paused') {
        gameState = 'playing';
        document.getElementById('pause-screen').style.display = 'none';
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }
}

function triggerDeath(reason) {
    if (gameState === 'dead' || gameState === 'escaped') return;
    gameState = 'dead';
    isEscaping = false;
    dangerLevel = 0;
    player.vx = 0; player.vy = 0;
    // Reset danger overlay immediately so it doesn't bleed over death screen
    const dangerEl = document.getElementById('danger-overlay');
    if (dangerEl) dangerEl.style.opacity = '0';
    document.getElementById('death-shell').textContent = SHELLS[shellIdx].n;
    document.getElementById('death-time').textContent = totalTime.toFixed(1);
    document.getElementById('death-score').textContent = Math.floor(score).toLocaleString();
    document.getElementById('death-reason').textContent = reason || 'Your energy completely depleted.';
    document.getElementById('death-speed').textContent = (telemetry.highestSpeedC * 1079252848.8).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
    telemetry.causeOfCollapse = reason || 'Energy Depletion';
    // Hide canvas so draw() cannot paint over the overlay
    document.getElementById('gameCanvas').style.display = 'none';
    document.getElementById('death-screen').style.display = 'flex';
    sendN8nTelemetry('dead');
    generatePostMortem({ score: score, timeAlive: totalTime, maxSpeed: telemetry.highestSpeedC });
}


async function sendN8nTelemetry(event) {
    const url = import.meta.env.VITE_N8N_WEBHOOK_URL || '';
    if (!url) {
        console.warn('n8n Webhook URL missing. Telemetry not sent.');
        return;
    }

    const payload = {
        event: event, // 'dead' or 'escaped'
        score: Math.floor(score),
        shellReached: SHELLS[shellIdx].n,
        timeSurvived: totalTime.toFixed(1),
        causeOfCollapse: telemetry.causeOfCollapse,
        timestamp: new Date().toISOString()
    };

    try {
        // Note: The n8n Webhook node MUST have "Respond to CORS" enabled in its settings!
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log('n8n Telemetry synchronized.');
    } catch (err) {
        console.error('Failed to sync with n8n:', err);
    }
}

async function generatePostMortem(stats) {
    const el = document.getElementById('pm-text');
    if (!el) return;

    el.innerHTML = '<span class="blink">Quantum link syncing with Gemini 3 Flash... Analyzing wave collapse...</span>';

    const url = import.meta.env.VITE_N8N_WEBHOOK_URL || '';
    if (!url) {
        el.innerHTML = '<span style="color:var(--yellow)">[SYSTEM] n8n URL missing. Oracle signal lost.</span>';
        return;
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                score: Math.floor(stats.score),
                timeAlive: stats.timeAlive.toFixed(1),
                peakSpeed: (stats.maxSpeed * 100).toFixed(1),
                cause: telemetry.causeOfCollapse,
                model: "gemini-3-flash"
            })
        });

        if (!response.ok) {
            el.innerHTML = `<span style="color:var(--yellow)">The Oracle is calibrating Gemini 3.1... stay tuned (Error ${response.status}).</span>`;
            return;
        }

        const data = await response.json();
        const text = data.text || "Anomaly detected. The Oracle remains silent.";

        // Typewriter effect
        el.innerHTML = '';
        let i = 0;
        const speed = 25;
        function typeWriter() {
            if (i < text.length) {
                el.innerHTML += text.charAt(i);
                i++;
                setTimeout(typeWriter, speed);
            }
        }
        typeWriter();

    } catch (err) {
        console.error("Oracle sync failed:", err);
        el.innerHTML = '<span style="color:var(--red)">Quantum link severed. Spidey Bot has the logs.</span>';
    }
}



function triggerEscape() {
    if (gameState === 'dead' || gameState === 'escaped') return;
    gameState = 'escaped';
    isEscaping = false;
    shellIdx = SHELLS.length - 1; // clamp back to valid index
    dangerLevel = 0;
    player.vx = 0; player.vy = 0;
    enemies = []; fluxFields = []; lattices = [];
    score += 5000;
    // Reset danger overlay
    const dangerEl = document.getElementById('danger-overlay');
    if (dangerEl) dangerEl.style.opacity = '0';
    spawnBurst(player.x, player.y, '#ffffff', 200);
    spawnBurst(player.x, player.y, '#00f0ff', 200);
    triggerShake(50);
    document.getElementById('escape-score').textContent = Math.floor(score).toLocaleString();
    const etEl = document.getElementById('escape-time');
    if (etEl) etEl.textContent = totalTime.toFixed(1);
    const esEl = document.getElementById('escape-speed');
    if (esEl) esEl.textContent = (telemetry.highestSpeedC * 1079252848.8).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
    // Hide canvas and show victory overlay after particles play
    setTimeout(() => {
        document.getElementById('gameCanvas').style.display = 'none';
        document.getElementById('escape-screen').style.display = 'flex';
    }, 1200);
    sendN8nTelemetry('escaped');
}

function exitGame() {
    gameState = 'start';
    if (window.audioManager) window.audioManager.stopAll();
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
}

function toggleMuteHUD() {
    if (window.audioManager) {
        const isMuted = window.audioManager.toggleMute();
        updateMuteUI(isMuted);
    }
}

function updateMuteUI(isMuted) {
    if (typeof isMuted === 'undefined') isMuted = window.audioManager.isMuted;
    const txt = isMuted ? '🔇 AUDIO: OFF' : '🔊 AUDIO: ON';
    document.getElementById('mute-toggle').textContent = txt;
    if (document.getElementById('pause-mute')) document.getElementById('pause-mute').textContent = txt;
}

function activateAudio() {
    if (window.audioManager) {
        window.audioManager.initAudio();
        window.audioManager.startMusic();
    }
    const btn = document.getElementById('activate-audio-btn');
    if (btn) {
        btn.textContent = '🔊 QUANTUM ACOUSTICS RECEPTIVE';
        btn.style.borderColor = 'var(--cyan)';
        btn.style.color = 'var(--cyan)';
    }
}

function onKey(k) {
    if (gameState === 'intro') { skipIntro(); return; }
    if (gameState === 'start' && (k === ' ' || k === 'enter')) { startGame(); return; }
    if (gameState === 'dead' || gameState === 'escaped') {
        if (k === ' ' || k === 'enter') { location.reload(); return; }
    }
    if (gameState === 'playing') {
        if (k === 'q') {
            if (isWaveMode) setMode('particle');
            else setMode('wave');
        }
        if (k === 'p' || k === '1') setMode('particle');
        if (k === 'e') {
            if (isShieldMode) setMode('particle');
            else setMode('shield');
        }
        if (k === 'shift') triggerTeleport();
        if (k === 'f') {
            if (coherence >= 65) triggerBlast();
            else showToast('<span class="hr">INSUFFICIENT COHERENCE</span> | Supernova requires 65%');
        }
        if (k === 'escape') { togglePause(); return; }
    }
    if (gameState === 'paused' && (k === 'escape' || k === ' ' || k === 'enter')) { togglePause(); return; }
}

function setMode(mode) {
    if (mode === 'wave' && isWaveMode) return;
    if (mode === 'shield' && isShieldMode) return;
    if (mode === 'particle' && !isWaveMode && !isShieldMode) return;

    isWaveMode = (mode === 'wave');
    isShieldMode = (mode === 'shield');

    document.getElementById('mode-particle').classList.toggle('active', mode === 'particle');
    document.getElementById('mode-wave').classList.toggle('active', isWaveMode);

    spawnBurst(player.x, player.y, isWaveMode ? '#00f0ff' : isShieldMode ? '#bc13fe' : '#ffffff', 18);
    if (isWaveMode) triggerShake(3);
}

function triggerBlast() {
    coherence -= 60;
    triggerShake(40);
    spawnBurst(player.x, player.y, '#ffffff', 80);

    // Vaporize enemies in a huge radius
    const beforeCount = enemies.length;
    enemies = enemies.filter(e => Math.hypot(e.x - player.x, e.y - player.y) > 2000);
    const killed = beforeCount - enemies.length;
    if (killed > 0) {
        score += killed * 500;
        showToast(`<span class="hl">SUPERNOVA BLAST!</span> ${killed} Hostiles Vaporized.`);
    }
}

function triggerTeleport() {
    if (teleportCooldown > 0) {
        showToast('<span class="hr">TELEPORT RECHARGING</span>');
        return;
    }
    if (coherence < 15) {
        showToast('<span class="hr">INSUFFICIENT ENERGY FOR ZAP</span>');
        return;
    }
    coherence -= 15;
    teleportCooldown = 5.0;
    
    // Determine direction based on velocity, or facing outward radially if stopped
    let spd = Math.hypot(player.vx, player.vy);
    let nx = 1, ny = 0;
    if (spd > 10) { nx = player.vx/spd; ny = player.vy/spd; }
    else {
    const P = Math.atan2(player.y, player.x);
    nx = Math.cos(P); ny = Math.sin(P);
}

const safePdist = Math.max(Math.hypot(player.x, player.y), 1);
const jumpDist = 800;
spawnBurst(player.x, player.y, '#ffffff', 40); // origin zap
player.x += (player.x / safePdist) * jumpDist;
player.y += (player.y / safePdist) * jumpDist;
spawnBurst(player.x, player.y, '#00f0ff', 40); // dest zap
    
    triggerShake(15);
    document.body.classList.add('glitch-warp');
    setTimeout(() => document.body.classList.remove('glitch-warp'), 100);
    
    // Anti-cheat: if teleport puts you outside shell, reset breakthrough
    const dist = Math.hypot(player.x, player.y);
    const targetR = SHELLS[shellIdx].targetR;
    if (dist > targetR * 0.94) breakthroughTimer = 0; // cannot instantly break
    
    score += 150;
    showToast('<span class="hl">QUANTUM TUNNEL EXECUTED</span>');
}

// ── TELEMETRY LOOP ─────────────────────────────────────────────────────────
function updateTelemetry(dt) {
    if (isWaveMode) telemetry.timeInWave += dt;

    const spdPct = Math.hypot(player.vx, player.vy) / MAX_SPEED;
    if (spdPct > telemetry.highestSpeedC) telemetry.highestSpeedC = spdPct;
}

// ── SCREENSHAKE ────────────────────────────────────────────────────────────
function triggerShake(mag) {
    shakeMag = Math.max(shakeMag, mag);
}

// ── UPDATE ─────────────────────────────────────────────────────────────────
function update(dt) {
    // ── UNIVERSAL EFFECTS FOR ALL STATES ──
    shakeMag *= 0.82;
    shakeX = (Math.random() - 0.5) * 2 * shakeMag;
    shakeY = (Math.random() - 0.5) * 2 * shakeMag;
    if (overheatFlash > 0) overheatFlash -= dt;

    if (totalTime % 0.1 < dt) {
        foam.push({ x: (Math.random() - 0.5) * 3000, y: (Math.random() - 0.5) * 3000, life: Math.random() });
        if (foam.length > 400) foam.shift();
    }
    foam.forEach(f => {
        f.life += (Math.random() - 0.5) * dt * 2;
        if (f.life < 0) f.life = 0;
        if (f.life > 1) f.life = 1;
    });

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }

    if (gameState !== 'playing') {
        // Zero out danger level so vignette clears when game ends
        dangerLevel = 0;
        return;
    }

    // isEscaping block removed — triggerEscape() now shows overlay directly

    totalTime += dt;
    score += dt * 8;

    // Toasts
    if (toastIdx < TOASTS.length && totalTime >= TOASTS[toastIdx].t) {
        showToast(TOASTS[toastIdx].html); toastIdx++;
    }
    if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) toastEl.style.opacity = '0';
    }

    // screenshake logic moved to universal updates

    // Boost cooldown
    if (boostCooldown > 0) boostCooldown -= dt;
    if (teleportCooldown > 0) teleportCooldown -= dt;

    const shell = SHELLS[shellIdx];
    const dx = player.x, dy = player.y;
    const dist = Math.hypot(dx, dy);

    // Inverse Distance Stability – Slower drain at shell outer boundaries
    let baseDrain = isWaveMode ? 3.5 : 1.5;
    const distanceFactor = Math.min(1, dist / shell.targetR); // 0 to 1
    const drainMultiplier = shell.drainMult * Math.max(0.6, 1 - distanceFactor * 0.4); // Dropping up to 40% at the edge
    let frameDrain = baseDrain * drainMultiplier * dt;

    // Nucleus pull (Coulomb) — much stronger, acts at greater range
    if (dist > 10) {
        // Extra radial resistance: stronger as you approach the boundary
        const boundaryProximity = Math.min(1, dist / shell.targetR);
        const zeffScale = 1 + boundaryProximity * 0.8; // up to 1.8× pull near boundary
        const force = (170000 * shell.Zeff * zeffScale) / Math.max(1, (dist * dist + 800));
        player.vx -= (dx / Math.max(1, dist)) * force * dt;
        player.vy -= (dy / Math.max(1, dist)) * force * dt;
    }

    // Player movement
    const isDrifting = keys.has(' ');
    let moveSpeed = isWaveMode ? 1100 : 1800;
    if (isDrifting) moveSpeed *= 2.8; // Nitro drift multiplier

    let ax = 0, ay = 0;
    if (keys.has('w') || keys.has('arrowup')) ay -= 1;
    if (keys.has('s') || keys.has('arrowdown')) ay += 1;
    if (keys.has('a') || keys.has('arrowleft')) ax -= 1;
    if (keys.has('d') || keys.has('arrowright')) ax += 1;

    // ── FLUX FIELDS (Fake Lorentz, Wind & Siphon) ──────────────────────────
    let isSiphoning = false;
    fluxFields.forEach(f => {
        const fdX = player.x - f.x;
        const fdY = player.y - f.y;
        const fDist = Math.hypot(fdX, fdY);
        f.playerInside = false; // Add state for render system

        if (fDist < f.radius) {
            f.playerInside = true;
            if (isWaveMode) isSiphoning = true;

            const falloff = 1 - (fDist / f.radius);
            if (f.type === 'magnetic') {
                // Fake B-Field cross product: simply nudge perpendicular to current v
                player.vx += -player.vy * (f.strength * 0.002) * falloff;
                player.vy += player.vx * (f.strength * 0.002) * falloff;
            } else if (f.type === 'electric') {
                // Directional wind
                const mag = Math.hypot(f.dirX, f.dirY);
                player.vx += (f.dirX / mag) * Math.abs(f.strength) * 2 * falloff * dt;
                player.vy += (f.dirY / mag) * Math.abs(f.strength) * 2 * falloff * dt;
            } else if (f.type === 'anomaly') {
                // Positron Anomaly - black hole drain
                const safeDist = Math.max(fDist, 1);
                player.vx -= (fdX / safeDist) * 1200 * falloff * dt;
                player.vy -= (fdY / safeDist) * 1200 * falloff * dt;
                coherence -= 8 * falloff * dt; // SAP ENERGY FAST
                triggerShake(0.5 + falloff * 2);
            }
        }
    });

    // Apply Siphon Recharge, Shield Regen, or normal inverse Drain
    if (isShieldMode) {
        player.vx *= 0.6; // Heavy braking
        player.vy *= 0.6;
        coherence = Math.min(100, coherence + 35 * dt); // Heavy shield regen
        if (Math.random() < 0.2) spawnBurst(player.x, player.y, '#bc13fe', 1);
    } else if (isSiphoning) {
        coherence = Math.min(100, coherence + 10 * dt); // Neon Siphon recharge
        if (Math.random() < 0.2) spawnBurst(player.x, player.y, '#6a0dad', 2);
    } else {
        coherence -= frameDrain;
    }

    updateTelemetry(dt);
    if (coherence <= 0) { triggerDeath('Energy level depleted — stabilization failed.'); return; }

    if (ax !== 0 || ay !== 0) {
        const mag = Math.max(Math.sqrt(ax * ax + ay * ay), 0.001);
        player.vx += (ax / mag) * moveSpeed * dt;
        player.vy += (ay / mag) * moveSpeed * dt;
    }

    // ── SPEED DRIFT (Space) ──────────────────────────────────────────────────
    if (isDrifting && (ax !== 0 || ay !== 0) && !isShieldMode) {
        coherence -= 10 * dt; // Heavy energy drain
        score += 20 * dt;
        overheatFlash = 0.5; // keeps the danger UI glowing slightly
        if (Math.random() < 0.3) spawnBurst(player.x - player.vx*0.02, player.y - player.vy*0.02, '#ffe500', 2);
    }

    // ── TERMINAL VELOCITY CAP ────────────────────────────────────────────────
    const spd = Math.max(Math.hypot(player.vx, player.vy), 0.001);
    if (spd > MAX_SPEED) {
        const limitFactor = MAX_SPEED / spd;
        player.vx *= limitFactor;
        player.vy *= limitFactor;
    }

    // ── ENEMY ELECTRONS ───────────────────────────────────────────────────
    if (player.invincible > 0) player.invincible -= dt;

    dangerLevel = 0;
    enemies.forEach(e => {
        e.age += dt;

        const edx = player.x - e.x;
        const edy = player.y - e.y;
        const eDist = Math.hypot(edx, edy);

        // ── BEHAVIOR AI ──────────────────────────────────────────────────
        if (e.behavior === 'patrol') {
            // Orbit around the nucleus
            e.orbitAngle += e.orbitSpeed * dt;
            const tx = Math.cos(e.orbitAngle) * e.orbitR;
            const ty = Math.sin(e.orbitAngle) * e.orbitR;
            e.vx += (tx - e.x) * 2 * dt;
            e.vy += (ty - e.y) * 2 * dt;
        } else if (e.behavior === 'hunter') {
            // Charge at player periodically
            e.chargeTime -= dt;
            if (e.chargeTime <= 0) {
                e.chargeTime = 2 + Math.random() * 3;
                // Burst toward player
                const spd = 800 + Math.random() * 600;
                if (eDist > 1) {
                    e.vx += (edx / eDist) * spd;
                    e.vy += (edy / eDist) * spd;
                    spawnBurst(e.x, e.y, '#ff003c', 8);
                }
            }
        } else if (e.behavior === 'blocker') {
            // Try to position between player and escape boundary
            const pAngle = Math.atan2(player.y, player.x);
            const bR = Math.hypot(player.x, player.y) + 400;
            const tx = Math.cos(pAngle) * Math.min(bR, shell.targetR * 0.85);
            const ty = Math.sin(pAngle) * Math.min(bR, shell.targetR * 0.85);
            e.vx += (tx - e.x) * 1.5 * dt;
            e.vy += (ty - e.y) * 1.5 * dt;
        }

        // ── COULOMB REPULSION (Electron-Electron) ─────────────────────
        // F ∝ 1/r² — violent at short range
        const REPULSION_CONST = 4800000;
        const MIN_DIST = 80;

        if (eDist < 600) {
            const clampedDist = Math.max(eDist, MIN_DIST);
            const repulse = REPULSION_CONST / (clampedDist * clampedDist);
            const nx = eDist > 0 ? edx / eDist : 0;
            const ny = eDist > 0 ? edy / eDist : 0;

            // Push player away
            player.vx += nx * repulse * dt;
            player.vy += ny * repulse * dt;
            // Push enemy away (Newton's 3rd law — but less dramatic for AI)
            e.vx -= nx * repulse * 0.3 * dt;
            e.vy -= ny * repulse * 0.3 * dt;

            // Danger proximity indicator
            const proximity = 1 - Math.min(eDist / 600, 1);
            dangerLevel = Math.max(dangerLevel, proximity);

            // Coherence impact handling based on active quantum state
            if (eDist < 120 && player.invincible <= 0) {
                if (isShieldMode) {
                    // Bounces off shield, minor drain to integrity
                    player.vx += nx * 600 * dt;
                    player.vy += ny * 600 * dt;
                    e.vx -= nx * 800 * dt;
                    e.vy -= ny * 800 * dt;
                    coherence -= 25 * dt;
                    spawnBurst(e.x, e.y, '#bc13fe', 4);
                } else if (!isWaveMode) {
                    // Direct Collision in Particle Mode
                    const impact = (120 - eDist) / 120;
                    coherence -= impact * 60 * dt;
                    if (impact > 0.5) {
                        triggerShake(8 + impact * 15);
                        spawnBurst(player.x, player.y, '#ff003c', 6);
                        spawnBurst(e.x, e.y, '#ff003c', 4);
                        // Violent elastic-like velocity exchange component
                        player.vx += nx * 1500 * impact;
                        player.vy += ny * 1500 * impact;
                        player.invincible = 0.4;
                    }
                }
            }
        }

        // Enemy takes nucleus pull too (they're electrons)
        const enDist = Math.hypot(e.x, e.y);
        if (enDist > 20) {
            const eForce = (60000 * shell.Zeff) / (enDist * enDist);
            e.vx -= (e.x / enDist) * eForce * dt;
            e.vy -= (e.y / enDist) * eForce * dt;
        }

        e.vx *= 0.97; e.vy *= 0.97;
        e.x += e.vx * dt; e.y += e.vy * dt;
    });

    // Phonon Scatter Zones
    lattices.forEach(l => {
        if (Math.hypot(player.x - l.x, player.y - l.y) < l.radius + player.r) {
            if (!isWaveMode) {
                player.vx *= 0.85; player.vy *= 0.85;
                player.x += (Math.random() - 0.5) * 16;
                player.y += (Math.random() - 0.5) * 16;
                coherence -= 16 * dt;
                triggerShake(3);
            } else {
                coherence -= 1.0 * dt;
            }
        }
    });

    // ── SHELL BREAKTHROUGH (must hover at boundary for BREAKTHROUGH_REQ sec) ──
    const boundaryZone = dist > shell.targetR * 0.94;
    if (boundaryZone) {
        breakthroughTimer += dt;
        // Boundary repels — acts as a spring pushing you back
        const pushBack = ((dist - shell.targetR * 0.94) / (shell.targetR * 0.06)) * 600;
        player.vx -= (dx / Math.max(1, dist)) * pushBack * dt;
        player.vy -= (dy / Math.max(1, dist)) * pushBack * dt;
    } else {
        breakthroughTimer = Math.max(0, breakthroughTimer - dt * 2); // resets if you retreat
    }

    if (breakthroughTimer >= BREAKTHROUGH_REQ) {
        breakthroughTimer = 0;
        shellIdx++;
        score += 3500;
        if (shellIdx >= SHELLS.length) { triggerEscape(); return; }

        // Short Snappy Teleport Forward (Tunneling mechanics bypass physical wall)
        const jumpDist = 600;
        player.x += (dx / Math.max(1, dist)) * jumpDist;
        player.y += (dy / Math.max(1, dist)) * jumpDist;

        // Glitch Screen Effect
        document.body.classList.add('glitch-warp');
        setTimeout(() => document.body.classList.remove('glitch-warp'), 150);

        spawnBurst(player.x, player.y, '#ffffff', 80);
        triggerShake(20);
        coherence = Math.min(100, coherence + 30);
        spawnEnemiesForShell(shellIdx);
        spawnFluxFieldsForShell(shellIdx);

        if (window.audioManager) {
            // Track 1 mapping: Circuit/Phonon Lattice
            if (shellIdx === 1) window.audioManager.transitionToShell(1);
        }

        showToast(`<span class="hl">Shell ${SHELLS[shellIdx - 1].n} breached via Quantum Tunneling!</span> Entering <span class="hy">${SHELLS[shellIdx].name}</span>.`);
    }

    // Physics
    player.vx *= player.momentum;
    player.vy *= player.momentum;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    camera.x += (player.x - camera.x) * 5 * dt;
    camera.y += (player.y - camera.y) * 5 * dt;

    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > 50) player.trail.shift();

    updateEntities(dt);
    updateHUD();
}

function updateEntities(dt) {
    // Foam
    if (Math.random() < 0.25) foam.push({ x: camera.x + (Math.random() - 0.5) * canvas.width * 1.8, y: camera.y + (Math.random() - 0.5) * canvas.height * 1.8, life: 0.8 });
    for (let i = foam.length - 1; i >= 0; i--) { foam[i].life -= dt; if (foam[i].life <= 0) foam.splice(i, 1); }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.95; p.vy *= 0.95;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Photon pickups (Shell 3/4 buffed)
    const maxPhotons = shellIdx >= 2 ? 15 : 6;
    const photonFactor = shellIdx >= 2 ? 0.024 : 0.008;

    if (photons.length < maxPhotons && Math.random() < photonFactor) {
        const a = Math.random() * Math.PI * 2;
        const r = 500 + Math.random() * (shellIdx >= 2 ? 1800 : 900);
        photons.push({ x: player.x + Math.cos(a) * r, y: player.y + Math.sin(a) * r, phase: Math.random() * Math.PI * 2, age: 0 });
    }
    for (let i = photons.length - 1; i >= 0; i--) {
        photons[i].age += dt;
        if (Math.hypot(player.x - photons[i].x, player.y - photons[i].y) < player.r + 22) {
            coherence = Math.min(100, coherence + 28); // buffed heal
            score += 100;
            spawnBurst(photons[i].x, photons[i].y, '#00f0ff', 14);
            telemetry.photonsAbsorbed++;
            photons.splice(i, 1);
        }
    }

    // Phonon scatter zones
    if (lattices.length < 8 && Math.random() < 0.003) {
        const a = Math.random() * Math.PI * 2;
        const r = 800 + Math.random() * 1200;
        lattices.push(mkLattice(player.x + Math.cos(a) * r, player.y + Math.sin(a) * r, 80 + Math.random() * 80, 14));
    }

    lattices = lattices.filter(l => Math.hypot(player.x - l.x, player.y - l.y) < 3500);
    photons = photons.filter(p => Math.hypot(player.x - p.x, player.y - p.y) < 3500);
}

function updateHUD() {
    if (gameState !== 'playing') return; // don't update HUD when dead/escaped
    const shell = SHELLS[Math.min(shellIdx, SHELLS.length - 1)];
    const pct = Math.max(0, coherence);
    const fill = document.getElementById('energy-fill');
    fill.style.width = pct + '%';
    fill.style.backgroundColor = pct < 20 ? 'var(--red)' : pct < 40 ? 'var(--yellow)' : 'var(--cyan)';
    fill.style.boxShadow = pct < 20 ? '0 0 12px var(--red)' : pct < 40 ? '0 0 12px var(--yellow)' : '0 0 10px var(--cyan)';
    document.getElementById('shell-n').textContent = `n=${shell.n}`;
    document.getElementById('shell-name').textContent = shell.name;
    // Show boost cooldown in zeff slot if cooling down
    const zapEl = document.getElementById('mode-zap');
    if (teleportCooldown > 0) {
        document.getElementById('shell-zeff').textContent = `ZAP RELOAD ${teleportCooldown.toFixed(1)}s`;
        document.getElementById('shell-zeff').style.color = '#ff003c';
        if (zapEl) {
            zapEl.textContent = `ZAP [${teleportCooldown.toFixed(1)}s]`;
            zapEl.style.color = '#ff003c';
        }
    } else {
        document.getElementById('shell-zeff').textContent = `PULL: ${shell.Zeff.toFixed(2)} Zeff`;
        document.getElementById('shell-zeff').style.color = 'var(--cyan)';
        if (zapEl) {
            zapEl.textContent = 'ZAP RDY (LSHIFT)';
            zapEl.style.color = '#ffe500';
        }
    }
    document.getElementById('score-display').textContent = `SCORE ${Math.floor(score).toLocaleString()}`;
    document.getElementById('enemy-count').textContent = `⚡ ${enemies.length} HOSTILE ELECTRONS`;

    // Danger vignette — also pulses red when overheating
    const dangerEl = document.getElementById('danger-overlay');
    const overheatPulse = keys.has(' ') ? 0.3 + Math.sin(totalTime * 20) * 0.2 : 0;
    dangerEl.style.opacity = Math.min(1, dangerLevel * 0.8 + overheatPulse).toFixed(2);

    // Supernova Ready Highlight
    const blastReady = coherence >= 65;
    const hintEl = document.getElementById('boost-hint');
    if (hintEl) {
        hintEl.style.color = blastReady ? 'var(--yellow)' : 'rgba(255,255,255,0.4)';
        hintEl.style.textShadow = blastReady ? '0 0 10px var(--yellow)' : 'none';
        hintEl.style.fontWeight = blastReady ? '700' : '400';
    }
    
    // Live Timer Update
    const tMin = Math.floor(totalTime / 60);
    const tSec = Math.floor(totalTime % 60);
    const tMs = Math.floor((totalTime % 1) * 100);
    const timerStr = `${tMin.toString().padStart(2, '0')}:${tSec.toString().padStart(2, '0')}.${tMs.toString().padStart(2, '0')}`;
    const timerEl = document.getElementById('live-timer');
    if (timerEl) timerEl.textContent = timerStr;

    // Live Velocity Update
    const spd = Math.hypot(player.vx, player.vy);
    const spdPct = Math.min(1, spd / MAX_SPEED);
    const kmhr = spdPct * 1079252848.8;
    const speedEl = document.getElementById('live-speed');
    if (speedEl) {
        speedEl.textContent = `VELOCITY | ${kmhr.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} km/h`;
        speedEl.style.color = spdPct > 0.85 ? '#ff003c' : spdPct > 0.55 ? '#ffe500' : '#00f0ff';
    }
}

function mkLattice(x, y, radius, density) {
    const atoms = [];
    for (let i = 0; i < density; i++) atoms.push({
        ox: (Math.random() - 0.5) * radius * 2, oy: (Math.random() - 0.5) * radius * 2, r: Math.random() * 5 + 3
    });
    return { x, y, radius, atoms };
}

function spawnBurst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 280 + 60;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, color, size: Math.random() * 3 + 1 });
    }
}

// ── DRAW ───────────────────────────────────────────────────────────────────
function draw() {
    // Do not draw anything once an overlay is showing
    if (gameState === 'dead' || gameState === 'escaped') return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#06060e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const shell = SHELLS[shellIdx];

    ctx.save();
    // Camera + screenshake
    ctx.translate(canvas.width / 2 - camera.x + shakeX, canvas.height / 2 - camera.y + shakeY);

    // ── STARFIELD (static quantum foam) ───────────────────────────────────
    foam.forEach(f => {
        ctx.globalAlpha = f.life * 0.06;
        ctx.fillStyle = '#fff';
        ctx.fillRect(f.x, f.y, 2, 2);
    });
    ctx.globalAlpha = 1;

    // ── NUCLEUS AMBIENT ────────────────────────────────────────────────────
    const ga = ctx.createRadialGradient(0, 0, 0, 0, 0, 900);
    ga.addColorStop(0, hexA(shell.color, 0.10));
    ga.addColorStop(1, 'transparent');
    ctx.fillStyle = ga;
    ctx.fillRect(-900, -900, 1800, 1800);

    // ── ELECTRIC FIELD LINES around enemies ───────────────────────────────
    enemies.forEach(e => {
        const pDist = Math.hypot(player.x - e.x, player.y - e.y);
        if (pDist < 700) {
            const alpha = (1 - pDist / 700) * 0.35;
            ctx.save();
            ctx.globalAlpha = alpha;
            // Draw radial repulsion lines from enemy (Cyan variant)
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2 + totalTime * 0.5;
                const len = 80 + Math.sin(totalTime * 3 + i) * 30;
                ctx.strokeStyle = '#00f0ff';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(e.x + Math.cos(angle) * (e.r + 5), e.y + Math.sin(angle) * (e.r + 5));
                ctx.lineTo(e.x + Math.cos(angle) * (e.r + len), e.y + Math.sin(angle) * (e.r + len));
                ctx.stroke();
            }
            // Warning arc when very close (White-hot core variant)
            if (pDist < 250) {
                ctx.globalAlpha = (1 - pDist / 250) * 0.6;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 10]);
                ctx.beginPath();
                ctx.arc(e.x, e.y, pDist * 0.5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();
        }
    });

    // ── TARGET BOUNDARY RING ──────────────────────────────────────────────
    ctx.save();
    ctx.setLineDash([6, 20]);
    ctx.strokeStyle = hexA(shell.color, 0.12);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, shell.targetR, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Animated inner glow ring
    const pulsedR = shell.targetR - 15 + Math.sin(totalTime * 2) * 5;
    ctx.strokeStyle = hexA(shell.color, 0.04);
    ctx.lineWidth = 30;
    ctx.beginPath(); ctx.arc(0, 0, pulsedR, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // ── PHONON SCATTER ZONES (BLUE/CYAN OVERHAUL) ──────────────────────────
    lattices.forEach(l => {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 71, 251, 0.1)'; ctx.lineWidth = 1; // Cobalt Blue
        ctx.beginPath(); ctx.arc(l.x, l.y, l.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.font = '9px Rajdhani, Segoe UI'; ctx.fillStyle = 'rgba(0, 240, 255, 0.4)'; // Cyan text
        ctx.textAlign = 'center';
        ctx.fillText('PHONON SCATTER ZONE', l.x, l.y - l.radius - 8);
        ctx.textAlign = 'left';
        l.atoms.forEach(a => {
            const j = Math.sin(totalTime * 9 + a.ox) * 2.5;
            ctx.shadowBlur = 8; ctx.shadowColor = '#0047fb'; // Deep Blue Shadow
            ctx.fillStyle = '#00f0ff'; // Cyan cores instead of red
            ctx.beginPath(); ctx.arc(l.x + a.ox + j, l.y + a.oy + j, a.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.shadowBlur = 0;
        ctx.restore();
    });

    // ── FLUX FIELDS (Subtle render / Neon Siphon) ─────────────────────────
    fluxFields.forEach(f => {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        // Boost glow intensely if siphoning (WaveMode + inside)
        const activeSiphon = f.playerInside && isWaveMode;
        const pulse = activeSiphon ? 0.7 + Math.sin(totalTime * 8) * 0.3 : Math.sin(totalTime * 2 + f.x) * 0.1 + 0.15;

        const fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
        if (f.type === 'magnetic') {
            const color = activeSiphon ? `rgba(106, 13, 173, ${pulse})` : `rgba(188, 19, 254, ${pulse * 0.6})`; // Deep Neon Purple
            fg.addColorStop(0, color);
            if (activeSiphon) fg.addColorStop(0.1, `rgba(255, 255, 255, ${pulse * 0.8})`); // White hot core
            fg.addColorStop(1, 'transparent');
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.fill();
            // Draw field lines
            ctx.globalAlpha = activeSiphon ? 0.6 : 0.2;
            ctx.strokeStyle = activeSiphon ? '#ffffff' : '#bc13fe';
            ctx.lineWidth = activeSiphon ? 2 : 1;
            const bRad = f.radius * 0.6;
            ctx.beginPath(); ctx.arc(f.x, f.y, bRad, totalTime, totalTime + Math.PI); ctx.stroke();
            ctx.beginPath(); ctx.arc(f.x, f.y, bRad * 0.6, -totalTime, -totalTime + Math.PI); ctx.stroke();
        } else if (f.type === 'electric') {
            const color = activeSiphon ? `rgba(0, 240, 255, ${pulse})` : `rgba(0, 100, 255, ${pulse * 0.5})`; // Electric Blue/Cyan
            fg.addColorStop(0, color);
            if (activeSiphon) fg.addColorStop(0.1, `rgba(255, 255, 255, ${pulse * 0.8})`); // White hot core
            fg.addColorStop(1, 'transparent');
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.fill();
            // Draw linear flow lines
            const mag = Math.hypot(f.dirX, f.dirY);
            const nx = f.dirX / mag; const ny = f.dirY / mag;
            ctx.globalAlpha = activeSiphon ? 0.8 : 0.4;
            ctx.strokeStyle = activeSiphon ? '#ffffff' : '#00f0ff';
            ctx.lineWidth = activeSiphon ? 2 : 1.5;
            ctx.beginPath();
            const lineOffset = (totalTime * (activeSiphon ? 400 : 150)) % (f.radius);
            ctx.moveTo(f.x - nx * f.radius / 2 + nx * lineOffset, f.y - ny * f.radius / 2 + ny * lineOffset);
            ctx.lineTo(f.x + nx * f.radius / 2 + nx * lineOffset, f.y + ny * f.radius / 2 + ny * lineOffset);
            ctx.stroke();
        } else if (f.type === 'anomaly') {
            const color = activeSiphon ? `rgba(255, 0, 60, ${pulse})` : `rgba(200, 0, 60, ${pulse * 0.5})`; // Blood Red
            fg.addColorStop(0, color);
            fg.addColorStop(0.2, '#000000');
            fg.addColorStop(1, 'transparent');
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.fill();
            // Draw gravity swirl
            ctx.globalAlpha = activeSiphon ? 0.8 : 0.4;
            ctx.strokeStyle = activeSiphon ? '#ff003c' : '#880022';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const swirlOffset = totalTime * 2;
            ctx.arc(f.x, f.y, f.radius * 0.4, swirlOffset, swirlOffset + Math.PI); ctx.stroke();
            ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * 0.7, -swirlOffset, -swirlOffset + Math.PI); ctx.stroke();
        }

        // ── FIELD NAMING LABELS ──
        ctx.globalAlpha = 1;
        ctx.font = '10px Rajdhani, Segoe UI';
        ctx.fillStyle = activeSiphon ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
        ctx.textAlign = 'center';
        const labelText = f.type === 'anomaly' ? 'POSITRON ANOMALY GRAVITY WELL' : (f.type === 'magnetic' ? 'UNKNOWN QUANTUM STATE - MAGNETIC FLUX' : 'UNKNOWN QUANTUM STATE - ELECTRIC GRADIENT');
        ctx.fillText(labelText, f.x, f.y - f.radius - 12);

        ctx.restore();
    });

    // ── FREE PHOTONS ──────────────────────────────────────────────────────
    photons.forEach(p => {
        const pulse = 0.6 + Math.sin(p.age * 4 + p.phase) * 0.35;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.shadowBlur = 20; ctx.shadowColor = '#00f0ff';
        ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = -26; i <= 26; i++) {
            const wx = p.x + i;
            const envelope = Math.exp(-0.004 * i * i);
            const wy = p.y + Math.sin(i * 0.5 + p.age * 6) * 9 * envelope;
            i === -26 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = '9px Rajdhani, Segoe UI'; ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
        ctx.textAlign = 'center';
        ctx.fillText('FREE PHOTON  +28', p.x, p.y - 20);
        ctx.textAlign = 'left';
        ctx.restore();
    });

    // ── NUCLEUS (Cinematic Singularity) ───────────────────────────────────
    ctx.save();
    ctx.shadowBlur = 90 + Math.sin(totalTime * 4) * 30;
    ctx.shadowColor = shell.color;
    ctx.globalCompositeOperation = 'lighter';

    // Core bright flare
    const corePulse = Math.sin(totalTime * 8) * 4;
    const ng = ctx.createRadialGradient(0, 0, 0, 0, 0, 60 + corePulse);
    ng.addColorStop(0, '#ffffff');
    ng.addColorStop(0.15, shell.color);
    ng.addColorStop(0.6, hexA(shell.color, 0.4));
    ng.addColorStop(1, 'transparent');
    ctx.fillStyle = ng;
    ctx.beginPath(); ctx.arc(0, 0, 60 + corePulse, 0, Math.PI * 2); ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;

    // Turbulent energy bands
    for (let r = 1; r <= 5; r++) {
        const pr = (Math.sin(totalTime * 2.5 + r * 2.2) * 0.5 + 0.5) * 45 + 20 + r * 25;
        ctx.strokeStyle = hexA(shell.color, 0.3 / r);
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, pr, pr * (0.85 + Math.sin(totalTime + r) * 0.1), totalTime * (r % 2 ? 1 : -1) * 0.5, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();

    // ── ENEMY ELECTRONS (Cinematic Probability Clouds) ────────────────────
    enemies.forEach(e => {
        const pDist = Math.hypot(player.x - e.x, player.y - e.y);
        const alerting = pDist < 300;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Furious outer probability cloud
        const pulseRate = alerting ? 15 : 4;
        const cloudPulse = Math.sin(totalTime * pulseRate + e.phase);
        const glowA = 0.35 + cloudPulse * 0.15;
        ctx.globalAlpha = glowA;

        // High-Energy "Steel Blue" Corona with Distortion Ripples
        const eg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 6);
        eg.addColorStop(0, '#4682b4'); // Steel Blue
        eg.addColorStop(0.5, 'rgba(70, 130, 180, 0.5)');
        eg.addColorStop(1, 'transparent');
        ctx.fillStyle = eg;

        // Ripple effect strokes
        ctx.strokeStyle = '#4682b4';
        for (let i = 1; i <= 3; i++) {
            const rad = e.r * (2 + i * 1.5) + Math.sin(totalTime * 10 + i) * 3;
            ctx.globalAlpha = 0.3 / i;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(e.x, e.y, rad, 0, Math.PI * 2); ctx.stroke();
        }

        ctx.globalAlpha = glowA;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 6, 0, Math.PI * 2); ctx.fill();

        // High-Intensity Core corona if alerting (White/Cyan instead of Magenta)
        if (alerting) {
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = '#ffffff'; // Blinding White instead of Pink
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let i = 0; i <= 12; i++) {
                const angle = (i / 12) * Math.PI * 2 + totalTime * -4;
                const spike = e.r * 1.5 + Math.random() * 12 * Math.abs(cloudPulse);
                const sx = e.x + Math.cos(angle) * spike;
                const sy = e.y + Math.sin(angle) * spike;
                if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
            }
            ctx.closePath();
            ctx.stroke();
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        // Dense blinding core
        ctx.shadowBlur = alerting ? 50 : 25;
        ctx.shadowColor = '#ff003c';
        const cg = ctx.createRadialGradient(e.x - e.r * 0.2, e.y - e.r * 0.2, 0, e.x, e.y, e.r * 1.8);
        cg.addColorStop(0, '#ffffff');
        cg.addColorStop(0.3, '#ff8099');
        cg.addColorStop(0.7, '#ff003c');
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.8, 0, Math.PI * 2); ctx.fill();

        // Abstract orbital rings
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#ff003c';
        ctx.lineWidth = 1.5;
        for (let spin = 1; spin <= 2; spin++) {
            const spinA = totalTime * (e.orbitSpeed > 0 ? 5 : -5) * spin + e.phase;
            ctx.beginPath();
            ctx.ellipse(e.x, e.y, e.r * 2.8, e.r * 0.9 * spin, spinA, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Behavior label
        ctx.globalAlpha = alerting ? 1.0 : 0.4;
        ctx.font = '8px Rajdhani, sans-serif';
        ctx.fillStyle = alerting ? '#ff003c' : 'rgba(255,0,60,0.6)';
        ctx.textAlign = 'center';
        const label = e.behavior === 'hunter' ? '⚡ HUNTER' : e.behavior === 'blocker' ? '⛔ BLOCKER' : '〇 PATROL';
        ctx.fillText(label, e.x, e.y - e.r * 3 - 12);
        ctx.textAlign = 'left';

        ctx.restore();
    });

    // ── PLAYER TRAIL ──────────────────────────────────────────────────────
    if (gameState === 'playing' && player.trail.length > 1) {
        ctx.save();
        for (let i = 1; i < player.trail.length; i++) {
            const t = i / player.trail.length;
            ctx.globalAlpha = t * (isWaveMode ? 0.25 : 0.5);
            ctx.strokeStyle = isWaveMode ? '#00f0ff' : 'rgba(255,255,255,0.9)';
            ctx.lineWidth = t * (isWaveMode ? 6 : 8);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(player.trail[i - 1].x, player.trail[i - 1].y);
            ctx.lineTo(player.trail[i].x, player.trail[i].y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.restore();
    }

    // ── PLAYER ────────────────────────────────────────────────────────────
    if (gameState === 'playing') {
        ctx.save();

        // Invincibility flicker
        if (player.invincible > 0 && Math.floor(player.invincible * 10) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        }

        if (isWaveMode) {
            // Sine-Wave Oscilloscope Packet Render
            ctx.shadowBlur = 15; ctx.shadowColor = '#00f0ff';
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 4;

            const hist = player.trail;
            if (hist.length > 2) {
                // Determine direction of travel from velocity to orient the wave transverse
                let fwdX = player.vx, fwdY = player.vy;
                if (Math.hypot(fwdX, fwdY) < 10) { fwdX = 1; fwdY = 0; }
                const mg = Math.hypot(fwdX, fwdY);
                const normX = fwdX / mg, normY = fwdY / mg;
                const perpX = -normY, perpY = normX;

                ctx.beginPath();
                for (let i = 0; i < hist.length; i++) {
                    const p1 = hist[i];
                    const tPct = i / hist.length; // 0 to 1

                    // A * sin(kx - wt). Amplitude envelopes to max in center of tail.
                    const envelope = Math.sin(tPct * Math.PI);
                    const amplitude = 35 * envelope;
                    const wavePhase = (i * 0.4) - (totalTime * 20);
                    const offset = Math.sin(wavePhase) * amplitude;

                    const wx = p1.x + perpX * offset;
                    const wy = p1.y + perpY * offset;

                    if (i === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
                }
                ctx.stroke();

                // Hot core line
                ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
            } else {
                ctx.beginPath(); ctx.arc(player.x, player.y, 12, 0, Math.PI * 2); ctx.stroke();
            }
        } else {
            // Particle mode — crisp glowing electron
            ctx.shadowBlur = 30; ctx.shadowColor = 'rgba(0,240,255,1)';
            const px = Number.isFinite(player.x) ? player.x : 0;
            const py = Number.isFinite(player.y) ? player.y : 0;
            const pg = ctx.createRadialGradient(px, py, 0, px, py, player.r);
            pg.addColorStop(0, '#fff');
            pg.addColorStop(0.5, '#80f8ff');
            pg.addColorStop(1, '#00f0ff');
            ctx.fillStyle = pg;
            ctx.beginPath(); ctx.arc(px, py, player.r, 0, Math.PI * 2); ctx.fill();

            // Spin orbit ring
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 0.45; ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1;
            const sA = totalTime * 5;
            ctx.beginPath();
            ctx.ellipse(player.x, player.y, player.r * 2.2, player.r * 0.7, sA, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (isShieldMode) {
            // Drawn dense protective energy dome over the player
            ctx.shadowBlur = 20; ctx.shadowColor = '#bc13fe';
            ctx.globalAlpha = 0.6 + Math.sin(totalTime * 15) * 0.2;
            const px = Number.isFinite(player.x) ? player.x : 0;
            const py = Number.isFinite(player.y) ? player.y : 0;
            const sg = ctx.createRadialGradient(px, py, player.r, px, py, player.r * 3.5);
            sg.addColorStop(0, 'rgba(188,19,254,0)');
            sg.addColorStop(0.8, 'rgba(188,19,254,0.5)');
            sg.addColorStop(1, '#bc13fe');
            ctx.fillStyle = sg;
            ctx.beginPath(); ctx.arc(px, py, player.r * 3.5, 0, Math.PI * 2); ctx.fill();
        }

        ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.restore();
    }

    // ── BURST PARTICLES ───────────────────────────────────────────────────
    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life * 1.7);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 6; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    ctx.restore(); // end world transform

    // ── HUD OVERLAYS (screen space) ────────────────────────────────────────
    const playerDist = Math.hypot(player.x, player.y);
    const safeShellIdx = Math.min(shellIdx, SHELLS.length - 1);
    const distPct = Math.max(0, Math.min(1, playerDist / SHELLS[safeShellIdx].targetR));
    const screenR = Math.min(canvas.width, canvas.height) / 2 - 20;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);

    // Radial distance arc
    ctx.strokeStyle = hexA(SHELLS[safeShellIdx].color, 0.13);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, screenR, -Math.PI / 2, distPct * Math.PI * 2 - Math.PI / 2);
    ctx.stroke();

    // Breakthrough progress arc
    if (breakthroughTimer > 0) {
        const btPct = breakthroughTimer / BREAKTHROUGH_REQ;
        ctx.strokeStyle = hexA(SHELLS[safeShellIdx].color, 0.5 + btPct * 0.5);
        ctx.lineWidth = 5 + btPct * 6;
        ctx.shadowBlur = 20 * btPct; ctx.shadowColor = SHELLS[safeShellIdx].color;
        ctx.beginPath();
        ctx.arc(0, 0, screenR + 10, -Math.PI / 2, btPct * Math.PI * 2 - Math.PI / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Label
        ctx.fillStyle = hexA(SHELLS[shellIdx].color, 0.9);
        ctx.font = 'bold 11px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`TUNNELING… ${Math.ceil((BREAKTHROUGH_REQ - breakthroughTimer) * 10) / 10}s`, 0, -screenR - 22);
        ctx.textAlign = 'left';
    }
    ctx.restore();

    // ── Boost cooldown bar (bottom center above mode buttons) ──────────────
    if (boostCooldown > 0) {
        const bPct = 1 - boostCooldown / BOOST_COOLDOWN;
        const bw = 180, bx = canvas.width / 2 - bw / 2, by = canvas.height - 130;
        ctx.save();
        ctx.fillStyle = 'rgba(255,229,0,0.08)';
        ctx.fillRect(bx, by, bw, 4);
        ctx.fillStyle = overheatFlash > 0 ? '#ff003c' : '#ffe500';
        ctx.fillRect(bx, by, bw * bPct, 4);
        ctx.font = '9px Rajdhani, sans-serif';
        ctx.fillStyle = 'rgba(255,229,0,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText('PHOTON KICK RELOADING', canvas.width / 2, by - 6);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Speed indicator loop moved to HTML DOM updateHUD()
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function hexA(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
}

// ── GAME LOOP ──────────────────────────────────────────────────────────────
function gameLoop() {
    const now = performance.now();
    let dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Apply time dilation ONLY during escape cinematic
    const slowDt = isEscaping ? dt * 0.1 : dt;

    update(slowDt);
    draw();

    // Stop loop when game has ended — canvas hidden, overlay is showing
    if (gameState !== 'dead' && gameState !== 'escaped') {
        requestAnimationFrame(gameLoop);
    }
}

// ── INTRO CINEMATIC ────────────────────────────────────────────────────────
const INTRO_BC = document.getElementById('intro-bubbles');
let iTime = 0, iPhase = 0, iZoom = 0.018, iAtomA = 0, iExGlow = 0;
let iLightT = -1, iFlash = 0, iZap = null;

// Deterministic stars
const I_STARS = Array.from({ length: 200 }, (_, i) => ({
    x: Math.sin(i * 2.3999) * 3600, y: Math.cos(i * 1.7321) * 3600,
    s: .5 + (i % 5) * .35, b: .25 + ((i * 37) % 63) / 100
}));
// Bohr shells: [r, [startAngles], orbitSpeed]
const I_SHELLS = [
    { r: 82, ang: [0, Math.PI], spd: 1.1 },
    { r: 158, ang: [.4, 2.0, 3.8, 5.4], spd: .62 },
    { r: 245, ang: [.8, 2.5, 4.2], spd: .38 },
];

function iShowBubble(cls, speaker, html, dur) {
    const d = document.createElement('div');
    d.className = 'ibubble ' + cls;
    d.innerHTML = `<div class="spk">${speaker}</div>${html}`;
    INTRO_BC.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateY(-10px)'; setTimeout(() => d.remove(), 500); }, dur * 1000);
}
function skipIntro() {
    INTRO_BC.innerHTML = '';
    gameState = 'start';
    document.getElementById('start-screen').style.display = 'flex';
}

function updateIntro(dt) {
    iTime += dt;
    const T = iTime;
    // Zoom ease-in
    const zTarget = T < 1.5 ? 0.06 : 1;
    iZoom += (zTarget - iZoom) * (T < 1.5 ? .4 : 1.1) * dt;
    if (iZoom > .999) iZoom = 1;
    // Atom fade
    if (T > 1.8) iAtomA = Math.min(1, iAtomA + dt * .55);
    // Zap physics
    if (iZap) { iZap.x += iZap.vx * dt; iZap.life -= dt; if (iZap.life <= 0) iZap = null; }
    // Lightning timer
    if (iLightT >= 0) {
        const lt = T - iLightT;
        if (lt > .5) iExGlow = Math.min(1, iExGlow + dt * 1.8);
    }
    // Final fade to white
    if (T > 29) iFlash = Math.min(1, iFlash + dt * 1.8);
    if (T > 30.5) { skipIntro(); return; }

    // Phase events (fire-once gates)
    if (iPhase === 0 && T > 4.2) {
        iPhase = 1;
        iShowBubble('ib-a', 'ELECTRON α', "What's the probability density of finding one of us in the <em>valence shell</em>?", 4);
    }
    if (iPhase === 1 && T > 8.5) {
        iPhase = 2;
        iShowBubble('ib-b', 'ELECTRON β', "With our quantum numbers?<br><em>Vanishingly small.</em> Coulomb chains us here.", 4);
    }
    if (iPhase === 2 && T > 13) {
        iPhase = 3;
        iZap = { x: -canvas.width * .55, y: canvas.height * .34, vx: 1500, life: 1.3 };
        iShowBubble('ib-x', '✦ EXCITED e⁻', "Maybe if you're <em>lucky</em>—<br>and <strong>excited</strong> enough—like me! ⚡", 2.8);
    }
    if (iPhase === 3 && T > 16) {
        iPhase = 4;
        iShowBubble('ib-a', 'ELECTRON α', "And… outside the atom entirely?<br>The probability of <em>escape</em>?", 4);
    }
    if (iPhase === 4 && T > 20.5) {
        iPhase = 5;
        iShowBubble('ib-b', 'ELECTRON β', "Zero.<br><span style='opacity:.45'>Unless God shines on you.</span>", 4);
    }
    if (iPhase === 5 && T > 25) { iPhase = 6; iLightT = T; }
    if (iPhase === 6 && T > 27) {
        iPhase = 7;
        iShowBubble('ib-p', 'ELECTRON α', "I feel it… I'm <em>EXCITED.</em><br>It's time to go.", 4);
    }
}

function drawIntro() {
    const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, T = iTime;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#06060e'; ctx.fillRect(0, 0, W, H);

    // Stars with zoom parallax
    ctx.save(); ctx.translate(cx, cy);
    I_STARS.forEach(s => {
        const sx = s.x * iZoom, sy = s.y * iZoom;
        if (sx < -W / 2 - 4 || sx > W / 2 + 4 || sy < -H / 2 - 4 || sy > H / 2 + 4) return;
        ctx.globalAlpha = s.b * Math.min(1, iZoom * 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(sx - s.s / 2, sy - s.s / 2, s.s, s.s);
    });
    ctx.globalAlpha = 1; ctx.restore();

    // Bohr atom
    if (iAtomA > 0) {
        ctx.save(); ctx.translate(cx, cy); ctx.globalAlpha = iAtomA;
        // Nucleus
        ctx.shadowBlur = 70; ctx.shadowColor = '#bc13fe';
        const ng = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
        ng.addColorStop(0, '#fff'); ng.addColorStop(.35, '#e060ff'); ng.addColorStop(1, 'rgba(188,19,254,.05)');
        ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = '9px Rajdhani,sans-serif';
        ctx.textAlign = 'center'; ctx.fillText('NUCLEUS', 0, 44); ctx.textAlign = 'left';

        const COLORS = ['#00f0ff', '#4682b4', '#bc13fe']; // Cyan, Steel Blue, Amethyst
        I_SHELLS.forEach((sh, si) => {
            // Ring (tilted ellipse for perspective feel)
            ctx.save();
            ctx.strokeStyle = `rgba(${si === 0 ? '0,240,255' : si === 1 ? '70,130,180' : '188,19,254'},.18)`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(0, 0, sh.r, sh.r * .3, Math.PI * .12 * si, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
            // Electrons
            sh.ang.forEach((a0, ei) => {
                const ang = a0 + T * sh.spd;
                const ex = Math.cos(ang) * sh.r, ey = Math.sin(ang) * sh.r * .3;
                const isAlpha = (si === 0 && ei === 0), isBeta = (si === 0 && ei === 1);
                ctx.save();
                if (isAlpha) {
                    const g2 = iExGlow;
                    ctx.shadowBlur = 25 + g2 * 70; ctx.shadowColor = '#00f0ff';
                    const pg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 14 + g2 * 30);
                    pg.addColorStop(0, '#fff'); pg.addColorStop(.4, '#00f0ff'); pg.addColorStop(1, 'rgba(0,240,255,0)');
                    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(ex, ey, 16 + g2 * 30, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0; ctx.fillStyle = '#00f0ff';
                    ctx.beginPath(); ctx.arc(ex, ey, 8 + g2 * 4, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = 'rgba(0,240,255,.7)'; ctx.font = '9px Rajdhani,sans-serif';
                    ctx.textAlign = 'center'; ctx.fillText('α', ex, ey - 18);
                    // Excited expansion rings
                    if (g2 > 0) for (let r = 0; r < 3; r++) {
                        const rr = ((T * 90 + r * 45) % 130);
                        ctx.globalAlpha = (1 - rr / 130) * g2 * .6;
                        ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1.5;
                        ctx.beginPath(); ctx.arc(ex, ey, rr, 0, Math.PI * 2); ctx.stroke();
                    }
                } else if (isBeta) {
                    ctx.shadowBlur = 14; ctx.shadowColor = '#00ff88';
                    ctx.fillStyle = '#00ff88'; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(0,255,136,.6)';
                    ctx.font = '9px Rajdhani,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('β', ex, ey - 14);
                } else {
                    ctx.globalAlpha = .35; ctx.fillStyle = COLORS[si];
                    ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill();
                }
                ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.restore();
            });
        });
        ctx.restore();
    }

    // EM Wave (lightning/photon)
    if (iLightT >= 0) {
        const lt = T - iLightT, wSpeed = 680;
        const wx = W + 60 - wSpeed * lt; // wave front sweeping left
        if (wx < W + 60 && wx > -50) {
            ctx.save();
            // Flash aura
            if (lt < 2) {
                ctx.fillStyle = `rgba(0,240,255,${Math.sin(lt / 2 * Math.PI) * .4})`; // Cyan aura
                ctx.fillRect(0, 0, W, H);
            }
            // E-field — cyan sine wave
            ctx.strokeStyle = '#00f0ffff'; ctx.lineWidth = 2.5;
            ctx.shadowBlur = 22; ctx.shadowColor = '#00f0ff'; ctx.lineCap = 'round';
            ctx.beginPath(); let started = false;
            for (let x = Math.min(W, wx + 20); x >= Math.max(-10, wx - W); x -= 4) {
                const ph = (wx - x) / 130 * Math.PI * 2;
                const wy = cy + Math.sin(ph) * 62;
                started ? (ctx.lineTo(x, wy)) : (ctx.moveTo(x, wy), started = true);
            }
            ctx.stroke();
            // B-field — white cosine (perpendicular)
            ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#ffffff';
            started = false; ctx.beginPath();
            for (let x = Math.min(W, wx + 20); x >= Math.max(-10, wx - W); x -= 4) {
                const ph = (wx - x) / 130 * Math.PI * 2;
                const wy = cy + Math.cos(ph) * 45;
                started ? (ctx.lineTo(x, wy)) : (ctx.moveTo(x, wy), started = true);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
            // Labels
            ctx.globalAlpha = .5; ctx.fillStyle = '#00f0ff';
            ctx.font = '10px Rajdhani,sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('PHOTON (γ) →', wx - 80, cy - 80);
            ctx.globalAlpha = .4; ctx.fillStyle = '#bc13fe';
            ctx.fillText('E field', wx - 80, cy - 68);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('B field', wx - 80, cy - 56);
            ctx.textAlign = 'left'; ctx.globalAlpha = 1;
            // Impact flash at center
            if (wx < cx + 30 && wx > cx - 120) {
                const fA = (1 - Math.abs(wx - cx) / 150) * .9;
                ctx.fillStyle = `rgba(255,255,255,${fA})`;
                ctx.fillRect(0, 0, W, H);
            }
            ctx.restore();
        }
    }

    // Zapping excited electron (Cyan instead of yellow)
    if (iZap) {
        const e = iZap;
        ctx.save();
        ctx.shadowBlur = 55; ctx.shadowColor = '#bc13fe';
        const tl = 150;
        const tg = ctx.createLinearGradient(e.x - tl, e.y, e.x, e.y);
        tg.addColorStop(0, 'rgba(0,240,255,0)'); tg.addColorStop(1, 'rgba(0,240,255,.85)');
        ctx.strokeStyle = tg; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(e.x - tl, e.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        ctx.fillStyle = '#00f0ff'; ctx.beginPath(); ctx.arc(e.x, e.y, 11, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // Final fade to white then start screen
    if (iFlash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${iFlash})`;
        ctx.fillRect(0, 0, W, H);
    }

    // Skip hint
    if (T > 2 && T < 28) {
        ctx.save();
        ctx.globalAlpha = .22 + Math.sin(T * 1.5) * .08;
        ctx.font = '10px Rajdhani,sans-serif'; ctx.fillStyle = '#14bbd4f4';
        ctx.textAlign = 'right';
        ctx.fillText('PRESS ANY KEY TO SKIP', W - 28, H - 22);
        ctx.textAlign = 'left'; ctx.restore();
    }
}

function introLoop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    if (gameState === 'intro') { updateIntro(dt); drawIntro(); requestAnimationFrame(introLoop); }
    else { draw(); }
}

// Expose functions to window for HTML onclick compatibility
window.setMode = setMode;
window.toggleMuteHUD = toggleMuteHUD;
window.activateAudio = activateAudio;
window.startGame = startGame;
window.togglePause = togglePause;
window.exitGame = exitGame;
window.skipIntro = skipIntro;

gameState = 'intro';
lastTime = performance.now();
requestAnimationFrame(introLoop);

