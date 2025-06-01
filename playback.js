/* ===================================================================
 * YOUTUBE ART MIXER - PLAYBACK PAGE
 * ===================================================================
 * Dedicated playback experience for saved art pieces
 */

// =================== GLOBAL VARIABLES ===================
let currentArtPiece = null;
let videos = [];
let isPlaybackActive = false;
let playbackStartTime = 0;
let playbackCurrentTime = 0;
let playbackInterval = null;
let YTReady = false;

// YouTube player instances for playback
let mainPlayers = {};
let previewPlayers = {};
let updateIntervals = {};

// Playback state
let compositionDuration = 60000; // 60 seconds
let currentPlaybackVolumes = {}; // Track current volumes for smooth transitions

// =================== THEME SYSTEM ===================
let currentTheme = localStorage.getItem('splice-theme') || 'dark';

// =================== INITIALIZATION ===================
document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme system
    initializeTheme();
    
    // Auto-enter fullscreen for better viewing experience
    autoEnterFullscreen();
    
    // Load art piece from sessionStorage
    loadArtPieceForPlayback();
    
    // Initialize fullscreen functionality
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

// Called automatically when YouTube API loads
function onYouTubeIframeAPIReady() {
    YTReady = true;
    console.log('YouTube API Ready for playback');
    
    // If we have an art piece waiting, load it now
    if (currentArtPiece) {
        setupPlaybackInterface();
    }
}

// =================== ART PIECE LOADING ===================
function loadArtPieceForPlayback() {
    try {
        const artPieceData = sessionStorage.getItem('currentArtPiece');
        if (artPieceData) {
            currentArtPiece = JSON.parse(artPieceData);
            console.log('Loaded art piece for playback:', currentArtPiece.name);
            console.log('Art piece sessions:', currentArtPiece.sessions);
            
            // Update page title (element might not exist, so check first)
            const titleElement = document.getElementById('playback-title');
            if (titleElement) {
                titleElement.textContent = currentArtPiece.name;
            }
            document.title = `YouTube Art Mixer - ${currentArtPiece.name}`;
            
            // If YouTube API is ready, setup immediately
            if (YTReady) {
                setupPlaybackInterface();
            }
        } else {
            console.error('No art piece found in sessionStorage');
            showError('Art piece not found. Please select an art piece from the gallery.');
        }
    } catch (error) {
        console.error('Error loading art piece:', error);
        showError('Error loading art piece. Please try again.');
    }
}

function setupPlaybackInterface() {
    if (!currentArtPiece || !YTReady) return;
    
    // Clear any error messages since we're loading successfully
    hideError();
    
    // Reset interface
    videos = [];
    
    // Load videos from art piece
    currentArtPiece.videos.forEach((videoData, index) => {
        if (videoData && videoData.url) {
            loadVideoForPlayback(index, videoData);
        }
    });
    
    // Hide empty module slots (only show modules with videos)
    hideEmptyModuleSlots();
    
    // Hide loading state
    const loadingState = document.getElementById('loading-state');
    if (loadingState) {
        loadingState.style.display = 'none';
    }
    
    // Initialize playback controls
    initializePlaybackControls();
    
    // Show fullscreen modal instead of auto-starting playback
    setTimeout(() => {
        showPlaybackFullscreenModal();
    }, 500); // Give players time to be ready
    
    console.log('Playback interface setup complete - showing fullscreen modal');
}

function loadVideoForPlayback(slot, videoData) {
    // Create video data object
    const video = {
        slot: slot,
        url: videoData.url,
        videoId: videoData.videoId,
        title: videoData.title || 'Unknown Video',
        duration: videoData.duration || 0,
        currentTime: 0,
        keyframes: videoData.keyframes || [null, null, null],
        volume: 50,
        opacity: 100
    };
    
    videos[slot] = video;
    console.log(`Loading video ${slot}:`, video);
    console.log(`Video ${slot} keyframes:`, video.keyframes);
    
    // Update UI
    updateVideoModuleForPlayback(slot, video);
    
    // Create players
    createPlaybackPlayers(slot, video.videoId);
}

