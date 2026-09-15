import { state } from './state';
import { els } from './elements';
import { updateMicUI, updateHighlight, scrollToCurrent, advancePastSkipped, restartScript, navigateParagraphs } from './render';
import { tokenizeWords, isCJKChar } from './tokenize';

// Track the last matched word to prevent matching the same word twice in a row
let lastMatchedWord = '';

// Web Speech results indexed by the API's own result index, so a revised
// interim guess overwrites its slot instead of duplicating — this is what
// lets us keep a STABLE, ever-growing transcript of the whole session
// instead of a sliding window that reshuffles every event.
let resultSegments: string[] = [];

// How many CLEANED spoken tokens (from the start of the full-session
// transcript) have already been "spent" justifying a script match. New
// matches may only draw on tokens from this point forward.
//
// Why this exists: without it, a word near the start of one sentence (e.g.
// you saying "動力鏈" once) stays sitting in the evidence pool forever, so
// if that same term happens to recur later in the script — which real
// scripts do constantly — a later, completely unrelated occurrence can
// "steal" that same old evidence and the tracker jumps to it, well past
// where you actually are. Consuming evidence once it's used closes that
// hole: the same thing you said can only ever justify one step forward.
let consumedTokenCount = 0;

// Call whenever currentIndex is changed by something other than matchWords()
// itself (tap-to-jump, restart, voice "go" commands) — otherwise stale
// matched/consumed state can suppress a real match near the new position,
// or let old evidence justify a match that has nothing to do with what's
// about to be said next.
export function resetMatchState(): void {
    lastMatchedWord = '';
    resultSegments = [];
    consumedTokenCount = 0;
}

// Track which result indices we already processed for commands
// to prevent re-firing when the recognition engine revisits finalized results

let speechBlocked = false;

// Voice command arming to prevent duplicate triggers
let commandArmed = true;

// Arc / silent-fail detection
let isFirstStart = true;
let gotResultOnFirstStart = false;

function showBrowserWarning() {
    els.browserWarning.classList.remove('hidden');
}

