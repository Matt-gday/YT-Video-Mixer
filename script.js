/* ===================================================================
 * YOUTUBE ART MIXER - JAVASCRIPT
 * ===================================================================
 * 
 * ARCHITECTURE OVERVIEW:
 * - 6 video slots (0-5), each can hold one unique YouTube video
 * - Each slot has TWO YouTube players:
 *   1. Preview player (in module) - MUTED, for timeline scrubbing
 *   2. Main player (in composite) - handles audio, for final output
 * 
 * AUDIO MANAGEMENT:
 * - Preview mode: Only slot 0 has audio to prevent doubling
 * - Recording mode: All slots play audio mixed together
 * 
 * LAYERING SYSTEM:
 * - Right slots stack on top of left slots (slot 5 on top of slot 0)
 * - Opacity controls transparency for photoshop-style blending
 * - Volume controls individual audio levels
 * 
 * RECORDING SYSTEM:
 * - Captures every slider movement with precise timestamps
 * - Fixed 60-second duration for all compositions
 * - Saves as JSON timeline for playback/sharing
 */

// =================== GLOBAL VARIABLES ===================
let currentSlot = 0;                    // Which slot modal is open for
let videos = [];                        // Array of video data objects
let usedUrls = new Set();              // Prevents duplicate videos
let isRecording = false;               // Recording state flag
let recordingStartTime = 0;            // When recording began
let countdownInterval = null;          // 60-second timer
let currentRecording = [];             // Array of recorded actions
let YTReady = false;                   // YouTube API ready flag

// YouTube player instances - each slot has two players
let previewPlayers = {};  // Small players in modules (MUTED)
let mainPlayers = {};     // Large players in main composite (AUDIO)
let updateIntervals = {}; // Timeline update intervals
let syncLocks = {};       // Prevent simultaneous sync operations

// Timeline scrubber dragging state
let isDragging = false;
let dragSlot = null;
let lastMouseX = 0;  // Track last mouse X position for incremental movement
let currentTime = 0; // Track current time position during drag

// =================== YOUTUBE API SETUP ===================
// Called automatically when YouTube API loads
function onYouTubeIframeAPIReady() {
    YTReady = true;
    console.log('YouTube API Ready');
}

// =================== MODAL FUNCTIONS ===================
function openModal(slot) {
    console.log('Opening modal for slot:', slot);
    if (isRecording) return;
    currentSlot = slot;
    document.getElementById('url-modal').style.display = 'flex';
    document.getElementById('url-input').value = '';
    document.getElementById('url-input').focus();
}

function closeModal() {
    console.log('Closing modal');
    document.getElementById('url-modal').style.display = 'none';
}

function addVideo() {
    const url = document.getElementById('url-input').value.trim();
    console.log('Adding video:', url);
    
    if (!url) {
        alert('Please enter a URL');
        return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        alert('Please enter a valid YouTube URL');
        return;
    }

    if (usedUrls.has(url)) {
        alert('This video is already added. Please use a unique video.');
        return;
    }

    usedUrls.add(url);
    loadVideoInSlot(currentSlot, url, videoId);
    closeModal();
}

// =================== VIDEO URL PROCESSING ===================
function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// =================== VIDEO LOADING SYSTEM ===================
function loadVideoInSlot(slot, url, videoId) {
    console.log('Loading video in slot:', slot, videoId);
    
    const module = document.querySelector(`[data-slot="${slot}"]`);
    
    // Clean up existing players
    if (previewPlayers[slot]) {
        previewPlayers[slot].destroy();
        delete previewPlayers[slot];
    }
    if (mainPlayers[slot]) {
        mainPlayers[slot].destroy();
        delete mainPlayers[slot];
    }
    if (updateIntervals[slot]) {
        clearInterval(updateIntervals[slot]);
        delete updateIntervals[slot];
    }

    // Create video object
    videos[slot] = {
        url: url,
        videoId: videoId,
        startTime: 0,
        endTime: 60,
        volume: 50,
        opacity: 100,
        linked: false,
        locked: false,
        title: `Video ${slot + 1}`,
        duration: 0,
        currentTime: 0,
        keyframes: [null, null, null] // Three keyframe slots
    };

    // Update module HTML
    module.className = 'video-module';
    module.onclick = null;
    module.innerHTML = `
        <button class="remove-btn" onclick="removeVideo(${slot})">×</button>
        <div class="video-preview">
            <div id="preview-${slot}"></div>
        </div>
        <div class="video-info">
            <div class="current-time" id="current-time-${slot}">0:00</div>
            <div class="keyframe-controls">
                <button class="keyframe-btn empty" onclick="handleKeyframeClick(${slot}, 0)" ondblclick="setKeyframe(${slot}, 0)" id="keyframe-${slot}-0">
                    <span class="keyframe-plus">+</span>
                </button>
                <button class="keyframe-btn empty" onclick="handleKeyframeClick(${slot}, 1)" ondblclick="setKeyframe(${slot}, 1)" id="keyframe-${slot}-1">
                    <span class="keyframe-plus">+</span>
                </button>
                <button class="keyframe-btn empty" onclick="handleKeyframeClick(${slot}, 2)" ondblclick="setKeyframe(${slot}, 2)" id="keyframe-${slot}-2">
                    <span class="keyframe-plus">+</span>
                </button>
            </div>
            <div class="timeline-scrubber" id="scrubber-${slot}">
                <div class="timeline-progress" id="progress-${slot}"></div>
                <div class="timeline-thumb" id="thumb-${slot}" title="Drag horizontally to scrub timeline. Move cursor up while dragging for fine control."></div>
            </div>
            <div class="control-row">
                <span class="control-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                </span>
                <input type="range" class="slider" min="0" max="100" value="50" 
                       oninput="updateVolume(${slot}, this.value)" id="vol-${slot}">
            </div>
            <div class="control-row">
                <span class="control-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                        <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.8"/>
                        <circle cx="12" cy="12" r="2" fill="currentColor"/>
                    </svg>
                </span>
                <input type="range" class="slider" min="0" max="100" value="100" 
                       oninput="updateOpacity(${slot}, this.value)" id="opc-${slot}">
            </div>
            <div class="module-controls">
                <button class="control-btn lock" onclick="toggleLock(${slot})" id="lock-${slot}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                    </svg>
                </button>
                <button class="control-btn" onclick="togglePlayPause(${slot})" id="play-pause-${slot}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </button>
                <button class="control-btn" onclick="toggleLink(${slot})" id="link-${slot}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                    </svg>
                </button>
            </div>
        </div>
    `;

    // Create YouTube players
    if (YTReady || window.YT) {
        createPlayers(slot, videoId);
    } else {
        setTimeout(() => createPlayers(slot, videoId), 1000);
    }

    // Setup timeline scrubber interactions
    setupTimelineScrubber(slot);
    
    // Update play button to show pause state since video will auto-start
    setTimeout(() => {
        updatePlayButtonState(slot, false);
    }, 600);

    updatePreviewComposite();
}

