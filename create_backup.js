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
let videoSlots = {};                    // Object to hold video slot data
let previewPlayers = {};                // YouTube players for preview
let mainPlayers = {};                   // YouTube players for main display
let isLinked = false;                   // Flag for cross-module linking
let isReceivingLink = false;            // Flag to prevent link loops
let usedUrls = new Set();              // Prevents duplicate videos
let isRecording = false;               // Recording state flag
let isCountdown = false;               // Countdown state flag
let recordingStartTime = 0;            // When recording began
let countdownInterval = null;          // 3-2-1 countdown timer
let recordingInterval = null;          // 60-second recording timer
let playbackInterval = null;           // Playback automation timer
let YTReady = false;                   // YouTube API ready flag

// Advanced Recording System
let recordingSessions = [];            // Array of all recording sessions
let currentSession = 0;               // Current session number
let isPlaybackMode = false;           // Whether we're in overdub playback mode
let hijackedControls = new Set();     // Controls that have been hijacked this session
let savedArtPieces = [];              // Saved compositions
let lastVolumeValues = [];            // Track previous volume values for linking
let lastOpacityValues = [];           // Track previous opacity values for linking

// Slider debouncing to prevent conflicts
let sliderDebounceTimers = {};        // Debounce timers for each slider
let lastRecordingTime = {};           // Track last recording time for throttling

// Recording data structure for current session
let currentRecordingData = {
    session: 0,
    startTime: 0,
    duration: 60000,
    controlData: {}  // Will contain data for each slot: {volume: [], opacity: [], timestamps: []}
};

// YouTube player instances - each slot has two players
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

// =================== TIMELINE SCRUBBER SETUP ===================
function setupTimelineScrubber(slot) {
    const scrubber = document.getElementById(`scrubber-${slot}`);
    if (!scrubber) return;
    
    let isDragging = false;
    let lastMouseX = 0;
    let startY = 0;
    
    function startDrag(e) {
        // Prevent interaction during recording or if locked
        if (isRecording || videos[slot].locked) return;
        
        isDragging = true;
        lastMouseX = e.clientX;
        startY = e.clientY;
        
        // Add dragging class to body for cursor management
        document.body.classList.add('dragging');
        
        // Pause timeline updates during drag
        if (updateIntervals[slot]) {
            clearInterval(updateIntervals[slot]);
            delete updateIntervals[slot];
        }
        
        // Prevent text selection
        e.preventDefault();
        
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
    }
    
    function onDrag(e) {
        if (!isDragging || !previewPlayers[slot]) return;
        
        const rect = scrubber.getBoundingClientRect();
        const deltaX = e.clientX - lastMouseX;
        const currentY = e.clientY;
        const deltaY = startY - currentY; // Positive when moving up
        
        // Calculate sensitivity based on vertical distance (0-30% of screen height)
        const maxDistance = window.innerHeight * 0.3;
        const distance = Math.max(0, Math.min(maxDistance, deltaY));
        const sensitivity = 1 - (distance / maxDistance) * 0.98; // 100% to 2%
        
        // Apply fine control visual feedback
        if (distance > 0) {
            document.body.classList.add('fine-control');
        } else {
            document.body.classList.remove('fine-control');
        }
        
        // Calculate time change based on mouse movement and sensitivity
        const timeChange = (deltaX / rect.width) * videos[slot].duration * sensitivity;
        const newTime = Math.max(0, Math.min(videos[slot].duration, videos[slot].currentTime + timeChange));
        
        // Update current time and seek player
        videos[slot].currentTime = newTime;
        previewPlayers[slot].seekTo(newTime);
        if (mainPlayers[slot]) {
            mainPlayers[slot].seekTo(newTime);
        }
        
        // Update display immediately
        updateTimelineDisplay(slot, newTime);
        
        lastMouseX = e.clientX;
        e.preventDefault();
    }
    
    function stopDrag() {
        if (!isDragging) return;
        
        isDragging = false;
        
        // Remove dragging and fine control classes
        document.body.classList.remove('dragging', 'fine-control');
        
        // Restart timeline updates
        startTimelineUpdates(slot);
        
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
    }
    
    // Add event listeners
    scrubber.addEventListener('mousedown', startDrag);
    scrubber.addEventListener('click', seekToPosition.bind(null, slot));
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
        volumeOpacityLinked: false, // New property for internal volume-opacity linking
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
            <div class="current-time clickable-time" id="current-time-${slot}" onclick="showTimestampInput(${slot})" title="Click to enter specific timestamp">0:00</div>
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
                <span class="control-icon" onclick="toggleVolumeOpacityLink(${slot})">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                </span>
                <input type="range" class="slider" min="0" max="100" value="50" 
                       oninput="updateVolume(${slot}, this.value)" id="vol-${slot}">
            </div>
            <div class="control-row">
                <span class="control-icon" onclick="toggleVolumeOpacityLink(${slot})">
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
    
    // Ensure remove button is visible for new videos (in case they were hidden during recording)
    setTimeout(() => {
        const removeBtn = module.querySelector('.remove-btn');
        if (removeBtn) {
            removeBtn.style.display = 'flex';
        }
    }, 100);
    
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
                            
                            // Update play button to show pause state after video starts
                            setTimeout(() => {
                                updatePlayButtonState(slot, false); // false = not paused (playing)
                            }, 100);
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
                },
                'onError': function(event) {
                    console.log(`Preview player ${slot} error:`, event.data);
                    handleVideoError(slot, event.data);
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
                },
                'onError': function(event) {
                    console.log(`Main player ${slot} error:`, event.data);
                    handleVideoError(slot, event.data);
                }
            }
        });
    } catch (error) {
        console.error('Error creating main player:', error);
    }
}

