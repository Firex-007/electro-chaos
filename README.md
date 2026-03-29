# Electro-Chaos: Quantum Odyssey

> **"Survive the void. Defy the nucleus. Escape the atom."**

**Electro-Chaos: Quantum Odyssey** is a cinematic, physics-driven subatomic survival game built entirely on HTML5 Canvas. You play as a rogue, hyper-energized electron attempting to break free from the crushing electrostatic grip of an unstable super-heavy nucleus. 

To escape ionization and reach "Quantum Infinity," you must navigate four increasingly erratic atomic shells, dodge aggressive enemy electron probability clouds, and master the mind-bending mechanics of wave-particle duality.

---

## 📖 The Lore & Objective

You are trapped in the **Inner Core**. The nucleus is burning like a dying star, emitting massive radial Coulomb forces that drag you inward. If your Coherence (Health) drops to zero, your wave-function collapses, and you are annihilated into the void.

Your objective is to push outward through four distinct orbital shells:
1. **Inner Core** ($n=1$)
2. **Phonon Lattice** ($n=2$)
3. **Delocalized Band** ($n=3$)
4. **Vacuum Edge** ($n=4$)

By surviving at the very boundary of a shell, you build up "Breakthrough Charge." At 100%, you instantly **Quantum Tunnel** through the impenetrable barrier into the next shell. Breach all four, and you achieve absolute freedom.

---

## ⚛️ Core Subatomic Mechanics

We threw out standard arcade physics and replaced them with stylized subatomic rules:

### 1. Vector Kicks & Coulomb Drag
Space is a vacuum. You do not hold a button to run; you press keys to align your vector, and hit **[SPACE]** to fire a **Photon Kick**—an instant burst of momentum that costs Coherence. 
Meanwhile, the Nucleus exerts a constant $F \propto 1/r^2$ gravitational-like electrostatic pull, forcing you to constantly maintain velocity to stay in orbit.

### 2. Wave-Particle Duality (The 'Q' Key)
By pressing **Q**, you toggle between two states:
*   **Particle Mode (Default):** You are a crisp, glowing point of mass. You can be hit, repelled by other electrons, and lose Coherence rapidly if you collide with hazards.
*   **Wave Mode:** You transform into a high-frequency Sine-Wave Packet ($A \cdot \sin(kx - \omega t)$). In this state, you are entirely immune to physical impacts and glide cleanly through enemy electron clouds. However, maintaining this form rapidly drains your baseline Coherence.

### 3. The Neon Siphon (Environmental Fields)
The atomic void is not empty—it is filled with dynamic Flux Fields.
*   **Lorentz Forces (Magnetic):** Faint purple currents that physically bend your trajectory.
*   **Potential Gradients (Electric):** Faint blue currents that push you like a cosmic wind.
If you enter a Flux Field and shift into **Wave Mode**, the field ignites. Instead of draining Coherence, you trigger a **Neon Siphon**, rapidly absorbing ambient energy from the vacuum to heal yourself.

### 4. Inverse Distance Stability
Unlike traditional games where the "edge of the map" is the most dangerous, Electro-Chaos features Inverse Drain. As you push further away from the suffocating Nucleus, your baseline Coherence drain *decreases* by up to 40%. The outer edges of the atom are physically safer, but navigating the massive, empty shells requires precise momentum management.

---

## 💻 Tech Stack & Hackathon API Integrations

**Electro-Chaos** was built purely with Vanilla JavaScript, HTML5 Canvas, and CSS3, requiring zero external game engines (like Unity or Godot) to guarantee a silky smooth 60FPS browser experience.

To fulfill the hackathon's requirements, we deeply integrated sponsor technologies directly into the game's lore, rather than treating them as UI advertisements:

### 1. Featherless AI (The Quantum Oracle)
When your wave-function collapses (Death), the game securely packages your final telemetry data (Time Alive, Shell Number, Cause of Death) and sends it to **Meta-Llama 3** via the Featherless API. The LLM acts as an in-universe "Quantum Oracle," analyzing your failure and generating a real-time, lore-accurate tactical debriefing on the death screen.

### 2. n8n (Subatomic Telemetry)
All high-stakes events (breaching a shell, game over, successful ionization) fire asynchronous POST requests to a secure **n8n Webhook**. This allows us to track global player statistics, log high scores to external databases, and monitor the health of the game instance entirely dynamically.

### 3. The Vertical Mix Audio Engine
We built a custom `AudioManager` class that seamlessly crossfades between three massive, cinematic MP3 stems. Using `requestAnimationFrame`, the engine mixes the audio tracks flawlessly as the player physically tunnels higher into the atom, transitioning the vibe from a frantic core run to a vast, echoing space-opera.

---

## 🎮 Controls

*   **W, A, S, D / Arrows:** Align Thruster Vector
*   **SPACEBAR:** Fire Photon Kick (Consumes Coherence)
*   **Q or E:** Toggle Wave-State / Particle-State
*   **ESC:** Pause / Resume Simulation

---

*Electro-Chaos: Quantum Odyssey - Built for LovHack Season 2.*
