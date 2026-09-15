/**
 * Utility functions for Google Docs integration.
 */

/**
 * Extracts the Google Document ID from a standard Google Doc URL.
 * Matches formats:
 * - https://docs.google.com/document/d/DOC_ID/edit
 * - https://docs.google.com/document/d/DOC_ID/export?format=txt
 * - https://docs.google.com/document/d/DOC_ID/
 */
export function extractDocId(url: string): string | null {
    const docIdRegex = /\/document\/d\/([a-zA-Z0-9-_]{25,110})/;
    const match = url.match(docIdRegex);
    return match ? match[1] : null;
}

/**
 * Fetches a URL with a strict timeout using AbortController.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 6000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

/**
 * Fetches the plain text of a Google Doc using a CORS proxy.
 * Google Doc must be shared publicly (Anyone with the link can view).
 */
export async function fetchGoogleDocText(docUrl: string): Promise<string> {
    const docId = extractDocId(docUrl);
    if (!docId) {
        throw new Error('Google 文件網址格式不正確，請確認連結後再試一次。');
    }

    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt&cb=${Date.now()}`;

    // Primary: your own Cloudflare Worker (source: cloudflare/gdoc-proxy/worker.js).
    // ⚠️ REPLACE_ME — this placeholder isn't a real deployed worker; Google
    // Docs Sync will just fail through to the fallbacks (and likely fail
    // entirely) until you deploy your own copy of the worker and put its
    // real URL here. See SETUP_FOR_AI.md, section "Google 文件同步".
    // The public CORS proxies below are legacy fallbacks only — they are
    // unreliable (all three were down in July 2026) and may never recover.
    const proxies = [
        `https://REPLACE_ME_your-worker-name.your-subdomain.workers.dev/?id=${docId}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(exportUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(exportUrl)}`
    ];

    let lastError: any = null;

    for (const proxyUrl of proxies) {
        try {
            // Fetch with a 6-second timeout per proxy to keep the experience responsive
            const response = await fetchWithTimeout(proxyUrl, { cache: 'no-store' }, 6000);
            if (!response.ok) {
                throw new Error(`Proxy returned status ${response.status}`);
            }
            
            const text = await response.text();
            if (!text || text.trim().length === 0) {
                throw new Error('抓到的文件內容是空的。');
            }

            // Check if we received HTML (login page redirect)
            if (text.trim().startsWith('<!DOCTYPE html>') || text.includes('<html')) {
                if (text.includes('google-signin') || text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
                    throw new Error('存取被拒絕，請確認這份 Google 文件的共用權限設定為「知道連結的使用者」皆可檢視。');
                }
                throw new Error('無法取得純文字內容，頁面被重新導向了。');
            }

            return text;
        } catch (error: any) {
            console.warn(`Failed to fetch via proxy ${proxyUrl}:`, error);
            lastError = error;
            // Continue to the next proxy
        }
    }

    // If all proxies failed, report the error details
    const isPermissionError = lastError?.message && lastError.message.includes('access denied');
    if (isPermissionError) {
        throw lastError;
    }
    
    throw new Error('連不上 Google 文件，請確認共用權限設定為「知道連結的使用者」皆可檢視，或稍後再試一次。');
}
