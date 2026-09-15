import { AppState, AppConfig } from './types';

// Single source of truth for factory defaults — used for the initial state,
// for restoring persisted settings (missing fields fall back to these), and
// for the double-click-to-reset behavior on every slider.
export const DEFAULT_CONFIG: AppConfig = {
    fontSize: 40,
    lineHeight: 1.0,
    margin: 0,
    textColor: '#ffffff',
    bgColor: '#000000',
    textAlign: 'left',
    textDirection: 'ltr',
    showStopIcon: false,
    preserveFormatting: true,
    voiceCommandsEnabled: false,
    paragraphSpacing: 0.5,
    smoothAnimations: false,
    highlightActiveWord: true,
    activeLinePosition: 50, // Default to 50% (vertical center)
    lookaheadWords: 30, // Default lookahead (was 5 — too narrow for CJK char-level tokens; getting more than a handful of characters behind made it impossible to ever re-match, see feedback 2026-08-30)
    dockOpacity: 50, // Default dock opacity (50%)
    fontFamily: 'mono', // Default font
    scrollingMode: 'voice',
    scrollSpeed: 3.5,
    soundSensitivity: 0.75
};

export const state: AppState = {
    scriptWords: [],
    currentIndex: 0,
    recognition: null,
    isListening: false,
    isMirrored: false,
    isMirroredH: false,
    isScreenRotated: false,
    selectedLanguage: 'zh-TW', // Target language for SpeechRecognition
    languageSetting: 'zh-TW', // User's dropdown preference
    detectedLanguage: null,
    config: { ...DEFAULT_CONFIG },
    // Video recording state
    isVideoMode: false,
    videoLayoutMode: 'split',
    facingMode: 'user',
    recordingMode: 'audio',
    recordArmed: false,
    isRecording: false,
    mediaRecorder: null,
    mediaStream: null,
    recordedChunks: [],
    googleDocUrl: null,
    selectedVideoDeviceId: null,
    selectedAudioDeviceId: null
};