// =================== VIDEO ERROR HANDLING ===================
function handleVideoError(slot, errorCode) {
    console.log(`Video error in slot ${slot}: ${errorCode}`);
    
    let errorMessage = '';
    let shouldRemove = false;
    
    switch (errorCode) {
        case 2:
            errorMessage = 'Invalid video ID. Please check the YouTube URL and try again.';
            shouldRemove = true;
            break;
        case 5:
            errorMessage = 'Video player error. This video may not be compatible with embedded playback.';
            shouldRemove = true;
            break;
        case 100:
            errorMessage = 'Video not found or is private. Please choose a different video.';
            shouldRemove = true;
            break;
        case 101:
            errorMessage = 'This video cannot be embedded due to owner restrictions. Please choose a different video.';
            shouldRemove = true;
            break;
        case 150:
            errorMessage = 'This video cannot be embedded due to owner restrictions. Please choose a different video.';
            shouldRemove = true;
            break;
        default:
            errorMessage = 'Video playback error. Please try a different video.';
            shouldRemove = true;
    }
    
    // Show error message to user
    alert(`Video Error (Slot ${slot + 1}):\n\n${errorMessage}`);
    
    // Clean up the failed video if needed
    if (shouldRemove && videos[slot]) {
        console.log(`Removing failed video from slot ${slot}`);
        actuallyRemoveVideo(slot);
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
    // Prevent interaction during recording or if locked
    if (isRecording || videos[slot].locked || !previewPlayers[slot]) return;
    
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
    // Immediately update the visual state for responsiveness
    updateVolumeImmediate(slot, value);
    
    // If recording, capture this value for smooth playback (with throttling)
    if (isRecording) {
        recordControlChangeThrottled(slot, 'volume', parseInt(value));
    }
    
    // Clear any existing debounce timer for this slider
    const timerId = `vol-${slot}`;
    if (sliderDebounceTimers[timerId]) {
        clearTimeout(sliderDebounceTimers[timerId]);
    }
    
    // Debounce other updates to prevent conflicts
    sliderDebounceTimers[timerId] = setTimeout(() => {
        updateVolumeDebounced(slot, value);
        delete sliderDebounceTimers[timerId];
    }, 50); // Small delay to prevent rapid firing
}

function updateVolumeImmediate(slot, value, skipOpacityLink = false) {
    if (!videos[slot] || isReceivingLink) return;
    
    const oldValue = videos[slot].volume;
    videos[slot].volume = parseInt(value);
    
    // Update display
    const volumeDisplay = document.getElementById(`volume-display-${slot}`);
    if (volumeDisplay) {
        volumeDisplay.textContent = Math.round(value) + '%';
    }

    // Apply to all players for this slot
    updateAllPlayersVolume(slot, value);

    // Handle internal volume-opacity linking (only if not called from opacity function)
    if (!skipOpacityLink && videos[slot].volumeOpacityLinked) {
        const change = parseInt(value) - oldValue;
        const opcSlider = document.getElementById(`opc-${slot}`);
        const currentOpacity = parseInt(opcSlider.value);
        const newOpacity = Math.max(0, Math.min(100, currentOpacity + change));
        
        opcSlider.value = newOpacity;
        updateOpacityImmediate(slot, newOpacity, true); // true to skip reciprocal linking
    }

    // Handle module-to-module linking
    if (videos[slot].linked && !isReceivingLink) {
        isReceivingLink = true;
        updateLinkedControls(slot, 'volume', oldValue, parseInt(value));
        isReceivingLink = false;
    }
}

function updateVolumeDebounced(slot, value) {
    if (videos[slot] && !videos[slot].locked) {
        // Handle hijacking during playback mode
        if (isPlaybackMode) {
            hijackControl(slot, 'volume');
        }
        
        // Recording now happens immediately in updateVolume() for smooth transitions
        
        // Ensure main players stay muted (visual only)
        try {
            if (mainPlayers[slot]) {
                mainPlayers[slot].mute();
                mainPlayers[slot].setVolume(0);
            }
        } catch (error) {
            console.log('Could not mute main player');
        }
        
        // Note: updateLinkedControls moved to updateVolumeImmediate for real-time linking
        
        console.log('Updated volume for slot', slot, ':', value);
    }
}

function updateOpacity(slot, value) {
    // Immediately update the visual state for responsiveness
    updateOpacityImmediate(slot, value);
    
    // If recording, capture this value for smooth playback (with throttling)
    if (isRecording) {
        recordControlChangeThrottled(slot, 'opacity', parseInt(value));
    }
    
    // Clear any existing debounce timer for this slider
    const timerId = `opc-${slot}`;
    if (sliderDebounceTimers[timerId]) {
        clearTimeout(sliderDebounceTimers[timerId]);
    }
    
    // Debounce other updates to prevent conflicts
    sliderDebounceTimers[timerId] = setTimeout(() => {
        updateOpacityDebounced(slot, value);
        delete sliderDebounceTimers[timerId];
    }, 50); // Small delay to prevent rapid firing
}

function updateOpacityImmediate(slot, value, skipVolumeLink = false) {
    if (!videos[slot] || isReceivingLink) return;
    
    const oldValue = videos[slot].opacity;
    videos[slot].opacity = parseInt(value);
    
    // Update display
    const opacityDisplay = document.getElementById(`opacity-display-${slot}`);
    if (opacityDisplay) {
        opacityDisplay.textContent = Math.round(value) + '%';
    }

    // Apply visual opacity to all layers for this slot
    updateAllLayersOpacity(slot, value);

    // Handle internal volume-opacity linking (only if not called from volume function)
    if (!skipVolumeLink && videos[slot].volumeOpacityLinked) {
        const change = parseInt(value) - oldValue;
        const volSlider = document.getElementById(`vol-${slot}`);
        const currentVolume = parseInt(volSlider.value);
        const newVolume = Math.max(0, Math.min(100, currentVolume + change));
        
        volSlider.value = newVolume;
        updateVolumeImmediate(slot, newVolume, true); // true to skip reciprocal linking
    }

    // Handle module-to-module linking
    if (videos[slot].linked && !isReceivingLink) {
        isReceivingLink = true;
        updateLinkedControls(slot, 'opacity', oldValue, parseInt(value));
        isReceivingLink = false;
    }
}

function updateOpacityDebounced(slot, value) {
    if (videos[slot] && !videos[slot].locked) {
        // Handle hijacking during playback mode
        if (isPlaybackMode) {
            hijackControl(slot, 'opacity');
        }
        
        // Recording now happens immediately in updateOpacity() for smooth transitions
        
        // Note: updateLinkedControls moved to updateOpacityImmediate for real-time linking
        
        console.log('Updated opacity for slot', slot, ':', value);
    }
}

// =================== LINKING SYSTEM ===================
function updateLinkedControls(sourceSlot, type, oldValue, newValue) {
    if (!videos[sourceSlot] || !videos[sourceSlot].linked) return;
    
    // Calculate the change amount instead of ratio to handle 0 values properly
    const change = newValue - oldValue;
    
    videos.forEach((video, slot) => {
        if (slot !== sourceSlot && video && video.linked && !video.locked) {
            if (type === 'volume') {
                // Apply the same change amount, but respect 0-100 bounds
                const currentVolume = video.volume;
                const newLinkedValue = Math.max(0, Math.min(100, currentVolume + change));
                video.volume = newLinkedValue;
                const volSlider = document.getElementById(`vol-${slot}`);
                if (volSlider) volSlider.value = newLinkedValue;
                
                // Use the throttled volume update to prevent crackling
                updateAllPlayersVolume(slot, newLinkedValue);
                
                // If we're in overdubbing mode, hijack this control
                if (isPlaybackMode) {
                    hijackControl(slot, 'volume');
                }
                
            } else if (type === 'opacity') {
                // Apply the same change amount, but respect 0-100 bounds
                const currentOpacity = video.opacity;
                const newLinkedValue = Math.max(0, Math.min(100, currentOpacity + change));
                video.opacity = newLinkedValue;
                const opcSlider = document.getElementById(`opc-${slot}`);
                if (opcSlider) opcSlider.value = newLinkedValue;
                
                updateAllLayersOpacity(slot, newLinkedValue);
                
                // If we're in overdubbing mode, hijack this control
                if (isPlaybackMode) {
                    hijackControl(slot, 'opacity');
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
            
            // If we're linking during overdubbing, set up proper visual states
            // BUT preserve hijacked states if they're already hijacked
            if (isPlaybackMode && currentSession > 1) {
                const volSlider = document.getElementById(`vol-${slot}`);
                const opcSlider = document.getElementById(`opc-${slot}`);
                
                if (volSlider && !volSlider.disabled) {
                    // Only set to playback if not already hijacked
                    if (!hijackedControls.has(`${slot}-volume`)) {
                        volSlider.classList.remove('hijacked');
                        volSlider.classList.add('playback');
                    }
                }
                if (opcSlider && !opcSlider.disabled) {
                    // Only set to playback if not already hijacked
                    if (!hijackedControls.has(`${slot}-opacity`)) {
                        opcSlider.classList.remove('hijacked');
                        opcSlider.classList.add('playback');
                    }
                }
            }
        } else {
            linkBtn.classList.remove('active');
            module.classList.remove('linked');
        }
        console.log('Toggled link for slot', slot, ':', videos[slot].linked);
    }
}

// =================== VOLUME-OPACITY LINKING ===================
function toggleVolumeOpacityLink(slot) {
    const videoObj = videos[slot];
    if (!videoObj || !videoObj.videoId || videoObj.locked) return;
    
    videoObj.volumeOpacityLinked = !videoObj.volumeOpacityLinked;
    updateVolumeOpacityLinkVisual(slot);
    
    console.log('Toggled volume-opacity link for slot', slot, ':', videoObj.volumeOpacityLinked);
}

function toggleLock(slot) {
    const videoObj = videos[slot];
    if (!videoObj || !videoObj.videoId) return;

    // Break volume-opacity linking when locking
    if (!videoObj.locked && videoObj.volumeOpacityLinked) {
        videoObj.volumeOpacityLinked = false;
        updateVolumeOpacityLinkVisual(slot);
    }

    videoObj.locked = !videoObj.locked;
    const lockButton = document.getElementById(`lock-${slot}`);
    const module = document.querySelector(`.video-module[data-slot="${slot}"]`);
    
    if (videoObj.locked) {
        // Lock all controls
        lockButton.classList.add('active');
        module.classList.add('locked');
        
        // Disable sliders and controls
        const volSlider = document.getElementById(`vol-${slot}`);
        const opcSlider = document.getElementById(`opc-${slot}`);
        const linkButton = document.getElementById(`link-${slot}`);
        const playPauseBtn = document.getElementById(`play-pause-${slot}`);
        const scrubber = document.getElementById(`scrubber-${slot}`);
        
        if (volSlider) volSlider.disabled = true;
        if (opcSlider) opcSlider.disabled = true;
        if (linkButton) linkButton.disabled = true;
        if (playPauseBtn) playPauseBtn.disabled = true;
        if (scrubber) scrubber.style.pointerEvents = 'none';
        
        // Update keyframe buttons to locked state
        updateKeyframeButtonsLockState(slot, true);
        
    } else {
        // Unlock all controls
        lockButton.classList.remove('active');
        module.classList.remove('locked');
        
        // Enable sliders and controls
        const volSlider = document.getElementById(`vol-${slot}`);
        const opcSlider = document.getElementById(`opc-${slot}`);
        const linkButton = document.getElementById(`link-${slot}`);
        const playPauseBtn = document.getElementById(`play-pause-${slot}`);
        const scrubber = document.getElementById(`scrubber-${slot}`);
        
        if (volSlider) volSlider.disabled = false;
        if (opcSlider) opcSlider.disabled = false;
        if (linkButton) linkButton.disabled = false;
        if (playPauseBtn) playPauseBtn.disabled = false;
        if (scrubber) scrubber.style.pointerEvents = 'auto';
        
        // Update keyframe buttons to unlocked state
        updateKeyframeButtonsLockState(slot, false);
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
        // No videos - show starfield only if not already present
        if (!document.getElementById('starfield-canvas')) {
            previewContent.innerHTML = `
                <canvas id="starfield-canvas"></canvas>
            `;
            // Reinitialize starfield
            setTimeout(initializeStarfield, 100);
        }
    } else {
        // Videos present - stop starfield and clear welcome content
        stopStarfield();
    }
}

// =================== ENHANCED RECORDING SYSTEM ===================
function toggleRecording() {
    if (isRecording || isCountdown) {
        // Cannot stop during countdown or active recording
        return;
    } else {
        startRecordingSession();
    }
}

function pauseAllVideos() {
    console.log('Pausing all videos for recording countdown...');
    
    videos.forEach((video, slot) => {
        if (video) {
            // Pause preview player
            if (previewPlayers[slot]) {
                try {
                    previewPlayers[slot].pauseVideo();
                    console.log(`Paused preview player ${slot} for countdown`);
                } catch (error) {
                    console.log(`Could not pause preview player ${slot}`);
                }
            }
            
            // Pause main player
            if (mainPlayers[slot]) {
                try {
                    mainPlayers[slot].pauseVideo();
                    console.log(`Paused main player ${slot} for countdown`);
                } catch (error) {
                    console.log(`Could not pause main player ${slot}`);
                }
            }
            
            // Update play button to show play icon (paused state)
            updatePlayButtonState(slot, true);
        }
    });
}

function startRecordingSession() {
    const hasVideos = videos.some(v => v !== null);
    if (!hasVideos) {
        alert('Add at least one video before recording!');
        return;
    }

    // Check that each loaded video has at least one keyframe set
    const loadedVideos = videos.filter(v => v !== null);
    const videosWithoutKeyframes = [];
    
    loadedVideos.forEach((video, index) => {
        const actualSlot = videos.indexOf(video); // Get the actual slot number
        const hasKeyframe = video.keyframes.some(keyframe => keyframe !== null);
        if (!hasKeyframe) {
            videosWithoutKeyframes.push(actualSlot + 1); // +1 for user-friendly numbering
        }
    });
    
    if (videosWithoutKeyframes.length > 0) {
        const videoList = videosWithoutKeyframes.join(', ');
        alert(`Please set at least one timestamp button in video slot${videosWithoutKeyframes.length > 1 ? 's' : ''}: ${videoList}`);
        return;
    }

    console.log('Starting recording session...');
    
    // Hide save button during recording process
    const saveBtn = document.getElementById('save-btn');
    saveBtn.style.display = 'none';
    
    // First, pause all videos before countdown begins
    pauseAllVideos();
    
    // Determine if this is first session or overdub
    const isFirstSession = recordingSessions.length === 0;
    currentSession = recordingSessions.length + 1;
    
    // Update UI to show appropriate state
    const recordBtn = document.getElementById('record-btn');
    if (isFirstSession) {
        recordBtn.textContent = 'Splicing...';
        recordBtn.disabled = true;
    } else {
        recordBtn.textContent = 'Overdubbing...';
        recordBtn.disabled = true;
        // Start playback of previous sessions (controls unlock when actual recording starts)
        startPlaybackMode();
    }
    
    // Start countdown
    startCountdown();
}

function startCountdown() {
    isCountdown = true;
    let countdown = 3;
    
    // Hide empty module slots during countdown so videos move to final positions
    hideEmptyModuleSlots();
    
    // Create timer overlay
    createTimerOverlay();
    updateTimerDisplay(`${countdown}`, true); // true = countdown mode
    
    countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            updateTimerDisplay(`${countdown}`, true);
        } else if (countdown === 0) {
            updateTimerDisplay('GO!', true);
        } else {
            // Countdown finished, start actual recording
            clearInterval(countdownInterval);
            isCountdown = false;
            startActualRecording();
        }
    }, 1000);
}

function startActualRecording() {
    console.log('Starting actual recording...');
    isRecording = true;
    recordingStartTime = Date.now();
    
    // Reset throttling timers for new recording session
    lastRecordingTime = {};
    
    // Remove empty timestamp button spaces to prevent new timestamp creation
    removeEmptyTimestampButtons();
    
    // Hide remove buttons permanently for this art piece
    hideVideoRemoveButtons();
    
    // Empty slots already hidden during countdown
    
    // Set body attribute to hide remove buttons via CSS
    document.body.setAttribute('data-recording-started', 'true');
    
    // If this is an overdub session, unlock controls now
    if (currentSession > 1) {
        unlockControlsForOverdubbing();
        // Set all timestamp buttons to orange (overdub initial state)
        setTimestampButtonsOverdubState();
    }
    
    // Seek all loaded videos to their leftmost keyframe and start playing
    videos.forEach((video, slot) => {
        if (video && previewPlayers[slot]) {
            // Find the leftmost (first) keyframe that has a time set
            const leftmostKeyframe = video.keyframes.find(keyframe => keyframe !== null);
            
            if (leftmostKeyframe !== undefined && leftmostKeyframe !== null) {
                console.log(`Seeking slot ${slot} to leftmost keyframe at ${leftmostKeyframe}s`);
                
                // Seek both players to the leftmost keyframe
                if (previewPlayers[slot]) {
                    previewPlayers[slot].seekTo(leftmostKeyframe);
                    setTimeout(() => {
                        previewPlayers[slot].playVideo();
                    }, 100);
                }
                
                if (mainPlayers[slot]) {
                    setTimeout(() => {
                        mainPlayers[slot].seekTo(leftmostKeyframe);
                        setTimeout(() => {
                            mainPlayers[slot].playVideo();
                        }, 50);
                    }, 50);
                }
                
                // Update the video's current time
                video.currentTime = leftmostKeyframe;
            }
        }
    });

    // Initialize recording data for this session
    currentRecordingData = {
        session: currentSession,
        startTime: recordingStartTime,
        duration: 60000,
        controlData: {}
    };
    
    // Initialize control data for each loaded video
    videos.forEach((video, slot) => {
        if (video) {
            currentRecordingData.controlData[slot] = {
                volume: [],
                opacity: [],
                timestamps: []
            };
        }
    });
    
    // Start 60-second recording timer
    let timeLeft = 60;
    updateTimerDisplay(`${timeLeft}s`, false); // false = recording mode
    
    recordingInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(`${timeLeft}s`, false);
        
        if (timeLeft <= 0) {
            stopRecording();
        }
    }, 1000);
    
    // Lock timeline scrubbers during recording (but allow other controls)
    videos.forEach((video, slot) => {
        if (video) {
            const scrubber = document.getElementById(`scrubber-${slot}`);
            if (scrubber) scrubber.style.pointerEvents = 'none';
            
            // Disable play/pause buttons during recording
            const playPauseBtn = document.getElementById(`play-pause-${slot}`);
            if (playPauseBtn) {
                playPauseBtn.disabled = true;
                playPauseBtn.style.opacity = '0.5';
                playPauseBtn.style.cursor = 'not-allowed';
            }
            
            // Update visual state for overdub mode
            if (currentSession > 1) {
                updateControlVisualState(slot);
            }
        }
    });
    
    console.log(`Started recording session ${currentSession}`);
}

