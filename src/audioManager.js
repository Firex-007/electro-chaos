const AUDIO_TRACKS = [
    { name: "Inner Core", filepath: "public/assets/track1-core.mp3" },
    { name: "Circuit Lattice", filepath: "public/assets/track2-lattice.mp3" },
    { name: "Quantum Infinity", filepath: "public/assets/track3-infinity.mp3" }
];

const MASTER_VOLUME = 0.45;
const FADE_DURATION_MS = 2000;

class AudioManager {
    constructor() {
        this.tracks = [];
        this.currentTrackIndex = -1;
        this.isInitialized = false;
        this.isMuted = localStorage.getItem('quantum_audio_muted') === 'true';
    }

    /**
     * Initializes the Audio objects but only loads the first track
     * to prevent massive memory spikes on initial load.
     */
    initAudio() {
        if (this.isInitialized) return;

        AUDIO_TRACKS.forEach((trackInfo, index) => {
            const audioObj = new Audio();
            audioObj.loop = true;
            audioObj.volume = 0; // Start silenced
            
            // Expert Fix 1 & 2: Absolute Root Path + Kebab Case
            const fullPath = trackInfo.filepath;

            // Only preload the first track immediately.
            if (index === 0) {
                audioObj.src = fullPath;
                audioObj.load();
            }

            this.tracks.push({
                element: audioObj,
                info: trackInfo,
                isLoaded: index === 0,
                fullPath: fullPath
            });
        });

        this.isInitialized = true;
        console.log(`Audio Engine ⚛️: System Ready. (Muted: ${this.isMuted})`);
    }

    /**
     * Start the symphony. Must be triggered directly by a physical user click.
     */
    startMusic() {
        if (!this.isInitialized || this.currentTrackIndex !== -1 || this.isMuted) return;

        const firstTrack = this.tracks[0];
        firstTrack.element.volume = MASTER_VOLUME;
        
        // Expert Fix 3: Direct playback attempt, no async delays
        console.log(`Now Playing 🎵: [${firstTrack.info.name}] (Source: ${firstTrack.fullPath})`);
        firstTrack.element.play().then(() => {
            this.currentTrackIndex = 0;
            // Preload the next track silently in the background
            this._preloadTrack(1);
        }).catch(err => {
            console.warn(`Audio Error 🚫: Playback failed for ${firstTrack.fullPath}. Check if file exists.`, err);
        });
    }

    /**
     * Toggles global mute state and pauses/resumes active tracks.
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem('quantum_audio_muted', this.isMuted);

        this.tracks.forEach(t => {
            if (this.isMuted) {
                t.element.pause();
                t.element.muted = true;
            } else {
                t.element.muted = false;
            }
        });

        if (!this.isMuted && this.currentTrackIndex !== -1) {
            const current = this.tracks[this.currentTrackIndex];
            current.element.volume = MASTER_VOLUME;
            current.element.play().catch(e => console.warn(e));
        }

        console.log(`Quantum Audio 🔊: ${this.isMuted ? 'MUTED' : 'UNMUTED'}`);
        return this.isMuted;
    }

    /**
     * Instantly halts and unloads all music.
     */
    stopAll() {
        this.tracks.forEach(track => {
            track.element.pause();
            track.element.currentTime = 0;
            track.element.volume = 0;
        });
        this.currentTrackIndex = -1;
        console.log("Quantum Audio ⏹️: System Shutdown.");
    }

    /**
     * Crossfade to a specific shell's track index smoothly.
     */
    transitionToShell(targetIndex) {
        if (!this.isInitialized || this.currentTrackIndex === targetIndex) return;
        if (targetIndex >= this.tracks.length || targetIndex < 0) return;
        if (this.isMuted) {
            this.currentTrackIndex = targetIndex;
            return;
        }

        const oldTrack = this.tracks[this.currentTrackIndex];
        const newTrack = this.tracks[targetIndex];

        // Ensure the new track is loaded and has a source
        this._preloadTrack(targetIndex);

        console.log(`Crossfading 🎵: [${oldTrack ? oldTrack.info.name : 'Silence'}] ➔ [${newTrack.info.name}]`);

        // Start playback of the new track at 0 volume
        newTrack.element.volume = 0;
        newTrack.element.play().catch(e => console.warn(e));

        const startTime = performance.now();
        const fadeStep = (timestamp) => {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / FADE_DURATION_MS, 1);
            const easeProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            if (oldTrack && oldTrack.element) {
                oldTrack.element.volume = MASTER_VOLUME * (1 - easeProgress);
            }
            newTrack.element.volume = MASTER_VOLUME * easeProgress;

            if (progress < 1) {
                requestAnimationFrame(fadeStep);
            } else {
                if (oldTrack && oldTrack.element) {
                    oldTrack.element.pause();
                    oldTrack.element.volume = 0;
                }
                this.currentTrackIndex = targetIndex;
                this._preloadTrack(targetIndex + 1);
            }
        };

        requestAnimationFrame(fadeStep);
    }

    /**
     * Silently lazy-loads a track if it hasn't mapped its source yet.
     */
    _preloadTrack(index) {
        if (index < this.tracks.length && !this.tracks[index].isLoaded) {
            console.log(`Lazy Loading 🔋: [${this.tracks[index].info.name}] (Source: ${this.tracks[index].fullPath})`);
            this.tracks[index].element.src = this.tracks[index].fullPath;
            this.tracks[index].element.load();
            this.tracks[index].isLoaded = true;
        }
    }
}

// Export singleton to be accessed globally
window.audioManager = new AudioManager();