// =================== DUAL PLAYER CREATION ===================
function createPlayers(slot, videoId) {
    console.log('Creating players for slot:', slot);

    try {
        // Create preview player (in module) - NOW HANDLES AUDIO for immediate response
        previewPlayers[slot] = new YT.Player(`preview-${slot}`, {
            height: '100',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'autoplay': 0,
                'controls': 0,  // Disable YouTube controls - app controls playhead
                'rel': 0,       // Don't show related videos
                'modestbranding': 1,  // Remove YouTube logo
                'iv_load_policy': 3,  // Disable annotations
                'showinfo': 0,  // Hide video info
                'fs': 0,        // Disable fullscreen
                'cc_load_policy': 0,  // Disable closed captions by default
                'disablekb': 1, // Disable keyboard controls
                'playsinline': 1 // Play inline on mobile
                // REMOVED mute: 1 - preview players now handle audio
            },
            events: {
                'onReady': function(event) {
                    console.log(`Preview player ${slot} ready`);
                    videos[slot].duration = event.target.getDuration();
                    
                    // Preview player now handles audio - set volume properly
                    event.target.unMute();
                    event.target.setVolume(videos[slot].volume);
                    
                    // Disable pointer events on preview player
                    setTimeout(() => {
                        const previewElement = document.getElementById(`preview-${slot}`);
                        const iframe = previewElement?.querySelector('iframe');
                        if (previewElement) {
                            previewElement.style.pointerEvents = 'none';
                        }
                        if (iframe) {
                            iframe.style.pointerEvents = 'none';
                            iframe.style.userSelect = 'none';
                            console.log(`Disabled pointer events for preview player ${slot}`);
                        }
                    }, 500);
                    
                    // Start timeline updates
                    startTimelineUpdates(slot);
                    
                    // Auto-start the video when ready - ensure it actually starts
                    setTimeout(() => {
                        event.target.seekTo(videos[slot].startTime);
                        setTimeout(() => {
                            event.target.playVideo();
                            console.log(`Auto-started preview player ${slot}`);
                        }, 100);
                    }, 200);
                },
                'onStateChange': function(event) {
                    // Sync main player visuals when preview plays/pauses (audio stays with preview)
                    if (event.data === YT.PlayerState.PLAYING) {
                        if (mainPlayers[slot] && !syncLocks[slot]) {
                            syncLocks[slot] = true;
                            const currentTime = event.target.getCurrentTime();
                            // Sync main player for visuals only
                            setTimeout(() => {
                                try {
                                    mainPlayers[slot].seekTo(currentTime);
                                    mainPlayers[slot].playVideo();
                                } catch (error) {
                                    console.log('Could not sync main player visuals');
                                }
                                // Release lock after operation
                                setTimeout(() => {
                                    syncLocks[slot] = false;
                                }, 100);
                            }, 50);
                        }
                    } else if (event.data === YT.PlayerState.PAUSED) {
                        if (mainPlayers[slot] && !syncLocks[slot]) {
                            syncLocks[slot] = true;
                            setTimeout(() => {
                                try {
                                    mainPlayers[slot].pauseVideo();
                                } catch (error) {
                                    console.log('Could not pause main player visuals');
                                }
                                // Release lock after operation
                                setTimeout(() => {
                                    syncLocks[slot] = false;
                                }, 50);
                            }, 25);
                        }
                    }
                }
            }
        });

        // Create main composite player - this handles all audio
        createMainPlayer(slot, videoId);

    } catch (error) {
        console.error('Error creating players:', error);
    }
}

