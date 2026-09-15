export type VideoLayoutMode = 'split' | 'overlay';
export type ScrollingMode = 'voice' | 'sound' | 'constant';

export interface ScriptWord {
    word: string;
    clean: string;
    element: HTMLElement | null;
    skip: boolean;
    isStop: boolean;
    isBreak?: boolean;
}

export interface AppConfig {
    fontSize: number;
    lineHeight: number;
    margin: number;
    textColor: string;
    bgColor: string;
    textAlign: 'left' | 'center' | 'right';
    textDirection: 'ltr' | 'rtl';
    showStopIcon: boolean;
    preserveFormatting: boolean;
    voiceCommandsEnabled: boolean;
    paragraphSpacing: number;
    smoothAnimations: boolean;
    highlightActiveWord: boolean;
    activeLinePosition: number; // 0 to 100 (percentage from top)
    lookaheadWords: number; // 1-10 words to look ahead
    dockOpacity: number; // 0-100 opacity of dock while recording
    fontFamily: string; // Font family for the script
    scrollingMode: ScrollingMode;
    scrollSpeed: number; // Words per second
    soundSensitivity: number; // 0 to 1
}

export interface AppState {
    isListening: boolean;
    // Which mode is actually driving the current playback session (null when
    // idle). Distinct from config.scrollingMode, which is the persisted
    // preference for next time — a caller can override the active mode for
    // one session (e.g. the plain Play button forcing 'constant') without
    // touching what the user has configured.
    activeScrollingMode: ScrollingMode | null;
    scriptWords: ScriptWord[];
    currentIndex: number;
    recognition: any; // Using any for SpeechRecognition as it's experimental
    isMirrored: boolean;
    isMirroredH: boolean;
    isScreenRotated: boolean;
    selectedLanguage: string;
    languageSetting: string;
    detectedLanguage: string | null;
    config: AppConfig;
    // Video recording state
    isVideoMode: boolean;
    videoLayoutMode: VideoLayoutMode;
    facingMode: 'user' | 'environment';
    recordingMode: 'audio' | 'video';
    recordArmed: boolean; // whether starting the teleprompter should also start recording
    isRecording: boolean;
    mediaRecorder: MediaRecorder | null;
    mediaStream: MediaStream | null;
    recordedChunks: Blob[];
    googleDocUrl: string | null;
    selectedVideoDeviceId: string | null;
    selectedAudioDeviceId: string | null;
}

export interface HistoryItem {
    id: number;
    text: string;
    preview: string;
    date: string;
    tag?: string;
    googleDocUrl?: string;
}
