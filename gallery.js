/* ===================================================================
 * SPLICE - GALLERY PAGE
 * ===================================================================
 * Homepage for browsing and selecting saved cuts
 */

// =================== GLOBAL VARIABLES ===================
let savedCuts = [];

// =================== THEME SYSTEM ===================
let currentTheme = localStorage.getItem('splice-theme') || 'dark';

// =================== PAGE INITIALIZATION ===================
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
    loadSavedCuts();
    displayCuts();
    
    // Initialize drag-and-drop functionality
    initializeDragAndDrop();
    
    // Mark gallery button as current page
    const galleryBtn = document.getElementById('gallery-btn');
    if (galleryBtn) {
        galleryBtn.classList.add('current-page');
        galleryBtn.onclick = null; // Remove click handler
        galleryBtn.style.cursor = 'default';
    }
    
    // Initialize fullscreen functionality
    document.addEventListener('fullscreenchange', () => {
        updateFullscreenIcon(!!document.fullscreenElement);
    });
});

// =================== LOCAL STORAGE MANAGEMENT ===================
function loadSavedCuts() {
    try {
        const saved = localStorage.getItem('youtubeMixerArtPieces');
        if (saved) {
            savedCuts = JSON.parse(saved);
            console.log('Loaded', savedCuts.length, 'saved cuts');
        }
    } catch (error) {
        console.error('Error loading saved cuts:', error);
        savedCuts = [];
    }
}

function saveCutsToStorage() {
    try {
        localStorage.setItem('youtubeMixerArtPieces', JSON.stringify(savedCuts));
        console.log('Saved cuts to localStorage');
    } catch (error) {
        console.error('Error saving cuts:', error);
    }
}