function createMainPlayer(slot, videoId) {
    const previewContent = document.getElementById('preview-content');
    
    // Remove placeholder text if this is the first video
    if (previewContent.textContent.includes('Add videos')) {
        previewContent.innerHTML = '';
    }

    // Create or update layer element for video compositing
    let layer = document.getElementById(`main-layer-${slot}`);
    if (!layer) {
        layer = document.createElement('div');
        layer.id = `main-layer-${slot}`;
        layer.className = 'main-video-layer';
        layer.style.zIndex = slot; // Higher slot number = top layer (right side = on top)
        layer.style.opacity = videos[slot].opacity / 100;
        previewContent.appendChild(layer);
    }

    try {
        // Main player for live composite - handles audio based on mode
        mainPlayers[slot] = new YT.Player(`main-layer-${slot}`, {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'autoplay': 0,
                'controls': 0,  // No controls on main composite
                'rel': 0,       // Don't show related videos
                'modestbranding': 1,  // Remove YouTube logo
                'iv_load_policy': 3,  // Disable annotations
                'showinfo': 0,  // Hide video info
                'fs': 0,        // Disable fullscreen
                'cc_load_policy': 0,  // Disable closed captions by default
                'disablekb': 1, // Disable keyboard controls
                'playsinline': 1, // Play inline on mobile
                'enablejsapi': 1, // Enable JavaScript API for more control
                'origin': window.location.origin, // Set origin for security
                'widget_referrer': window.location.origin,
                'host': 'https://www.youtube-nocookie.com' // Use privacy-enhanced mode
            },
            events: {
                'onReady': function(event) {
                    console.log(`Main player ${slot} ready`);
                    
                    // Hide YouTube overlays after player loads
                    setTimeout(() => {
                        hideYouTubeOverlays(slot);
                    }, 1000);
                    
                    // Auto-start and sync with preview player
                    setTimeout(() => {
                        event.target.seekTo(videos[slot].startTime);
                        setTimeout(() => {
                            event.target.playVideo();
                            console.log(`Auto-started main player ${slot}`);
                        }, 100);
                    }, 300); // Start after preview player
                    
                    // MAIN PLAYERS NOW VISUAL ONLY - muted to prevent audio doubling
                    event.target.mute();
                    event.target.setVolume(0);
                },
                'onStateChange': function(event) {
                    // Hide overlays when video pauses
                    if (event.data === YT.PlayerState.PAUSED) {
                        setTimeout(() => {
                            hideYouTubeOverlays(slot);
                        }, 100);
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating main player:', error);
    }
}

// =================== TIMELINE SYSTEM ===================
function startTimelineUpdates(slot) {
    if (updateIntervals[slot]) {
        clearInterval(updateIntervals[slot]);
    }

    updateIntervals[slot] = setInterval(() => {
        if (previewPlayers[slot] && previewPlayers[slot].getCurrentTime) {
            try {
                const currentTime = previewPlayers[slot].getCurrentTime();
                videos[slot].currentTime = currentTime;
                updateTimelineDisplay(slot, currentTime);
            } catch (error) {
                // Player not ready yet
            }
        }
    }, 100); // Update every 100ms for smooth timeline
}

function updateTimelineDisplay(slot, currentTime) {
    const duration = videos[slot].duration;
    if (duration > 0) {
        const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));
        const progressBar = document.getElementById(`progress-${slot}`);
        const thumb = document.getElementById(`thumb-${slot}`);
        
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (thumb) {
            // Position thumb so left edge is at 0% and right edge is at 100%
            // Thumb is 12px wide, so we need to offset by 6px (half width)
            const thumbPosition = (progress / 100) * (100 - (12 / thumb.parentElement.offsetWidth * 100));
            thumb.style.left = `calc(6px + ${thumbPosition}%)`;
        }
        
        // Update current time display
        const currentTimeDisplay = document.getElementById(`current-time-${slot}`);
        if (currentTimeDisplay) {
            currentTimeDisplay.textContent = formatTime(currentTime);
        }
    }
}

function seekToPosition(slot, event) {
    if (videos[slot].locked || !previewPlayers[slot]) return;
    
    const scrubber = event.currentTarget;
    const rect = scrubber.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * videos[slot].duration;
    
    previewPlayers[slot].seekTo(newTime);
    if (mainPlayers[slot]) {
        mainPlayers[slot].seekTo(newTime);
    }
    
    console.log(`Seeked slot ${slot} to ${newTime}s`);
}

// =================== TIME MANAGEMENT ===================
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// =================== VOLUME & OPACITY CONTROLS ===================
function updateVolume(slot, value) {
    if (videos[slot] && !videos[slot].locked) {
        const oldValue = videos[slot].volume;
        videos[slot].volume = parseInt(value);
        
        // Audio now comes from PREVIEW players - update them instead of main players
        if (previewPlayers[slot]) {
            previewPlayers[slot].setVolume(parseInt(value));
            
            // Mute/unmute based on volume level
            if (parseInt(value) > 0) {
                previewPlayers[slot].unMute();
            } else {
                previewPlayers[slot].mute();
            }
        }
        
        // Main players stay muted (visual only)
        if (mainPlayers[slot]) {
            mainPlayers[slot].mute();
            mainPlayers[slot].setVolume(0);
        }
        
        // Update linked videos
        updateLinkedControls(slot, 'volume', oldValue, parseInt(value));
        
        console.log('Updated volume for slot', slot, ':', value);
        recordAction('volume_change', { slot, volume: parseInt(value) });
    }
}

function updateOpacity(slot, value) {
    if (videos[slot] && !videos[slot].locked) {
        const oldValue = videos[slot].opacity;
        videos[slot].opacity = parseInt(value);
        
        // Update visual opacity in main composite
        const mainLayer = document.getElementById(`main-layer-${slot}`);
        if (mainLayer) {
            mainLayer.style.opacity = value / 100;
        }
        
        // Update linked videos
        updateLinkedControls(slot, 'opacity', oldValue, parseInt(value));
        
        console.log('Updated opacity for slot', slot, ':', value);
        recordAction('opacity_change', { slot, opacity: parseInt(value) });
    }
}

// =================== LINKING SYSTEM ===================
function updateLinkedControls(sourceSlot, type, oldValue, newValue) {
    if (!videos[sourceSlot].linked) return;
    
    const ratio = oldValue > 0 ? newValue / oldValue : 0;
    
    videos.forEach((video, slot) => {
        if (slot !== sourceSlot && video && video.linked && !video.locked) {
            if (type === 'volume') {
                const newLinkedValue = Math.max(0, Math.min(100, Math.round(video.volume * ratio)));
                video.volume = newLinkedValue;
                const volSlider = document.getElementById(`vol-${slot}`);
                if (volSlider) volSlider.value = newLinkedValue;
                
                // Audio now controlled by PREVIEW players
                if (previewPlayers[slot]) {
                    previewPlayers[slot].setVolume(newLinkedValue);
                    
                    // Mute/unmute based on volume level
                    if (newLinkedValue > 0) {
                        previewPlayers[slot].unMute();
                    } else {
                        previewPlayers[slot].mute();
                    }
                }
                
                // Ensure main players stay muted (visual only)
                if (mainPlayers[slot]) {
                    mainPlayers[slot].mute();
                    mainPlayers[slot].setVolume(0);
                }
            } else if (type === 'opacity') {
                const newLinkedValue = Math.max(0, Math.min(100, Math.round(video.opacity * ratio)));
                video.opacity = newLinkedValue;
                const opcSlider = document.getElementById(`opc-${slot}`);
                if (opcSlider) opcSlider.value = newLinkedValue;
                
                const mainLayer = document.getElementById(`main-layer-${slot}`);
                if (mainLayer) {
                    mainLayer.style.opacity = newLinkedValue / 100;
                }
            }
        }
    });
}

// =================== LINK AND LOCK CONTROLS ===================
function toggleLink(slot) {
    if (videos[slot] && !videos[slot].locked) {
        videos[slot].linked = !videos[slot].linked;
        const module = document.querySelector(`[data-slot="${slot}"]`);
        const linkBtn = document.getElementById(`link-${slot}`);
        
        if (videos[slot].linked) {
            linkBtn.classList.add('active');
            module.classList.add('linked');
        } else {
            linkBtn.classList.remove('active');
            module.classList.remove('linked');
        }
        console.log('Toggled link for slot', slot, ':', videos[slot].linked);
        recordAction('link_toggle', { slot, linked: videos[slot].linked });
    }
}

function toggleLock(slot) {
    if (videos[slot]) {
        videos[slot].locked = !videos[slot].locked;
        const module = document.querySelector(`[data-slot="${slot}"]`);
        const lockBtn = document.getElementById(`lock-${slot}`);
        
        if (videos[slot].locked) {
            // When locking: break any existing link and disable all controls
            if (videos[slot].linked) {
                videos[slot].linked = false;
                const linkBtn = document.getElementById(`link-${slot}`);
                linkBtn.classList.remove('active');
                module.classList.remove('linked');
            }
            
            lockBtn.classList.add('active');
            module.classList.add('locked');
            
            // Disable all controls when locked
            const volSlider = document.getElementById(`vol-${slot}`);
            const opcSlider = document.getElementById(`opc-${slot}`);
            const linkButton = document.getElementById(`link-${slot}`);
            const playPauseBtn = document.getElementById(`play-pause-${slot}`);
            const scrubber = document.getElementById(`scrubber-${slot}`);
            
            // Disable keyframe buttons
            for (let i = 0; i < 3; i++) {
                const keyframeBtn = document.getElementById(`keyframe-${slot}-${i}`);
                if (keyframeBtn) keyframeBtn.disabled = true;
            }
            
            if (volSlider) volSlider.disabled = true;
            if (opcSlider) opcSlider.disabled = true;
            if (linkButton) linkButton.disabled = true;
            if (playPauseBtn) playPauseBtn.disabled = true;
            if (scrubber) scrubber.style.pointerEvents = 'none';
            
        } else {
            lockBtn.classList.remove('active');
            module.classList.remove('locked');
            
            // Re-enable all controls when unlocked
            const volSlider = document.getElementById(`vol-${slot}`);
            const opcSlider = document.getElementById(`opc-${slot}`);
            const linkButton = document.getElementById(`link-${slot}`);
            const playPauseBtn = document.getElementById(`play-pause-${slot}`);
            const scrubber = document.getElementById(`scrubber-${slot}`);
            
            // Re-enable keyframe buttons
            for (let i = 0; i < 3; i++) {
                const keyframeBtn = document.getElementById(`keyframe-${slot}-${i}`);
                if (keyframeBtn) keyframeBtn.disabled = false;
            }
            
            if (volSlider) volSlider.disabled = false;
            if (opcSlider) opcSlider.disabled = false;
            if (linkButton) linkButton.disabled = false;
            if (playPauseBtn) playPauseBtn.disabled = false;
            if (scrubber) scrubber.style.pointerEvents = 'auto';
        }
        
        console.log('Toggled lock for slot', slot, ':', videos[slot].locked);
        recordAction('lock_toggle', { slot, locked: videos[slot].locked });
    }
}

// =================== INDIVIDUAL PLAY/PAUSE CONTROL ===================
function togglePlayPause(slot) {
    if (videos[slot] && !videos[slot].locked && previewPlayers[slot]) {
        try {
            const playPauseBtn = document.getElementById(`play-pause-${slot}`);
            
            // Get the actual player state
            previewPlayers[slot].getPlayerState().then ? 
                previewPlayers[slot].getPlayerState().then(state => handlePlayerState(slot, state, playPauseBtn)) :
                handlePlayerState(slot, previewPlayers[slot].getPlayerState(), playPauseBtn);
                
        } catch (error) {
            console.log('Could not toggle play/pause for slot', slot, error);
        }
    }
}

function handlePlayerState(slot, playerState, playPauseBtn) {
    console.log(`Player ${slot} state:`, playerState);
    
    if (playerState === YT.PlayerState.PLAYING) {
        // Currently playing - pause both players
        console.log(`Pausing slot ${slot}`);
        if (!syncLocks[slot]) {
            syncLocks[slot] = true;
            previewPlayers[slot].pauseVideo();
            
            setTimeout(() => {
                if (mainPlayers[slot]) {
                    try {
                        mainPlayers[slot].pauseVideo();
                    } catch (error) {
                        console.log('Could not pause main player');
                    }
                }
                // Release lock
                setTimeout(() => {
                    syncLocks[slot] = false;
                }, 50);
            }, 25);
        }
        
        // Update button to show play icon
        updatePlayButtonState(slot, true);
        
    } else {
        // Currently paused - play both players
        console.log(`Playing slot ${slot}`);
        if (!syncLocks[slot]) {
            syncLocks[slot] = true;
            previewPlayers[slot].playVideo();
            
            setTimeout(() => {
                if (mainPlayers[slot]) {
                    try {
                        const currentTime = previewPlayers[slot].getCurrentTime();
                        mainPlayers[slot].seekTo(currentTime);
                        mainPlayers[slot].playVideo();
                    } catch (error) {
                        console.log('Could not play main player');
                    }
                }
                // Release lock
                setTimeout(() => {
                    syncLocks[slot] = false;
                }, 100);
            }, 50);
        }
        
        // Update button to show pause icon
        updatePlayButtonState(slot, false);
    }
}

// =================== VIDEO REMOVAL ===================
function removeVideo(slot) {
    console.log('Showing delete confirmation for slot:', slot);
    if (isRecording) return;
    
    showDeleteConfirmation(slot);
}

function showDeleteConfirmation(slot) {
    // Remove any existing confirmation modals
    const existingModal = document.querySelector('.delete-confirmation-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const module = document.querySelector(`[data-slot="${slot}"]`);
    const deleteBtn = module.querySelector('.remove-btn');
    
    if (!module || !deleteBtn) return;
    
    // Create confirmation modal
    const modal = document.createElement('div');
    modal.className = 'delete-confirmation-modal';
    modal.innerHTML = `
        <div class="delete-modal-content">
            <div class="delete-modal-text">Delete video?</div>
            <div class="delete-modal-buttons">
                <button class="delete-modal-btn cancel" onclick="hideDeleteConfirmation()">No</button>
                <button class="delete-modal-btn confirm" onclick="confirmDelete(${slot})">Yes</button>
            </div>
        </div>
    `;
    
    // Position modal relative to delete button
    const rect = deleteBtn.getBoundingClientRect();
    modal.style.position = 'fixed';
    modal.style.top = `${rect.top - 10}px`;
    modal.style.left = `${rect.left - 60}px`;
    modal.style.zIndex = '1001';
    
    document.body.appendChild(modal);
}

function hideDeleteConfirmation() {
    const modal = document.querySelector('.delete-confirmation-modal');
    if (modal) {
        modal.remove();
    }
}

function confirmDelete(slot) {
    hideDeleteConfirmation();
    actuallyRemoveVideo(slot);
}

function actuallyRemoveVideo(slot) {
    console.log('Actually removing video from slot:', slot);
    
    // Clean up players and intervals
    if (previewPlayers[slot]) {
        previewPlayers[slot].destroy();
        delete previewPlayers[slot];
    }
    if (mainPlayers[slot]) {
        mainPlayers[slot].destroy();
        delete mainPlayers[slot];
    }
    if (updateIntervals[slot]) {
        clearInterval(updateIntervals[slot]);
        delete updateIntervals[slot];
    }
    
    // Remove from data
    if (videos[slot]) {
        usedUrls.delete(videos[slot].url);
        videos[slot] = null;
    }
    
    // Remove main layer
    const mainLayer = document.getElementById(`main-layer-${slot}`);
    if (mainLayer) {
        mainLayer.remove();
    }
    
    // Reset module
    const module = document.querySelector(`[data-slot="${slot}"]`);
    module.className = 'video-module empty';
    module.innerHTML = '<div class="add-icon">+</div>';
    module.onclick = () => openModal(slot);
    
    updatePreviewComposite();
}

function updatePreviewComposite() {
    const previewContent = document.getElementById('preview-content');
    const hasVideos = videos.some(v => v !== null);
    
    if (!hasVideos) {
        previewContent.innerHTML = 'Add videos to start creating';
    }
}

// =================== RECORDING SYSTEM ===================
function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    const hasVideos = videos.some(v => v !== null);
    if (!hasVideos) {
        alert('Add at least one video before recording!');
        return;
    }

    console.log('Starting recording...');
    isRecording = true;
    recordingStartTime = Date.now();
    currentRecording = [];
    
    // Lock all timeline scrubbers during recording
    videos.forEach((video, slot) => {
        if (video) {
            const scrubber = document.getElementById(`scrubber-${slot}`);
            const playPauseBtn = document.getElementById(`play-pause-${slot}`);
            
            if (scrubber) scrubber.style.pointerEvents = 'none';
            if (playPauseBtn) playPauseBtn.disabled = true;
            
            // Update keyframe buttons to jump mode
            for (let i = 0; i < 3; i++) {
                updateKeyframeButton(slot, i);
            }
        }
    });
    
    // Update UI to show recording state
    document.getElementById('record-btn').textContent = '⏹ Stop Recording';
    document.getElementById('record-btn').style.background = 'linear-gradient(45deg, #2c2c2c, #1a1a1a)';
    
    // Start 60-second auto-stop timer (no visual countdown)
    let timeLeft = 60;
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        
        // Auto-stop when countdown reaches 0
        if (timeLeft <= 0) {
            stopRecording();
        }
    }, 1000);
    
    // Start all videos at their designated start points for recording
    videos.forEach((video, slot) => {
        if (video && mainPlayers[slot]) {
            try {
                // Use first keyframe as start point if available, otherwise use startTime
                const startPosition = video.keyframes[0] !== null ? video.keyframes[0] : video.startTime;
                
                // Seek all videos to their designated start points
                mainPlayers[slot].seekTo(startPosition);
                mainPlayers[slot].playVideo();
                
                console.log(`Started recording slot ${slot} from position: ${startPosition}s`);
                
                // Audio is already set correctly from preview mode
            } catch (error) {
                console.log(`Could not control main player ${slot}`);
            }
        }
    });
    
    // Record the initial state when recording starts
    recordAction('recording_start', { timestamp: 0, videos: videos.filter(v => v !== null) });
}

