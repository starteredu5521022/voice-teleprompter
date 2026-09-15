import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { initElements, els } from './elements';
import { state, DEFAULT_CONFIG } from './state';
import { renderScript, updateHighlight, scrollToCurrent, applySettings, renderHistoryList, restartScript } from './render';
import { initSpeech, startListening, stopListening } from './speech';
import { autoScrollManager } from './autoscroll';
import { saveToHistory, getHistory, clearAllHistory, saveConfig, loadConfig, saveRecordingDirHandle, getRecordingDirHandle } from './storage';
import { ScriptWord, ScrollingMode } from './types';
import { enterVideoMode, exitVideoMode, toggleVideoLayout, startRecording, stopRecording, startAudioOnlyRecording, stopAudioOnlyRecording, flipCamera, getMediaConstraints } from './video';
import { detectAll } from 'tinyld/light';
import { fetchGoogleDocText } from './gdoc';
import { enumerateAndPopulateDevices } from './devices';
import { detectVisitorPlatform, getNativePromo } from './platform-promo';
import { tokenizeWords } from './tokenize';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

interface LangItem { id: string; name: string }

const AUTO_LANGS: LangItem[] = [
    { id: 'zh-TW', name: '中文（繁體）' },
    { id: 'en-US', name: '英文' }
];

const MANUAL_LANGS: LangItem[] = [];

const LANG_MAP: Record<string, string> = {
    'en': 'en-US', 'zh': 'zh-TW'
};

const DEMO_SCRIPTS: { id: string; label: string; text: string }[] = [
    {
        id: 'demo-zh',
        label: '示範：中文',
        text: '欸，你知道嗎，我昨天晚上超餓的，結果冰箱裡面什麼都沒有，只剩下半顆蛋跟一包泡麵。\n我就想說，算了，將就一下好了，反正肚子餓的時候吃什麼都好吃。\n結果泡麵煮到一半，才發現瓦斯快沒了，火一直忽大忽小，整個人超崩潰。\n最後花了快二十分鐘才把一碗泡麵搞定，吃起來還是特別香啦，果然餓的時候什麼都好吃。\n所以說，冰箱真的要定期補貨，不然半夜肚子餓真的會出事。'
    },
    {
        id: 'demo-en',
        label: '示範：英文',
        text: "So here's a fun fact about my morning routine - I always tell myself I'll wake up early and go for a run.\nAnd every single time, my alarm goes off, and I just hit snooze about five times in a row.\nBy the time I actually get out of bed, I've completely given up on the run and I'm just making coffee instead.\nHonestly, I've stopped feeling guilty about it. Some days you're a morning person, and some days you're just... not.\nThe important thing is you still show up, even if showing up just means walking to the kitchen."
    },
    {
        id: 'demo-mix1',
        label: '示範：中英夾雜①',
        text: '欸我跟你講，我昨天去了一家新開的café，氣氛真的很chill，很適合work from home的人去坐一整個下午。\n我點了一杯latte，配一個croissant，價錢還算reasonable啦，大概一百多塊而已。\n重點是wifi超快，插座也很多，難怪一堆freelancer都窩在那邊工作。\n下次你如果想找地方meeting或是brainstorm，我可以推薦你這間，真的很不錯。'
    },
    {
        id: 'demo-mix2',
        label: '示範：中英夾雜②',
        text: 'Okay大家，我們先quickly recap一下這禮拜的進度。\n目前這個project大概完成了七成，剩下的deadline是下禮拜五，時間有點tight，大家要抓緊。\n如果中間有任何blocker，記得馬上跟我提出來，不要等到最後一刻才說。\n另外下午三點有一個follow-up meeting，麻煩大家先看過附件的資料，我們到時候直接討論重點就好。'
    }
];

function renderLanguageDropdowns() {
    [els.languageSelectContainer, els.languageSelectSettingsContainer].forEach(container => {
        container.innerHTML = `
            <button class="w-full flex items-center justify-between text-left bg-neutral-800 border border-neutral-700 rounded px-3 h-[38px] text-sm text-neutral-300 focus:ring-2 focus:ring-[#FFBB00] focus:border-transparent outline-none transition-colors hover:bg-neutral-700 min-w-[200px]" data-dropdown-toggle>
                <div class="flex flex-col flex-1 truncate">
                    <span class="font-medium dropdown-title">自動偵測</span>
                    <span class="text-[10px] text-neutral-400 dropdown-subtitle truncate h-3 mt-0.5" style="display: none;"></span>
                </div>
                <svg class="w-4 h-4 ml-2 flex-shrink-0 text-neutral-400 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <div class="absolute z-50 w-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl opacity-0 scale-95 pointer-events-none transition-all duration-200 origin-top dropdown-menu overflow-hidden flex flex-col max-h-[60vh] sm:max-h-[300px]">
                <div class="overflow-y-auto no-scrollbar py-2">
                    <button class="w-full text-left px-3 py-2 hover:bg-neutral-800 transition-colors flex flex-col lang-option" data-value="auto">
                        <div class="flex items-center justify-between w-full">
                            <span class="font-medium text-white">自動偵測</span>
                            <span class="text-[10px] text-neutral-500 auto-detected-label ml-2 truncate"></span>
                        </div>
                    </button>

                    <div class="px-3 py-1 mt-1 flex items-center justify-between">
                        <span class="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">支援自動偵測</span>
                    </div>

                    ${AUTO_LANGS.map(lang => `
                        <button class="w-full text-left px-3 py-1.5 hover:bg-neutral-800 transition-colors flex items-center justify-between lang-option" data-value="${lang.id}">
                            <span class="text-sm text-neutral-300">${lang.name}</span>
                            <span class="text-[9px] font-bold bg-[#FFBB00]/10 text-[#FFBB00] px-1.5 py-0.5 rounded-full tracking-wider">自動</span>
                        </button>
                    `).join('')}

                    ${MANUAL_LANGS.length > 0 ? `
                    <div class="px-3 py-1 mt-2 flex items-center justify-between border-t border-neutral-800 pt-2">
                        <span class="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Manual Selection</span>
                    </div>

                    ${MANUAL_LANGS.map(lang => `
                        <button class="w-full text-left px-3 py-1.5 hover:bg-neutral-800 transition-colors flex items-center justify-between lang-option" data-value="${lang.id}">
                            <span class="text-sm text-neutral-300">${lang.name}</span>
                        </button>
                    `).join('')}
                    ` : ''}
                </div>
            </div>
        `;

        const toggle = container.querySelector('[data-dropdown-toggle]') as HTMLButtonElement;
        const menu = container.querySelector('.dropdown-menu') as HTMLDivElement;
        const svg = toggle.querySelector('svg') as SVGElement;

        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = !menu.classList.contains('opacity-0');

            // Close all
            document.querySelectorAll('.dropdown-menu').forEach(m => {
                m.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                const btn = m.previousElementSibling as HTMLButtonElement;
                if (btn) btn.querySelector('svg')?.classList.remove('rotate-180');
            });

            if (!isOpen) {
                menu.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
                svg.classList.add('rotate-180');

                // Smart positioning
                const rect = menu.getBoundingClientRect();
                if (rect.bottom > window.innerHeight) {
                    menu.style.bottom = '100%';
                    menu.style.top = 'auto';
                    menu.style.marginBottom = '0.5rem';
                } else {
                    menu.style.bottom = 'auto';
                    menu.style.top = '100%';
                    menu.style.marginBottom = '0';
                }
            }
        });

        const options = menu.querySelectorAll('.lang-option');
        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const val = (opt as HTMLButtonElement).dataset.value!;
                handleLanguageChange(val);
                menu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                svg.classList.remove('rotate-180');
            });
        });
    });

    window.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            const btn = menu.previousElementSibling as HTMLButtonElement;
            if (btn) btn.querySelector('svg')?.classList.remove('rotate-180');
        });
    });
}