function stopRecording() {
    console.log('Stopping recording...');
    isRecording = false;
    
    // Stop timers
    if (recordingInterval) {
        clearInterval(recordingInterval);
        recordingInterval = null;
    }
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    
    // Stop playback mode
    isPlaybackMode = false;
    hijackedControls.clear();
    
    // Pause all videos when recording ends
    videos.forEach((video, slot) => {
        if (video) {
            if (previewPlayers[slot]) {
                try {
                    previewPlayers[slot].pauseVideo();
                    console.log(`Paused preview player ${slot}`);
                } catch (error) {
                    console.log(`Could not pause preview player ${slot}`);
                }
            }
            if (mainPlayers[slot]) {
                try {
                    mainPlayers[slot].pauseVideo();
                    console.log(`Paused main player ${slot}`);
                } catch (error) {
                    console.log(`Could not pause main player ${slot}`);
                }
            }
            
            // Re-enable timeline scrubbers and play/pause buttons after recording
            const scrubber = document.getElementById(`scrubber-${slot}`);
            if (scrubber) {
                scrubber.style.pointerEvents = 'auto';
            }
            
            const playPauseBtn = document.getElementById(`play-pause-${slot}`);
            if (playPauseBtn) {
                playPauseBtn.disabled = false;
                playPauseBtn.style.opacity = '1';
                playPauseBtn.style.cursor = 'pointer';
            }
            
            // Update play button to show play icon (paused state)
            updatePlayButtonState(slot, true);
        }
    });
    
    // Save recording data
    currentRecordingData.duration = Date.now() - recordingStartTime;
    recordingSessions.push({...currentRecordingData});
    
    // Lock all controls between sessions (except during overdubbing)
    lockAllControlsBetweenSessions();
    
    // Clear overdub visual states
    clearOverdubVisualStates();
    
    // Update UI
    const recordBtn = document.getElementById('record-btn');
    recordBtn.textContent = recordingSessions.length === 1 ? 'Keep Splicing' : 'Keep Splicing';
    recordBtn.disabled = false;
    
    // Show save button after first recording session
    const saveBtn = document.getElementById('save-btn');
    saveBtn.style.display = 'block';
    saveBtn.disabled = false;
    
    // Remove timer overlay
    removeTimerOverlay();
    
    console.log(`Completed recording session ${currentSession}:`, currentRecordingData);
}

// =================== TIMER OVERLAY SYSTEM ===================
function createTimerOverlay() {
    // Remove existing overlay if present
    removeTimerOverlay();
    
    const previewContent = document.getElementById('preview-content');
    const overlay = document.createElement('div');
    overlay.id = 'timer-overlay';
    overlay.className = 'timer-overlay';
    
    previewContent.appendChild(overlay);
}

function updateTimerDisplay(text, isCountdown) {
    const overlay = document.getElementById('timer-overlay');
    if (overlay) {
        overlay.textContent = text;
        overlay.className = `timer-overlay ${isCountdown ? 'countdown' : 'recording'}`;
    }
}

