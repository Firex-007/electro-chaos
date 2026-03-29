const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const oldHtml = fs.readFileSync(path.join(cwd, 'old-index.html'), 'utf-8');

// Directories
fs.mkdirSync(path.join(cwd, 'src', 'styles'), { recursive: true });
fs.mkdirSync(path.join(cwd, 'src', 'js'), { recursive: true });

// Extract CSS
const styleMatch = oldHtml.match(/<style>([\s\S]*?)<\/style>/);
if (styleMatch) {
    fs.writeFileSync(path.join(cwd, 'src', 'styles', 'main.css'), styleMatch[1].trim());
}

// Extract JS
let scriptMatch = oldHtml.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
    let jsCode = scriptMatch[1].trim();

    // 1. Remove the old sendTelemetry
    jsCode = jsCode.replace(/async function sendTelemetry[\s\S]*?\}\n\}/, 'import { sendTelemetry } from "./api.js";');

    // 2. Remove sponsor spark names
    jsCode = jsCode.replace(/const SPONSORS = \['CREAO AI'[\s\S]*?photons\.push\(\{ x: player\.x \+ Math\.cos\(a\)\*r, y: player\.y \+ Math\.sin\(a\)\*r, phase: Math\.random\(\)\*Math\.PI\*2, age: 0, sponsor: name \}\);/g, 
        `photons.push({ x: player.x + Math.cos(a)*r, y: player.y + Math.sin(a)*r, phase: Math.random()*Math.PI*2, age: 0 });`);
    jsCode = jsCode.replace(/const pName = photons\[i\]\.sponsor;[\s\S]*?showToast\(.*?Picked up .*?Neural Spark.*?\);/g, 
        `showToast('<span class="hy">+35 COHERENCE</span> | Picked up Quantum Spark');`);

    // Ensure functions called from HTML are globally available for now (like startGame, togglePause, setMode)
    jsCode += `\n\n// Expose to global scope for HTML inline handlers (hackathon quick fix)\nwindow.startGame = startGame;\nwindow.togglePause = togglePause;\nwindow.setMode = setMode;\nwindow.skipIntro = skipIntro || function(){};\n`;

    fs.writeFileSync(path.join(cwd, 'src', 'js', 'main.js'), jsCode);
}

// Rewrite HTML
let newHtml = oldHtml.replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="/src/styles/main.css" />');
newHtml = newHtml.replace(/<script>[\s\S]*?<\/script>/, '<script type="module" src="/src/js/main.js"></script>');

// Strip sponsor UI inputs from HTML easily
newHtml = newHtml.replace(/<div style="background:rgba\(0,0,0,0\.4\); padding: 12px; border: 1px solid rgba\(255,255,255,0\.1\); margin-top: 10px; border-radius:4px;">[\s\S]*?<\/div>/g, '');

// Revert start screen text
newHtml = newHtml.replace(/Quantum Odyssey \| Escaping to the CREAO AI Mainframe/, 'Quantum Odyssey');
newHtml = newHtml.replace(/Escape all 4 shells\. Reach the CREAO Data Core\./, 'Escape all 4 shells. Reach Quantum Infinity.');

fs.writeFileSync(path.join(cwd, 'index.html'), newHtml);

// Create API module
const apiCode = `
export async function sendTelemetry(reason, score, shell) {
    const n8nUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;
    const featherlessKey = import.meta.env.VITE_FEATHERLESS_API_KEY;
    const gameState = reason.includes('escape') ? 'escaped' : 'dead';
    
    // Dispatch telemetry to n8n webhook silently
    if (n8nUrl) {
        fetch(n8nUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ score, shell, reason, event: gameState })
        }).catch(e => console.log('n8n Webhook Error:', e));
    }

    // Dynamic Sassy Quote via Featherless AI presented as "Quantum Oracle"
    if (featherlessKey) {
        const outBox = document.getElementById(gameState === 'dead' ? 'death-reason' : 'escape-reason');
        outBox.innerHTML += \`<br><br><span style="color:#ffe500">Processing Oracle readout...</span>\`;
        try {
            const res = await fetch('https://api.featherless.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${featherlessKey}\` },
                body: JSON.stringify({
                    model: 'meta-llama/Meta-Llama-3-8B-Instruct', 
                    messages: [{
                        role: 'system', 
                        content: 'You are a sarcastic, omniscient quantum physics AI.'
                    }, {
                        role: 'user',
                        content: \`The player electron has \${gameState === 'dead' ? 'collapsed' : 'ESCAPED'} at Shell \${shell} with a score of \${score} due to: \${reason}. Generate a highly sarcastic 2-sentence combat summary.\`
                    }]
                })
            });
            const data = await res.json();
            const quote = (data.choices && data.choices[0] && data.choices[0].message.content) || 'Oracle unresponsive.';
            outBox.innerHTML = \`\${gameState === 'dead' ? 'Your coherence collapsed.' : 'A successful ionization.'}<br><br><span style="color:#00f0ff">Quantum Oracle Analysis:</span><br><em style="color:#fff">"\${quote}"</em>\`;
        } catch (e) {
            console.log('Featherless Error:', e);
            outBox.innerHTML += \`<br><span style="color:var(--red)">(Oracle Link Failed)</span>\`;
        }
    }
}
`;
fs.writeFileSync(path.join(cwd, 'src', 'js', 'api.js'), apiCode.trim());

console.log("Splitting complete.");
