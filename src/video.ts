import { state } from './state';
import { els } from './elements';
import { scrollToCurrent } from './render';
import { getRecordingDirHandle } from './storage';

// Mirror the preview only for the front ('user') camera, like a selfie view.
// The rear camera should show a true (non-mirrored) image.
function applyCameraMirror(): void {
    els.videoPreview.style.transform =
        state.facingMode === 'user' ? 'scaleX(-1)' : 'none';
}

// Full-window red breathing border shown while actively recording (audio or video).
function setRecordingBorder(active: boolean): void {
    els.prompterContainer.classList.toggle('recording-border', active);
}

export function getMediaConstraints(): MediaStreamConstraints {
    const videoConstraints: any = {
        width: { ideal: 1280 },
        height: { ideal: 720 }
    };
    
    if (state.selectedVideoDeviceId) {
        videoConstraints.deviceId = state.selectedVideoDeviceId;
    } else {
        videoConstraints.facingMode = state.facingMode;
    }

    const audioConstraints: any = state.selectedAudioDeviceId
        ? { deviceId: state.selectedAudioDeviceId }
        : true;

    return {
        video: videoConstraints,
        audio: audioConstraints
    };
}

export async function enterVideoMode(): Promise<void> {
    try {
        // Always start on the front-facing camera unless a specific camera is chosen.
        if (!state.selectedVideoDeviceId) {
            state.facingMode = 'user';
        }
        const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints());
        state.mediaStream = stream;
        state.isVideoMode = true;
        state.videoLayoutMode = 'split';

        // Attach stream to video preview
        els.videoPreview.srcObject = stream;
        els.videoPreview.muted = true;
        applyCameraMirror();
        await els.videoPreview.play();

        // Show video UI
        els.videoContainer.classList.remove('hidden');
        els.videoFlipCameraBtn.classList.remove('hidden');
        els.videoLayoutToggleBtn.classList.remove('hidden');

        // Apply split layout by default
        applyVideoLayout();

        setTimeout(() => {
            scrollToCurrent();
        }, 50);

        if (/Android/i.test(navigator.userAgent)) {
            els.androidVideoWarning.classList.remove('hidden');
        }

        (window as any).umami?.track('video-mode-enter');
    } catch (err) {
        console.error('Failed to access camera:', err);
        alert('無法取用攝影機，請允許攝影機與麥克風權限。');
    }
}

export async function flipCamera(): Promise<void> {
    if (!state.isVideoMode) return;
    // Swapping the camera mid-recording would invalidate the MediaRecorder's
    // stream, so block it while recording is in progress.
    if (state.isRecording) return;

    const previous = state.facingMode;
    state.facingMode = previous === 'user' ? 'environment' : 'user';

    // Clear custom device selection when manual flip button is pressed
    state.selectedVideoDeviceId = null;
    if (els.videoDeviceSelect) els.videoDeviceSelect.value = '';

    try {
        const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints());

        // Tear down the old stream only after the new one is acquired.
        if (state.mediaStream) {
            state.mediaStream.getTracks().forEach(track => track.stop());
        }
        state.mediaStream = stream;
        els.videoPreview.srcObject = stream;
        applyCameraMirror();
        await els.videoPreview.play();

        (window as any).umami?.track('video-flip-camera', { facing: state.facingMode });
    } catch (err) {
        // Device may not have the requested camera — revert.
        console.error('Failed to switch camera:', err);
        state.facingMode = previous;
        alert('無法切換鏡頭，這個裝置可能只有一個鏡頭。');
    }
}

export function exitVideoMode(): void {
    // Stop recording if active
    if (state.isRecording) {
        stopRecording();
    }

    // Stop all media tracks
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
        state.mediaStream = null;
    }

    // Reset video element
    els.videoPreview.srcObject = null;

    // Hide video UI
    els.videoContainer.classList.add('hidden');
    els.videoFlipCameraBtn.classList.add('hidden');
    els.videoLayoutToggleBtn.classList.add('hidden');

    // Remove layout classes
    els.prompterContainer.classList.remove('video-mode-split', 'video-mode-overlay');

    setTimeout(() => {
        scrollToCurrent();
    }, 50);

    state.isVideoMode = false;
    state.isRecording = false;
    state.mediaRecorder = null;
    state.recordedChunks = [];

    // Update button states
    setRecordingBorder(false);
    const dock = document.getElementById('mainControlsDock');
    if (dock) { dock.style.opacity = ''; }

    (window as any).umami?.track('video-mode-exit');
}

export function toggleVideoLayout(): void {
    state.videoLayoutMode = state.videoLayoutMode === 'split' ? 'overlay' : 'split';
    applyVideoLayout();
    
    setTimeout(() => {
        scrollToCurrent();
    }, 50);

    (window as any).umami?.track('video-layout-toggle', { layout: state.videoLayoutMode });
}

function applyVideoLayout(): void {
    els.prompterContainer.classList.remove('video-mode-split', 'video-mode-overlay');

    if (state.videoLayoutMode === 'split') {
        els.prompterContainer.classList.add('video-mode-split');
        els.videoLayoutToggleBtn.textContent = '⬜ 滿版覆蓋';
        els.videoLayoutToggleBtn.dataset.tip = '切換成滿版覆蓋模式';
        els.scrollContainer.style.backgroundColor = state.config.bgColor;
    } else {
        els.prompterContainer.classList.add('video-mode-overlay');
        els.videoLayoutToggleBtn.textContent = '⬜ 上下分割';
        els.videoLayoutToggleBtn.dataset.tip = '切換成上下分割模式';
        els.scrollContainer.style.backgroundColor = '';
    }
}