function updateVideoModuleForPlayback(slot, video) {
    const module = document.querySelector(`[data-slot="${slot}"]`);
    if (!module) return;
    
    module.className = 'video-module filled playback-mode';
    module.innerHTML = `
        <div class="video-preview" id="preview-${slot}"></div>
        <div class="video-info">
            <div class="current-time" id="current-time-${slot}">0:00</div>
            <div class="keyframe-controls">
                ${video.keyframes.map((time, index) => 
                    `<button class="keyframe-btn ${time !== null ? 'filled' : 'empty'} playback-readonly" 
                            id="keyframe-${slot}-${index}" 
                            disabled>
                        ${time !== null ? `<span class="keyframe-time">${formatTime(time)}</span>` : '<span class="keyframe-plus">+</span>'}
                    </button>`
                ).join('')}
            </div>
            <div class="timeline-scrubber" id="scrubber-${slot}">
                <div class="timeline-progress" id="progress-${slot}"></div>
                <div class="timeline-thumb" id="thumb-${slot}"></div>
            </div>
            <div class="control-row">
                <span class="control-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                </span>
                <input type="range" 
                       class="slider" 
                       id="volume-${slot}" 
                       min="0" 
                       max="100" 
                       value="${video.volume}"
                       disabled>
            </div>
            <div class="control-row">
                <span class="control-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                        <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.8"/>
                        <circle cx="12" cy="12" r="2" fill="currentColor"/>
                    </svg>
                </span>
                <input type="range" 
                       class="slider" 
                       id="opacity-${slot}" 
                       min="0" 
                       max="100" 
                       value="${video.opacity}"
                       disabled>
            </div>
        </div>
    `;
    
    // Initialize current volumes for smooth playback
    currentPlaybackVolumes[slot] = video.volume;
}

function createPlaybackPlayers(slot, videoId) {
    // Determine starting position from leftmost keyframe
    const leftmostKeyframe = videos[slot].keyframes.find(k => k !== null);
    const startTime = leftmostKeyframe !== undefined && leftmostKeyframe !== null ? leftmostKeyframe : 0;
    
    console.log(`Creating players for slot ${slot} starting at ${startTime}s`);
    
    // Create preview player (small, in module) - ready but not playing
    previewPlayers[slot] = new YT.Player(`preview-${slot}`, {
        videoId: videoId,
        width: '100%',
        height: '100%',
        playerVars: {
            autoplay: 0, // Wait for user to choose fullscreen option
            controls: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            mute: 1, // Preview players are always muted
            loop: 0,
            start: Math.floor(startTime) // Ready at the correct position
        },
        events: {
            onReady: function(event) {
                console.log(`Preview player ${slot} ready, starting at ${startTime}s`);
                event.target.setVolume(0); // Ensure muted
                
                // Get video duration
                videos[slot].duration = event.target.getDuration();
                
                // Update timeline display to show starting position
                updateTimelineDisplayForPlayback(slot, startTime);
                
                // Start timeline updates for this video
                startTimelineUpdatesForPlayback(slot);
            },
            onError: function(event) {
                console.error(`Preview player ${slot} error:`, event.data);
            }
        }
    });
    
    // Create main player (large, in composite) - ready but not playing
    const mainPlayerDiv = document.createElement('div');
    mainPlayerDiv.id = `main-player-${slot}`;
    mainPlayerDiv.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: ${videos[slot].opacity / 100};
        z-index: ${slot + 1};
        pointer-events: none;
    `;
    
    document.getElementById('preview-content').appendChild(mainPlayerDiv);
    
    mainPlayers[slot] = new YT.Player(`main-player-${slot}`, {
        videoId: videoId,
        width: '100%',
        height: '100%',
        playerVars: {
            autoplay: 0, // Wait for user to choose fullscreen option
            controls: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            mute: 0,
            loop: 0,
            start: Math.floor(startTime) // Ready at the correct position
        },
        events: {
            onReady: function(event) {
                console.log(`Main player ${slot} ready, starting at ${startTime}s`);
                
                // Unmute main players for audio playback
                event.target.unMute();
                event.target.setVolume(videos[slot].volume);
                
                // Initialize current volume tracking
                currentPlaybackVolumes[slot] = videos[slot].volume;
            },
            onError: function(event) {
                console.error(`Main player ${slot} error:`, event.data);
            }
        }
    });
}

// =================== PLAYBACK CONTROLS ===================
function initializePlaybackControls() {
    // Reset scrubber
    const scrubber = document.getElementById('playback-scrubber');
    if (scrubber) {
        scrubber.value = 0;
    }
    
    // Reset time display
    updatePlaybackTimeDisplay(0);
    
    // Ensure play button shows play state
    const playBtn = document.getElementById('overlay-play-btn');
    if (playBtn) {
        playBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
        `;
    }
}