export function initSpeech(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
        // No API at all — Firefox, older browsers
        showBrowserWarning();
        return;
    }

    state.recognition = new SpeechRecognition();
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.lang = state.selectedLanguage;

    state.recognition.onresult = (event: any) => {
        // Mark that we got real results on first start (rules out Arc silent fail)
        if (isFirstStart) {
            gotResultOnFirstStart = true;
        }

        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
            resultSegments[i] = event.results[i][0].transcript;
        }

        // --- Voice Commands (Mac-Style) ---
        if (state.config.voiceCommandsEnabled) {
            const cleanTokens = transcript.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(t => t.length > 0);
            if (cleanTokens.length >= 2) {
                const lastTwoWords = cleanTokens.slice(-2).join(' ');
                let commandMatched: string | null = null;
                
                if (lastTwoWords === 'go start') commandMatched = 'go start';
                else if (lastTwoWords === 'go finish') commandMatched = 'go finish';
                else if (lastTwoWords === 'go next') commandMatched = 'go next';
                else if (lastTwoWords === 'go back') commandMatched = 'go back';
                
                if (commandMatched) {
                    const commandTokens = commandMatched.split(' ');
                    // Conflict resolution: look around the current index (back 4, forward 10)
                    const startIdx = Math.max(0, state.currentIndex - 4);
                    const endIdx = Math.min(state.scriptWords.length, state.currentIndex + 10);
                    const windowScript = state.scriptWords.slice(startIdx, endIdx).map(w => w.word.toLowerCase().replace(/[^\w\s]/g, ''));
                    
                    let conflict = false;
                    for (let j = 0; j < Math.max(0, windowScript.length - 1); j++) {
                        if (windowScript[j] === commandTokens[0] && windowScript[j+1] === commandTokens[1]) {
                            conflict = true;
                            break;
                        }
                    }
                    
                    if (!conflict) {
                        if (commandArmed) {
                            commandArmed = false;
                            console.log(`[VoiceCommand] TRIGGER: ${commandMatched}`);
                            if (commandMatched === 'go start') {
                                restartScript();
                            } else if (commandMatched === 'go finish') {
                                state.currentIndex = Math.max(0, state.scriptWords.length - 1);
                                resetMatchState();
                                updateHighlight();
                                scrollToCurrent();
                            } else if (commandMatched === 'go next') {
                                navigateParagraphs('forward', 1);
                            } else if (commandMatched === 'go back') {
                                navigateParagraphs('back', 1);
                            }
                            return; // Stop processing to prevent the command from being read as script text
                        }
                    } else {
                        commandArmed = true;
                    }
                } else {
                    commandArmed = true;
                }
            } else {
                commandArmed = true;
            }
        }

        // --- Word matching: uses all results (interim + final) for responsiveness ---
        // Uses the full accumulated session transcript (resultSegments), not
        // just this event's slice — matchWords() itself restricts the search
        // to unconsumed tokens.
        const fullTranscript = resultSegments.join('');
        const spokenWords = tokenizeWords(fullTranscript.trim().toLowerCase());
        matchWords(spokenWords);
    };

    state.recognition.onerror = (e: any) => {
        console.log('error:', e.error, e.message);

        // Arc / silent-fail detection: error fires immediately on first start with no results
        if (isFirstStart && !gotResultOnFirstStart) {
            isFirstStart = false;
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture' || e.error === 'aborted') {
                // These are legitimate errors that don't mean the browser lacks support
                // 'aborted' happens on Safari iOS when the permission dialog interrupts the first recognition start
            } else {
                showBrowserWarning();
            }
            state.isListening = false;
            updateMicUI(false);
            return;
        }

        if (e.error === 'aborted') {
            speechBlocked = true;

            // This used to only check for iPad, but the underlying restriction is
            // Apple blocking speech recognition in standalone (home-screen-installed)
            // display mode — not iPad-specific — so iPhone can hit it too.
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 2);
            const isPWA = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;

            if (isIOS && isPWA) {
                els.ipadPwaWarning.classList.remove('hidden');
            }

            state.isListening = false;
            updateMicUI(false);
            return;
        }
    };

    state.recognition.onend = () => {
        console.log('ended');

        // Arc / silent-fail detection: ended immediately on first start with no results and no error
        if (isFirstStart && !gotResultOnFirstStart) {
            isFirstStart = false;
            showBrowserWarning();
            state.isListening = false;
            updateMicUI(false);
            return;
        }
        isFirstStart = false;

        if (speechBlocked) return;
        if (state.isListening) {

            try {
                // A restarted recognition session gets its own event.resultIndex
                // starting back at 0 — without clearing resultSegments here,
                // the new session's segments overwrite the old session's early
                // indices while stale leftover segments at higher indices (from
                // the longer old session) stick around, corrupting the
                // full-transcript concatenation. consumedTokenCount would then
                // be calibrated against transcript content that no longer
                // means what it used to, and matching can go permanently dark
                // — the exact "won't ever match, even saying the right word"
                // reported 2026-08-30.
                resetMatchState();
                state.recognition.start();
            } catch (error) {
                console.error('Failed to restart speech recognition:', error);
            }
        } else {
            updateMicUI(false);
        }
    };
}

export function startListening(): void {
    if (!state.recognition) return;
    state.isListening = true;
    resetMatchState();

    speechBlocked = false;
    try {
        state.recognition.start();
        updateMicUI(true);
    } catch (error) {
        console.error('Failed to start speech recognition:', error);
        state.isListening = false;
        updateMicUI(false);
    }
}

export function stopListening(): void {
    if (!state.recognition) return;
    state.isListening = false;
    resetMatchState();

    try {
        state.recognition.stop();
        updateMicUI(false);
    } catch (error) {
        console.error('Failed to stop speech recognition:', error);
    }
}

// The ~60 highest-frequency Mandarin function/filler characters. These are
// cheap for noise, breathing, or a garbled interim result to "hallucinate" —
// almost any short script has one nearby, so a single-character hit on one of
// these is weak evidence. Everything NOT in this set is comparatively
// distinctive, so a single-character hit is trusted immediately (fast).
const CJK_COMMON_CHARS = new Set('的了是在我你他她它們這那個和與也就都很著而不有到說要會對上下之於去來又還讓把被啊喔嗎呢一二三四五六七八九十'.split(''));

// Index of the first i (>= 0) such that tokens[i] === a && tokens[i+1] === b,
// or -1. Used instead of a Set so a bigram match tells us WHERE it was found
// — needed to consume evidence up through that point (see matchWords).
function indexOfBigram(tokens: string[], a: string, b: string): number {
    for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i] === a && tokens[i + 1] === b) return i;
    }
    return -1;
}