// =================== GALLERY DISPLAY ===================
function displayCuts() {
    const emptyGallery = document.getElementById('empty-gallery');
    const cutsGrid = document.getElementById('cuts-grid');
    
    if (savedCuts.length === 0) {
        // Show empty state
        emptyGallery.style.display = 'block';
        cutsGrid.style.display = 'none';
    } else {
        // Show gallery grid
        emptyGallery.style.display = 'none';
        cutsGrid.style.display = 'grid';
        
        // Clear existing content
        cutsGrid.innerHTML = '';
        
        // Sort cuts by creation date (most recent first)
        const sortedCuts = [...savedCuts].sort((a, b) => {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        // Add each cut
        sortedCuts.forEach(cut => {
            createCutCard(cut);
        });
    }
}

function createCutCard(cut) {
    const grid = document.getElementById('cuts-grid');
    
    const card = document.createElement('div');
    card.className = 'cut-card';
    card.onclick = () => playCut(cut);
    
    // Format creation date
    const createdDate = new Date(cut.createdAt).toLocaleDateString();
    
    // Format video and session counts with proper singular/plural
    const videoCount = cut.videos.length;
    const sessionCount = cut.sessions.length;
    const videoText = videoCount === 1 ? 'video' : 'videos';
    const sessionText = sessionCount === 1 ? 'session' : 'sessions';
    
    // Check if this cut was imported
    const isImported = cut.importedAt || cut.originalName || cut.name.includes('(imported)');
    
    card.innerHTML = `
        <div class="cut-thumbnail">
            <img src="${cut.thumbnail}" alt="${cut.name}" loading="lazy">
            <div class="play-overlay">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            </div>
            <button class="cut-delete-btn" onclick="event.stopPropagation(); deleteCut('${cut.id}')" title="Delete">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
            </button>
            ${isImported ? `
                <div class="cut-imported-pill" title="This cut was imported from a .splice file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                    <span>Imported</span>
                </div>
            ` : ''}
            <div class="duration-badge">1:00</div>
        </div>
        <div class="cut-info">
            <div class="cut-name">${cut.name}</div>
            <div class="cut-meta">
                <span>${videoCount} ${videoText}</span>
                <span>•</span>
                <span>${sessionCount} ${sessionText}</span>
                <span>•</span>
                <span>${createdDate}</span>
            </div>
            <div class="cut-actions">
                <button class="cut-share-pill" onclick="event.stopPropagation(); exportCut('${cut.id}')" title="Share this composition">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
                    </svg>
                    <span>Share</span>
                </button>
            </div>
        </div>
    `;
    
    grid.appendChild(card);
}

// =================== NAVIGATION ===================
function playCut(cut) {
    // Store the cut in sessionStorage for the playback page
    sessionStorage.setItem('currentArtPiece', JSON.stringify(cut));
    
    // Navigate to playback page
    window.location.href = `playback.html?id=${cut.id}`;
}

// =================== CUT MANAGEMENT ===================
function deleteCut(cutId) {
    console.log('Showing delete confirmation for cut:', cutId);
    showDeleteCutConfirmation(cutId);
}

function showDeleteCutConfirmation(cutId) {
    // Remove any existing confirmation modals
    const existingModal = document.querySelector('.delete-confirmation-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const cut = savedCuts.find(piece => piece.id == cutId);
    if (!cut) return;
    
    // Find the delete button for this cut
    const deleteBtn = document.querySelector(`[onclick*="deleteCut('${cutId}')"]`);
    
    if (!deleteBtn) return;
    
    // Create confirmation modal
    const modal = document.createElement('div');
    modal.className = 'delete-confirmation-modal';
    modal.innerHTML = `
        <div class="delete-modal-content">
            <div class="delete-modal-text">Delete "${cut.name}"?</div>
            <div class="delete-modal-buttons">
                <button class="delete-modal-btn cancel" onclick="hideDeleteCutConfirmation()">No</button>
                <button class="delete-modal-btn confirm" onclick="confirmDeleteCut('${cutId}')">Yes</button>
            </div>
        </div>
    `;
    
    // Position modal relative to delete button
    const rect = deleteBtn.getBoundingClientRect();
    modal.style.position = 'fixed';
    modal.style.top = `${rect.top - 10}px`;
    modal.style.left = `${rect.left - 60}px`;
    modal.style.zIndex = '1001';
    
    // Add click outside to close functionality
    setTimeout(() => {
        document.addEventListener('click', function closeModalOnOutsideClick(e) {
            if (!modal.contains(e.target) && !deleteBtn.contains(e.target)) {
                hideDeleteCutConfirmation();
                document.removeEventListener('click', closeModalOnOutsideClick);
            }
        });
    }, 100); // Small delay to prevent immediate closure
    
    document.body.appendChild(modal);
}

function hideDeleteCutConfirmation() {
    const modal = document.querySelector('.delete-confirmation-modal');
    if (modal) {
        modal.remove();
    }
}

function confirmDeleteCut(cutId) {
    hideDeleteCutConfirmation();
    actuallyDeleteCut(cutId);
}

function actuallyDeleteCut(cutId) {
    const cut = savedCuts.find(piece => piece.id == cutId);
    if (!cut) return;
    
    console.log('Actually deleting cut:', cut.name);
    
    // Remove from array
    savedCuts = savedCuts.filter(piece => piece.id != cutId);
    
    // Save to localStorage
    saveCutsToStorage();
    
    // Refresh display
    displayCuts();
    
    console.log('Deleted cut:', cut.name);
}

// =================== IMPORT/EXPORT (FUTURE) ===================
function exportCut(cutId) {
    const cut = savedCuts.find(piece => piece.id == cutId);
    if (!cut) return;
    
    console.log('Exporting cut:', cut.name);
    
    // Create the export data with metadata
    const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        exportedBy: "Splice",
        artPiece: cut
    };
    
    // Convert to JSON string with formatting
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Create blob and download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create temporary download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cut.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.splice`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up URL
    URL.revokeObjectURL(url);
    
    console.log('Export complete:', cut.name);
}

// =================== DRAG AND DROP FUNCTIONALITY ===================
function initializeDragAndDrop() {
    const dropZone = document.body; // Make entire page a drop zone
    
    // Prevent default drag behaviors on the entire page
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Visual feedback for drag operations
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropZone.classList.add('drag-over');
    }
    
    function unhighlight() {
        dropZone.classList.remove('drag-over');
    }
    
    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        unhighlight();
        const dt = e.dataTransfer;
        const files = dt.files;
        
        handleFiles(files);
    }
    
    function handleFiles(files) {
        ([...files]).forEach(handleFile);
    }
    
    function handleFile(file) {
        // Check file extension
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.splice') && !fileName.endsWith('.json')) {
            showImportError(`Invalid file type. Please drop a .splice file. (Got: ${file.name})`);
            return;
        }
        
        // Read and import the file
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importData = JSON.parse(e.target.result);
                processImportedData(importData, file.name);
                
            } catch (error) {
                console.error('Error parsing dropped file:', error);
                showImportError(`Failed to parse ${file.name}: ${error.message}`);
            }
        };
        
        reader.onerror = function() {
            showImportError(`Failed to read file: ${file.name}`);
        };
        
        reader.readAsText(file);
    }
}

function processImportedData(importData, fileName) {
    try {
        // Validate the import data structure (same logic as importCut)
        let artPiece;
        if (importData.artPiece) {
            // New format with metadata
            artPiece = importData.artPiece;
        } else if (importData.id && importData.name && importData.videos) {
            // Direct art piece format (backwards compatibility)
            artPiece = importData;
        } else {
            throw new Error('Invalid file format');
        }
        
        // Validate required fields
        if (!artPiece.id || !artPiece.name || !artPiece.videos || !artPiece.sessions) {
            throw new Error('Missing required art piece data');
        }
        
        // Generate new ID to avoid conflicts
        const newId = 'imported_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        artPiece.id = newId;
        
        // Add import metadata
        artPiece.importedAt = new Date().toISOString();
        artPiece.originalName = artPiece.name;
        
        // Check if already exists (by original name) and add timestamp suffix if needed
        const existingCut = savedCuts.find(cut => cut.originalName === artPiece.originalName);
        if (existingCut) {
            const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            artPiece.name = `${artPiece.originalName} ${timestamp}`;
        }
        
        // Add to saved cuts
        savedCuts.push(artPiece);
        saveCutsToStorage();
        displayCuts();
        
        console.log('Successfully imported via drag-and-drop:', artPiece.name);
        showImportSuccess(`${artPiece.name} (from ${fileName})`);
        
    } catch (error) {
        console.error('Processing error:', error);
        showImportError(`Failed to import ${fileName}: ${error.message}`);
    }
}

function showImportSuccess(cutName) {
    // Create success notification
    const notification = document.createElement('div');
    notification.className = 'import-notification success';
    notification.innerHTML = `
        <div class="notification-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <span>Successfully imported "${cutName}"</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function showImportError(message) {
    // Create error notification
    const notification = document.createElement('div');
    notification.className = 'import-notification error';
    notification.innerHTML = `
        <div class="notification-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span>Import failed: ${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
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

// =================== UTILITY FUNCTIONS ===================
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// =================== SHARED STORAGE ACCESS ===================
// Function to be called by create.js when a new cut is saved
window.addNewCut = function(cut) {
    savedCuts.push(cut);
    saveCutsToStorage();
    displayCuts();
};

function initializeTheme() {
    document.body.setAttribute('data-theme', currentTheme);
    updateThemeIcon();
    updateThemeText();
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('splice-theme', currentTheme);
    updateThemeIcon();
    updateThemeText();
}

function updateThemeIcon() {
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        if (currentTheme === 'light') {
            // Moon icon for dark mode toggle
            themeIcon.innerHTML = `<path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"/>`;
        } else {
            // Sun icon for light mode toggle
            themeIcon.innerHTML = `<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>`;
        }
    }
}

