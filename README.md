# YouTube Art Mixer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

> Create 60-second video art compositions by layering YouTube videos with real-time volume and opacity control

## 🎯 Overview

**YouTube Art Mixer** is a constraint-based creative tool that allows artists to compose unique video art pieces by layering up to 6 YouTube videos simultaneously. Each composition is exactly 60 seconds long and captures every real-time adjustment as a recorded performance.

### ✨ Key Features

- **6-Video Layering**: Stack videos with Photoshop-style transparency blending
- **Dual Player System**: Independent timeline scrubbing and live composition
- **Real-Time Recording**: Capture every slider movement with precise timestamps
- **Audio Management**: Smart audio mixing prevents doubling while preserving creative control
- **Constraint-Based Design**: 60-second limit encourages focused, intentional art
- **Live Performance Recording**: No pausing during recording - pure human expression

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Local web server (required for YouTube API)

### Installation

1. **Clone or download** this repository
2. **Start a local server** using one of these methods:

   **Using VS Code:**
   ```bash
   # Install Live Server extension, then right-click index.html → "Open with Live Server"
   ```

   **Using Python:**
   ```bash
   python -m http.server 8000
   # Open http://localhost:8000
   ```

   **Using Node.js:**
   ```bash
   npx serve .
   # Open http://localhost:3000
   ```

   **Using Cursor:**
   ```bash
   # Built-in server available through Cursor interface
   ```

3. **Open in browser** at the localhost URL
4. **Start creating!** Add YouTube videos and begin mixing

## 🎨 How to Use

### Adding Videos
1. Click any empty video slot (+ icon)
2. Paste a YouTube URL
3. Video loads with timeline scrubbing controls

### Composition Setup
- **Volume sliders**: Control individual audio levels
- **Opacity sliders**: Adjust layer transparency
- **Timeline scrubbing**: Click anywhere to jump to that time
- **Link button**: Sync multiple sliders proportionally
- **Lock button**: Prevent accidental changes during performance

### Recording Performance
1. Set up your 6 videos with desired start points
2. Click **"● Start Recording"**
3. 60-second countdown begins
4. Adjust sliders in real-time - every movement is captured
5. Recording auto-stops at 60 seconds
6. Save your art piece with a custom name

### Keyboard Shortcuts
- **Spacebar**: Play all preview videos (when not recording)
- **Escape**: Pause all videos

## 🏗️ Technical Architecture

### Dual Player System
Each video slot contains **two YouTube players**:

- **Preview Player** (in module): Timeline scrubbing, always muted, user controls playback
- **Main Player** (in composite): Final output, audio-enabled, syncs with preview player

**Synchronized Behavior**: Both players start paused and stay perfectly synchronized. When you press play on the preview player, both players start together. When you pause, both pause together.

### Audio Management
```
All modes: Videos with volume > 0 play audio, videos with volume = 0 are muted
Real-time mixing: Adjust any video's volume to immediately hear the change
Volume control: Each video's audio level controlled independently
Perfect mixing: Hear exactly what you'll record during composition
```

### Layer System
- Videos stack left-to-right (rightmost = top layer)
- Z-index based on slot number
- Real-time opacity blending

### Data Structure
```javascript
videos[slot] = {
    url: "YouTube URL",
    videoId: "YouTube video ID", 
    startTime: 0,
    endTime: 60,
    volume: 50,          // 0-100
    opacity: 100,        // 0-100
    linked: false,       // Linked to other sliders
    locked: false,       // Controls locked during performance
    title: "Video 1",
    duration: 0,
    currentTime: 0
}
```

## 🛠️ Development

### Project Structure
```
youtube-art-mixer/
├── index.html          # Main HTML structure
├── styles.css          # All styling (dark theme)
├── script.js           # Complete application logic
├── README.md           # This file
├── .gitignore          # Git ignore rules
└── LICENSE             # MIT license
```

### Development Workflow

1. **Make changes** to HTML, CSS, or JS files
2. **Refresh browser** to see updates
3. **Use browser dev tools** for debugging
4. **Test with real YouTube URLs** for best results

### Code Organization

**HTML**: Clean semantic structure with external resources
**CSS**: Organized into logical sections with comprehensive comments
**JavaScript**: Modular functions with detailed architecture documentation

## 🐛 Known Issues & Console Messages

### Expected Console Messages (Harmless)

When you open the browser console, you may see these messages - **they are completely normal and don't affect functionality**:

#### ✅ Ad Blocker Messages (Normal)
```
ERR_BLOCKED_BY_CLIENT googleads.g.doubleclick.net/pagead/id
```
- **Cause**: Ad blockers (uBlock Origin, AdBlock Plus, etc.) blocking Google ads
- **Impact**: None - actually beneficial as it prevents ads
- **Action**: No action needed, this is working as intended

#### ✅ Success Messages (Good!)
```
YouTube API Ready
Preview player 0 ready
Main player 0 ready
```
- **Meaning**: Everything is working correctly
- **What to look for**: These messages confirm the app loaded successfully

#### ⚠️ Occasional Warnings (Harmless)
```
YouTube iframe API permissions policy violations
PostMessage origin warnings
```
- **Cause**: YouTube's security restrictions in development mode
- **Impact**: None - videos still work perfectly
- **Action**: These will resolve when deployed to production

### Performance Notes
- Tested with 6 simultaneous videos
- May experience lag on older devices
- Optimized for desktop browsers

## 🚗 Roadmap

### Phase 1: Core Improvements
- [ ] Session playback system
- [ ] Gallery view for saved pieces
- [ ] Export/import functionality
- [ ] Mobile touch controls

### Phase 2: Enhanced Features  
- [ ] Visual effects and filters
- [ ] Audio effects (reverb, delay)
- [ ] Drag-and-drop reordering
- [ ] Preset starting positions

### Phase 3: Social Features
- [ ] URL-based sharing
- [ ] Community gallery
- [ ] Remix functionality
- [ ] Weekly challenges

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- YouTube IFrame API for video playback
- Modern web standards for canvas layering
- Constraint-based design philosophy
- Open source community

---

**Start creating unique video art compositions today!** 🎬✨ 