function togglePlayback() {
    if (isPlaybackActive) {
        pausePlayback();
    } else {
        startPlayback();
    }
}

function startPlayback() {
    if (!currentArtPiece || isPlaybackActive) return;
    
    console.log('Starting art piece playback');
    isPlaybackActive = true;
    playbackStartTime = Date.now() - playbackCurrentTime;
    
    // Update UI
    const playBtn = document.getElementById('overlay-play-btn');
    if (playBtn) {
        playBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
        `;
    }
    
    // Start all players
    Object.keys(mainPlayers).forEach(slot => {
        if (mainPlayers[slot] && mainPlayers[slot].playVideo) {
            mainPlayers[slot].playVideo();
        }
        if (previewPlayers[slot] && previewPlayers[slot].playVideo) {
            previewPlayers[slot].playVideo();
        }
    });
    
    // Start playback loop
    playbackInterval = setInterval(() => {
        updatePlaybackTime();
    }, 50); // 20fps for smooth updates
}

function pausePlayback() {
    if (!isPlaybackActive) return;
    
    console.log('Pausing art piece playback');
    isPlaybackActive = false;
    
    // Clear interval
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    
    // Update UI
    const playBtn = document.getElementById('overlay-play-btn');
    if (playBtn) {
        playBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
        `;
    }
    
    // Pause all players
    Object.keys(mainPlayers).forEach(slot => {
        if (mainPlayers[slot] && mainPlayers[slot].pauseVideo) {
            mainPlayers[slot].pauseVideo();
        }
        if (previewPlayers[slot] && previewPlayers[slot].pauseVideo) {
            previewPlayers[slot].pauseVideo();
        }
    });
}

function updatePlaybackTime() {
    if (!isPlaybackActive) return;
    
    playbackCurrentTime = Date.now() - playbackStartTime;
    
    // Stop at 60 seconds and show completion modal
    if (playbackCurrentTime >= compositionDuration) {
        playbackCurrentTime = compositionDuration;
        pausePlayback();
        showCompletionModal();
        return;
    }
    
    // Update displays
    updatePlaybackTimeDisplay(playbackCurrentTime);
    
    // Apply recorded data
    applyRecordedDataAtTime(playbackCurrentTime);
}

function scrubPlayback(timeMs) {
    const newTime = parseInt(timeMs);
    playbackCurrentTime = newTime;
    
    if (isPlaybackActive) {
        playbackStartTime = Date.now() - newTime;
    }
    
    // Seek all players
    Object.keys(mainPlayers).forEach(slot => {
        if (mainPlayers[slot] && mainPlayers[slot].seekTo) {
            mainPlayers[slot].seekTo(newTime / 1000);
        }
        if (previewPlayers[slot] && previewPlayers[slot].seekTo) {
            previewPlayers[slot].seekTo(newTime / 1000);
        }
    });
    
    // Update display
    updatePlaybackTimeDisplay(newTime);
    
    // Apply recorded data
    applyRecordedDataAtTime(newTime);
}

function updatePlaybackTimeDisplay(timeMs) {
    const scrubber = document.getElementById('overlay-scrubber');
    const timeDisplay = document.getElementById('overlay-time');
    
    if (scrubber) {
        scrubber.value = timeMs;
        
        // Update the progress CSS custom property for the blue fill
        const progress = (timeMs / compositionDuration) * 100;
        scrubber.style.setProperty('--progress', `${Math.min(100, Math.max(0, progress))}%`);
    }
    
    if (timeDisplay) {
        const current = formatTime(timeMs / 1000);
        timeDisplay.textContent = current;
    }
}

// =================== RECORDED DATA PLAYBACK ===================
function applyRecordedDataAtTime(currentTime) {
    if (!currentArtPiece || !currentArtPiece.sessions) return;
    
    // Apply data from all sessions
    currentArtPiece.sessions.forEach((session, sessionIndex) => {
        playbackSessionData(session, currentTime);
    });
}

