import { HistoryItem, AppConfig } from './types';
import { DEFAULT_CONFIG } from './state';

const HISTORY_KEY = 'teleprompter_history';
const CONFIG_KEY = 'teleprompter_config';

export function saveConfig(config: AppConfig): void {
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (err) {
        console.error('Failed to save settings:', err);
    }
}

// Merges saved settings over the factory defaults, so a field added in a
// later version (not present in an old saved blob) still gets a sane value
// instead of `undefined`.
export function loadConfig(): AppConfig {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) return { ...DEFAULT_CONFIG };
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (err) {
        console.error('Failed to load saved settings:', err);
        return { ...DEFAULT_CONFIG };
    }
}

// --- Remembered recording save-folder handle (Chromium File System Access
// API only — see main.ts's feature check). A FileSystemDirectoryHandle can't
// go in localStorage (it's not a string), but IndexedDB can store it via
// structured clone, so it survives across reloads/sessions.
const FS_DB_NAME = 'teleprompter-fs';
const FS_STORE_NAME = 'handles';
const RECORDING_DIR_KEY = 'recordingDir';

function openFsDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(FS_DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(FS_STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function saveRecordingDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openFsDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(FS_STORE_NAME, 'readwrite');
        tx.objectStore(FS_STORE_NAME).put(handle, RECORDING_DIR_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

export async function getRecordingDirHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
        const db = await openFsDb();
        const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
            const tx = db.transaction(FS_STORE_NAME, 'readonly');
            const req = tx.objectStore(FS_STORE_NAME).get(RECORDING_DIR_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
        db.close();
        return handle;
    } catch {
        return null;
    }
}

export function getHistory(): HistoryItem[] {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
}

export function saveToHistory(text: string, googleDocUrl?: string | null): void {
    let history = getHistory();
    if (history.length > 0 && history[0].text === text) return;

    const item: HistoryItem = {
        id: Date.now(),
        text: text,
        preview: text.substring(0, 40) + (text.length > 40 ? '...' : ''),
        date: new Date().toLocaleDateString(),
        ...(googleDocUrl ? { googleDocUrl } : {})
    };

    history.unshift(item);
    if (history.length > 10) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function clearAllHistory(): void {
    localStorage.removeItem(HISTORY_KEY);
}