// Hard ceiling on how many unconsumed spoken tokens we'll ever hold onto.
// Only matters if recognition keeps producing tokens that never match
// anything (background noise, or you go off-script for a while) — without
// this, availableSpoken would grow for as long as the mic stays on.
const MAX_UNCONSUMED_TOKENS = 200;

function matchWords(spokenWords: string[]) {
    if (state.currentIndex >= state.scriptWords.length) return;
    if (spokenWords.length === 0) return;

    const LOOKAHEAD = state.config.lookaheadWords;

    const cleanedSpoken = spokenWords
        .map(w => w.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase())
        .filter(w => w.length > 0);

    if (consumedTokenCount > cleanedSpoken.length) {
        // Session was reset or shrank underneath us — clamp defensively.
        consumedTokenCount = cleanedSpoken.length;
    }
    if (cleanedSpoken.length - consumedTokenCount > MAX_UNCONSUMED_TOKENS) {
        consumedTokenCount = cleanedSpoken.length - MAX_UNCONSUMED_TOKENS;
    }

    // Only tokens spoken AFTER everything already used by a previous match
    // are eligible as fresh evidence. This is what stops a word from early
    // in one sentence (e.g. a term repeated throughout the script) from
    // being "reused" to justify a second, unrelated, much later jump — once
    // spent, it's spent.
    const availableSpoken = cleanedSpoken.slice(consumedTokenCount);
    if (availableSpoken.length === 0) return;

    // Iterate through SCRIPT words from nearest to farthest
    // This ensures we always advance to the nearest matching word
    let scriptPtr = state.currentIndex;
    let validWordsChecked = 0;

    while (scriptPtr < state.scriptWords.length && validWordsChecked < LOOKAHEAD) {
        const scriptWordObj = state.scriptWords[scriptPtr];

        if (scriptWordObj.skip || scriptWordObj.clean === '') {
            // Pure punctuation (e.g. a lone "，") can never be "said" — don't
            // burn lookahead budget on it and never treat it as matchable.
            scriptPtr++;
            continue;
        }

        let isMatch = false;
        let consumeThrough = -1; // index within availableSpoken, inclusive

        if (isCJKChar(scriptWordObj.clean) && CJK_COMMON_CHARS.has(scriptWordObj.clean)) {
            // High-frequency character: require it to appear adjacent (in the
            // correct order) to one of its script neighbors in what was
            // actually heard, not just present anywhere in the recent buffer.
            let nextPtr = scriptPtr + 1;
            while (nextPtr < state.scriptWords.length && (state.scriptWords[nextPtr].skip || state.scriptWords[nextPtr].clean === '')) nextPtr++;
            const nextClean = nextPtr < state.scriptWords.length ? state.scriptWords[nextPtr].clean : '';

            let prevPtr = scriptPtr - 1;
            while (prevPtr >= 0 && (state.scriptWords[prevPtr].skip || state.scriptWords[prevPtr].clean === '')) prevPtr--;
            const prevClean = prevPtr >= 0 ? state.scriptWords[prevPtr].clean : '';

            const fwdIdx = (!!nextClean && isCJKChar(nextClean))
                ? indexOfBigram(availableSpoken, scriptWordObj.clean, nextClean) : -1;
            const bwdIdx = (!!prevClean && isCJKChar(prevClean))
                ? indexOfBigram(availableSpoken, prevClean, scriptWordObj.clean) : -1;

            if (fwdIdx !== -1) {
                isMatch = true;
                consumeThrough = fwdIdx + 1; // consumes both characters of the pair
            } else if (bwdIdx !== -1) {
                isMatch = true;
                consumeThrough = bwdIdx + 1;
            }
        } else {
            // Distinctive character/word: a single hit is trusted immediately.
            const idx = availableSpoken.indexOf(scriptWordObj.clean);
            if (idx !== -1) {
                isMatch = true;
                consumeThrough = idx;
            }
        }

        if (isMatch) {
            // Prevent matching the same word twice in a row (prevents double-jump)
            // But allow it if it's at the current position (position 0 in lookahead)
            if (scriptWordObj.clean === lastMatchedWord && validWordsChecked > 0) {
                // Same word as last match, and not at current position - skip it
                scriptPtr++;
                validWordsChecked++;
                continue;
            }

            lastMatchedWord = scriptWordObj.clean;
            consumedTokenCount += consumeThrough + 1;
            state.currentIndex = scriptPtr + 1;
            advancePastSkipped();
            updateHighlight();
            scrollToCurrent();
            return;
        }

        scriptPtr++;
        validWordsChecked++;
    }
}