function stopRecording() {
    console.log('Stopping recording...');
    isRecording = false;
    
    // Stop countdown timer
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // Unlock all timeline scrubbers after recording
    videos.forEach((video, slot) => {
        if (video) {
            const scrubber = document.getElementById(`scrubber-${slot}`);
            const playPauseBtn = document.getElementById(`play-pause-${slot}`);
            
            if (scrubber) scrubber.style.pointerEvents = 'auto';
            if (playPauseBtn) playPauseBtn.disabled = false;
            
            // Update keyframe buttons back to set mode
            for (let i = 0; i < 3; i++) {
                updateKeyframeButton(slot, i);
            }
        }
    });
    
    // Pause all videos
    videos.forEach((video, slot) => {
        if (video && mainPlayers[slot]) {
            try {
                mainPlayers[slot].pauseVideo();
            } catch (error) {
                console.log(`Could not pause main player ${slot}`);
            }
        }
    });
    
    // Update UI back to ready state
    document.getElementById('record-btn').textContent = '● Start Recording';
    document.getElementById('record-btn').style.background = 'linear-gradient(45deg, #ff4757, #ff3838)';
    document.getElementById('save-btn').disabled = false;
    
    // Record the final timestamp
    recordAction('recording_end', { timestamp: Date.now() - recordingStartTime });
    
    console.log('Recording data:', currentRecording);
}

