// Improved applyTimestampInput function for testing
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
        
        console.log(`🎯 TIMESTAMP INPUT: Slot ${slot}, Requested: ${newTime}s (${Math.floor(newTime/60)}:${String(Math.floor(newTime%60)).padStart(2,'0')})`);
        
        // Get actual video duration from player if available, fallback to stored duration
        let maxTime = videos[slot].duration || 0;
        console.log(`📊 Initial duration: ${maxTime}s`);
        
        if (previewPlayers[slot]) {
            try {
                const playerDuration = previewPlayers[slot].getDuration();
                console.log(`🎬 Player getDuration(): ${playerDuration}`);
                
                if (playerDuration && playerDuration > 0 && !isNaN(playerDuration)) {
                    maxTime = playerDuration;
                    videos[slot].duration = playerDuration; // Update stored duration
                    console.log(`✅ Updated maxTime to: ${maxTime}s (${Math.floor(maxTime/60)}:${String(Math.floor(maxTime%60)).padStart(2,'0')})`);
                } else {
                    console.log(`❌ Invalid player duration: ${playerDuration}`);
                }
            } catch (error) {
                console.log('❌ Could not get player duration:', error);
            }
        }
        
        // Determine final time to seek to
        let clampedTime;
        
        if (maxTime > 0) {
            // Clamp time to valid range (0 to video duration)
            clampedTime = Math.max(0, Math.min(newTime, maxTime));
            if (newTime > maxTime) {
                console.log(`🔧 CLAMPING: ${newTime}s > ${maxTime}s, using video end: ${clampedTime}s`);
            } else {
                console.log(`✅ VALID: ${newTime}s <= ${maxTime}s, using: ${clampedTime}s`);
            }
        } else {
            // No duration available - still try to seek, but with aggressive clamping for very high values
            clampedTime = Math.max(0, newTime);
            if (newTime > 14400) { // 4 hours - very conservative max
                clampedTime = 14400;
                console.log(`⚠️ NO DURATION + EXTREME VALUE: Clamping ${newTime}s to 4h max: ${clampedTime}s`);
            } else {
                console.log(`⚠️ NO DURATION: Using ${clampedTime}s, letting player handle bounds`);
            }
        }
        
        // FORCE seek regardless of current position
        console.log(`🎮 SEEKING: Attempting to seek to ${clampedTime}s`);
        
        if (previewPlayers[slot] && !syncLocks[slot]) {
            syncLocks[slot] = true;
            
            // Log current time before seek
            try {
                const beforeTime = previewPlayers[slot].getCurrentTime();
                console.log(`⏰ Before seek: ${beforeTime}s`);
            } catch (e) {}
            
            previewPlayers[slot].seekTo(clampedTime);
            
            // Verify seek after short delay
            setTimeout(() => {
                try {
                    const afterTime = previewPlayers[slot].getCurrentTime();
                    console.log(`⏰ After seek: ${afterTime}s (requested: ${clampedTime}s)`);
                    if (Math.abs(afterTime - clampedTime) > 2) {
                        console.log(`⚠️ SEEK MISMATCH: Expected ${clampedTime}s, got ${afterTime}s`);
                    } else {
                        console.log(`✅ SEEK SUCCESS: Close to expected time`);
                    }
                } catch (e) {
                    console.log('Could not verify seek result');
                }
            }, 200);
            
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
        } else {
            console.log(`❌ CANNOT SEEK: Player not available or locked`);
        }
        
        // Update video data
        videos[slot].currentTime = clampedTime;
        
        console.log(`🏁 FINAL: Slot ${slot} timestamp set to ${clampedTime}s`);
        
    } catch (error) {
        console.log('❌ TIMESTAMP ERROR:', error);
    }
    
    // Restore time display
    cancelTimestampInput(slot);
}

// Copy this function to replace the one in script.js
console.log('Test timestamp function loaded. Copy this to script.js to replace the existing applyTimestampInput function.'); 