function updateAutoDetectText(detectedVal: string | null) {
    let detectedName = '';
    const allLangs = [...AUTO_LANGS, ...MANUAL_LANGS];

    if (detectedVal) {
        const found = allLangs.find(l => l.id === detectedVal);
        detectedName = found ? found.name : detectedVal;
    }

    [els.languageSelectContainer, els.languageSelectSettingsContainer].forEach(container => {
        const toggleTitle = container.querySelector('.dropdown-title') as HTMLElement;
        const toggleSub = container.querySelector('.dropdown-subtitle') as HTMLElement;
        const autoOptLabel = container.querySelector('.auto-detected-label') as HTMLElement;

        if (!toggleTitle) return;

        // Ensure subtitle is always hidden since we are using brackets in the title now
        if (toggleSub) toggleSub.style.display = 'none';

        if (state.languageSetting === 'auto') {
            if (detectedName) {
                toggleTitle.textContent = `自動偵測（${detectedName}）`;
                if (autoOptLabel) autoOptLabel.textContent = `偵測為${detectedName}`;
            } else {
                toggleTitle.textContent = '自動偵測';
                if (autoOptLabel) autoOptLabel.textContent = '';
            }
            toggleTitle.classList.add('text-white');
            toggleTitle.classList.remove('text-neutral-300');
        } else {
            const found = allLangs.find(l => l.id === state.languageSetting);
            toggleTitle.textContent = found ? found.name : state.languageSetting;
            toggleTitle.classList.remove('text-white');
            toggleTitle.classList.add('text-neutral-300');

            if (autoOptLabel) autoOptLabel.textContent = detectedName ? `偵測為${detectedName}` : '';
        }
    });
}

// --- PWA Update Handling ---
registerSW({ immediate: true });

// --- Settings persistence ---
// Restore saved settings (merged over factory defaults for any field a
// previous version didn't have yet), then wrap config in a Proxy so EVERY
// future change to any state.config.* field auto-saves — no need to
// remember to call a save function at each of the ~25 places settings get
// mutated throughout this file.
state.config = new Proxy(loadConfig(), {
    set(target, prop, value) {
        (target as any)[prop] = value;
        saveConfig(target as typeof target);
        return true;
    }
});

// --- Initialization ---
initElements();
initSpeech();
renderLanguageDropdowns();

// --- Toast ---
let langWarningTimer: ReturnType<typeof setTimeout> | null = null;
function showLangDetectionWarning() {
    const toast = els.langDetectionWarning;
    toast.classList.remove('hidden');
    if (langWarningTimer) clearTimeout(langWarningTimer);
    langWarningTimer = setTimeout(() => toast.classList.add('hidden'), 6000);
}

// --- Main Logic ---

function loadScript(text: string, googleDocUrl: string | null = null): void {
    if (!text) return;
    const scriptText = text.trim();
    if (!scriptText) return;

    state.googleDocUrl = googleDocUrl;

    // Save to history (unless it's a reload of the same text, handled by storage)
    saveToHistory(scriptText, googleDocUrl);

    // Detect language and update Speech Recognition
    let targetLang = state.languageSetting;

    if (targetLang === 'auto') {
        const results = detectAll(scriptText);
        const top = results[0];
        const confidence = top?.accuracy ?? 0;
        const detection = top?.lang ?? '';
        let mappedLang = LANG_MAP[detection] || 'en-US';
        state.detectedLanguage = mappedLang;
        targetLang = mappedLang;
        updateAutoDetectText(mappedLang);
        if (confidence < 0.5) {
            showLangDetectionWarning();
        }
    } else {
        state.detectedLanguage = null;
        updateAutoDetectText(null);
    }

    state.selectedLanguage = targetLang;
    if (state.recognition) {
        state.recognition.lang = targetLang;
    }


    // Instant Update Logic:
    // If preserveFormatting is ON, we want to treat newlines as actual breaks.
    // We'll use ||BR|| for this.
    let processedText = scriptText;
    if (state.config.preserveFormatting) {
        processedText = processedText.replace(/\n/g, ' ||BR|| ');
    } else {
        processedText = processedText.replace(/\n+/g, ' ||LB|| ');
    }

    const rawWords = tokenizeWords(processedText);

    let inBracket = false;
    state.scriptWords = rawWords.map(word => {
        // Check special stop sign token
        if (word === '||LB||') {
            return {
                word: '🛑',
                clean: '',
                element: null,
                skip: true,
                isStop: true
            } as ScriptWord;
        }

        // Check special break token
        if (word === '||BR||') {
            return {
                word: '',
                clean: '',
                element: null,
                skip: true,
                isBreak: true, // Flag to mark as line break
                isStop: false
            } as ScriptWord;
        }

        // Check bracket state
        if (word.includes('[')) inBracket = true;
        const shouldSkip = inBracket || /[\u{1F300}-\u{1F9FF}]/u.test(word); // Skip brackets and emojis
        if (word.includes(']')) inBracket = false;

        // Clean word for matching
        const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

        return {
            word: word,
            clean: cleanWord,
            element: null,
            skip: shouldSkip,
            isStop: false
        } as ScriptWord;
    });

    renderScript();
    applySettings(); // Ensure settings are applied after render
    lockBodyScroll(); // Keep tap targets aligned in the full-screen prompter (see below)
}

function resetApp(): void {
    stopListening();
    autoScrollManager.stop();
    isAutoScrollStarting = false;
    if (state.isVideoMode) exitVideoMode();
    unlockBodyScroll();
    els.prompterContainer.classList.add('hidden');
    els.setupScreen.classList.remove('hidden');
    renderHistoryList(getHistory(), loadScript);
}