function recordAction(action, data) {
    if (!isRecording && action !== 'recording_start' && action !== 'recording_end') return;
    
    const timestamp = Date.now() - recordingStartTime;
    currentRecording.push({
        timestamp: timestamp,
        action: action,
        data: data
    });
}

// =================== COMPOSITION SAVING ===================
function saveComposition() {
    if (currentRecording.length === 0) {
        alert('No recording to save!');
        return;
    }

    const name = prompt('Name your art piece:') || `Art Piece ${Date.now()}`;
    
    const composition = {
        name: name,
        createdAt: new Date().toISOString(),
        videos: videos.filter(v => v !== null),
        recording: currentRecording,
        duration: 60000
    };
    
    if (!window.savedArtPieces) {
        window.savedArtPieces = [];
    }
    window.savedArtPieces.push(composition);
    
    console.log('Art piece saved:', name, composition);
    alert('Art piece saved: ' + name);
    
    // Reset UI
    document.getElementById('save-btn').disabled = true;
    currentRecording = [];
}

// =================== UTILITY FUNCTIONS ===================
// Utility function to play all preview videos for testing
function playAllPreviews() {
    videos.forEach((video, slot) => {
        if (video && previewPlayers[slot]) {
            try {
                previewPlayers[slot].playVideo();
            } catch (error) {
                console.log(`Could not play preview ${slot}`);
            }
        }
    });
}