function playbackSessionData(session, currentTime) {
    if (!session || !session.controlData) return;
    
    Object.keys(session.controlData).forEach(slot => {
        const slotData = session.controlData[slot];
        const slotNum = parseInt(slot);
        
        // Apply volume data with smooth interpolation
        if (slotData.volume && mainPlayers[slotNum]) {
            playbackVolumeData(slotNum, slotData.volume, currentTime);
        }
        
        // Apply opacity data
        if (slotData.opacity && mainPlayers[slotNum]) {
            playbackOpacityData(slotNum, slotData.opacity, currentTime);
        }
        
        // Apply timestamp data (keyframe button highlighting)
        if (slotData.timestamps) {
            playbackTimestampData(slotNum, slotData.timestamps, currentTime);
        }
    });
}

function playbackVolumeData(slot, volumeData, currentTime) {
    if (!volumeData.length) return;
    
    // Find the closest recorded point
    let targetVolume = volumeData[0].value;
    for (let i = 0; i < volumeData.length; i++) {
        if (volumeData[i].timestamp <= currentTime) {
            targetVolume = volumeData[i].value;
        } else {
            break;
        }
    }
    
    // Apply smooth volume transition
    applyVolumeSmooth(slot, targetVolume);
    
    // Update UI slider
    const volumeSlider = document.getElementById(`volume-${slot}`);
    if (volumeSlider) volumeSlider.value = targetVolume;
}

function applyVolumeSmooth(slot, targetVolume) {
    if (!mainPlayers[slot]) return;
    
    // Skip volume changes if currently seeking (but for a shorter time)
    if (window.seekingSlots && window.seekingSlots.has(slot)) {
        return;
    }
    
    // Initialize current volume if not set
    if (currentPlaybackVolumes[slot] === undefined) {
        currentPlaybackVolumes[slot] = 50; // Default volume
    }
    
    const currentVolume = currentPlaybackVolumes[slot];
    const volumeDiff = Math.abs(targetVolume - currentVolume);
    
    // Apply volume changes more directly to reduce processing overhead during seeks
    try {
        if (mainPlayers[slot] && mainPlayers[slot].setVolume) {
            // Use smaller steps for large changes, but apply more frequently
            if (volumeDiff <= 5) {
                // Small changes - apply directly
                mainPlayers[slot].setVolume(targetVolume);
                currentPlaybackVolumes[slot] = targetVolume;
            } else {
                // Larger changes - use smaller steps
                const step = Math.min(3, volumeDiff);
                const nextVolume = currentVolume + (targetVolume > currentVolume ? step : -step);
                const clampedVolume = targetVolume > currentVolume ? 
                    Math.min(nextVolume, targetVolume) : 
                    Math.max(nextVolume, targetVolume);
                
                mainPlayers[slot].setVolume(clampedVolume);
                currentPlaybackVolumes[slot] = clampedVolume;
            }
        }
    } catch (error) {
        // Silently handle player state errors during seeks
    }
}

function playbackOpacityData(slot, opacityData, currentTime) {
    if (!opacityData.length) return;
    
    // Find the closest recorded point
    let targetOpacity = opacityData[0].value;
    for (let i = 0; i < opacityData.length; i++) {
        if (opacityData[i].timestamp <= currentTime) {
            targetOpacity = opacityData[i].value;
        } else {
            break;
        }
    }
    
    // Apply opacity to main player
    const mainPlayerDiv = document.getElementById(`main-player-${slot}`);
    if (mainPlayerDiv) {
        mainPlayerDiv.style.opacity = targetOpacity / 100;
    }
    
    // Update UI slider
    const opacitySlider = document.getElementById(`opacity-${slot}`);
    if (opacitySlider) opacitySlider.value = targetOpacity;
}

function playbackTimestampData(slot, timestampData, currentTime) {
    if (!timestampData.length) return;
    
    // Check if any keyframe should be highlighted at this time
    timestampData.forEach(entry => {
        if (Math.abs(entry.timestamp - currentTime) < 200) { // Within 200ms
            const btn = document.getElementById(`keyframe-${slot}-${entry.keyframeIndex}`);
            if (btn) {
                // Flash orange briefly
                btn.classList.add('playback-active');
                setTimeout(() => {
                    btn.classList.remove('playback-active');
                }, 400);
            }
            
            // If it was a jump action, perform smooth seek with debouncing
            if (entry.action === 'jump' && entry.time !== null) {
                const seekKey = `${slot}-${entry.time}`;
                
                // Debounce rapid seeks to the same position
                if (window.lastSeekTime && window.lastSeekTime[seekKey]) {
                    const timeSinceLastSeek = Date.now() - window.lastSeekTime[seekKey];
                    if (timeSinceLastSeek < 500) { // Prevent seeks within 500ms
                        return;
                    }
                }
                
                // Initialize seek tracking
                if (!window.lastSeekTime) {
                    window.lastSeekTime = {};
                }
                
                window.lastSeekTime[seekKey] = Date.now();
                
                console.log(`Jumping video ${slot} to timestamp ${entry.time}s`);
                
                // Use smooth seeking to prevent stutter
                performSmoothSeek(slot, entry.time);
            }
        }
    });
}