function updateThemeText() {
    const themeText = document.getElementById('theme-text');
    if (themeText) {
        themeText.textContent = currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
}

// Make these functions available globally so they can be called by the modal buttons
window.hideDeleteCutConfirmation = hideDeleteCutConfirmation;
window.confirmDeleteCut = confirmDeleteCut;
window.importCut = importCut;

function importCut() {
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.splice,.json';
    fileInput.style.display = 'none';
    
    fileInput.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Read and import the file using the same logic as drag-and-drop
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importData = JSON.parse(e.target.result);
                processImportedData(importData, file.name);
                
            } catch (error) {
                console.error('Import error:', error);
                showImportError(`Failed to import ${file.name}: ${error.message}`);
            }
        };
        
        reader.readAsText(file);
    };
    
    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// =================== HASH GENERATION UTILITY ===================
function generateCompositionHash(artPiece) {
    // Create a hash based on the composition structure
    // This includes video URLs, session data, and keyframe positions
    const hashData = {
        videos: artPiece.videos.map(v => ({
            url: v.url,
            videoId: v.videoId,
            keyframes: v.keyframes
        })),
        sessions: artPiece.sessions.map(session => ({
            actions: session.actions || [],
            duration: session.duration
        }))
    };
    
    // Simple hash function - create a string and hash it
    const hashString = JSON.stringify(hashData);
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) {
        const char = hashString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
} 