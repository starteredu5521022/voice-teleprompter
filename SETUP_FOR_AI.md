# 給 AI 助理（Claude Code 等）的部署設定指南

這份文件是寫給**協助使用者部署這份原始碼的 AI coding agent** 看的操作手冊，不是給人類閱讀的介紹文（人類介紹文請見 `README.md`）。如果你是 AI agent，收到「幫我把這個提詞器部署成我自己的版本」這類請求時，照這份文件的步驟執行。

## 背景

這份程式碼原本是專案擁有者（下稱「原作者」）自己客製化的私人版本，現在原作者要把原始碼交給別人（下稱「使用者」）獨立部署一份屬於使用者自己的版本。程式碼裡有 **3 處** 寫死指向原作者個人資源的網址／帳號設定，已經全部替換成 `REPLACE_ME` 開頭的佔位字串，並在原始碼旁加了註解標記。你的任務就是把這些佔位字串換成使用者自己的真實資訊。

## 步驟總覽

1. 確認環境（Node.js、npm）
2. 先問清楚使用者要用哪個靜態網頁主機部署（預設建議 surge.sh，最簡單）
3. `npm install` → `npm run build`
4. 部署 `dist/` 資料夾，拿到真實網址
5. 用真實網址回填 `app/index.html` 裡的 3 個 `REPLACE_ME` 佔位符（純粹是分享縮圖用，不影響功能，可以跳過）
6. 詢問使用者要不要設定「Google 文件同步」這個選用功能——**這一步需要使用者自己的 Cloudflare 帳號，不要自己幫使用者建帳號，等使用者確認要做才動手**
7. 如果要做 Google 文件同步：協助 `wrangler login`、部署 worker、回填另外 2 個 `REPLACE_ME` 佔位符
8. 重新 build + 重新部署
9. 驗證：實際 curl 部署後的網址，確認頁面能開、資源檔案 hash 跟本機一致

## 需要替換的 5 個 REPLACE_ME 位置

用這個指令可以一次找出全部位置：

```bash
grep -rn "REPLACE_ME" src/ app/*.html cloudflare/
```

### ① `app/index.html`（5 處，同一個網域重複出現在不同 meta 標籤，純粹是分享連結的縮圖/標題用，不影響任何實際功能）

```
<link rel="canonical" href="https://REPLACE_ME_your-domain.example.com/app/">
<meta property="og:url" content="https://REPLACE_ME_your-domain.example.com/app/">
<meta property="og:image" content="https://REPLACE_ME_your-domain.example.com/og-image.png">
<meta property="twitter:url" content="https://REPLACE_ME_your-domain.example.com/app/">
<meta property="twitter:image" content="https://REPLACE_ME_your-domain.example.com/og-image.png">
```

把 `REPLACE_ME_your-domain.example.com` 全部換成使用者實際部署的網域（例如 `their-name-teleprompter.surge.sh`）。**這一步可以完全跳過**，不影響 App 任何實際功能，只影響別人在 LINE/FB/Twitter/Slack 分享這個連結時縮圖卡片顯示的網址是否正確。

### ②③ Google 文件同步（2 處，選用功能，需要使用者自己的 Cloudflare 帳號）

這個功能因為瀏覽器 CORS 限制，需要一個中介代理伺服器。**在動手之前，先確認使用者真的要這個功能**——如果使用者不需要匯入 Google 文件，直接跳過這整節，App 其他功能完全不受影響（點「Google文件同步」按鈕會顯示連線失敗，僅此而已，不會壞掉其他功能）。

如果使用者要設定，依序執行：

1. 確認使用者有 Cloudflare 帳號（沒有的話請使用者自己去 https://dash.cloudflare.com/ 免費註冊——**不要代替使用者建立帳號**）
2. 在專案根目錄執行登入（會開瀏覽器讓使用者自己完成 OAuth 授權，你等待即可）：
   ```bash
   npx wrangler login
   ```
3. 確認登入成功：
   ```bash
   npx wrangler whoami
   ```
4. 如果 wrangler 回報「需要註冊 workers.dev 子網域」，這一步也需要使用者自己在瀏覽器完成（Cloudflare Dashboard → Compute → Workers & Pages 會自動提示），**這一步不能用指令代勞**，請使用者操作。
5. 打開 `cloudflare/gdoc-proxy/worker.js`，把這一行：
   ```js
   'https://REPLACE_ME_your-app-domain.example.com',
   ```
   換成使用者在步驟④實際部署的網址（跟 `app/index.html` 那個網域一致，不含路徑，只要 origin）。
6. 部署代理伺服器：
   ```bash
   cd cloudflare/gdoc-proxy
   npx wrangler deploy
   cd ../..
   ```
   部署成功後 wrangler 會印出一個網址，格式類似：`https://gdoc-proxy.<使用者的workers.dev子網域>.workers.dev`
7. 打開 `src/gdoc.ts`，把這一行：
   ```ts
   `https://REPLACE_ME_your-worker-name.your-subdomain.workers.dev/?id=${docId}`,
   ```
   換成上一步拿到的真實網址（記得保留 `/?id=${docId}` 這段模板字串，只換網域部分）。
8. **實際測試**：新的 Cloudflare 子網域可能要等 1-3 分鐘憑證才會生效，用這個指令輪詢直到通：
   ```bash
   until curl -s -o /dev/null "https://<worker網址>/"; do sleep 5; done
   ```
   然後帶著使用者真實網域當 Origin 測試白名單有沒有生效：
   ```bash
   curl -s -H "Origin: https://<使用者的網域>" "https://<worker網址>/?id=<隨便一個公開Google文件ID>"
   ```
   應該要回傳文件純文字內容，不是錯誤訊息。

## 重新 build 與部署

不管做了①或②③（或都做、或都跳過），最後都要：

```bash
npm run build
npx surge dist <使用者的網址>.surge.sh   # 或使用者指定的其他靜態主機
```

**驗證（不要只看 build 訊息就說完成）**：

```bash
curl -s https://<使用者網址>/app/ -o /tmp/verify.html
grep -o 'assets/app-[A-Za-z0-9_.-]*' /tmp/verify.html
ls dist/assets/*.js dist/assets/*.css
```

兩邊列出的檔名（含 hash）要完全一致，才算真的部署上去，不是只是 build 完放在本機。

## 不要動的東西

- `LICENSE` 檔案——GPL-3 授權條文，依授權條款必須保留，不要刪除或修改。
- `README.md` 開頭關於「這是 fork 自 kosuvorov/VoicePrompter」的說明——同樣是 GPL-3 要求的來源標示，不要拿掉。
- 除了上面列出的 5 個 `REPLACE_ME` 位置以外，其他程式碼邏輯不需要為了「換成使用者自己的版本」而修改——那些是功能程式碼，不是個人化設定。

## 順便提醒使用者的已知限制

部署完成後，建議把 `README.md` 裡「已知限制」那節的內容也講給使用者聽一遍（iOS 語音辨識被系統封鎖的情況、錄影存檔路徑只有電腦版 Chrome 支援等），避免使用者以為是部署錯誤。