export function startRecording(): void {
    if (!state.mediaStream) return;

    state.recordedChunks = [];

    // Prefer MP4 with H.264 (supported in Chrome 120+, Safari)
    // Fall back to WebM if MP4 is not available
    const mimeTypes = [
        'video/mp4;codecs=avc1,opus',
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
    ];

    let selectedMimeType = '';
    for (const mt of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mt)) {
            selectedMimeType = mt;
            break;
        }
    }

    try {
        state.mediaRecorder = selectedMimeType
            ? new MediaRecorder(state.mediaStream, { mimeType: selectedMimeType })
            : new MediaRecorder(state.mediaStream);
    } catch (e) {
        state.mediaRecorder = new MediaRecorder(state.mediaStream);
    }

    state.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
            state.recordedChunks.push(event.data);
        }
    };

    state.mediaRecorder.onstop = () => {
        downloadRecording();
    };

    state.mediaRecorder.start(1000); // Collect data every second
    state.isRecording = true;

    // Update UI
    setRecordingBorder(true);
    const dock = document.getElementById('mainControlsDock');
    if (dock) dock.style.opacity = (state.config.dockOpacity / 100).toString();

    (window as any).umami?.track('video-record-start');
}

export function stopRecording(): void {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
    }
    state.isRecording = false;

    // Update UI
    setRecordingBorder(false);
    const dock = document.getElementById('mainControlsDock');
    if (dock) { dock.style.opacity = ''; }

    (window as any).umami?.track('video-record-stop');
}

/**
 * Audio-only recording (no camera). Parallel to startRecording()/enterVideoMode()
 * but skips all camera-preview UI since there's nothing to show.
 */
export async function startAudioOnlyRecording(): Promise<boolean> {
    try {
        const audioConstraints: any = state.selectedAudioDeviceId
            ? { deviceId: state.selectedAudioDeviceId }
            : true;
        state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (err) {
        console.error('Failed to access microphone:', err);
        alert('無法取用麥克風，請允許麥克風權限後再試一次。');
        return false;
    }

    state.recordedChunks = [];

    const mimeTypes = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm'
    ];
    let selectedMimeType = '';
    for (const mt of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mt)) {
            selectedMimeType = mt;
            break;
        }
    }

    try {
        state.mediaRecorder = selectedMimeType
            ? new MediaRecorder(state.mediaStream, { mimeType: selectedMimeType })
            : new MediaRecorder(state.mediaStream);
    } catch (e) {
        state.mediaRecorder = new MediaRecorder(state.mediaStream);
    }

    state.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
            state.recordedChunks.push(event.data);
        }
    };
    state.mediaRecorder.onstop = () => downloadRecording();
    state.mediaRecorder.start(1000);
    state.isRecording = true;

    setRecordingBorder(true);
    const dock = document.getElementById('mainControlsDock');
    if (dock) dock.style.opacity = (state.config.dockOpacity / 100).toString();

    (window as any).umami?.track('audio-record-start');
    return true;
}

export function stopAudioOnlyRecording(): void {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
    }
    state.isRecording = false;

    // No camera preview to keep alive in audio-only mode — release the mic stream.
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
        state.mediaStream = null;
    }

    setRecordingBorder(false);
    const dock = document.getElementById('mainControlsDock');
    if (dock) { dock.style.opacity = ''; }

    (window as any).umami?.track('audio-record-stop');
}

// Tries to write into the user's chosen folder (Chromium File System Access
// API); returns false on anything unsupported/denied/failed so the caller
// can fall back to a normal browser download — this must never be the only
// path, since it's a no-op on iOS Safari (the primary platform here).
async function trySaveToChosenFolder(blob: Blob, filename: string): Promise<boolean> {
    if (!('showDirectoryPicker' in window)) return false;
    try {
        const dirHandle = await getRecordingDirHandle();
        if (!dirHandle) return false;
        const permission = await (dirHandle as any).requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') return false;
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (err) {
        console.error('Failed to save to chosen folder, falling back to browser download:', err);
        return false;
    }
}

function downloadViaBrowser(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = filename;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadRecording(): Promise<void> {
    if (state.recordedChunks.length === 0) return;

    // Determine file extension from the actual mimeType used
    const actualMime = state.mediaRecorder?.mimeType || '';
    const isAudioOnly = actualMime.startsWith('audio/');
    const isMP4 = actualMime.includes('mp4');
    const extension = isAudioOnly ? (isMP4 ? 'm4a' : 'weba') : (isMP4 ? 'mp4' : 'webm');
    const blobType = isMP4
        ? (isAudioOnly ? 'audio/mp4' : 'video/mp4')
        : (isAudioOnly ? 'audio/webm' : 'video/webm');

    const blob = new Blob(state.recordedChunks, { type: blobType });
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `tici-recording-${timestamp}.${extension}`;

    const savedToChosenFolder = await trySaveToChosenFolder(blob, filename);
    if (!savedToChosenFolder) {
        downloadViaBrowser(blob, filename);
    }

    state.recordedChunks = [];
}