function performSmoothSeek(slot, targetTime) {
    // Prevent multiple simultaneous seeks on the same slot
    if (window.seekingSlots && window.seekingSlots.has(slot)) {
        return;
    }
    
    // Initialize seeking slots tracker
    if (!window.seekingSlots) {
        window.seekingSlots = new Set();
    }
    
    window.seekingSlots.add(slot);
    
    // Seek both players simultaneously without pausing to avoid YouTube overlays
    if (previewPlayers[slot] && previewPlayers[slot].seekTo) {
        previewPlayers[slot].seekTo(targetTime, true);
    }
    
    if (mainPlayers[slot] && mainPlayers[slot].seekTo) {
        mainPlayers[slot].seekTo(targetTime, true);
    }
    
    // Update timeline display immediately
    updateTimelineDisplayForPlayback(slot, targetTime);
    
    // Clear seeking lock after a brief moment
    setTimeout(() => {
        window.seekingSlots.delete(slot);
    }, 100); // Short delay just to prevent rapid successive seeks
}

// =================== ERROR HANDLING ===================
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.id = 'playback-error';
    errorDiv.style.display = 'block';
    errorDiv.innerHTML = `
        <div class="error-content">
            <h3>Error</h3>
            <p>${message}</p>
            <a href="index.html" class="error-btn">Return to Gallery</a>
        </div>
    `;
    
    // Remove any existing error message first
    hideError();
    
    document.body.appendChild(errorDiv);
}

function hideError() {
    const existingError = document.getElementById('playback-error');
    if (existingError) {
        existingError.remove();
    }
}

// =================== UTILITY FUNCTIONS ===================
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// =================== FULLSCREEN FUNCTIONS ===================
function enterFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            updateFullscreenIcon(true);
            document.body.classList.add('fullscreen-active');
            console.log('Entered fullscreen mode');
        }).catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    }
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
        const textSpan = btn.querySelector('span');
        const textContent = textSpan ? textSpan.textContent : 'Full Screen';
        
        if (isFullscreen) {
            // Show "exit fullscreen" icon and update text
            btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
                <span>Exit Full</span>
            `;
            btn.title = "Exit Fullscreen";
        } else {
            // Show "enter fullscreen" icon and restore original text
            btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
                <span>Full Screen</span>
            `;
            btn.title = "Toggle Fullscreen";
        }
    }
}

// =================== TIMELINE UPDATES FOR PLAYBACK ===================
function startTimelineUpdatesForPlayback(slot) {
    if (updateIntervals[slot]) {
        clearInterval(updateIntervals[slot]);
    }

    updateIntervals[slot] = setInterval(() => {
        if (previewPlayers[slot] && previewPlayers[slot].getCurrentTime) {
            try {
                const currentTime = previewPlayers[slot].getCurrentTime();
                updateTimelineDisplayForPlayback(slot, currentTime);
            } catch (error) {
                // Player not ready yet
            }
        }
    }, 100); // Update every 100ms for smooth timeline
}

function updateTimelineDisplayForPlayback(slot, currentTime) {
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
        
        // Update current time display to show actual video time
        const currentTimeDisplay = document.getElementById(`current-time-${slot}`);
        if (currentTimeDisplay) {
            currentTimeDisplay.textContent = formatTime(currentTime);
        }
        
        // Store the current time in the video object
        videos[slot].currentTime = currentTime;
    }
}

// Show completion modal when playback finishes
function showCompletionModal() {
    const modal = document.getElementById('completion-modal');
    if (modal) {
        modal.style.display = 'flex';
        
        // Add click outside to close functionality
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideCompletionModal();
            }
        });
    }
}

