# Development Guide

This guide covers the technical details for developers working on the YouTube Art Mixer project.

## 🏗️ Architecture Deep Dive

### Dual Player System

The core innovation of this application is the dual player architecture:

```
Each Video Slot Contains:
├── Preview Player (in module)
│   ├── Purpose: Timeline scrubbing and visual preview
│   ├── Audio: ALWAYS MUTED
│   ├── Controls: User-visible YouTube controls
│   └── Location: Small preview window in each module
│
└── Main Player (in composite)
    ├── Purpose: Final layered output and recording
    ├── Audio: Managed based on mode (preview vs recording)
    ├── Controls: Hidden from user
    └── Location: Large main preview area
```

### Audio Management Strategy

```javascript
// Simplified Audio Management (all modes)
previewPlayers[*] = MUTED (always - visual only)

mainPlayers[*] = {
    volume > 0: UNMUTED with individual volume levels
    volume = 0: MUTED
}

// Real-time volume control
updateVolume(slot, value) → {
    setVolume(value)
    if (value > 0) unmute()
    else mute()
}
```

### State Management

```javascript
// Global State
videos[] = Array of video objects (slots 0-5)
usedUrls = Set preventing duplicate videos
isRecording = Boolean recording state
currentRecording[] = Array of timestamped actions

// Player Instances
previewPlayers{} = Preview player objects
mainPlayers{} = Main composite player objects
updateIntervals{} = Timeline update intervals
```

## 🔧 Key Functions

### Video Loading Pipeline

```javascript
1. openModal(slot) → User clicks empty slot
2. addVideo() → Validates and extracts YouTube ID
3. loadVideoInSlot() → Creates video object and UI
4. createPlayers() → Sets up dual YouTube players
5. startTimelineUpdates() → Begins position tracking
```

### Recording System

```javascript
1. startRecording() → Initializes recording state
2. recordAction() → Captures every user interaction
3. Audio mode switch → All players unmuted for mixing
4. 60-second timer → Auto-stops recording
5. stopRecording() → Returns to preview mode
6. saveComposition() → Stores JSON timeline
```

### Player Synchronization

```javascript
// Both players start in synchronized paused state
previewPlayer.onReady → {
    seekTo(startTime)
    pauseVideo() // Ensures paused start
}

mainPlayer.onReady → {
    seekTo(startTime) 
    pauseVideo() // Ensures paused start
}

// Preview player controls main player during playback
previewPlayer.onStateChange → {
    if (PLAYING) {
        mainPlayer.seekTo(currentTime)
        mainPlayer.playVideo()
    }
    if (PAUSED) {
        mainPlayer.pauseVideo()
    }
}
```

## 🎨 CSS Architecture

### Styling Organization

```css
/* Base Styles */ - Reset and typography
/* Layout */ - App container and structure  
/* Main Preview */ - Large composite area
/* Countdown & Status */ - Timer and status text
/* Video Modules */ - Individual video controls
/* Timeline */ - Scrubbing and progress
/* Controls */ - Sliders and buttons
/* Modal */ - URL input dialog
/* Responsive */ - Mobile breakpoints
```

### Color Scheme

```css
:root {
    --bg-primary: #0a0a0a;    /* Deep black background */
    --bg-secondary: #1a1a1a;  /* Module backgrounds */
    --border: #333;           /* Default borders */
    --accent: #00bcd4;        /* Cyan accent (links) */
    --warning: #ffa726;       /* Orange (locks) */
    --danger: #ff4757;        /* Red (recording/remove) */
    --text: #ffffff;          /* Primary text */
    --text-dim: rgba(255,255,255,0.6); /* Secondary text */
}
```

## 🧪 Testing Strategy

### Manual Testing Checklist

**Video Loading:**
- [ ] YouTube URL validation works
- [ ] Duplicate prevention active
- [ ] Both players create successfully
- [ ] Timeline scrubbing responsive

**Audio Management:**
- [ ] Preview mode: only leftmost audio
- [ ] Recording mode: all audio mixed
- [ ] No audio doubling occurs
- [ ] Volume sliders affect correct players

**Recording System:**
- [ ] 60-second timer accurate
- [ ] All interactions captured
- [ ] Auto-stop works correctly
- [ ] Save functionality stores data

**Linking & Locking:**
- [ ] Link creates proportional scaling
- [ ] Lock prevents slider changes
- [ ] Visual feedback correct
- [ ] Recording captures state changes

### Performance Testing