function removeTimerOverlay() {
    const overlay = document.getElementById('timer-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// =================== PLAYBACK MODE SYSTEM ===================
function startPlaybackMode() {
    if (recordingSessions.length === 0) return;
    
    isPlaybackMode = true;
    console.log('Starting playback mode for overdub...');
    
    // Reset playback volume tracking for smooth transitions
    currentPlaybackVolumes = {};
    
    // Start playback automation
    const playbackStartTime = Date.now();
    
    playbackInterval = setInterval(() => {
        const elapsed = Date.now() - playbackStartTime;
        
        // Playback all previous sessions' data
        recordingSessions.forEach(session => {
            playbackSessionData(session, elapsed);
        });
        
        // Stop playback at 60 seconds
        if (elapsed >= 60000) {
            clearInterval(playbackInterval);
            playbackInterval = null;
        }
    }, 100); // Update every 100ms for smooth playback
}

function playbackSessionData(session, currentTime) {
    // Playback volume, opacity, and timestamp data for each slot
    Object.keys(session.controlData).forEach(slot => {
        const slotData = session.controlData[slot];
        const slotNum = parseInt(slot);
        
        if (videos[slotNum] && !hijackedControls.has(`${slot}-volume`)) {
            playbackVolumeData(slotNum, slotData.volume, currentTime);
        }
        
        if (videos[slotNum] && !hijackedControls.has(`${slot}-opacity`)) {
            playbackOpacityData(slotNum, slotData.opacity, currentTime);
        }
        
        if (videos[slotNum] && !hijackedControls.has(`${slot}-timestamps`)) {
            playbackTimestampData(slotNum, slotData.timestamps, currentTime);
        }
    });
}

// Track current volume for each slot to enable smooth transitions
let currentPlaybackVolumes = {};

function applyVolumeSmooth(slot, targetVolume) {
    if (!previewPlayers[slot]) return;
    
    // Initialize current volume if not set
    if (currentPlaybackVolumes[slot] === undefined) {
        try {
            currentPlaybackVolumes[slot] = previewPlayers[slot].getVolume();
        } catch (error) {
            currentPlaybackVolumes[slot] = 50; // Default
        }
    }
    
    const currentVolume = currentPlaybackVolumes[slot];
    const volumeDiff = Math.abs(targetVolume - currentVolume);
    
    // If the volume change is small, apply it directly
    if (volumeDiff <= 2) {
        try {
            previewPlayers[slot].setVolume(targetVolume);
            currentPlaybackVolumes[slot] = targetVolume;
        } catch (error) {
            console.log('Could not set volume');
        }
    } else {
        // For larger changes, apply a small step to reduce crackling
        const step = volumeDiff > 20 ? 5 : 2;
        const nextVolume = currentVolume + (targetVolume > currentVolume ? step : -step);
        const clampedVolume = targetVolume > currentVolume ? 
            Math.min(nextVolume, targetVolume) : 
            Math.max(nextVolume, targetVolume);
        
        try {
            previewPlayers[slot].setVolume(clampedVolume);
            currentPlaybackVolumes[slot] = clampedVolume;
        } catch (error) {
            console.log('Could not set volume');
        }
    }
}

function playbackVolumeData(slot, volumeData, currentTime) {
    // Find the current and next volume points for smooth interpolation
    let currentPoint = null;
    let nextPoint = null;
    
    for (let i = 0; i < volumeData.length; i++) {
        if (volumeData[i].timestamp <= currentTime) {
            currentPoint = volumeData[i];
        }
        if (volumeData[i].timestamp > currentTime && !nextPoint) {
            nextPoint = volumeData[i];
            break;
        }
    }
    
    if (currentPoint) {
        let interpolatedValue = currentPoint.value;
        
        // Smooth interpolation between current and next points
        if (nextPoint) {
            const timeDiff = nextPoint.timestamp - currentPoint.timestamp;
            const valueDiff = nextPoint.value - currentPoint.value;
            const timeProgress = (currentTime - currentPoint.timestamp) / timeDiff;
            
            // Use smooth interpolation only for small time differences to avoid lag
            if (timeDiff < 500) { // Only interpolate within 500ms gaps
                interpolatedValue = currentPoint.value + (valueDiff * timeProgress);
                interpolatedValue = Math.round(interpolatedValue); // Round to whole numbers
            }
        }
        
        const volumeSlider = document.getElementById(`vol-${slot}`);
        if (volumeSlider && !volumeSlider.classList.contains('hijacked')) {
            volumeSlider.value = interpolatedValue;
            volumeSlider.classList.add('playback'); // Orange state
            // Apply volume smoothly with a tiny ramp to prevent crackling
            if (previewPlayers[slot]) {
                applyVolumeSmooth(slot, interpolatedValue);
            }
        }
    }
}

function playbackOpacityData(slot, opacityData, currentTime) {
    // Similar to volume playback
    const opacityPoint = opacityData.find(point => 
        Math.abs(point.timestamp - currentTime) < 100
    );
    
    if (opacityPoint) {
        const opacitySlider = document.getElementById(`opc-${slot}`);
        if (opacitySlider && !opacitySlider.classList.contains('hijacked')) {
            opacitySlider.value = opacityPoint.value;
            opacitySlider.classList.add('playback'); // Orange state
            // Update actual opacity
            const mainLayer = document.getElementById(`main-layer-${slot}`);
            if (mainLayer) {
                mainLayer.style.opacity = opacityPoint.value / 100;
            }
        }
    }
}

function playbackTimestampData(slot, timestampData, currentTime) {
    // Playback timestamp button clicks from previous sessions
    const timestampPoint = timestampData.find(point => 
        Math.abs(point.timestamp - currentTime) < 100
    );
    
    if (timestampPoint) {
        // Only trigger the actual jump - don't change visual states
        // The playback from previous sessions should not affect current session's visual indicators
        if (timestampPoint.action === 'jump') {
            const targetTime = videos[slot].keyframes[timestampPoint.keyframeIndex];
            if (targetTime !== null && previewPlayers[slot] && !syncLocks[slot]) {
                syncLocks[slot] = true;
                previewPlayers[slot].seekTo(targetTime);
                
                setTimeout(() => {
                    if (mainPlayers[slot]) {
                        try {
                            mainPlayers[slot].seekTo(targetTime);
                        } catch (error) {
                            console.log('Could not seek main player');
                        }
                    }
                    setTimeout(() => {
                        syncLocks[slot] = false;
                    }, 50);
                }, 25);
            }
        }
        // Do NOT change button visual states - they should only change when user actually clicks them
    }
}

// =================== KEYFRAME SYSTEM ===================
function setKeyframe(slot, keyframeIndex) {
    if (!videos[slot] || !previewPlayers[slot] || videos[slot].locked) return;
    
    // Handle hijacking during playback mode
    if (isPlaybackMode) {
        hijackControl(slot, 'timestamps');
    }
    
    try {
        const currentTime = previewPlayers[slot].getCurrentTime();
        videos[slot].keyframes[keyframeIndex] = currentTime;
        
        // Record timestamp data if currently recording
        if (isRecording) {
            recordTimestampChange(slot, keyframeIndex, currentTime, 'set');
        }
        
        // Update button appearance using the proper function that includes delete button
        updateKeyframeButton(slot, keyframeIndex);
        
        console.log(`Set keyframe ${keyframeIndex} for slot ${slot} at ${currentTime}s`);
        
    } catch (error) {
        console.log('Could not get current time for keyframe');
    }
}

function jumpToKeyframe(slot, keyframeIndex) {
    if (!videos[slot] || videos[slot].keyframes[keyframeIndex] === null || videos[slot].locked) return;
    
    const targetTime = videos[slot].keyframes[keyframeIndex];
    
    // Handle hijacking during playback mode (only if user initiated and currently recording)
    // Don't hijack if this is called from automatic playback of previous sessions
    if (isPlaybackMode && isRecording) {
        hijackControl(slot, 'timestamps');
    }
    
    try {
        if (previewPlayers[slot] && !syncLocks[slot]) {
            syncLocks[slot] = true;
            previewPlayers[slot].seekTo(targetTime);
            
            // Record timestamp jump if currently recording
            if (isRecording) {
                recordTimestampChange(slot, keyframeIndex, targetTime, 'jump');
            }
            
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
        
    } catch (error) {
        console.log(`Could not jump to keyframe ${keyframeIndex} for slot ${slot}`);
    }
}

function deleteKeyframe(slot, keyframeIndex) {
    if (!videos[slot] || videos[slot].locked) return;
    
    // Handle hijacking during playback mode
    if (isPlaybackMode) {
        hijackControl(slot, 'timestamps');
    }
    
    // Clear the keyframe
    videos[slot].keyframes[keyframeIndex] = null;
    
    // Record timestamp deletion if currently recording
    if (isRecording) {
        recordTimestampChange(slot, keyframeIndex, null, 'delete');
    }
    
    // Update button back to empty state
    updateKeyframeButton(slot, keyframeIndex);
    
    console.log(`Deleted keyframe ${keyframeIndex} for slot ${slot}`);
}

// =================== TIMESTAMP RECORDING ===================
function recordTimestampChange(slot, keyframeIndex, time, action) {
    if (!isRecording) return;
    
    const timestamp = Date.now() - recordingStartTime;
    
    // Initialize slot data if needed
    if (!currentRecordingData.controlData[slot]) {
        currentRecordingData.controlData[slot] = {
            volume: [],
            opacity: [],
            timestamps: []
        };
    }
    
    // Add timestamp action
    currentRecordingData.controlData[slot].timestamps.push({
        timestamp: timestamp,
        keyframeIndex: keyframeIndex,
        time: time,
        action: action
    });
    
    console.log(`Recorded timestamp ${action} for slot ${slot}, keyframe ${keyframeIndex} at ${timestamp}ms`);
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
        // Empty state - shows plus sign for setting keyframe (only when not recording and no sessions exist)
        if (!isRecording && recordingSessions.length === 0) {
            keyframeBtn.className = 'keyframe-btn empty';
            keyframeBtn.onclick = () => handleKeyframeClick(slot, keyframeIndex);
            keyframeBtn.ondblclick = () => setKeyframe(slot, keyframeIndex);
            keyframeBtn.innerHTML = '<span class="keyframe-plus">+</span>';
            keyframeBtn.style.display = 'flex'; // Show the button
        } else {
            // Hide empty buttons during recording or between sessions
            keyframeBtn.style.display = 'none';
        }
    } else {
        // Filled state - behavior depends on recording state
        keyframeBtn.style.display = 'flex'; // Always show filled buttons
        
        if (isRecording) {
            // During recording: read-only mode (no delete button, light blue color, jump only)
            keyframeBtn.className = 'keyframe-btn filled recording';
            keyframeBtn.innerHTML = `
                <span class="keyframe-time">${formatTime(keyframeTime)}</span>
            `;
            // Only allow jumping during recording
            keyframeBtn.onclick = () => jumpToKeyframe(slot, keyframeIndex);
            keyframeBtn.ondblclick = null; // Disable double-click editing during recording
        } else if (recordingSessions.length === 0) {
            // Before any recording: full edit mode (with delete button, grey color)
            keyframeBtn.className = 'keyframe-btn filled';
            keyframeBtn.innerHTML = `
                <span class="keyframe-time">${formatTime(keyframeTime)}</span>
                <button class="keyframe-delete-btn" onclick="event.stopPropagation(); deleteKeyframe(${slot}, ${keyframeIndex})" title="Delete timestamp">×</button>
            `;
            // Single click: jump to keyframe (test)
            // Double click: replace keyframe
            keyframeBtn.onclick = () => handleKeyframeClick(slot, keyframeIndex);
            keyframeBtn.ondblclick = () => setKeyframe(slot, keyframeIndex);
        } else {
            // Between sessions: locked state (no delete button, no editing)
            keyframeBtn.className = 'keyframe-btn filled locked';
            keyframeBtn.innerHTML = `
                <span class="keyframe-time">${formatTime(keyframeTime)}</span>
            `;
            // Only allow jumping between sessions (for testing)
            keyframeBtn.onclick = () => jumpToKeyframe(slot, keyframeIndex);
            keyframeBtn.ondblclick = null; // No editing between sessions
        }
    }
}

function updateKeyframeButtonForPlayback(slot, keyframeIndex) {
    const keyframeBtn = document.getElementById(`keyframe-${slot}-${keyframeIndex}`);
    if (!keyframeBtn) return;
    
    const keyframeTime = videos[slot].keyframes[keyframeIndex];
    
    if (keyframeTime === null) {
        // Hide empty buttons during playback
        keyframeBtn.style.display = 'none';
    } else {
        // Show filled buttons as grayed out, non-interactive during playback
        keyframeBtn.style.display = 'flex';
        keyframeBtn.className = 'keyframe-btn filled playback-readonly';
        keyframeBtn.innerHTML = `
            <span class="keyframe-time">${formatTime(keyframeTime)}</span>
        `;
        keyframeBtn.onclick = null; // Disable clicking during playback
        keyframeBtn.ondblclick = null;
        keyframeBtn.disabled = true;
    }
}

function removeEmptyTimestampButtons() {
    console.log('Hiding empty timestamp buttons for recording...');
    videos.forEach((video, slot) => {
        if (video) {
            for (let i = 0; i < 3; i++) {
                updateKeyframeButton(slot, i);
            }
        }
    });
}

function lockAllControlsBetweenSessions() {
    console.log('Locking all controls between recording sessions...');
    videos.forEach((video, slot) => {
        if (video) {
            // Lock all sliders
            const volSlider = document.getElementById(`vol-${slot}`);
            const opcSlider = document.getElementById(`opc-${slot}`);
            const linkButton = document.getElementById(`link-${slot}`);
            const lockButton = document.getElementById(`lock-${slot}`);
            const playPauseBtn = document.getElementById(`play-pause-${slot}`);
            const scrubber = document.getElementById(`scrubber-${slot}`);
            
            if (volSlider) volSlider.disabled = true;
            if (opcSlider) opcSlider.disabled = true;
            if (linkButton) linkButton.disabled = true;
            if (lockButton) lockButton.disabled = true;
            if (playPauseBtn) playPauseBtn.disabled = true;
            if (scrubber) scrubber.style.pointerEvents = 'none';
            
            // Update all timestamp buttons to locked state
            for (let i = 0; i < 3; i++) {
                updateKeyframeButton(slot, i);
            }
            
            // Reset visual states
            resetControlVisualState(slot);
            
            // Add locked-between-sessions class for styling
            const module = document.querySelector(`[data-slot="${slot}"]`);
            if (module) {
                module.classList.add('locked-between-sessions');
            }
        }
    });
}

function unlockControlsForOverdubbing() {
    console.log('Unlocking controls for overdubbing (but timestamp creation still disabled)...');
    
    // Clear hijacked controls from previous session to ensure fresh start
    hijackedControls.clear();
    
    videos.forEach((video, slot) => {
        if (video) {
            // Unlock sliders and buttons for overdubbing
            const volSlider = document.getElementById(`vol-${slot}`);
            const opcSlider = document.getElementById(`opc-${slot}`);
            const linkButton = document.getElementById(`link-${slot}`);
            const lockButton = document.getElementById(`lock-${slot}`);
            const playPauseBtn = document.getElementById(`play-pause-${slot}`);
            const scrubber = document.getElementById(`scrubber-${slot}`);
            
            if (volSlider) {
                volSlider.disabled = false;
                // Set initial overdub visual state (orange)
                volSlider.classList.remove('hijacked');
                volSlider.classList.add('playback');
            }
            if (opcSlider) {
                opcSlider.disabled = false;
                // Set initial overdub visual state (orange)
                opcSlider.classList.remove('hijacked');
                opcSlider.classList.add('playback');
            }
            if (linkButton) linkButton.disabled = false;
            if (lockButton) lockButton.disabled = false;
            if (playPauseBtn) playPauseBtn.disabled = false;
            if (scrubber) scrubber.style.pointerEvents = 'auto';
            
            // Remove locked-between-sessions class
            const module = document.querySelector(`[data-slot="${slot}"]`);
            if (module) {
                module.classList.remove('locked-between-sessions');
            }
            
            // Note: timestamp buttons remain in their current state (no new creation allowed)
        }
    });
}

function setTimestampButtonsOverdubState() {
    console.log('Setting timestamp buttons to overdub initial state (orange)...');
    videos.forEach((video, slot) => {
        if (video) {
            for (let i = 0; i < 3; i++) {
                const keyframeBtn = document.getElementById(`keyframe-${slot}-${i}`);
                if (keyframeBtn && video.keyframes[i] !== null) {
                    // Clear any existing states first
                    keyframeBtn.classList.remove('overdub-hijacked', 'playback', 'hijacked');
                    // Set to initial orange state
                    keyframeBtn.classList.add('overdub-initial');
                }
            }
        }
    });
}

function setTimestampButtonsHijackedState() {
    console.log('Setting all timestamp buttons to hijacked state (blue) - previous data deleted...');
    videos.forEach((video, slot) => {
        if (video) {
            for (let i = 0; i < 3; i++) {
                const keyframeBtn = document.getElementById(`keyframe-${slot}-${i}`);
                if (keyframeBtn && video.keyframes[i] !== null) {
                    keyframeBtn.classList.remove('overdub-initial');
                    keyframeBtn.classList.add('overdub-hijacked');
                }
            }
        }
    });
}

function clearOverdubVisualStates() {
    console.log('Clearing overdub visual states...');
    videos.forEach((video, slot) => {
        if (video) {
            // Clear timestamp button states
            for (let i = 0; i < 3; i++) {
                const keyframeBtn = document.getElementById(`keyframe-${slot}-${i}`);
                if (keyframeBtn) {
                    keyframeBtn.classList.remove('overdub-initial', 'overdub-hijacked');
                }
            }
            
            // Clear slider states
            const volSlider = document.getElementById(`vol-${slot}`);
            const opcSlider = document.getElementById(`opc-${slot}`);
            if (volSlider) {
                volSlider.classList.remove('playback', 'hijacked');
            }
            if (opcSlider) {
                opcSlider.classList.remove('playback', 'hijacked');
            }
        }
    });
}

function hideVideoRemoveButtons() {
    console.log('Hiding video remove buttons - videos are now part of the art piece...');
    videos.forEach((video, slot) => {
        if (video) {
            const module = document.querySelector(`[data-slot="${slot}"]`);
            const removeBtn = module?.querySelector('.remove-btn');
            if (removeBtn) {
                removeBtn.style.display = 'none';
            }
        }
    });
}

function showVideoRemoveButtons() {
    console.log('Showing video remove buttons - new art piece creation...');
    videos.forEach((video, slot) => {
        if (video) {
            const module = document.querySelector(`[data-slot="${slot}"]`);
            const removeBtn = module?.querySelector('.remove-btn');
            if (removeBtn) {
                removeBtn.style.display = 'flex';
            }
        }
    });
}

function hideEmptyModuleSlots() {
    console.log('Hiding empty module slots - no new videos can be added...');
    for (let slot = 0; slot < 6; slot++) {
        if (!videos[slot]) {
            const module = document.querySelector(`[data-slot="${slot}"]`);
            if (module && module.classList.contains('empty')) {
                module.style.display = 'none';
            }
        }
    }
}

function showEmptyModuleSlots() {
    console.log('Showing empty module slots - new art piece creation...');
    for (let slot = 0; slot < 6; slot++) {
        const module = document.querySelector(`[data-slot="${slot}"]`);
        if (module) {
            module.style.display = 'block';
        }
    }
}

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
function setupEventListeners() {
    // Any additional event listeners can be added here
    // Currently handled by existing onload and other functions
}

function autoEnterFullscreen() {
    // Only auto-enter fullscreen if not already in fullscreen
    if (!document.fullscreenElement) {
        // Add a small delay to ensure page is fully loaded
        setTimeout(() => {
            document.documentElement.requestFullscreen().then(() => {
                updateFullscreenIcon(true);
                document.body.classList.add('fullscreen-active'); // Add class for CSS styling
                console.log('Auto-entered fullscreen mode');
            }).catch(err => {
                console.log('Auto-fullscreen blocked or failed (this is normal for user gesture requirements):', err);
                // Don't show error to user as some browsers require user gesture
            });
        }, 500); // Small delay to ensure smooth loading
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            updateFullscreenIcon(true);
            document.body.classList.add('fullscreen-active'); // Add class for CSS styling
            console.log('Entered fullscreen mode');
        }).catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen().then(() => {
            updateFullscreenIcon(false);
            document.body.classList.remove('fullscreen-active'); // Remove class for CSS styling
            console.log('Exited fullscreen mode');
        }).catch(err => {
            console.error('Error attempting to exit fullscreen:', err);
        });
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
    const isFullscreen = !!document.fullscreenElement;
    updateFullscreenIcon(isFullscreen);
    
    // Add or remove the fullscreen-active class
    if (isFullscreen) {
        document.body.classList.add('fullscreen-active');
    } else {
        document.body.classList.remove('fullscreen-active');
    }
});

// =================== HIJACKING SYSTEM ===================
function hijackControl(slot, controlType) {
    const controlKey = `${slot}-${controlType}`;
    
    if (isPlaybackMode && !hijackedControls.has(controlKey)) {
        console.log(`Hijacking control: ${controlKey}`);
        
        const currentTime = Date.now() - recordingStartTime;
        const controlsToHijack = new Set([controlKey]);
        
        // Collect all controls that should be hijacked based on linking rules
        collectLinkedControlsToHijack(slot, controlType, controlsToHijack);
        
        // Hijack all collected controls
        for (const key of controlsToHijack) {
            if (!hijackedControls.has(key)) {
                hijackedControls.add(key);
                const [hijackSlot, hijackControlType] = key.split('-');
                deleteFutureRecordingData(parseInt(hijackSlot), hijackControlType, currentTime);
                updateControlVisualState(parseInt(hijackSlot), hijackControlType, 'hijacked');
            }
        }
        
        // Handle timestamp buttons visual state for overdubbing
        if (controlType === 'timestamps' && currentSession > 1) {
            for (let i = 0; i < 3; i++) {
                const keyframeBtn = document.getElementById(`keyframe-${slot}-${i}`);
                if (keyframeBtn && videos[slot] && videos[slot].keyframes[i] !== null) {
                    keyframeBtn.classList.remove('overdub-initial');
                    keyframeBtn.classList.add('overdub-hijacked');
                }
            }
        }
    }
}