// Hide completion modal
function hideCompletionModal() {
    const modal = document.getElementById('completion-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Replay the art piece from the beginning
function replayArtPiece() {
    hideCompletionModal();
    
    // Reset playback state
    playbackCurrentTime = 0;
    isPlaybackActive = false;
    
    // Clear any existing intervals
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    
    // Reset overlay controls
    const overlayTime = document.getElementById('overlay-time');
    const overlayScrubber = document.getElementById('overlay-scrubber');
    if (overlayTime) overlayTime.textContent = '0:00';
    if (overlayScrubber) overlayScrubber.value = 0;
    
    // Update play button to show play icon
    const playBtn = document.getElementById('overlay-play-btn');
    if (playBtn) {
        playBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
        `;
    }
    
    // Reset all players to start and re-initialize
    setTimeout(() => {
        startPlayback();
    }, 500);
}

// =================== THEME SYSTEM ===================
function initializeTheme() {
    // Apply theme to body
    document.body.setAttribute('data-theme', currentTheme);
    
    // Update theme icon and text
    updateThemeIcon();
    updateThemeText();
    
    console.log('Theme initialized:', currentTheme);
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // Apply theme to body
    document.body.setAttribute('data-theme', currentTheme);
    
    // Save to localStorage
    localStorage.setItem('splice-theme', currentTheme);
    
    // Update icon and text
    updateThemeIcon();
    updateThemeText();
    
    console.log('Theme toggled to:', currentTheme);
}

function updateThemeIcon() {
    const themeIcon = document.getElementById('theme-icon');
    if (!themeIcon) return;
    
    if (currentTheme === 'light') {
        // Moon icon for dark mode toggle
        themeIcon.innerHTML = `<path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"/>`;
    } else {
        // Sun icon for light mode toggle
        themeIcon.innerHTML = `<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>`;
    }
}

function updateThemeText() {
    const themeText = document.getElementById('theme-text');
    if (themeText) {
        themeText.textContent = currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
}

function hideEmptyModuleSlots() {
    console.log('Hiding empty module slots - only showing modules with videos...');
    for (let slot = 0; slot < 6; slot++) {
        if (!videos[slot]) {
            const module = document.querySelector(`[data-slot="${slot}"]`);
            if (module && module.classList.contains('empty')) {
                module.style.display = 'none';
                console.log(`Hidden empty module slot ${slot}`);
            }
        }
    }
}

// =================== PLAYBACK MODAL ===================
function createPlaybackFullscreenModal() {
    // Check if modal already exists
    if (document.getElementById('fullscreen-recommendation-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'fullscreen-recommendation-modal';
    modal.className = 'fullscreen-modal';
    
    modal.innerHTML = `
        <div class="fullscreen-modal-content">
            <h2 class="fullscreen-modal-title">Go fullscreen for best experience?</h2>
            <div class="fullscreen-modal-buttons">
                <button class="fullscreen-modal-btn accept" onclick="acceptPlaybackFullscreen()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    <span>Yes</span>
                </button>
                <button class="fullscreen-modal-btn decline" onclick="declinePlaybackFullscreen()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                    <span>No</span>
                </button>
            </div>
        </div>
    `;
    
    // Append to main preview area
    const mainPreview = document.querySelector('.main-preview');
    if (mainPreview) {
        mainPreview.appendChild(modal);
    }
}

function showPlaybackFullscreenModal() {
    // Don't show if already in fullscreen
    if (document.fullscreenElement) {
        // Still start playback even if modal not shown
        startAutomaticPlayback();
        return;
    }
    
    createPlaybackFullscreenModal();
    const modal = document.getElementById('fullscreen-recommendation-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hidePlaybackFullscreenModal() {
    const modal = document.getElementById('fullscreen-recommendation-modal');
    if (modal) {
        modal.style.display = 'none';
        // Remove modal after animation
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 500);
    }
}

function acceptPlaybackFullscreen() {
    hidePlaybackFullscreenModal();
    
    // Enter fullscreen first
    enterFullscreen();
    
    // Then start playback
    setTimeout(() => {
        startAutomaticPlayback();
    }, 500);
}

function declinePlaybackFullscreen() {
    hidePlaybackFullscreenModal();
    
    // Start playback without fullscreen
    startAutomaticPlayback();
}

function startAutomaticPlayback() {
    // Start playback if we haven't already
    if (!isPlaybackActive) {
        startPlayback();
    }
} 