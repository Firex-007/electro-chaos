# The Scientific Post-Mortem (Generative AI Integration)

Your reasoning is flawless. Option A and B are technical landmines for a 3-hour deadline. Option C (The Post-Mortem) delivers maximum emotional impact with **zero** risk to the 60FPS physics loop, while natively demonstrating a robust Generative AI integration to the sponsors.

Here is the exact battle plan to integrate the **Featherless AI LLM** into the game's death screen in the next 20 minutes.

## 1. The Telemetry Engine (Silent Tracking)
I will inject a lightweight `telemetry` object into the `gameLoop`. It will silently track:
*   `timeInWave` (Seconds spent in Ghost Mode)
*   `photonsAbsorbed` (How many +28 heals you caught)
*   `totalDistance` (How far the electron traveled)
*   `killsMitigated` (How many enemies you slipped past vs got hit by)
*   `shellDepth` (How far you made it before collapsing)
*   `causeOfCollapse` (Was it a Hunter strike, a Foam Friction stall, or natural decay?)

## 2. The Featherless AI REST API Hook
When `triggerDeath()` or `triggerEscape()` fires, the game pauses rendering. We will instantly execute an async `fetch()` request to the Featherless AI Chat Completions endpoint. 
*   **The System Prompt:** *"You are a high-level Quantum Physicist reviewing the anomalous collapse of an electron holding excessive energy. Write a terse, 3-sentence scientific research journal entry post-mortem analyzing the telemetry data."*
*   **The User Payload:** The JSON stringified `telemetry` object.
*   **Live Server Caveat:** Since you are using Live Server (port 5500) and not Vite, `import.meta.env` won't work automatically. I will structure the API call to check a global `window.ENV_VARS` or temporarily accept a hardcoded key in your local setup, so you can test it immediately without breaking pathing again.

## 3. The UI Integration (The Research Journal)
I will modify `index.html` and `style.css` to add a stylized "Quantum Research Journal" readout box to the Death and Escape screens. 
*   When you die, the box will initially show a flickering "Uplinking to Featherless AI Mainframe... Analyzing Wave Collapse..." animation.
*   Once the LLM returns the payload (usually 1.5 - 2 seconds), the text will dynamically type itself out like a true terminal log, giving you a custom, deeply scientific post-mortem.

## User Review Required

> [!IMPORTANT]
> **API Key Setup:** To make this work safely over VSCode Live Server, we need a secure way to access your `VITE_FEATHERLESS_API_KEY`. 
> Do you have an `env.js` file acting as a global bridge, or do you want me to write the fetch function so you can manually paste the key in right before your final demo? 
> 
> Approve this final plan and we will wire up the AI!