// Utility function to pause all videos
function pauseAllVideos() {
    videos.forEach((video, slot) => {
        if (video) {
            if (previewPlayers[slot]) {
                try {
                    previewPlayers[slot].pauseVideo();
                } catch (error) {
                    console.log(`Could not pause preview ${slot}`);
                }
            }
            if (mainPlayers[slot]) {
                try {
                    mainPlayers[slot].pauseVideo();
                } catch (error) {
                    console.log(`Could not pause main player ${slot}`);
                }
            }
        }
    });
}

// =================== INITIALIZATION ===================
// Initialize application
console.log('YouTube Art Mixer loaded');
updatePreviewComposite();

// Add keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && !e.target.matches('input')) {
        e.preventDefault();
        if (!isRecording) {
            playAllPreviews();
        }
    }
    if (e.key === 'Escape') {
        pauseAllVideos();
    }
});

// Handle URL input modal
document.getElementById('url-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addVideo();
    }
});

// Close modal when clicking outside
document.getElementById('url-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

// =================== ENHANCED TIMELINE SCRUBBER ===================
function setupTimelineScrubber(slot) {
    const scrubber = document.getElementById(`scrubber-${slot}`);
    const thumb = document.getElementById(`thumb-${slot}`);
    
    if (!scrubber || !thumb) return;
    
    // Mouse events for desktop
    scrubber.addEventListener('mousedown', (e) => startDrag(slot, e));
    thumb.addEventListener('mousedown', (e) => startDrag(slot, e));
    
    // Touch events for mobile
    scrubber.addEventListener('touchstart', (e) => startDrag(slot, e), { passive: false });
    thumb.addEventListener('touchstart', (e) => startDrag(slot, e), { passive: false });
}

function startDrag(slot, event) {
    if (videos[slot].locked || !previewPlayers[slot]) return;
    
    event.preventDefault();
    isDragging = true;
    dragSlot = slot;
    
    // Store initial mouse position
    if (event.type.startsWith('touch')) {
        lastMouseX = event.touches[0].clientX;
    } else {
        lastMouseX = event.clientX;
    }
    
    // Store current time
    try {
        currentTime = previewPlayers[slot].getCurrentTime();
    } catch (error) {
        currentTime = 0;
    }
    
    // Pause timeline updates during dragging to prevent shuddering
    if (updateIntervals[slot]) {
        clearInterval(updateIntervals[slot]);
    }
    
    // For initial click, seek to that position normally
    seekToScrubberPosition(slot, event);
    
    // Add global event listeners
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', handleDrag, { passive: false });
    document.addEventListener('touchend', endDrag);
    
    // Add visual feedback - prevent text selection and add dragging class
    document.body.style.userSelect = 'none';
    document.body.classList.add('dragging');
}

function handleDrag(event) {
    if (!isDragging || dragSlot === null) return;
    
    event.preventDefault();
    seekToScrubberPosition(dragSlot, event);
}

function endDrag() {
    if (!isDragging) return;
    
    const currentDragSlot = dragSlot; // Store reference before clearing
    isDragging = false;
    dragSlot = null;
    lastMouseX = 0;
    currentTime = 0;
    
    // Remove global event listeners
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', handleDrag);
    document.removeEventListener('touchend', endDrag);
    
    // Remove visual feedback
    document.body.style.userSelect = '';
    document.body.classList.remove('dragging');
    document.body.classList.remove('fine-control'); // Remove fine control indicator
    
    // Restart timeline updates for the dragged slot to prevent freezing
    if (currentDragSlot !== null && previewPlayers[currentDragSlot]) {
        startTimelineUpdates(currentDragSlot);
    }
}

function seekToScrubberPosition(slot, event) {
    if (videos[slot].locked || !previewPlayers[slot]) return;
    
    const scrubber = document.getElementById(`scrubber-${slot}`);
    if (!scrubber) return;
    
    const rect = scrubber.getBoundingClientRect();
    let clientX, clientY;
    
    // Handle both mouse and touch events
    if (event.type.startsWith('touch')) {
        clientX = event.touches[0]?.clientX || event.changedTouches[0]?.clientX;
        clientY = event.touches[0]?.clientY || event.changedTouches[0]?.clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    
    let newTime;
    
    // During dragging, implement incremental movement with vertical sensitivity control
    if (isDragging && lastMouseX !== 0) {
        // Calculate distance from timeline (negative = above timeline)
        const timelineY = rect.top + (rect.height / 2);
        const verticalDistance = clientY - timelineY;
        
        // Calculate sensitivity based on how far above the timeline the cursor is
        let sensitivityMultiplier = 1.0;
        if (verticalDistance < 0) {
            // Cursor is above timeline - reduce sensitivity
            const maxDistance = window.innerHeight * 0.3; // 30% of screen height for full range
            const normalizedDistance = Math.min(Math.abs(verticalDistance), maxDistance) / maxDistance;
            
            // Gradual sensitivity reduction: 100% -> 2% sensitivity
            sensitivityMultiplier = Math.max(0.02, 1.0 - (normalizedDistance * 0.98));
            
            // Visual feedback for fine control
            if (sensitivityMultiplier < 0.5) {
                document.body.classList.add('fine-control');
            } else {
                document.body.classList.remove('fine-control');
            }
        } else {
            document.body.classList.remove('fine-control');
        }
        
        // Calculate incremental movement from last mouse position
        const mouseMovement = clientX - lastMouseX;
        const pixelsPerSecond = rect.width / videos[slot].duration;
        
        // Apply sensitivity to movement
        const adjustedMovement = mouseMovement * sensitivityMultiplier;
        const timeChange = adjustedMovement / pixelsPerSecond;
        
        // Update current time incrementally
        currentTime = Math.max(0, Math.min(videos[slot].duration, currentTime + timeChange));
        newTime = currentTime;
        
        // Update last mouse position for next incremental calculation
        lastMouseX = clientX;
        
        if (sensitivityMultiplier < 0.1) {
            console.log(`Ultra-fine control: ${sensitivityMultiplier.toFixed(3)}x speed, moved ${adjustedMovement.toFixed(2)}px`);
        }
    } else {
        // Normal clicking/seeking behavior
        const clickX = Math.max(6, Math.min(rect.width - 6, clientX - rect.left));
        const percentage = Math.min(1, Math.max(0, (clickX - 6) / (rect.width - 12)));
        newTime = Math.max(0, Math.min(videos[slot].duration, percentage * videos[slot].duration));
        currentTime = newTime; // Update our tracked time
    }
    
    // Update both players
    if (isDragging) {
        // Immediate visual update during drag
        updateTimelineDisplay(slot, newTime);
        
        // Seek players without sync locks during drag for responsiveness
        try {
            previewPlayers[slot].seekTo(newTime);
            if (mainPlayers[slot]) {
                mainPlayers[slot].seekTo(newTime);
            }
        } catch (error) {
            console.log(`Could not seek during drag for slot ${slot}`);
        }
    } else {
        // Normal seeking with sync protection when not dragging
        if (!syncLocks[slot]) {
            syncLocks[slot] = true;
            
            try {
                previewPlayers[slot].seekTo(newTime);
                
                setTimeout(() => {
                    if (mainPlayers[slot]) {
                        try {
                            mainPlayers[slot].seekTo(newTime);
                        } catch (error) {
                            console.log(`Could not seek main player ${slot}`);
                        }
                    }
                    
                    updateTimelineDisplay(slot, newTime);
                    
                    setTimeout(() => {
                        syncLocks[slot] = false;
                    }, 50);
                }, 25);
                
            } catch (error) {
                console.log(`Could not seek slot ${slot} to ${newTime}s`);
                syncLocks[slot] = false;
            }
        }
    }
}

// =================== KEYFRAME SYSTEM ===================
function setKeyframe(slot, keyframeIndex) {
    if (!videos[slot] || !previewPlayers[slot] || videos[slot].locked) return;
    
    try {
        const currentTime = previewPlayers[slot].getCurrentTime();
        videos[slot].keyframes[keyframeIndex] = currentTime;
        
        // Update button appearance using the proper function that includes delete button
        updateKeyframeButton(slot, keyframeIndex);
        
        console.log(`Set keyframe ${keyframeIndex} for slot ${slot} at ${currentTime}s`);
        recordAction('keyframe_set', { slot, keyframeIndex, time: currentTime });
        
    } catch (error) {
        console.log('Could not get current time for keyframe');
    }
}

function jumpToKeyframe(slot, keyframeIndex) {
    if (!videos[slot] || videos[slot].keyframes[keyframeIndex] === null || videos[slot].locked) return;
    
    const targetTime = videos[slot].keyframes[keyframeIndex];
    
    try {
        if (previewPlayers[slot] && !syncLocks[slot]) {
            syncLocks[slot] = true;
            previewPlayers[slot].seekTo(targetTime);
            
            // Seek main player with delay to prevent conflicts but avoid double audio start
            setTimeout(() => {
                if (mainPlayers[slot]) {
                    try {
                        mainPlayers[slot].seekTo(targetTime);
                    } catch (error) {
                        console.log('Could not seek main player');
                    }
                }
                // Release lock
                setTimeout(() => {
                    syncLocks[slot] = false;
                }, 50);
            }, 25); // Reduced delay
        }
        
        console.log(`Jumped to keyframe ${keyframeIndex} at ${targetTime}s for slot ${slot}`);
        recordAction('keyframe_jump', { slot, keyframeIndex, time: targetTime });
        
    } catch (error) {
        console.log(`Could not jump to keyframe ${keyframeIndex} for slot ${slot}`);
    }
}

// =================== HIDE YOUTUBE OVERLAYS ===================
function hideYouTubeOverlays(slot) {
    try {
        const layerElement = document.getElementById(`main-layer-${slot}`);
        if (layerElement) {
            // Ensure pointer events are disabled
            layerElement.style.pointerEvents = 'none';
            
            // Also disable on the iframe if it exists
            setTimeout(() => {
                const iframe = layerElement.querySelector('iframe');
                if (iframe) {
                    iframe.style.pointerEvents = 'none';
                    iframe.style.userSelect = 'none';
                    console.log(`Disabled pointer events for main player ${slot}`);
                }
            }, 500);
        }
    } catch (error) {
        console.log('Error disabling YouTube interactions:', error);
    }
}

// =================== UPDATE PLAY BUTTON STATE ===================
function updatePlayButtonState(slot, isPaused) {
    const playPauseBtn = document.getElementById(`play-pause-${slot}`);
    if (playPauseBtn) {
        if (isPaused) {
            // Video is paused - show play icon
            playPauseBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            `;
        } else {
            // Video is playing - show pause icon
            playPauseBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
            `;
        }
    }
}

// =================== UPDATE KEYFRAME BUTTON ===================
function updateKeyframeButton(slot, keyframeIndex) {
    const keyframeBtn = document.getElementById(`keyframe-${slot}-${keyframeIndex}`);
    if (!keyframeBtn) return;
    
    const keyframeTime = videos[slot].keyframes[keyframeIndex];
    
    if (keyframeTime === null) {
        // Empty state - shows plus sign for setting keyframe
        keyframeBtn.className = 'keyframe-btn empty';
        keyframeBtn.onclick = () => handleKeyframeClick(slot, keyframeIndex);
        keyframeBtn.ondblclick = () => setKeyframe(slot, keyframeIndex);
        keyframeBtn.innerHTML = '<span class="keyframe-plus">+</span>';
    } else {
        // Filled state - behavior depends on recording state
        if (isRecording) {
            // During recording: read-only mode (no delete button, light blue color, jump only)
            keyframeBtn.className = 'keyframe-btn filled recording';
            keyframeBtn.innerHTML = `
                <span class="keyframe-time">${formatTime(keyframeTime)}</span>
            `;
            // Only allow jumping during recording
            keyframeBtn.onclick = () => jumpToKeyframe(slot, keyframeIndex);
            keyframeBtn.ondblclick = null; // Disable double-click editing during recording
        } else {
            // Outside recording: full edit mode (with delete button, grey color)
            keyframeBtn.className = 'keyframe-btn filled';
            keyframeBtn.innerHTML = `
                <span class="keyframe-time">${formatTime(keyframeTime)}</span>
                <button class="keyframe-delete-btn" onclick="event.stopPropagation(); deleteKeyframe(${slot}, ${keyframeIndex})" title="Delete timestamp">×</button>
            `;
            // Single click: jump to keyframe (test)
            // Double click: replace keyframe
            keyframeBtn.onclick = () => handleKeyframeClick(slot, keyframeIndex);
            keyframeBtn.ondblclick = () => setKeyframe(slot, keyframeIndex);
        }
    }
}

function deleteKeyframe(slot, keyframeIndex) {
    if (!videos[slot] || videos[slot].locked) return;
    
    // Clear the keyframe
    videos[slot].keyframes[keyframeIndex] = null;
    
    // Update button back to empty state
    updateKeyframeButton(slot, keyframeIndex);
    
    console.log(`Deleted keyframe ${keyframeIndex} for slot ${slot}`);
    recordAction('keyframe_delete', { slot, keyframeIndex });
}

// =================== HANDLE KEYFRAME CLICK ===================
function handleKeyframeClick(slot, keyframeIndex) {
    if (!videos[slot] || videos[slot].locked) return;
    
    const keyframeTime = videos[slot].keyframes[keyframeIndex];
    
    if (keyframeTime !== null) {
        // Keyframe exists - jump to it (testing)
        jumpToKeyframe(slot, keyframeIndex);
    } else {
        // Empty keyframe - set it with current position
        setKeyframe(slot, keyframeIndex);
    }
}

// =================== FULLSCREEN FUNCTIONS ===================
function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) {
            // Enter fullscreen
            document.documentElement.requestFullscreen().then(() => {
                updateFullscreenIcon(true);
                console.log('Entered fullscreen mode');
            }).catch(err => {
                console.error('Error entering fullscreen:', err);
            });
        } else {
            // Exit fullscreen
            document.exitFullscreen().then(() => {
                updateFullscreenIcon(false);
                console.log('Exited fullscreen mode');
            }).catch(err => {
                console.error('Error exiting fullscreen:', err);
            });
        }
    } catch (error) {
        console.error('Fullscreen not supported:', error);
    }
}

function updateFullscreenIcon(isFullscreen) {
    const btn = document.getElementById('fullscreen-btn');
    if (btn) {
        if (isFullscreen) {
            // Show "exit fullscreen" icon
            btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
            `;
            btn.title = "Exit Fullscreen";
        } else {
            // Show "enter fullscreen" icon
            btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
            `;
            btn.title = "Toggle Fullscreen";
        }
    }
}

// Listen for fullscreen changes (e.g., user presses ESC)
document.addEventListener('fullscreenchange', () => {
    updateFullscreenIcon(!!document.fullscreenElement);
});