// ── Body scroll lock — iOS PWA landscape tap-offset fix ──────────────────
// On iOS 26 (esp. standalone/PWA, landscape) the page can get stuck in a
// negative scroll / visual-viewport offset — observed live as
// scrollY === visualViewport.offsetTop === -62. Touch coordinates are in
// visual-viewport space while element hit-testing is in layout space, so that
// offset makes every tap land ~62px from where the control is painted — both
// the dock buttons AND the script words ("I have to tap below the button").
// The teleprompter is a full-screen fixed overlay that never needs to scroll,
// so we pin the body at scroll 0 while it's open, which keeps the two
// coordinate systems aligned. Verified on-device: with this lock, scrollY and
// visualViewport.offsetTop stay 0 and taps register correctly.
let bodyScrollLocked = false;
function lockBodyScroll(): void {
    if (bodyScrollLocked) return;
    bodyScrollLocked = true;
    const b = document.body, h = document.documentElement;
    h.style.overflow = 'hidden';
    b.style.position = 'fixed';
    b.style.top = '0';
    b.style.left = '0';
    b.style.right = '0';
    b.style.bottom = '0';
    b.style.width = '100%';
    b.style.height = '100%';
    b.style.overflow = 'hidden';
    b.style.overscrollBehavior = 'none';
    window.scrollTo(0, 0);
}
function unlockBodyScroll(): void {
    if (!bodyScrollLocked) return;
    bodyScrollLocked = false;
    const b = document.body, h = document.documentElement;
    h.style.overflow = '';
    b.style.position = '';
    b.style.top = '';
    b.style.left = '';
    b.style.right = '';
    b.style.bottom = '';
    b.style.width = '';
    b.style.height = '';
    b.style.overflow = '';
    b.style.overscrollBehavior = '';
    window.scrollTo(0, 0);
}
// The stuck offset can reappear on orientation change or when iOS adjusts the
// visual viewport; re-zero the scroll whenever it drifts while locked.
function keepScrollZeroWhileLocked(): void {
    if (bodyScrollLocked && Math.round(window.scrollY) !== 0) window.scrollTo(0, 0);
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', keepScrollZeroWhileLocked);
    window.visualViewport.addEventListener('scroll', keepScrollZeroWhileLocked);
}
window.addEventListener('orientationchange', () => setTimeout(keepScrollZeroWhileLocked, 60));

function clearHistory(): void {
    if (confirm('Clear all recent scripts?')) {
        clearAllHistory();
        renderHistoryList(getHistory(), loadScript);
    }
}

// --- Event Listeners ---

// Load Script Button
els.loadScriptBtn.addEventListener('click', () => {
    (window as any).umami?.track('start-teleprompter');
    loadScript(els.inputScript.value);
});

// Clear Script Button
els.clearScriptBtn.addEventListener('click', () => {
    (window as any).umami?.track('clear-script');
    els.inputScript.value = '';
    els.inputScript.focus();
});

// Copy Script Button
els.copyScriptBtn.addEventListener('click', async () => {
    const text = els.inputScript.value;
    if (!text) return;
    (window as any).umami?.track('copy-script');
    try {
        await navigator.clipboard.writeText(text);
        const originalText = els.copyScriptBtn.textContent;
        els.copyScriptBtn.textContent = '已複製！';
        setTimeout(() => els.copyScriptBtn.textContent = originalText, 1500);
    } catch (err) {
    }
});

// Paste Script Button
els.pasteScriptBtn.addEventListener('click', async () => {
    (window as any).umami?.track('paste-script');
    try {
        const text = await navigator.clipboard.readText();
        els.inputScript.value = text;
        els.inputScript.focus();
    } catch (err) {
        console.error('Failed to paste!', err);
    }
});

// Demo Script Buttons (testing phase)
const demoButtonsContainer = document.getElementById('demoScriptButtons');
if (demoButtonsContainer) {
    demoButtonsContainer.innerHTML = DEMO_SCRIPTS.map(demo => `
        <button data-demo-id="${demo.id}"
            class="px-3 py-1.5 landscape:px-2 landscape:py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-xs landscape:text-[10px] text-neutral-300 transition-all">
            ${demo.label}
        </button>
    `).join('');
    demoButtonsContainer.querySelectorAll('[data-demo-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const demo = DEMO_SCRIPTS.find(d => d.id === (btn as HTMLElement).dataset.demoId);
            if (!demo) return;
            els.inputScript.value = demo.text;
            els.inputScript.focus();
        });
    });
}

// --- Google Doc Event Listeners ---

// Show Import Modal
els.importGoogleDocBtn.addEventListener('click', () => {
    (window as any).umami?.track('open-google-doc-modal');
    els.googleDocUrlInput.value = '';
    els.googleDocModal.classList.remove('hidden');
    els.googleDocUrlInput.focus();
});

// Close Import Modal
els.closeGoogleDocModalBtn.addEventListener('click', () => {
    els.googleDocModal.classList.add('hidden');
});

// Paste Google Doc Link Button
els.pasteGoogleDocUrlBtn.addEventListener('click', async () => {
    (window as any).umami?.track('paste-google-doc-url');
    try {
        const text = await navigator.clipboard.readText();
        els.googleDocUrlInput.value = text.trim();
        els.googleDocUrlInput.focus();
    } catch (err) {
        console.error('Failed to paste Google Doc URL!', err);
    }
});