```javascript
// Test with maximum load
const testUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=ZZ5LpwO-An4',
    // ... add 6 different videos
];

// Load all slots and test performance
testUrls.forEach((url, slot) => {
    setTimeout(() => loadVideoInSlot(slot, url), slot * 1000);
});
```

## 🐛 Debugging Guide

### Common Issues

**Players Not Loading:**
```javascript
// Check YouTube API ready state
console.log('YT Ready:', window.YT?.loaded);

// Check player creation
console.log('Preview Players:', Object.keys(previewPlayers));
console.log('Main Players:', Object.keys(mainPlayers));
```

**Audio Problems:**
```javascript
// Check mute states
Object.entries(mainPlayers).forEach(([slot, player]) => {
    try {
        console.log(`Slot ${slot} muted:`, player.isMuted());
        console.log(`Slot ${slot} volume:`, player.getVolume());
    } catch (e) {
        console.log(`Slot ${slot} not ready`);
    }
});
```

**Timeline Issues:**
```javascript
// Check update intervals
console.log('Active intervals:', Object.keys(updateIntervals));

// Monitor timeline updates
videos.forEach((video, slot) => {
    if (video) {
        console.log(`Slot ${slot} current time:`, video.currentTime);
    }
});
```

### Browser Compatibility

**Minimum Requirements:**
- ES6+ support (arrow functions, const/let)
- YouTube IFrame API support
- CSS Grid and Flexbox
- HTML5 audio/video APIs

**Known Issues:**
- Safari: May require user interaction before autoplay
- Firefox: Console warnings about permissions
- Chrome: Best performance and compatibility

## 📱 Mobile Considerations

### Current Limitations
- Timeline scrubbing requires precision clicking
- Small touch targets for sliders
- YouTube mobile restrictions

### Future Mobile Enhancements
```css
/* Touch-friendly controls */
@media (pointer: coarse) {
    .timeline-scrubber {
        height: 12px; /* Larger touch target */
    }
    
    .slider {
        height: 8px; /* Bigger sliders */
    }
    
    .control-btn {
        min-height: 44px; /* iOS minimum */
    }
}
```

## 🚀 Performance Optimization

### Current Optimizations
- 100ms timeline updates (smooth but not excessive)
- Player cleanup on video removal
- Muted preview players (no audio processing)
- CSS transitions for smooth UI

### Future Improvements
```javascript
// Lazy load main players
function createMainPlayerLazy(slot, videoId) {
    // Only create when first needed (recording or preview)
    if (isRecording || slot === 0) {
        createMainPlayer(slot, videoId);
    }
}

// Debounced slider updates
const debouncedVolumeUpdate = debounce(updateVolume, 50);
```

## 🔄 State Persistence

### Current Storage
- `window.savedArtPieces` array
- Browser memory only (lost on refresh)

### Future Persistence
```javascript
// Local Storage implementation
function saveToLocalStorage(composition) {
    const saved = JSON.parse(localStorage.getItem('artPieces') || '[]');
    saved.push(composition);
    localStorage.setItem('artPieces', JSON.stringify(saved));
}

// IndexedDB for larger compositions
function saveToIndexedDB(composition) {
    // Implementation for offline storage
}
```

## 📊 Analytics & Metrics

### Usage Tracking
```javascript
// Track composition creation
function trackComposition(composition) {
    analytics.track('Composition Created', {
        videoCount: composition.videos.length,
        duration: composition.duration,
        actionCount: composition.recording.length
    });
}

// Performance monitoring
function trackPerformance() {
    const timing = performance.timing;
    console.log('Page load time:', timing.loadEventEnd - timing.navigationStart);
}
```

## 🔐 Security Considerations

### Current Security
- Client-side only (no server vulnerabilities)
- YouTube API handles video validation
- No user authentication required

### Production Security
- Content Security Policy headers
- HTTPS requirement for YouTube API
- Input sanitization for video titles
- Rate limiting for API calls

---

## 🤝 Contributing Workflow

1. **Fork repository** and create feature branch
2. **Follow code style** (see existing patterns)
3. **Test thoroughly** with multiple videos
4. **Update documentation** if needed
5. **Submit pull request** with clear description

### Code Style Guidelines

**JavaScript:**
- Use descriptive function names
- Comment complex logic thoroughly
- Handle errors gracefully
- Use consistent variable naming

**CSS:**
- Organize by logical sections
- Use CSS custom properties for colors
- Mobile-first responsive design
- Consistent spacing patterns

**HTML:**
- Semantic markup
- Accessible attributes
- Clean structure
- Minimal inline styles 