function collectLinkedControlsToHijack(sourceSlot, sourceControlType, controlsToHijack) {
    const sourceVideo = videos[sourceSlot];
    if (!sourceVideo) return;
    
    // Handle volume-opacity linking within the same module
    if (sourceVideo.volumeOpacityLinked && (sourceControlType === 'volume' || sourceControlType === 'opacity')) {
        const linkedControl = sourceControlType === 'volume' ? 'opacity' : 'volume';
        controlsToHijack.add(`${sourceSlot}-${linkedControl}`);
    }
    
    // Handle cross-module linking (but NEVER for timestamps)
    if (sourceVideo.linked && sourceControlType !== 'timestamps') {
        videos.forEach((video, slot) => {
            if (slot !== sourceSlot && video && video.linked && !video.locked) {
                // Add the same control type for all linked modules
                controlsToHijack.add(`${slot}-${sourceControlType}`);
                
                // If the source module has volume-opacity linked and we're moving volume/opacity,
                // then hijack the corresponding control in ALL linked modules (regardless of their vol-opc link status)
                if (sourceVideo.volumeOpacityLinked && (sourceControlType === 'volume' || sourceControlType === 'opacity')) {
                    const correspondingControl = sourceControlType === 'volume' ? 'opacity' : 'volume';
                    controlsToHijack.add(`${slot}-${correspondingControl}`);
                }
            }
        });
    }
}

function deleteFutureRecordingData(slot, controlType, fromTime) {
    // Remove future data from all previous sessions
    recordingSessions.forEach(session => {
        if (session.controlData[slot] && session.controlData[slot][controlType]) {
            session.controlData[slot][controlType] = session.controlData[slot][controlType].filter(
                point => point.timestamp < fromTime
            );
        }
    });
    
    console.log(`Deleted future ${controlType} data for slot ${slot} from ${fromTime}ms`);
}

function updateControlVisualState(slot, controlType = null, state = 'playback') {
    if (controlType) {
        // Update specific control
        const element = getControlElement(slot, controlType);
        if (element) {
            element.classList.remove('playback', 'recording', 'hijacked');
            element.classList.add(state);
        }
    } else {
        // Update all controls for slot
        ['volume', 'opacity', 'timestamps'].forEach(type => {
            const element = getControlElement(slot, type);
            if (element) {
                element.classList.remove('playback', 'recording', 'hijacked');
                element.classList.add(state);
            }
        });
    }
}

function resetControlVisualState(slot) {
    ['volume', 'opacity', 'timestamps'].forEach(type => {
        const element = getControlElement(slot, type);
        if (element) {
            element.classList.remove('playback', 'recording', 'hijacked');
        }
    });
}

function getControlElement(slot, controlType) {
    switch(controlType) {
        case 'volume':
            return document.getElementById(`vol-${slot}`);
        case 'opacity':
            return document.getElementById(`opc-${slot}`);
        case 'timestamps':
            // Return first timestamp button (will handle all three)
            return document.getElementById(`keyframe-${slot}-0`);
        default:
            return null;
    }
}

// =================== ENHANCED RECORDING DATA CAPTURE ===================
function recordControlChange(slot, controlType, value) {
    if (!isRecording) return;
    
    const timestamp = Date.now() - recordingStartTime;
    
    // Initialize slot data if needed
    if (!currentRecordingData.controlData[slot]) {
        currentRecordingData.controlData[slot] = {
            volume: [],
            opacity: [],
            timestamps: []
        };
    }
    
    // Add data point
    currentRecordingData.controlData[slot][controlType].push({
        timestamp: timestamp,
        value: value
    });
    
    console.log(`Recorded ${controlType} change for slot ${slot}: ${value} at ${timestamp}ms`);
}

function recordControlChangeThrottled(slot, controlType, value) {
    if (!isRecording) return;
    
    const now = Date.now();
    const throttleKey = `${slot}-${controlType}`;
    
    // Initialize throttling if needed
    if (!lastRecordingTime[throttleKey]) {
        lastRecordingTime[throttleKey] = 0;
    }
    
    // Throttle to max one recording every 25ms (40fps) for smooth but not overwhelming data
    if (now - lastRecordingTime[throttleKey] >= 25) {
        recordControlChange(slot, controlType, value);
        lastRecordingTime[throttleKey] = now;
    }
}

// =================== ENHANCED SAVE SYSTEM ===================
function saveComposition() {
    if (recordingSessions.length === 0) {
        alert('No recording to save!');
        return;
    }

    // Show custom naming modal instead of browser prompt
    showNamingModal();
}