// Confirm Import from Google Doc
els.confirmGoogleDocImportBtn.addEventListener('click', async () => {
    const url = els.googleDocUrlInput.value.trim();
    if (!url) {
        alert('請先輸入 Google 文件的網址。');
        return;
    }

    const btn = els.confirmGoogleDocImportBtn as HTMLButtonElement;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '匯入中...';

    try {
        const text = await fetchGoogleDocText(url);
        (window as any).umami?.track('import-google-doc-success');
        
        els.inputScript.value = text;
        els.googleDocModal.classList.add('hidden');
        
        // Load script and pass the URL to state/history
        loadScript(text, url);
    } catch (err: any) {
        (window as any).umami?.track('import-google-doc-error', { error: err.message });
        alert(err.message || '匯入文件失敗。');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// Refresh Google Doc from Settings
els.refreshGoogleDocBtn.addEventListener('click', async () => {
    const url = state.googleDocUrl;
    if (!url) return;

    (window as any).umami?.track('refresh-google-doc-click');
    const btn = els.refreshGoogleDocBtn as HTMLButtonElement;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '同步中...';

    try {
        const text = await fetchGoogleDocText(url);
        (window as any).umami?.track('refresh-google-doc-success');

        els.inputScript.value = text;

        // Preserve current index if applicable
        const prevIndex = state.currentIndex;
        
        loadScript(text, url);

        // Restore position as close as possible
        if (prevIndex < state.scriptWords.length) {
            state.currentIndex = prevIndex;
            updateHighlight();
            scrollToCurrent();
        }

        btn.textContent = '已同步！';
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }, 1500);
    } catch (err: any) {
        (window as any).umami?.track('refresh-google-doc-error', { error: err.message });
        alert(err.message || '重新同步文件失敗。');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// Copy Google Doc URL from Settings
els.copyGoogleDocUrlBtn.addEventListener('click', async () => {
    const url = state.googleDocUrl;
    if (!url) return;

    (window as any).umami?.track('copy-google-doc-url-click');
    try {
        await navigator.clipboard.writeText(url);
        
        // Show brief visual checkmark on the icon, and show alert
        const originalHTML = els.copyGoogleDocUrlBtn.innerHTML;
        els.copyGoogleDocUrlBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>`;
        
        alert('已複製 Google 文件連結！');
        
        els.copyGoogleDocUrlBtn.innerHTML = originalHTML;
    } catch (err) {
        console.error('Failed to copy Google Doc link:', err);
        alert('複製連結失敗，請手動從網址列複製。');
    }
});

// Play / Pause / Record Button
let isAutoScrollStarting = false;

// Shared start/stop for the teleprompter's own scroll-following (voice/sound/constant
// modes), used by both the standalone mic button (practice mode, no recording) and
// the unified record button (recording + teleprompter together).
async function startTeleprompterPlayback(): Promise<boolean> {
    if (state.isListening) return true;

    if (state.config.scrollingMode === 'voice') {
        (window as any).umami?.track('mic-start');
        startListening();
    } else {
        isAutoScrollStarting = true;
        const started = await autoScrollManager.start();
        isAutoScrollStarting = false;
        if (!started) {
            if (state.config.scrollingMode === 'sound') {
                alert('聲音偵測模式需要麥克風權限，請允許權限後再試一次。');
            }
            return false;
        }
        state.isListening = true;
        const { updateMicUI } = await import('./render');
        updateMicUI(true);
    }
    // Fade dock while listening
    const dock = document.getElementById('mainControlsDock');
    if (dock) dock.style.opacity = (state.config.dockOpacity / 100).toString();
    return true;
}

function stopTeleprompterPlayback(): void {
    if (!state.isListening) return;

    if (state.config.scrollingMode === 'voice') {
        (window as any).umami?.track('mic-stop');
        stopListening();
    } else {
        autoScrollManager.stop();
        state.isListening = false;
        import('./render').then(({ updateMicUI }) => updateMicUI(false));
    }
    // Restore dock opacity (unless a recording is still using it)
    if (!state.isRecording) {
        const dock = document.getElementById('mainControlsDock');
        if (dock) dock.style.opacity = '';
    }
}

els.micButton.addEventListener('click', async () => {
    if (isAutoScrollStarting) {
        autoScrollManager.stop();
        isAutoScrollStarting = false;
        return;
    }

    if (state.isListening) {
        // Stopping: tear down recording first (if armed and active), then playback.
        if (state.isRecording) {
            if (state.recordingMode === 'video') {
                stopRecording();
            } else {
                stopAudioOnlyRecording();
            }
        }
        stopTeleprompterPlayback();
    } else {
        // Starting: if recording is armed, start the recording first — if that
        // fails (permission denied etc.) don't start the teleprompter either,
        // since the user asked for a recorded session.
        if (state.recordArmed) {
            let ok = false;
            if (state.recordingMode === 'video') {
                if (!state.isVideoMode) {
                    await enterVideoMode();
                }
                if (state.isVideoMode) {
                    startRecording();
                    ok = true;
                }
            } else {
                ok = await startAudioOnlyRecording();
            }
            if (!ok) return;
        }
        await startTeleprompterPlayback();
    }
});

// Reset App Button
els.resetAppBtn.addEventListener('click', resetApp);

// Restart Script Button
els.restartScriptBtn.addEventListener('click', restartScript);

const visitorPlatform = detectVisitorPlatform();
const nativePromo = getNativePromo(visitorPlatform);
els.nativePromoTitle.textContent = nativePromo.title;

let promoTimeout: number | null = null;
let currentPromoPairIndex = 0;
let currentPromoPairStatic = '';
let currentPromoWord = '';

function startPromoAnimation() {
    if (promoTimeout) {
        window.clearTimeout(promoTimeout);
        promoTimeout = null;
    }

    const subtitleEl = els.nativePromoSubtitle;

    const pair = nativePromo.pairs[currentPromoPairIndex];
    currentPromoPairIndex = (currentPromoPairIndex + 1) % nativePromo.pairs.length;
    
    currentPromoPairStatic = pair.line1;

    if (pair.rotating.length === 0) {
        currentPromoWord = '';
        subtitleEl.innerHTML = `<div>${pair.line1}</div><div>${pair.line2}</div>`;
        return;
    }

    let currentIndex = 0;
    currentPromoWord = pair.rotating[currentIndex];

    subtitleEl.innerHTML = `<div>${pair.line1}</div><div class="flex items-center">${pair.line2}<span class="promo-rotating-word inline-block transition-all duration-500 opacity-100 translate-y-0 text-[#FFBB00] font-medium whitespace-nowrap ml-1">${pair.rotating[currentIndex]}</span></div>`;

    const rotatingEl = subtitleEl.querySelector('.promo-rotating-word') as HTMLElement;

    function animateNextWord() {
        promoTimeout = window.setTimeout(() => {
            if (!document.body.contains(rotatingEl)) return;

            rotatingEl.classList.remove('opacity-100', 'translate-y-0');
            rotatingEl.classList.add('opacity-0', '-translate-y-2');

            promoTimeout = window.setTimeout(() => {
                if (!document.body.contains(rotatingEl)) return;
                currentIndex = (currentIndex + 1) % pair.rotating.length;
                currentPromoWord = pair.rotating[currentIndex];
                rotatingEl.textContent = pair.rotating[currentIndex];

                rotatingEl.classList.remove('-translate-y-2', 'transition-all', 'duration-500');
                rotatingEl.classList.add('translate-y-2');

                void rotatingEl.offsetWidth;

                rotatingEl.classList.add('transition-all', 'duration-500');
                rotatingEl.classList.remove('opacity-0', 'translate-y-2');
                rotatingEl.classList.add('opacity-100', 'translate-y-0');

                animateNextWord();
            }, 500);
        }, 1500);
    }

    animateNextWord();
}

function stopPromoAnimation() {
    if (promoTimeout) {
        window.clearTimeout(promoTimeout);
        promoTimeout = null;
    }
}

// Toggle Settings
els.toggleSettingsBtn.addEventListener('click', () => {
    (window as any).umami?.track('settings-toggle');
    const isHidden = els.settingsPanel.classList.toggle('hidden');
    if (!isHidden) {
        startPromoAnimation();
        if (!isIOS) {
            enumerateAndPopulateDevices(false);
        }
    } else {
        stopPromoAnimation();
    }
});

// Close Settings
els.closeSettingsBtn.addEventListener('click', () => {
    els.settingsPanel.classList.add('hidden');
    stopPromoAnimation();
});

// Native App Promo Card Banner
els.settingsNativeAppBanner.addEventListener('click', () => {
    const promoData = currentPromoWord ? `${currentPromoPairStatic} - ${currentPromoWord}` : currentPromoPairStatic;
    (window as any).umami?.track(nativePromo.analyticsEvent, {
        destination: nativePromo.href,
        sourcePlatform: visitorPlatform,
        variant: promoData
    });
    window.location.href = nativePromo.href;
});

// Font Size Slider
els.fontSizeInput.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    state.config.fontSize = val;
    els.fontSizeVal.textContent = `${val}px`;
    els.scriptContent.style.fontSize = `${val}px`;
});

// Line Height Slider
els.lineHeightInput.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    state.config.lineHeight = val;
    els.lineHeightVal.textContent = `${val}x`;
    els.scriptContent.style.lineHeight = `${val}`;
});

// Paragraph Spacing Slider
els.paragraphSpacingInput.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    state.config.paragraphSpacing = val;
    els.paragraphSpacingVal.textContent = `${val}em`;
    applySettings();
});

// Margin Slider
els.marginInput.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    state.config.margin = val;
    els.marginVal.textContent = `${val}%`;
    els.scriptContent.style.paddingLeft = `${val}%`;
    els.scriptContent.style.paddingRight = `${val}%`;
});

// Dock Opacity Slider
els.dockOpacityInput.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    state.config.dockOpacity = val;
    els.dockOpacityVal.textContent = `${val}%`;
    // Apply live preview if the dock is currently faded (mic listening or recording)
    if (state.isListening || state.isRecording) {
        const dock = document.getElementById('mainControlsDock');
        if (dock) dock.style.opacity = (val / 100).toString();
    }
});

// Active Line Position Slider
els.activeLinePositionInput.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    state.config.activeLinePosition = val;
    els.activeLinePositionVal.textContent = `${val}%`;

    // Update spacer to allow scrolling to the bottom-most position
    // If position is 90% (bottom), we need less spacer at top but more at bottom?
    // Actually, scrollToCurrent handles the positioning logic.
    // We just need to trigger a scroll update.
    scrollToCurrent();
});

// Lookahead Words Slider
els.lookaheadWordsInput.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    state.config.lookaheadWords = val;
    els.lookaheadWordsVal.textContent = `${val}`;
});

// Text / Background Color — pickers, preset swatches, and remembered choice
// (saved automatically via the state.config Proxy set up above) all share
// these two setters so the hex label and swatch highlighting never drift
// out of sync with whichever path changed the color.
const TEXT_COLOR_PRESETS = ['#ffffff', '#000000', '#FFBB00', '#4ADE80', '#67E8F9', '#F87171'];
const BG_COLOR_PRESETS = ['#000000', '#ffffff', '#1a1a1a', '#0f172a', '#1e1b4b', '#052e16'];

function setTextColor(hex: string): void {
    state.config.textColor = hex;
    els.textColorInput.value = hex;
    els.textColorHex.textContent = hex;
    applySettings();
    updateColorPresetSelection();
}

function setBgColor(hex: string): void {
    state.config.bgColor = hex;
    els.bgColorInput.value = hex;
    els.bgColorHex.textContent = hex;
    applySettings();
    updateColorPresetSelection();
}

function updateColorPresetSelection(): void {
    els.textColorPresets.querySelectorAll('[data-color]').forEach(btn => {
        const isActive = (btn as HTMLElement).dataset.color?.toLowerCase() === state.config.textColor.toLowerCase();
        btn.classList.toggle('ring-2', isActive);
        btn.classList.toggle('ring-[#FFBB00]', isActive);
    });
    els.bgColorPresets.querySelectorAll('[data-color]').forEach(btn => {
        const isActive = (btn as HTMLElement).dataset.color?.toLowerCase() === state.config.bgColor.toLowerCase();
        btn.classList.toggle('ring-2', isActive);
        btn.classList.toggle('ring-[#FFBB00]', isActive);
    });
}

function renderColorPresets(container: HTMLElement, colors: string[], onPick: (hex: string) => void): void {
    container.innerHTML = colors.map(hex => `
        <button data-color="${hex}" title="${hex}" aria-label="${hex}"
            class="w-6 h-6 rounded-full border border-neutral-600 transition-transform hover:scale-110"
            style="background-color: ${hex};"></button>
    `).join('');
    container.querySelectorAll('[data-color]').forEach(btn => {
        btn.addEventListener('click', () => onPick((btn as HTMLElement).dataset.color!));
    });
}

renderColorPresets(els.textColorPresets, TEXT_COLOR_PRESETS, setTextColor);
renderColorPresets(els.bgColorPresets, BG_COLOR_PRESETS, setBgColor);

// Text Color Picker
els.textColorInput.addEventListener('input', (e) => {
    setTextColor((e.target as HTMLInputElement).value);
});

// Background Color Picker
els.bgColorInput.addEventListener('input', (e) => {
    setBgColor((e.target as HTMLInputElement).value);
});

// Alignment Buttons
(['left', 'center', 'right'] as const).forEach(align => {
    els.alignBtns[align].addEventListener('click', () => {
        state.config.textAlign = align;
        els.scriptContent.style.textAlign = align;
        updateAlignmentButtons();
    });
});

// Text Direction Buttons
(['ltr', 'rtl'] as const).forEach(dir => {
    els.dirBtns[dir].addEventListener('click', () => {
        state.config.textDirection = dir as 'ltr' | 'rtl';
        applySettings();
        updateDirectionButtons();
    });
});

// Theme Presets
els.themeDarkBtn.addEventListener('click', () => {
    setBgColor('#000000');
    setTextColor('#ffffff');
});

els.themeLightBtn.addEventListener('click', () => {
    setBgColor('#ffffff');
    setTextColor('#000000');
});

// --- Recording save folder (Chromium File System Access API only — no
// equivalent exists on iOS Safari, the primary platform for this app, so
// this section stays hidden there and recordings just use the browser's
// normal download behavior). ---
const supportsDirectoryPicker = 'showDirectoryPicker' in window;
if (supportsDirectoryPicker) {
    els.recordingPathSupported.classList.remove('hidden');
} else {
    els.recordingPathUnsupported.classList.remove('hidden');
}

async function refreshRecordingPathStatus(): Promise<void> {
    if (!supportsDirectoryPicker) return;
    const handle = await getRecordingDirHandle();
    els.recordingPathStatus.textContent = handle
        ? `目前存到：${handle.name}（每次錄影可能會再跳出一次權限確認）`
        : '尚未設定，錄影會用瀏覽器預設下載方式。';
}

els.chooseRecordingPathBtn.addEventListener('click', async () => {
    if (!supportsDirectoryPicker) return;
    try {
        const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        await saveRecordingDirHandle(handle);
        await refreshRecordingPathStatus();
    } catch (err) {
        // User cancelled the folder picker — nothing to report.
    }
});

refreshRecordingPathStatus();

// Mirror Toggle
els.mirrorToggle.addEventListener('change', (e) => {
    state.isMirrored = (e.target as HTMLInputElement).checked;

    if (state.isMirrored) {
        els.scrollContainer.classList.add('mirror-mode');
    } else {
        els.scrollContainer.classList.remove('mirror-mode');
    }
});

// Horizontal Mirror Toggle (beta, revealed via ?beta=hmirror)
els.hMirrorToggle.addEventListener('change', (e) => {
    state.isMirroredH = (e.target as HTMLInputElement).checked;

    if (state.isMirroredH) {
        els.scrollContainer.classList.add('mirror-mode-h');
    } else {
        els.scrollContainer.classList.remove('mirror-mode-h');
    }
});

// Stop Sign Toggle
els.stopSignToggle.addEventListener('change', (e) => {
    state.config.showStopIcon = (e.target as HTMLInputElement).checked;
    if (state.config.showStopIcon) {
        els.scriptContent.classList.add('show-stops');
    } else {
        els.scriptContent.classList.remove('show-stops');
    }
});

function handleLanguageChange(lang: string) {
    (window as any).umami?.track('language-select', { language: lang });
    state.languageSetting = lang;

    // if auto, re-detect if there is a script
    if (lang === 'auto') {
        if (els.inputScript.value.trim()) {
            const results = detectAll(els.inputScript.value.trim());
            const top = results[0];
            const confidence = top?.accuracy ?? 0;
            const detection = top?.lang ?? '';
            const mappedLang = LANG_MAP[detection] || 'en-US';
            state.detectedLanguage = mappedLang;
            state.selectedLanguage = mappedLang;
            updateAutoDetectText(mappedLang);
            if (confidence < 0.5) {
                showLangDetectionWarning();
            }
        } else {
            state.selectedLanguage = 'en-US'; // fallback empty script
            updateAutoDetectText(null);
        }
    } else {
        state.selectedLanguage = lang;
        state.detectedLanguage = null;
        updateAutoDetectText(null);
    }

    if (state.recognition) {
        state.recognition.lang = state.selectedLanguage;
    }
}

// Preserve Formatting Toggle
els.preserveFormattingToggle.addEventListener('change', (e) => {
    state.config.preserveFormatting = (e.target as HTMLInputElement).checked;

    // Instant update if we have text
    const text = els.inputScript.value.trim();
    if (text) {
        // Save current index to try and restore position
        const currentIndex = state.currentIndex;

        loadScript(text);

        // Restore position (approximate)
        if (currentIndex < state.scriptWords.length) {
            state.currentIndex = currentIndex;
            updateHighlight();
            scrollToCurrent();
        }
    }
});

// Voice Command Toggle
els.voiceCommandToggle.addEventListener('change', (e) => {
    state.config.voiceCommandsEnabled = (e.target as HTMLInputElement).checked;
});

// Screen Rotation Toggle
els.screenRotationToggle.addEventListener('change', (e) => {
    state.isScreenRotated = (e.target as HTMLInputElement).checked;

    if (state.isScreenRotated) {
        document.body.classList.add('screen-rotated');
    } else {
        document.body.classList.remove('screen-rotated');
    }
    // Re-evaluate the dock: in rotated mode it must drop the viewport-based
    // pin and use the CSS `bottom-8`; on un-rotate it must re-pin.
    pinDockToVisualViewport();
});

// Smooth Animations Toggle
els.smoothAnimationsToggle.addEventListener('change', (e) => {
    state.config.smoothAnimations = (e.target as HTMLInputElement).checked;
    applySettings();
});

// Highlight Active Word Toggle
els.highlightActiveWordToggle.addEventListener('change', (e) => {
    state.config.highlightActiveWord = (e.target as HTMLInputElement).checked;
    applySettings();
    updateHighlight();
});

// Font Family Buttons
(['mono', 'sans', 'serif', 'comicSans', 'openDyslexic'] as const).forEach(font => {
    els.fontFamilyBtns[font].addEventListener('click', () => {
        state.config.fontFamily = font;
        applySettings();
        updateFontFamilyButtons();
    });
});

// Clear History Button
els.clearHistoryBtn.addEventListener('click', clearHistory);

// Dismiss Browser Warning
els.dismissWarningBtn.addEventListener('click', () => {
    els.browserWarning.classList.add('hidden');
});

// Dismiss iPad PWA Warning
els.dismissIpadWarningBtn.addEventListener('click', () => {
    els.ipadPwaWarning.classList.add('hidden');
});

// Dismiss Language Detection Warning
els.dismissLangWarningBtn.addEventListener('click', () => {
    els.langDetectionWarning.classList.add('hidden');
    if (langWarningTimer) clearTimeout(langWarningTimer);
});

// Dismiss Android Video Warning
els.dismissAndroidVideoWarningBtn.addEventListener('click', () => {
    els.androidVideoWarning.classList.add('hidden');
});

// --- Camera Toggle (off = audio only, on = video) ---
// Turning the camera on previews it immediately (so you can frame the shot)
// — it does NOT start recording by itself. Recording only starts when
// "Start Teleprompter" is pressed with the Record-Armed toggle on.

function updateCameraToggleUI(): void {
    const isVideo = state.recordingMode === 'video';

    // Explicit remove+add on BOTH states, not classList.toggle() of just the
    // active-state classes — the resting-state bg/border/text were static
    // classes in the HTML that never got removed, so the active color and
    // the resting color sat in the class list at the same time and whichever
    // one Tailwind's generated CSS happened to place later in the stylesheet
    // silently won. That's the "sometimes it doesn't pop" bug.
    if (isVideo) {
        els.cameraToggleBtn.classList.remove('bg-neutral-900/90', 'border-neutral-500', 'text-neutral-400');
        els.cameraToggleBtn.classList.add('bg-[#FFBB00]', 'border-[#FFBB00]', 'text-neutral-900');
    } else {
        els.cameraToggleBtn.classList.remove('bg-[#FFBB00]', 'border-[#FFBB00]', 'text-neutral-900');
        els.cameraToggleBtn.classList.add('bg-neutral-900/90', 'border-neutral-500', 'text-neutral-400');
    }

    els.cameraToggleIcon.textContent = isVideo ? '🎥' : '📷';
    els.cameraToggleLabel.textContent = isVideo ? '鏡頭：開啟' : '鏡頭：關閉';
    els.cameraToggleBtn.dataset.tip = isVideo ? '鏡頭：開啟（錄影模式）' : '鏡頭：關閉（錄音模式）';
}

els.cameraToggleBtn.addEventListener('click', async () => {
    if (state.isRecording) return;

    if (state.recordingMode === 'video') {
        state.recordingMode = 'audio';
        if (state.isVideoMode) exitVideoMode();
        updateCameraToggleUI();
    } else {
        state.recordingMode = 'video';
        updateCameraToggleUI();
        if (!state.isVideoMode) {
            await enterVideoMode();
        }
    }
});

updateCameraToggleUI();

// --- Recording Armed Toggle ---
// Just arms/disarms whether pressing "Start Teleprompter" also records —
// it has no effect by itself.

function updateRecordArmedUI(): void {
    // Same explicit remove+add fix as updateCameraToggleUI() — see comment there.
    if (state.recordArmed) {
        els.recordArmedToggle.classList.remove('bg-neutral-700/90', 'border-neutral-500', 'text-neutral-200');
        els.recordArmedToggle.classList.add('bg-red-600', 'border-red-400', 'text-white');
        els.recordArmedDot.classList.add('bg-red-200');
    } else {
        els.recordArmedToggle.classList.remove('bg-red-600', 'border-red-400', 'text-white');
        els.recordArmedToggle.classList.add('bg-neutral-700/90', 'border-neutral-500', 'text-neutral-200');
        els.recordArmedDot.classList.remove('bg-red-200');
    }
    els.recordArmedToggle.dataset.tip = state.recordArmed
        ? '錄影功能：已開啟（開始提詞會一併錄製）'
        : '錄影功能：關閉（開始提詞只會捲動，不會錄製）';
}

els.recordArmedToggle.addEventListener('click', () => {
    if (state.isRecording) return;
    state.recordArmed = !state.recordArmed;
    updateRecordArmedUI();
});

updateRecordArmedUI();

// Toggle Video Layout
els.videoLayoutToggleBtn.addEventListener('click', toggleVideoLayout);

// Flip Camera (front <-> rear)
els.videoFlipCameraBtn.addEventListener('click', flipCamera);

// --- Initialization ---
function initializeUI(): void {
    // Hidden beta flag: visiting with ?beta=hmirror persistently unlocks the
    // horizontal mirror toggle on this device (and relabels the vertical one).
    if (new URLSearchParams(window.location.search).get('beta') === 'hmirror') {
        localStorage.setItem('beta-hmirror', '1');
    }
    if (localStorage.getItem('beta-hmirror') === '1') {
        els.hMirrorRow.classList.remove('hidden');
        els.hMirrorRow.classList.add('flex');
        els.mirrorModeLabel.textContent = '鏡像模式（垂直）';
    }

    // Set UI values from state
    els.fontSizeVal.textContent = `${state.config.fontSize}px`;
    els.fontSizeInput.value = state.config.fontSize.toString();

    els.lineHeightVal.textContent = `${state.config.lineHeight}x`;
    els.lineHeightInput.value = state.config.lineHeight.toString();
    els.scriptContent.style.lineHeight = `${state.config.lineHeight}`;

    els.paragraphSpacingVal.textContent = `${state.config.paragraphSpacing}em`;
    els.paragraphSpacingInput.value = state.config.paragraphSpacing.toString();

    els.marginVal.textContent = `${state.config.margin}%`;
    els.marginInput.value = state.config.margin.toString();

    els.dockOpacityVal.textContent = `${state.config.dockOpacity}%`;
    els.dockOpacityInput.value = state.config.dockOpacity.toString();

    els.activeLinePositionVal.textContent = `${state.config.activeLinePosition}%`;
    els.activeLinePositionInput.value = state.config.activeLinePosition.toString();

    els.lookaheadWordsVal.textContent = `${state.config.lookaheadWords}`;
    els.lookaheadWordsInput.value = state.config.lookaheadWords.toString();

    // Update alignment and direction buttons
    updateAlignmentButtons();
    updateDirectionButtons();

    els.smoothAnimationsToggle.checked = state.config.smoothAnimations;
    els.highlightActiveWordToggle.checked = state.config.highlightActiveWord;
    els.stopSignToggle.checked = state.config.showStopIcon;
    els.preserveFormattingToggle.checked = state.config.preserveFormatting;
    els.voiceCommandToggle.checked = state.config.voiceCommandsEnabled;
    els.textColorInput.value = state.config.textColor;
    els.bgColorInput.value = state.config.bgColor;
    els.textColorHex.textContent = state.config.textColor;
    els.bgColorHex.textContent = state.config.bgColor;
    updateColorPresetSelection();

    // Seed demo script for first-time users
    const history = getHistory();
    if (history.length === 0) {
        const demoText = DEMO_SCRIPTS[0].text;

        // Save to localStorage with 'demo' tag
        const demoItem = {
            id: Date.now(),
            text: demoText,
            preview: demoText.substring(0, 40) + '...',
            date: new Date().toLocaleDateString(),
            tag: '示範'
        };
        localStorage.setItem('teleprompter_history', JSON.stringify([demoItem]));

        // Prefill textarea
        els.inputScript.value = demoText;

        // Re-render history with the demo item
        renderHistoryList(getHistory(), loadScript);
    } else {
        renderHistoryList(history, loadScript);
    }

    updateAutoDetectText(null);

    // Apply all settings to DOM
    applySettings();
    updateFontFamilyButtons();
    if (isIOS) {
        if (els.devicesSelectionContainer) {
            els.devicesSelectionContainer.classList.add('hidden');
        }
    } else {
        enumerateAndPopulateDevices(false);
    }
}

function updateAlignmentButtons(): void {
    (['left', 'center', 'right'] as const).forEach(a => {
        const btn = els.alignBtns[a];
        const isActive = a === state.config.textAlign;
        btn.classList.toggle('bg-neutral-500', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('hover:bg-neutral-600', !isActive);
    });
}

function updateDirectionButtons(): void {
    (['ltr', 'rtl'] as const).forEach(dir => {
        const btn = els.dirBtns[dir];
        const isActive = state.config.textDirection === dir;
        btn.classList.toggle('bg-neutral-700', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-[#FFBB00]', isActive);
        btn.classList.toggle('bg-neutral-800', !isActive);
        btn.classList.toggle('text-neutral-300', !isActive);
        btn.classList.toggle('border-neutral-700', !isActive);
    });
}

function updateFontFamilyButtons(): void {
    (['mono', 'sans', 'serif', 'comicSans', 'openDyslexic'] as const).forEach(font => {
        const btn = els.fontFamilyBtns[font];
        const isActive = state.config.fontFamily === font;
        btn.classList.toggle('bg-neutral-700', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-[#FFBB00]', isActive);
        btn.classList.toggle('bg-neutral-800', !isActive);
        btn.classList.toggle('text-neutral-300', !isActive);
        btn.classList.toggle('border-neutral-700', !isActive);
    });
}

async function handleDeviceChange(): Promise<void> {
    state.selectedVideoDeviceId = els.videoDeviceSelect.value || null;
    state.selectedAudioDeviceId = els.audioDeviceSelect.value || null;

    // If video mode is active and not recording, seamlessly switch devices
    if (state.isVideoMode && !state.isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints());
            if (state.mediaStream) {
                state.mediaStream.getTracks().forEach(track => track.stop());
            }
            state.mediaStream = stream;
            els.videoPreview.srcObject = stream;
            els.videoPreview.muted = true;
            
            // Use same mirroring rule (mirror front camera selfie mode)
            els.videoPreview.style.transform = state.selectedVideoDeviceId ? 'none' : (state.facingMode === 'user' ? 'scaleX(-1)' : 'none');
            await els.videoPreview.play();
        } catch (err) {
            console.error('Failed to switch media device sources:', err);
            alert('切換所選裝置失敗。');
        }
    }

    // Apply microphone changes to whichever microphone-driven mode is active.
    if (state.isListening) {
        if (state.config.scrollingMode === 'sound') {
            autoScrollManager.stop();
            const started = await autoScrollManager.start();
            if (!started) {
                state.isListening = false;
                const { updateMicUI } = await import('./render');
                updateMicUI(false);
            }
        } else if (state.config.scrollingMode === 'voice') {
            stopListening();
            setTimeout(() => {
                startListening();
            }, 400);
        }
    }
}

if (!isIOS) {
    els.videoDeviceSelect.addEventListener('change', handleDeviceChange);
    els.audioDeviceSelect.addEventListener('change', handleDeviceChange);
}

const permissionRequested = { video: false, audio: false };

async function requestPermissionsOnSelectFocus(kind: 'video' | 'audio') {
    if (permissionRequested[kind]) return;
    
    // Check if we already have device labels for this kind
    const devices = await navigator.mediaDevices.enumerateDevices();
    const needsPermission = devices.some(d => {
        if (kind === 'video' && d.kind === 'videoinput' && !d.label) return true;
        if (kind === 'audio' && d.kind === 'audioinput' && !d.label) return true;
        return false;
    });
    
    if (needsPermission) {
        permissionRequested[kind] = true;
        // Trigger permissions dialog and re-populate for this device kind
        await enumerateAndPopulateDevices(true, kind);
    }
}

if (!isIOS) {
    els.videoDeviceSelect.addEventListener('focus', () => requestPermissionsOnSelectFocus('video'));
    els.audioDeviceSelect.addEventListener('focus', () => requestPermissionsOnSelectFocus('audio'));
    els.videoDeviceSelect.addEventListener('mousedown', () => requestPermissionsOnSelectFocus('video'));
    els.audioDeviceSelect.addEventListener('mousedown', () => requestPermissionsOnSelectFocus('audio'));

    // Listen for browser device changes
    navigator.mediaDevices.addEventListener('devicechange', () => {
        enumerateAndPopulateDevices(false);
    });
}

function updateScrollingUI() {
    els.scrollingModeSelect.value = state.config.scrollingMode;
    els.scrollSpeedInput.value = state.config.scrollSpeed.toString();
    els.scrollSpeedVal.textContent = `${state.config.scrollSpeed.toFixed(1)} 字/秒`;
    els.soundSensitivityInput.value = state.config.soundSensitivity.toString();
    els.soundSensitivityVal.textContent = `${Math.round(state.config.soundSensitivity * 100)}%`;

    els.scrollSpeedContainer.classList.toggle('hidden', state.config.scrollingMode === 'voice');
    els.soundSensitivityContainer.classList.toggle('hidden', state.config.scrollingMode !== 'sound');

    const descriptions: Record<ScrollingMode, string> = {
        voice: '跟著你講的字走，你停頓它也停。',
        sound: '偵測到麥克風有聲音就捲動，安靜時暫停（不判讀內容）。',
        constant: '用你設定的速度持續勻速捲動。'
    };
    els.scrollingModeDescription.textContent = descriptions[state.config.scrollingMode];

    // Update Mic button icon based on mode
    const path = els.micButton.querySelector('path');
    if (path) {
        if (state.config.scrollingMode === 'voice') {
            path.setAttribute('d', 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z');
        } else {
            // Play icon
            path.setAttribute('d', 'M8 5v14l11-7z');
        }
    }
}

els.scrollingModeSelect.addEventListener('change', (e) => {
    state.config.scrollingMode = (e.target as HTMLSelectElement).value as ScrollingMode;
    autoScrollManager.stop();
    isAutoScrollStarting = false;
    updateScrollingUI();
    if (state.isListening) {
        // Stop current mode
        stopListening();
        autoScrollManager.stop();
        state.isListening = false;
        import('./render').then(({ updateMicUI }) => updateMicUI(false));
    }
});

els.scrollSpeedInput.addEventListener('input', (e) => {
    state.config.scrollSpeed = parseFloat((e.target as HTMLInputElement).value);
    els.scrollSpeedVal.textContent = `${state.config.scrollSpeed.toFixed(1)} 字/秒`;
});

els.soundSensitivityInput.addEventListener('input', (e) => {
    state.config.soundSensitivity = parseFloat((e.target as HTMLInputElement).value);
    els.soundSensitivityVal.textContent = `${Math.round(state.config.soundSensitivity * 100)}%`;
});

// Double-click any settings slider to snap it back to its factory default.
// Re-dispatches the slider's own 'input' event instead of duplicating each
// one's side-effect logic (updating the label, applying the style, etc.).
const SLIDER_DEFAULTS: [HTMLInputElement, number][] = [
    [els.fontSizeInput, DEFAULT_CONFIG.fontSize],
    [els.lineHeightInput, DEFAULT_CONFIG.lineHeight],
    [els.paragraphSpacingInput, DEFAULT_CONFIG.paragraphSpacing],
    [els.marginInput, DEFAULT_CONFIG.margin],
    [els.dockOpacityInput, DEFAULT_CONFIG.dockOpacity],
    [els.activeLinePositionInput, DEFAULT_CONFIG.activeLinePosition],
    [els.lookaheadWordsInput, DEFAULT_CONFIG.lookaheadWords],
    [els.scrollSpeedInput, DEFAULT_CONFIG.scrollSpeed],
    [els.soundSensitivityInput, DEFAULT_CONFIG.soundSensitivity],
];
SLIDER_DEFAULTS.forEach(([input, defaultVal]) => {
    input.title = '雙擊恢復預設值';
    input.addEventListener('dblclick', () => {
        input.value = defaultVal.toString();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
});

function boot(): void {
    updateScrollingUI();
    initializeUI();
    pinDockToVisualViewport();

    // Fallback for async localStorage injection (e.g. WKWebView)
    setTimeout(() => {
        renderHistoryList(getHistory(), loadScript);
    }, 500);
}

// Run boot as soon as the DOM is ready. We must NOT rely solely on the
// DOMContentLoaded event: this is an ES module (deferred), so by the time it
// evaluates the DOM is already parsed and the event may have *already fired*
// (or won't fire on a bfcache restore). When that happened, initializeUI never
// ran and the Recent Scripts list stayed empty until a later user action
// (e.g. returning from the prompter) re-rendered it.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    boot();
}

// iOS Safari restores pages from the back-forward cache without firing
// DOMContentLoaded, so re-render history (and re-pin the dock) on show.
window.addEventListener('pageshow', () => {
    renderHistoryList(getHistory(), loadScript);
    pinDockToVisualViewport();
});

// Pin the floating controls dock to the visual viewport. iOS Safari (esp. in
// landscape) paints `position: fixed` elements near the visual viewport's
// bottom but hit-tests them at their layout-viewport position — so taps fall
// through to the script. Computing `top` from `visualViewport` keeps the hit
// rect under the rendered button.
//
// Idempotent: called from both module-eval and DOMContentLoaded so the dock is
// pinned regardless of which fires first (with async module loading either can
// win). A guard flag ensures listeners/observers are only wired once.
let dockPinned = false;
function pinDockToVisualViewport(): void {
    const dock = document.getElementById('mainControlsDock');
    const vv = window.visualViewport;
    if (!dock || !vv) return;
    const update = () => {
        // Manual rotation (the Screen Rotation toggle) puts a `transform` on
        // <body>, which makes `position: fixed` resolve against the rotated
        // body instead of the viewport. Our viewport-based `top` would then
        // shove the dock off-screen (buttons invisible AND untappable). Fall
        // back to the CSS `bottom-8`, which lays out correctly under rotation.
        if (document.body.classList.contains('screen-rotated')) {
            dock.style.top = '';
            dock.style.bottom = '';
            return;
        }
        // The dock starts hidden inside #prompterContainer, so offsetHeight is
        // 0 until the prompter is shown. Skip until it has a real height,
        // otherwise we'd pin it ~64px too low; the MutationObserver below
        // re-runs this once the prompter becomes visible.
        if (dock.offsetHeight === 0) return;
        const visualBottomInLayout = vv.offsetTop + vv.height;
        const margin = 32; // matches original `bottom-8`
        dock.style.bottom = 'auto';
        dock.style.top = `${visualBottomInLayout - dock.offsetHeight - margin}px`;
    };
    if (dockPinned) {
        // Already wired; just recompute (e.g. second call after DOM is ready).
        requestAnimationFrame(update);
        return;
    }
    dockPinned = true;
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // After an orientation change iOS reports stale visualViewport dimensions
    // for a beat, so recompute on the next frame *and* after a short delay.
    window.addEventListener('orientationchange', () => {
        requestAnimationFrame(update);
        setTimeout(update, 300);
    });
    requestAnimationFrame(update);

    // Recalculate when the prompter container is shown (class 'hidden' is removed)
    const prompterContainer = document.getElementById('prompterContainer');
    if (prompterContainer) {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.attributeName === 'class') {
                    const target = mutation.target as HTMLElement;
                    if (!target.classList.contains('hidden')) {
                        // Let the DOM update first, then recalculate
                        requestAnimationFrame(update);
                    }
                }
            }
        });
        observer.observe(prompterContainer, { attributes: true, attributeFilter: ['class'] });
    }
}
pinDockToVisualViewport();