function showNamingModal() {
    // Remove any existing naming modal
    const existingModal = document.getElementById('naming-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create naming modal
    const modal = document.createElement('div');
    modal.id = 'naming-modal';
    modal.className = 'custom-modal';
    modal.innerHTML = `
        <div class="custom-modal-content">
            <div class="custom-modal-title">Name Your Art Piece</div>
            <input type="text" class="custom-modal-input" id="art-piece-name" placeholder="Enter name..." maxlength="50">
            <div class="custom-modal-buttons">
                <button class="custom-modal-btn cancel" onclick="closeNamingModal()">Cancel</button>
                <button class="custom-modal-btn primary" onclick="proceedToThumbnailCapture()">Continue</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus the input and select placeholder text
    setTimeout(() => {
        const input = document.getElementById('art-piece-name');
        input.focus();
        input.value = `Art Piece ${new Date().toLocaleDateString()}`;
        input.select();
    }, 100);
    
    // Handle Enter key
    document.getElementById('art-piece-name').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            proceedToThumbnailCapture();
        } else if (e.key === 'Escape') {
            closeNamingModal();
        }
    });
}

function closeNamingModal() {
    const modal = document.getElementById('naming-modal');
    if (modal) {
        modal.remove();
    }
}

function proceedToThumbnailCapture() {
    const nameInput = document.getElementById('art-piece-name');
    const artPieceName = nameInput.value.trim() || `Art Piece ${Date.now()}`;
    
    closeNamingModal();
    
    // Show simple thumbnail selection modal
    showThumbnailSelectionModal(artPieceName);
}

function showThumbnailSelectionModal(artPieceName) {
    // Create simple thumbnail selection modal
    const modal = document.createElement('div');
    modal.id = 'thumbnail-selection-modal';
    modal.className = 'custom-modal';
    
    // Get loaded videos
    const loadedVideos = [];
    videos.forEach((video, slot) => {
        if (video) {
            loadedVideos.push({ video, slot });
        }
    });
    
    console.log('Loaded videos for thumbnail selection:', loadedVideos.length);
    console.log('Videos array:', videos);
    
    let thumbnailsHTML = '';
    if (loadedVideos.length > 0) {
        console.log('Creating thumbnail grid with videos:', loadedVideos);
        thumbnailsHTML = `
            <div class="thumbnail-grid" id="thumbnail-grid">
                ${loadedVideos.map(({ video, slot }) => {
                    const thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;
                    console.log(`Creating thumbnail for slot ${slot}: ${thumbnailUrl}`);
                    return `
                        <div class="thumbnail-option" onclick="highlightThumbnail('${video.videoId}', ${slot})" data-video-id="${video.videoId}" data-slot="${slot}">
                            <img src="${thumbnailUrl}" alt="Video ${slot + 1}">
                            <div class="thumbnail-label">Video ${slot + 1}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } else {
        console.log('No videos found for thumbnail selection');
        thumbnailsHTML = '<p>No videos loaded to choose from.</p>';
    }
    
    modal.innerHTML = `
        <div class="custom-modal-content" style="max-width: 600px;">
            <div class="custom-modal-title">Choose Thumbnail</div>
            <div class="thumbnail-selection-info">
                <p>Select which video thumbnail you'd like to use for your art piece.</p>
            </div>
            
            ${thumbnailsHTML}
            
            <div class="custom-modal-buttons">
                <button class="custom-modal-btn cancel" onclick="closeThumbnailSelectionModal()">Cancel</button>
                <button class="custom-modal-btn primary" id="save-thumbnail-btn" onclick="saveThumbnailSelection('${artPieceName}')" disabled>Save Thumbnail</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

let selectedThumbnailData = null;

function highlightThumbnail(videoId, slot) {
    // Remove previous selection
    const previousSelected = document.querySelector('.thumbnail-option.selected');
    if (previousSelected) {
        previousSelected.classList.remove('selected');
    }
    
    // Highlight new selection
    const thumbnailElement = document.querySelector(`[data-video-id="${videoId}"][data-slot="${slot}"]`);
    if (thumbnailElement) {
        thumbnailElement.classList.add('selected');
        
        // Store selection data
        selectedThumbnailData = { videoId, slot };
        
        // Enable save button
        const saveBtn = document.getElementById('save-thumbnail-btn');
        if (saveBtn) {
            saveBtn.disabled = false;
        }
    }
}

function saveThumbnailSelection(artPieceName) {
    if (!selectedThumbnailData) return;
    
    console.log(`Selected thumbnail from video ${selectedThumbnailData.slot + 1} for art piece: ${artPieceName}`);
    
    // Get the YouTube thumbnail URL
    const thumbnailUrl = `https://img.youtube.com/vi/${selectedThumbnailData.videoId}/mqdefault.jpg`;
    
    // Close modal and save with selected thumbnail (no browser alert)
    closeThumbnailSelectionModal();
    saveCompositionWithThumbnailSilent(artPieceName, thumbnailUrl);
}

function saveCompositionWithThumbnailSilent(name, thumbnailUrl) {
    console.log('Saving composition silently:', name);
    
    const composition = {
        id: Date.now(),
        name: name,
        createdAt: new Date().toISOString(),
        videos: videos.filter(v => v !== null).map(v => ({
            url: v.url,
            videoId: v.videoId,
            title: v.title,
            keyframes: v.keyframes || [null, null, null] // Include keyframe data
        })),
        sessions: recordingSessions,
        duration: 60000,
        thumbnail: thumbnailUrl
    };
    
    // Save to localStorage
    try {
        const saved = localStorage.getItem('youtubeMixerArtPieces');
        const savedArtPieces = saved ? JSON.parse(saved) : [];
        savedArtPieces.push(composition);
        localStorage.setItem('youtubeMixerArtPieces', JSON.stringify(savedArtPieces));
        console.log('Art piece saved successfully:', name);
        
        // Show success message and redirect to gallery
        alert(`🎨 "${name}" saved successfully! Redirecting to gallery...`);
        
        // Small delay for user to see the success message
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
        
    } catch (error) {
        console.error('Error saving art piece:', error);
        alert('Error saving art piece. Please try again.');
    }
}

function closeThumbnailSelectionModal() {
    const modal = document.getElementById('thumbnail-selection-modal');
    if (modal) {
        modal.remove();
    }
}

// Modal video preview functions removed - no longer needed with simple thumbnail selection

// =================== COMPOSITION PLAYBACK SYSTEM ===================
let isCompositionPlaying = false;
let compositionPlaybackTime = 0;
let compositionPlaybackInterval = null;

function initializeCompositionPlayback() {
    console.log('Initializing composition playback...');
    
    // Reset all videos to their starting positions
    videos.forEach((video, slot) => {
        if (video && previewPlayers[slot]) {
            // Find the leftmost keyframe for this video
            const leftmostKeyframe = video.keyframes.find(keyframe => keyframe !== null);
            if (leftmostKeyframe !== undefined && leftmostKeyframe !== null) {
                previewPlayers[slot].seekTo(leftmostKeyframe);
                if (mainPlayers[slot]) {
                    mainPlayers[slot].seekTo(leftmostKeyframe);
                }
                // Also seek modal players
                if (window.modalPlayers && window.modalPlayers[slot]) {
                    try {
                        window.modalPlayers[slot].seekTo(leftmostKeyframe);
                    } catch (error) {
                        console.log('Could not seek modal player');
                    }
                }
            }
            
            // Pause all videos initially
            previewPlayers[slot].pauseVideo();
            if (mainPlayers[slot]) {
                mainPlayers[slot].pauseVideo();
            }
            // Also pause modal players
            if (window.modalPlayers && window.modalPlayers[slot]) {
                try {
                    window.modalPlayers[slot].pauseVideo();
                } catch (error) {
                    console.log('Could not pause modal player');
                }
            }
        }
    });
    
    // Reset playback time
    compositionPlaybackTime = 0;
    updatePlaybackDisplay();
}

function toggleCompositionPlayback() {
    const playBtn = document.getElementById('playback-play-btn') || document.getElementById('composition-play-btn');
    
    if (isCompositionPlaying) {
        // Pause playback
        pauseCompositionPlayback();
        if (playBtn) {
            playBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                Play Composition
            `;
        }
    } else {
        // Start playback
        startCompositionPlayback();
        if (playBtn) {
            playBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
                Pause Composition
            `;
        }
    }
}

function startCompositionPlayback() {
    console.log('Starting composition playback...');
    isCompositionPlaying = true;
    
    // Start all videos playing (including modal players if they exist)
    videos.forEach((video, slot) => {
        if (video && previewPlayers[slot]) {
            previewPlayers[slot].playVideo();
            if (mainPlayers[slot]) {
                mainPlayers[slot].playVideo();
            }
            // Also play modal players for thumbnail capture
            if (window.modalPlayers && window.modalPlayers[slot]) {
                try {
                    window.modalPlayers[slot].playVideo();
                } catch (error) {
                    console.log('Could not play modal player');
                }
            }
        }
    });
    
    // Start playback automation (replay recorded actions)
    const playbackStartTime = Date.now();
    
    compositionPlaybackInterval = setInterval(() => {
        const elapsed = Date.now() - playbackStartTime + compositionPlaybackTime;
        
        // Update display
        updatePlaybackDisplay(elapsed);
        
        // Apply recorded actions at the correct times
        recordingSessions.forEach(session => {
            playbackRecordedActions(session, elapsed);
        });
        
        // Stop at 60 seconds
        if (elapsed >= 60000) {
            pauseCompositionPlayback();
        }
    }, 100);
}

function pauseCompositionPlayback() {
    console.log('Pausing composition playback...');
    isCompositionPlaying = false;
    
    // Pause all videos (including modal players if they exist)
    videos.forEach((video, slot) => {
        if (video && previewPlayers[slot]) {
            previewPlayers[slot].pauseVideo();
            if (mainPlayers[slot]) {
                mainPlayers[slot].pauseVideo();
            }
            // Also pause modal players
            if (window.modalPlayers && window.modalPlayers[slot]) {
                try {
                    window.modalPlayers[slot].pauseVideo();
                } catch (error) {
                    console.log('Could not pause modal player');
                }
            }
        }
    });
    
    // Stop playback interval
    if (compositionPlaybackInterval) {
        clearInterval(compositionPlaybackInterval);
        compositionPlaybackInterval = null;
    }
}

function scrubComposition(timeMs) {
    console.log(`Scrubbing composition to ${timeMs}ms`);
    
    // Pause playback if running
    if (isCompositionPlaying) {
        pauseCompositionPlayback();
        // Update button to show play state
        const playBtn = document.getElementById('playback-play-btn') || document.getElementById('composition-play-btn');
        if (playBtn) {
            playBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                Play Composition
            `;
        }
    }
    
    compositionPlaybackTime = parseInt(timeMs);
    
    // Apply recorded state at this time
    recordingSessions.forEach(session => {
        applyStateAtTime(session, compositionPlaybackTime);
    });
    
    updatePlaybackDisplay(compositionPlaybackTime);
}

function playbackRecordedActions(session, currentTime) {
    // Apply volume, opacity, and timestamp changes at correct times
    Object.keys(session.controlData).forEach(slot => {
        const slotData = session.controlData[slot];
        const slotNum = parseInt(slot);
        
        if (videos[slotNum]) {
            // Apply volume changes - find the most recent value at or before current time
            if (slotData.volume && slotData.volume.length > 0) {
                let latestVolume = null;
                for (let i = slotData.volume.length - 1; i >= 0; i--) {
                    if (slotData.volume[i].timestamp <= currentTime) {
                        latestVolume = slotData.volume[i];
                        break;
                    }
                }
                
                if (latestVolume && videos[slotNum].volume !== latestVolume.value) {
                    videos[slotNum].volume = latestVolume.value;
                    const volumeSlider = document.getElementById(`vol-${slotNum}`);
                    if (volumeSlider) {
                        volumeSlider.value = latestVolume.value;
                    }
                    if (previewPlayers[slotNum]) {
                        previewPlayers[slotNum].setVolume(latestVolume.value);
                    }
                }
            }
            
            // Apply opacity changes - find the most recent value at or before current time
            if (slotData.opacity && slotData.opacity.length > 0) {
                let latestOpacity = null;
                for (let i = slotData.opacity.length - 1; i >= 0; i--) {
                    if (slotData.opacity[i].timestamp <= currentTime) {
                        latestOpacity = slotData.opacity[i];
                        break;
                    }
                }
                
                if (latestOpacity && videos[slotNum].opacity !== latestOpacity.value) {
                    videos[slotNum].opacity = latestOpacity.value;
                    const opacitySlider = document.getElementById(`opc-${slotNum}`);
                    if (opacitySlider) {
                        opacitySlider.value = latestOpacity.value;
                    }
                    const mainLayer = document.getElementById(`main-layer-${slotNum}`);
                    if (mainLayer) {
                        mainLayer.style.opacity = latestOpacity.value / 100;
                    }
                }
            }
            
            // Apply timestamp button activity - only for exact matches (visual feedback)
            if (slotData.timestamps && slotData.timestamps.length > 0) {
                const timestampPoint = slotData.timestamps.find(point => 
                    Math.abs(point.timestamp - currentTime) < 100
                );
                if (timestampPoint) {
                    // Light up the keyframe button that was clicked
                    const keyframeBtn = document.getElementById(`keyframe-${slotNum}-${timestampPoint.keyframeIndex}`);
                    if (keyframeBtn) {
                        keyframeBtn.classList.add('playback-active');
                        // Remove active class after brief highlight
                        setTimeout(() => {
                            if (keyframeBtn) keyframeBtn.classList.remove('playback-active');
                        }, 400);
                    }
                    
                    // If it was a jump action, actually perform the jump
                    if (timestampPoint.action === 'jump' && timestampPoint.time !== null) {
                        jumpToKeyframe(slotNum, timestampPoint.keyframeIndex);
                    }
                }
            }
        }
    });
}

function applyStateAtTime(session, targetTime) {
    // Apply the state that should exist at a specific time
    Object.keys(session.controlData).forEach(slot => {
        const slotData = session.controlData[slot];
        const slotNum = parseInt(slot);
        
        if (videos[slotNum]) {
            // Find latest volume value at or before target time
            if (slotData.volume && slotData.volume.length > 0) {
                let latestVolume = null;
                for (let i = slotData.volume.length - 1; i >= 0; i--) {
                    if (slotData.volume[i].timestamp <= targetTime) {
                        latestVolume = slotData.volume[i];
                        break;
                    }
                }
                
                if (latestVolume) {
                    videos[slotNum].volume = latestVolume.value;
                    const volumeSlider = document.getElementById(`vol-${slotNum}`);
                    if (volumeSlider) volumeSlider.value = latestVolume.value;
                    if (previewPlayers[slotNum]) {
                        // Use smooth application for scrubbing too
                        applyVolumeSmooth(slotNum, latestVolume.value);
                    }
                }
            }
            
            // Find latest opacity value at or before target time
            if (slotData.opacity && slotData.opacity.length > 0) {
                let latestOpacity = null;
                for (let i = slotData.opacity.length - 1; i >= 0; i--) {
                    if (slotData.opacity[i].timestamp <= targetTime) {
                        latestOpacity = slotData.opacity[i];
                        break;
                    }
                }
                
                if (latestOpacity) {
                    videos[slotNum].opacity = latestOpacity.value;
                    const opacitySlider = document.getElementById(`opc-${slotNum}`);
                    if (opacitySlider) opacitySlider.value = latestOpacity.value;
                    const mainLayer = document.getElementById(`main-layer-${slotNum}`);
                    if (mainLayer) {
                        mainLayer.style.opacity = latestOpacity.value / 100;
                    }
                    // Also update modal layer opacity
                    const modalLayer = document.getElementById(`modal-layer-${slotNum}`);
                    if (modalLayer) {
                        modalLayer.style.opacity = latestOpacity.value / 100;
                    }
                    // Update playback layer opacity
                    const playbackLayer = document.getElementById(`playback-layer-${slotNum}`);
                    if (playbackLayer) {
                        playbackLayer.style.opacity = latestOpacity.value / 100;
                    }
                }
            }
        }
    });
}

function updatePlaybackDisplay(timeMs = compositionPlaybackTime) {
    // Update both thumbnail capture modal and composition playback modal
    const scrubber = document.getElementById('playback-scrubber') || document.getElementById('composition-scrubber');
    const timeDisplay = document.getElementById('playback-time') || document.getElementById('composition-time');
    
    if (scrubber) {
        scrubber.value = timeMs;
    }
    
    if (timeDisplay) {
        const currentSeconds = Math.floor(timeMs / 1000);
        const currentMins = Math.floor(currentSeconds / 60);
        const currentSecs = currentSeconds % 60;
        const currentTime = `${currentMins}:${currentSecs.toString().padStart(2, '0')}`;
        timeDisplay.textContent = `${currentTime} / 1:00`;
    }
}

// Removed - replaced with closeThumbnailSelectionModal

// Removed - no longer needed with simple thumbnail selection

// All artistic generation functions removed - using simple thumbnail selection now

// =================== OLD THUMBNAIL FUNCTIONS REMOVED ===================
// These have been replaced with the new composition playback and screenshot system

function saveCompositionWithThumbnail(name, thumbnailUrl) {
    console.log('Saving composition with thumbnail:', name);
    console.log('Thumbnail URL type:', typeof thumbnailUrl);
    console.log('Thumbnail URL length:', thumbnailUrl ? thumbnailUrl.length : 'null');
    console.log('Thumbnail URL starts with:', thumbnailUrl ? thumbnailUrl.substring(0, 50) : 'null');
    
    const composition = {
        id: Date.now(),
        name: name,
        createdAt: new Date().toISOString(),
        videos: videos.filter(v => v !== null).map(v => ({
            url: v.url,
            videoId: v.videoId,
            title: v.title
        })),
        sessions: recordingSessions,
        duration: 60000,
        thumbnail: thumbnailUrl
    };
    
    savedArtPieces.push(composition);
    
    console.log('Art piece saved:', name);
    console.log('Composition thumbnail in saved object:', composition.thumbnail ? composition.thumbnail.substring(0, 50) : 'null');
    alert('Art piece saved: ' + name);
    
    // Display saved art piece
    displaySavedArtPiece(composition);
    
    // Reset interface for new creation
    resetInterface();
}

function displaySavedArtPiece(composition) {
    let savedContainer = document.getElementById('saved-art-pieces');
    
    if (!savedContainer) {
        // Create saved art pieces container
        savedContainer = document.createElement('div');
        savedContainer.id = 'saved-art-pieces';
        savedContainer.className = 'saved-art-pieces';
        
        // Insert after recording controls
        const recordingControls = document.querySelector('.recording-controls');
        recordingControls.parentNode.insertBefore(savedContainer, recordingControls.nextSibling);
        
        // Add title
        const title = document.createElement('h3');
        title.textContent = 'Saved Art Pieces';
        title.className = 'saved-title';
        savedContainer.appendChild(title);
        
        const grid = document.createElement('div');
        grid.className = 'saved-grid';
        grid.id = 'saved-grid';
        savedContainer.appendChild(grid);
    }
    
    const grid = document.getElementById('saved-grid');
    
    // Create art piece card
    const card = document.createElement('div');
    card.className = 'art-piece-card';
    card.onclick = () => loadAndPlayArtPiece(composition);
    
    card.innerHTML = `
        <div class="art-piece-thumbnail">
            <img src="${composition.thumbnail}" alt="${composition.name}">
            <div class="play-overlay">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            </div>
        </div>
        <div class="art-piece-info">
            <div class="art-piece-name">${composition.name}</div>
            <div class="art-piece-meta">${composition.videos.length} videos • ${composition.sessions.length} sessions</div>
        </div>
    `;
    
    grid.appendChild(card);
}

function loadAndPlayArtPiece(composition) {
    console.log('Loading and auto-playing art piece:', composition.name);
    
    // Hide empty slots immediately to prevent flicker during loading
    hideEmptyModuleSlots();
    
    // First, clear any existing videos
    resetInterface();
    
    // Show loading overlay
    showPlaybackOverlay(composition.name);
    
    // Load each video from the composition
    let videosLoaded = 0;
    const totalVideos = composition.videos.length;
    
    composition.videos.forEach((videoData, index) => {
        if (index < 6) { // Only load up to 6 videos (our slot limit)
            loadVideoInSlot(index, videoData.url, videoData.videoId);
            
            // Wait for video to be ready
            const checkVideoReady = setInterval(() => {
                if (previewPlayers[index] && videos[index]) {
                    clearInterval(checkVideoReady);
                    
                    // Restore keyframe data from composition
                    if (videoData.keyframes) {
                        videos[index].keyframes = videoData.keyframes;
                    }
                    
                    videosLoaded++;
                    
                    // Lock all controls for playback mode
                    lockAllControlsForPlayback(index);
                    
                    // When all videos are loaded, start playback
                    if (videosLoaded === totalVideos) {
                        setTimeout(() => {
                            startAutoPlayback(composition);
                        }, 2000); // Give videos time to fully initialize
                    }
                }
            }, 500);
        }
    });
    
    // Set the recording sessions data
    recordingSessions = composition.sessions || [];
}

function lockAllControlsForPlayback(slot) {
    console.log('Locking controls for playback in slot:', slot);
    
    // Lock all sliders but keep them visually active for playback
    const volSlider = document.getElementById(`vol-${slot}`);
    const opcSlider = document.getElementById(`opc-${slot}`);
    const linkButton = document.getElementById(`link-${slot}`);
    const lockButton = document.getElementById(`lock-${slot}`);
    const playPauseBtn = document.getElementById(`play-pause-${slot}`);
    const scrubber = document.getElementById(`scrubber-${slot}`);
    
    // Disable all interactive controls
    if (volSlider) volSlider.disabled = true;
    if (opcSlider) opcSlider.disabled = true;
    if (linkButton) linkButton.disabled = true;
    if (lockButton) lockButton.disabled = true;
    if (playPauseBtn) playPauseBtn.disabled = true;
    if (scrubber) scrubber.style.pointerEvents = 'none';
    
    // Update keyframe buttons for playback mode
    for (let i = 0; i < 3; i++) {
        updateKeyframeButtonForPlayback(slot, i);
    }
    
    // Add playback mode class to module for styling
    const module = document.querySelector(`[data-slot="${slot}"]`);
    if (module) {
        module.classList.add('playback-mode');
    }
}

function showPlaybackOverlay(compositionName) {
    // Create fullscreen playback overlay that shows the full interface
    const overlay = document.createElement('div');
    overlay.id = 'playback-overlay';
    overlay.className = 'playback-overlay';
    overlay.innerHTML = `
        <div class="playback-header">
            <div class="playback-title">Playing: ${compositionName}</div>
            <button class="exit-playback-btn" onclick="exitPlayback()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
                Exit
            </button>
        </div>
        <div class="playback-status" id="playback-status">Loading videos...</div>
    `;
    
    document.body.appendChild(overlay);
    
    // Don't hide empty slots here - wait until videos are loaded
    
    // Hide the original app container and show it in playback mode
    const appContainer = document.querySelector('.app-container');
    appContainer.classList.add('playback-mode');
}

function startAutoPlayback(composition) {
    console.log('Starting auto-playback for composition:', composition.name);
    
    // Update status
    const status = document.querySelector('.playback-status');
    if (status) {
        status.textContent = 'Playing composition...';
    }
    
    // Start all videos at their leftmost keyframes
    videos.forEach((video, slot) => {
        if (video && previewPlayers[slot]) {
            // Find the leftmost keyframe for this video
            const leftmostKeyframe = video.keyframes.find(keyframe => keyframe !== null);
            if (leftmostKeyframe !== undefined && leftmostKeyframe !== null) {
                previewPlayers[slot].seekTo(leftmostKeyframe);
                if (mainPlayers[slot]) {
                    mainPlayers[slot].seekTo(leftmostKeyframe);
                }
            }
            
            // Start playing
            previewPlayers[slot].playVideo();
            if (mainPlayers[slot]) {
                mainPlayers[slot].playVideo();
            }
        }
    });
    
    // Start playback automation to replay recorded actions
    const playbackStartTime = Date.now();
    
    const autoPlaybackInterval = setInterval(() => {
        const elapsed = Date.now() - playbackStartTime;
        
        // Apply recorded actions at the correct times
        composition.sessions.forEach(session => {
            playbackRecordedActions(session, elapsed);
        });
        
        // Stop at 60 seconds and exit
        if (elapsed >= 60000) {
            clearInterval(autoPlaybackInterval);
            setTimeout(() => {
                exitPlayback();
            }, 1000); // Small delay before auto-exit
        }
    }, 100);
    
    // Store interval for cleanup
    window.currentAutoPlaybackInterval = autoPlaybackInterval;
}

function exitPlayback() {
    console.log('Exiting playback mode');
    
    // Stop any ongoing playback
    if (window.currentAutoPlaybackInterval) {
        clearInterval(window.currentAutoPlaybackInterval);
        window.currentAutoPlaybackInterval = null;
    }
    
    // Remove overlay
    const overlay = document.getElementById('playback-overlay');
    if (overlay) {
        overlay.remove();
    }
    
    // Show empty module slots again when exiting playback
    showEmptyModuleSlots();
    
    // Remove playback mode from app container
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        appContainer.classList.remove('playback-mode');
    }
    
    // Reset interface
    resetInterface();
}

function resetInterface() {
    console.log('Resetting interface...');
    
    // Clear all video slots
    videos.forEach((video, slot) => {
        if (video) {
            actuallyRemoveVideo(slot);
        }
    });
    
    // Clear the used URLs set to allow reusing videos
    usedUrls.clear();
    console.log('Cleared usedUrls set');
    
    // Reset recording data
    recordingSessions = [];
    currentSession = 0;
    hijackedControls.clear();
    isPlaybackMode = false;
    
    // Reset UI
    const recordBtn = document.getElementById('record-btn');
    recordBtn.textContent = 'Splice';
    recordBtn.disabled = false;
    
    // Hide save button until first recording session
    const saveBtn = document.getElementById('save-btn');
    saveBtn.style.display = 'none';
    saveBtn.disabled = true;
    
    // Show empty module slots again for new art piece creation
    showEmptyModuleSlots();
    
    // Remove recording-started attribute to show remove buttons again
    document.body.removeAttribute('data-recording-started');
    
    // Reset main preview
    updatePreviewComposite();
    
    console.log('Interface reset complete');
}

// =================== TIMESTAMP INPUT SYSTEM ===================
function showTimestampInput(slot) {
    if (!videos[slot] || videos[slot].locked || isRecording) return;
    
    const timeDisplay = document.getElementById(`current-time-${slot}`);
    if (!timeDisplay) return;
    
    // Check if already in edit mode
    const existingInput = document.getElementById(`timestamp-input-${slot}`);
    if (existingInput) {
        // If input already exists, apply the current value (like clicking again)
        if (existingInput.dataset.processing === 'false') {
            existingInput.dataset.processing = 'true';
            applyTimestampInput(slot);
        }
        return;
    }
    
    // Auto-pause the video when entering timestamp edit mode
    if (previewPlayers[slot]) {
        try {
            previewPlayers[slot].pauseVideo();
            // Update play button to show play icon
            updatePlayButtonState(slot, true);
        } catch (error) {
            console.log('Could not pause video for timestamp editing');
        }
    }
    if (mainPlayers[slot]) {
        try {
            mainPlayers[slot].pauseVideo();
        } catch (error) {
            console.log('Could not pause main player');
        }
    }
    
    // Get current time and format it
    const currentTime = videos[slot].currentTime || 0;
    const formattedTime = formatTime(currentTime);
    
    // Create input element 
    const input = document.createElement('input');
    input.type = 'text';
    input.value = ':'; // Start with just colon for clear input indication
    input.className = 'timestamp-input';
    input.id = `timestamp-input-${slot}`;
    input.placeholder = '0:00';
    input.title = 'Type digits to build time (e.g., type 125 for 1:25)';
    input.readOnly = true; // Prevent normal text input
    
    // Flag to prevent double processing
    input.dataset.processing = 'false';
    
    // Start in push-digit mode immediately
    input.dataset.pushMode = 'true';
    input.dataset.digits = '00000'; // Ready for digit input (MMMSS format for up to 999:59)
    
    // Handle keydown for push-digit system
    input.addEventListener('keydown', function(e) {
        e.preventDefault(); // Prevent all default behavior
        
        if (e.key === 'Enter') {
            if (this.dataset.processing === 'false') {
                this.dataset.processing = 'true';
                applyTimestampInput(slot);
            }
        } else if (e.key === 'Escape') {
            if (this.dataset.processing === 'false') {
                this.dataset.processing = 'true';
                cancelTimestampInput(slot);
            }
        } else if (e.key === 'Backspace') {
            if (this.dataset.pushMode === 'true') {
                // Remove rightmost digit (shift right and add zero on left)
                pushDigitRight(this);
            } else {
                // If not in push mode yet, cancel input
                if (this.dataset.processing === 'false') {
                    this.dataset.processing = 'true';
                    cancelTimestampInput(slot);
                }
            }
        } else if (/^[0-9]$/.test(e.key)) {
            // First digit entered - switch to push mode
            if (this.dataset.pushMode === 'false') {
                this.dataset.pushMode = 'true';
                this.dataset.digits = '00000'; // Reset to 0:00
                this.value = '0:00';
            }
            // Push new digit from the right
            pushDigitLeft(this, e.key);
        }
        // Ignore all other keys
    });
    
    // Add click listener to input itself for "click again to apply" behavior
    input.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.dataset.processing === 'false') {
            this.dataset.processing = 'true';
            applyTimestampInput(slot);
        }
    });
    
    // Prevent paste, cut, copy events
    input.addEventListener('paste', function(e) { e.preventDefault(); });
    input.addEventListener('cut', function(e) { e.preventDefault(); });
    input.addEventListener('copy', function(e) { e.preventDefault(); });
    
    // Replace time display with input
    timeDisplay.style.display = 'none';
    timeDisplay.parentElement.insertBefore(input, timeDisplay);
    
    // Focus the input
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length); // Cursor at end
    
    input.addEventListener('blur', function() {
        // Small delay to prevent race condition with Enter key
        setTimeout(() => {
            if (this.dataset.processing === 'false') {
                this.dataset.processing = 'true';
                applyTimestampInput(slot);
            }
        }, 10);
    });
    
    // Add listeners to other controls to auto-apply timestamp when clicked
    addTimestampAutoApplyListeners(slot);
}

function addTimestampAutoApplyListeners(slot) {
    // Get all interactive controls for this slot
    const controls = [
        `vol-${slot}`,      // Volume slider
        `opc-${slot}`,      // Opacity slider
        `play-pause-${slot}`, // Play/pause button
        `lock-${slot}`,     // Lock button
        `link-${slot}`,     // Link button
        `keyframe-${slot}-0`, `keyframe-${slot}-1`, `keyframe-${slot}-2`, // Keyframe buttons
        `scrubber-${slot}`  // Timeline scrubber
    ];
    
    controls.forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            // Add one-time event listener
            element.addEventListener('mousedown', function timestampAutoApply() {
                const input = document.getElementById(`timestamp-input-${slot}`);
                if (input && input.dataset.processing === 'false') {
                    input.dataset.processing = 'true';
                    applyTimestampInput(slot);
                }
                // Remove this listener after use
                element.removeEventListener('mousedown', timestampAutoApply);
            }, { once: true });
        }
    });
    
    // Also add listener for other slot controls
    for (let otherSlot = 0; otherSlot < 6; otherSlot++) {
        if (otherSlot !== slot) {
            const otherTimeDisplay = document.getElementById(`current-time-${otherSlot}`);
            if (otherTimeDisplay) {
                otherTimeDisplay.addEventListener('click', function timestampAutoApply() {
                    const input = document.getElementById(`timestamp-input-${slot}`);
                    if (input && input.dataset.processing === 'false') {
                        input.dataset.processing = 'true';
                        applyTimestampInput(slot);
                    }
                    // Remove this listener after use
                    otherTimeDisplay.removeEventListener('click', timestampAutoApply);
                }, { once: true });
            }
        }
    }
}

function pushDigitLeft(input, newDigit) {
    // Get current digits
    let digits = input.dataset.digits;
    
    // Shift all digits left and add new digit on the right
    digits = digits.substring(1) + newDigit;
    
    // Check for overflow (max 999:59)
    const minutes = parseInt(digits.substring(0, 3));
    const seconds = parseInt(digits.substring(3, 5));
    
    if (minutes > 999) {
        // Don't allow minutes > 999, keep previous state
        return;
    }
    
    if (seconds > 59) {
        // Don't allow seconds > 59, keep previous state
        return;
    }
    
    // Update stored digits
    input.dataset.digits = digits;
    
    // Update display
    updateTimestampDisplay(input);
}

function pushDigitRight(input) {
    // Get current digits
    let digits = input.dataset.digits;
    
    // Shift all digits right and add zero on the left
    digits = '0' + digits.substring(0, 4);
    
    // Update stored digits
    input.dataset.digits = digits;
    
    // Update display
    updateTimestampDisplay(input);
}

function updateTimestampDisplay(input) {
    const digits = input.dataset.digits;
    const minutes = digits.substring(0, 3);
    const seconds = digits.substring(3, 5);
    
    input.value = `${parseInt(minutes)}:${seconds}`;
}

function parseTimestampFromDigits(digits) {
    const minutes = parseInt(digits.substring(0, 3));
    const seconds = parseInt(digits.substring(3, 5));
    return (minutes * 60) + seconds;
}

function applyTimestampInput(slot) {
    const input = document.getElementById(`timestamp-input-${slot}`);
    const timeDisplay = document.getElementById(`current-time-${slot}`);
    
    if (!input || !timeDisplay || !videos[slot]) return;
    
    try {
        let newTime;
        
        if (input.dataset.pushMode === 'true') {
            // Use push-digit system
            const digits = input.dataset.digits;
            newTime = parseTimestampFromDigits(digits);
        } else {
            // No digits entered, keep current time (no change)
            newTime = videos[slot].currentTime || 0;
        }
        
        // Get actual video duration from player if available, fallback to stored duration
        let maxTime = videos[slot].duration || 0;
        if (previewPlayers[slot]) {
            try {
                const playerDuration = previewPlayers[slot].getDuration();
                if (playerDuration && playerDuration > 0) {
                    maxTime = playerDuration;
                    videos[slot].duration = playerDuration; // Update stored duration
                }
            } catch (error) {
                console.log('Could not get player duration');
            }
        }
        
        // If we still don't have a duration, don't clamp (allow any timestamp)
        let clampedTime;
        if (maxTime > 0) {
            // Clamp time to valid range (0 to video duration)
            clampedTime = Math.max(0, Math.min(newTime, maxTime));
            if (newTime > maxTime) {
                console.log(`Timestamp ${newTime}s exceeds video duration ${maxTime}s, going to video end`);
            }
        } else {
            // No duration available, use requested time as-is
            clampedTime = Math.max(0, newTime);
            console.log(`No video duration available, seeking to ${clampedTime}s`);
        }
        
        // Always seek if we have a valid time, regardless of current position
        if (clampedTime >= 0) {
            // Seek both players to the new time
            if (previewPlayers[slot] && !syncLocks[slot]) {
                syncLocks[slot] = true;
                previewPlayers[slot].seekTo(clampedTime);
                
                // Sync main player
                setTimeout(() => {
                    if (mainPlayers[slot]) {
                        try {
                            mainPlayers[slot].seekTo(clampedTime);
                        } catch (error) {
                            console.log('Could not seek main player');
                        }
                    }
                    // Release lock
                    setTimeout(() => {
                        syncLocks[slot] = false;
                    }, 100);
                }, 50);
            }
            
            // Update video data
            videos[slot].currentTime = clampedTime;
            
            console.log(`Jumped to timestamp ${clampedTime}s in slot ${slot} (requested ${newTime}s, video duration ${maxTime}s)`);
        } else {
            console.log(`Invalid timestamp for slot ${slot}`);
        }
        
    } catch (error) {
        console.log('Invalid timestamp format:', error);
    }
    
    // Restore time display
    cancelTimestampInput(slot);
}

function cancelTimestampInput(slot) {
    const input = document.getElementById(`timestamp-input-${slot}`);
    const timeDisplay = document.getElementById(`current-time-${slot}`);
    
    // Check if input still exists before trying to remove it
    if (input && input.parentElement) {
        try {
            input.remove();
        } catch (error) {
            console.log('Input already removed');
        }
    }
    
    if (timeDisplay) {
        timeDisplay.style.display = 'flex';
    }
}

// =================== STARFIELD ANIMATION ===================
let starfieldCanvas = null;
let starfieldCtx = null;
let stars = [];
let starfieldAnimationId = null;

// Starfield configuration
const STARFIELD_CONFIG = {
    numStars: 1200,
    speedFactor: 1.2,
    maxDepth: 1000,
    starBaseRadius: 1.5,
    starMinRadius: 0.2
};

function Star() {
    this.x = (Math.random() - 0.5) * starfieldCanvas.width * 2;
    this.y = (Math.random() - 0.5) * starfieldCanvas.height * 2;
    this.z = Math.random() * STARFIELD_CONFIG.maxDepth;

    this.reset = function() {
        this.x = (Math.random() - 0.5) * starfieldCanvas.width * 2;
        this.y = (Math.random() - 0.5) * starfieldCanvas.height * 2;
        this.z = STARFIELD_CONFIG.maxDepth;
    }

    this.update = function() {
        this.z -= STARFIELD_CONFIG.speedFactor;
        if (this.z < 1) {
            this.reset();
        }
    }

    this.draw = function() {
        const focalLength = starfieldCanvas.width / 2.5;
        const screenX = (this.x / this.z) * focalLength + starfieldCanvas.width / 2;
        const screenY = (this.y / this.z) * focalLength + starfieldCanvas.height / 2;
        const sizeFactor = Math.max(0, (STARFIELD_CONFIG.maxDepth - this.z) / STARFIELD_CONFIG.maxDepth);
        const radius = Math.max(STARFIELD_CONFIG.starMinRadius, sizeFactor * STARFIELD_CONFIG.starBaseRadius);
        const alpha = Math.min(1, sizeFactor * 1.5);

        if (screenX > 0 && screenX < starfieldCanvas.width &&
            screenY > 0 && screenY < starfieldCanvas.height &&
            radius > STARFIELD_CONFIG.starMinRadius) {
            starfieldCtx.beginPath();
            starfieldCtx.arc(screenX, screenY, radius, 0, Math.PI * 2);
            starfieldCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            starfieldCtx.fill();
        } else if (this.z < 1) {
            this.reset();
        }
    }
}

function initializeStarfield() {
    starfieldCanvas = document.getElementById('starfield-canvas');
    if (!starfieldCanvas) return;
    
    starfieldCtx = starfieldCanvas.getContext('2d');
    resizeStarfieldCanvas();
    initializeStars();
    animateStarfield();
}

function resizeStarfieldCanvas() {
    if (!starfieldCanvas) return;
    
    const rect = starfieldCanvas.parentElement.getBoundingClientRect();
    starfieldCanvas.width = rect.width;
    starfieldCanvas.height = rect.height;
    initializeStars();
}

function initializeStars() {
    if (!starfieldCanvas) return;
    
    stars = [];
    for (let i = 0; i < STARFIELD_CONFIG.numStars; i++) {
        stars.push(new Star());
    }
}

function animateStarfield() {
    if (!starfieldCanvas || !starfieldCtx) return;
    
    starfieldCtx.fillStyle = 'black';
    starfieldCtx.fillRect(0, 0, starfieldCanvas.width, starfieldCanvas.height);

    for (let i = 0; i < stars.length; i++) {
        stars[i].update();
        stars[i].draw();
    }
    
    starfieldAnimationId = requestAnimationFrame(animateStarfield);
}

function stopStarfield() {
    if (starfieldAnimationId) {
        cancelAnimationFrame(starfieldAnimationId);
        starfieldAnimationId = null;
    }
    
    // Remove starfield canvas
    if (starfieldCanvas) {
        starfieldCanvas.remove();
        starfieldCanvas = null;
        starfieldCtx = null;
    }
    
    // Remove welcome text
    const welcomeText = document.querySelector('.welcome-text');
    if (welcomeText) {
        welcomeText.remove();
    }
}

// Initialize starfield when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Small delay to ensure DOM is fully ready
    setTimeout(initializeStarfield, 100);
});

// Handle window resize for starfield
window.addEventListener('resize', () => {
    if (starfieldCanvas && starfieldAnimationId) {
        cancelAnimationFrame(starfieldAnimationId);
        resizeStarfieldCanvas();
        animateStarfield();
    }
});

function updateKeyframeButtonsLockState(slot, isLocked) {
    // Disable/enable keyframe buttons based on lock state
    for (let i = 0; i < 3; i++) {
        const keyframeBtn = document.getElementById(`keyframe-${slot}-${i}`);
        if (keyframeBtn) keyframeBtn.disabled = isLocked;
    }
}

function updateVolumeOpacityLinkVisual(slot) {
    const module = document.querySelector(`.video-module[data-slot="${slot}"]`);
    const videoObj = videos[slot];
    
    if (videoObj && videoObj.volumeOpacityLinked) {
        module.classList.add('vol-opc-linked');
    } else {
        module.classList.remove('vol-opc-linked');
    }
}

// Add throttling for volume updates to prevent crackling
let volumeUpdateTimeouts = {};

function updateAllPlayersVolume(slot, value) {
    // Clear any existing timeout for this slot
    if (volumeUpdateTimeouts[slot]) {
        clearTimeout(volumeUpdateTimeouts[slot]);
    }
    
    // Throttle the actual volume update to prevent crackling
    volumeUpdateTimeouts[slot] = setTimeout(() => {
        // Update preview player volume immediately for responsive feedback
        if (previewPlayers[slot]) {
            try {
                previewPlayers[slot].setVolume(value);
                
                // Mute/unmute based on volume level
                if (value > 0) {
                    previewPlayers[slot].unMute();
                } else {
                    previewPlayers[slot].mute();
                }
            } catch (error) {
                console.log('Error updating preview player volume:', error);
            }
        }
        
        // Update main player if it exists (keep muted)
        if (mainPlayers[slot]) {
            try {
                mainPlayers[slot].setVolume(0);
                mainPlayers[slot].mute();
            } catch (error) {
                console.log('Error updating main player volume:', error);
            }
        }
        
        delete volumeUpdateTimeouts[slot];
    }, 10); // Small delay to batch rapid changes
}

function updateAllLayersOpacity(slot, value) {
    // Update visual opacity immediately for responsive feedback
    const mainLayer = document.getElementById(`main-layer-${slot}`);
    if (mainLayer) {
        mainLayer.style.opacity = value / 100;
    }
}

// =================== THEME SYSTEM ===================
let currentTheme = localStorage.getItem('splice-theme') || 'dark';

function initializeTheme() {
    // Apply saved theme on page load
    document.body.setAttribute('data-theme', currentTheme);
    updateThemeIcon();
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('splice-theme', currentTheme);
    updateThemeIcon();
    console.log('Theme switched to:', currentTheme);
}

function updateThemeIcon() {
    const themeIcon = document.getElementById('theme-icon');
    if (!themeIcon) return;
    
    if (currentTheme === 'light') {
        // Moon icon for switching to dark mode
        themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
    } else {
        // Sun icon for switching to light mode
        themeIcon.innerHTML = `<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>`;
    }
}

// Initialize theme when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme after other DOM content is loaded
    setTimeout(initializeTheme, 100);
});

// =================== INITIALIZATION ===================
document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme system
    initializeTheme();
    
    // Auto-enter fullscreen for better viewing experience
    autoEnterFullscreen();
    
    // Initialize starfield in main preview
    initializeStarfield();
    
    // Initialize controls and event listeners
    setupEventListeners();
    
    // Listen for fullscreen changes (e.g., user presses ESC)
    document.addEventListener('fullscreenchange', () => {
        const isFullscreen = !!document.fullscreenElement;
        updateFullscreenIcon(isFullscreen);
        
        // Add or remove the fullscreen-active class
        if (isFullscreen) {
            document.body.classList.add('fullscreen-active');
        } else {
            document.body.classList.remove('fullscreen-active');
        }
    });
});
