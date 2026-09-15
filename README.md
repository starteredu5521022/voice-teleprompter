# 🐔 提詞雞

語音跟隨提詞器——你講到哪，稿子就捲到哪；意譯、跳字、換詞都不會卡住，只要意思接近程式就跟得上。以 PWA（網頁 App）形式運作，用 Safari／Chrome「加入主畫面」就能像原生 App 一樣使用，不需要 Xcode、不需要開發者帳號、不用上架 App Store。

## 這是什麼來歷

本專案是 fork 自開源專案 [kosuvorov/VoicePrompter](https://github.com/kosuvorov/VoicePrompter)（GPL-3 授權），在此基礎上做了大量客製化：

- 中文逐字斷詞比對（原版是空白分詞，只支援西方語言）
- 中文語音辨識容錯機制（bigram 驗證＋消耗式證據比對，避免常見字被雜音誤判、避免重複詞被誤跳到很遠的地方）
- 全介面繁體中文化
- 錄音／錄影功能整合（開始提詞可同步觸發錄製）、鏡頭切換、滿版覆蓋
- 設定值持久化（會記住你上次的設定）＋顏色預設色
- 手機直向/橫向自適應版面、提詞中設定鎖定、即時懸浮提示…等一系列 UI 調整
- 移除了上游原本埋在頁面裡的 3 個第三方追蹤 script（Umami 事件分析、一個叫 Ansvisor 的 AI 流量追蹤、以及一個會錄下 30% 使用者操作畫面的 Umami session recorder，全部都是指向原開發商自己帳號的資源，跟這個私人版本無關）

依 GPL-3 授權條款，本專案的原始碼與衍生修改必須維持開源、附上授權條款——`LICENSE` 檔案已經在這個資料夾裡，請保留。

## 快速開始（本機開發）

```bash
npm install
npm run dev        # 本機開發伺服器，預設 http://localhost:5173
```

## 部署成你自己的版本

```bash
npm run build       # 產出靜態檔案到 dist/
```

`dist/` 就是完整的靜態網站，丟到任何靜態網頁主機都能跑。最簡單的方式（跟這個專案原本的部署方式一樣）：

```bash
npx surge dist <你想要的網址>.surge.sh
```

（`surge` 免費、不需要信用卡，第一次執行會請你註冊帳號。也可以改用 Netlify、Vercel、Cloudflare Pages 等其他靜態主機，`dist/` 資料夾原封不動丟上去就行。）

實際會用到的功能入口是 **`/app/`** 這個路徑（例如 `https://你的網址.surge.sh/app/`），根目錄 `/` 是原專案留下的行銷介紹頁，跟這個私人客製版沒有關係，可以不用理它。

### 裝到手機主畫面

Safari 開啟你部署好的網址 → 分享 → 加入主畫面，就會出現一個像原生 App 的圖示。

## ⚠️ 部署前要換成你自己的設定

程式碼裡凡是需要換成你個人資訊的地方，都已經標成 `REPLACE_ME` 佔位字串並附上說明註解，用這個指令可以一次找出全部：

```bash
grep -rn "REPLACE_ME" src/ app/*.html cloudflare/
```

- **`app/index.html` 的 5 個 meta 標籤**（canonical、og:url、og:image、twitter:url、twitter:image）：換成你自己的網址就好，純粹是分享連結時縮圖/標題顯示用，**不改也完全不影響 App 功能**，可以先跳過。
- **`cloudflare/gdoc-proxy/worker.js` 跟 `src/gdoc.ts` 各 1 處**：Google 文件同步功能要用的，見下一節。

想找自己 logo/名字的話，`vite.config.ts` 的 PWA manifest `name`/`short_name` 目前是「提詞雞」，`public/` 底下的 `favicon.ico`、`apple-touch-icon.png`、`og-image.png`、`pwa-192x192.png`、`pwa-512x512.png` 這幾個圖示檔也還是暫用的色塊字卡，想換就在這裡換。

**如果是請 AI coding agent（Claude Code 等）幫你部署**，把 `SETUP_FOR_AI.md` 這份文件的內容給它看，裡面是專門寫給 AI 看的逐步操作指南。

## Google 文件同步（選用功能，需要你自己的 Cloudflare 帳號）

「Google 文件同步」這個功能因為瀏覽器 CORS 限制，需要一個中介的代理伺服器才能運作。這個代理伺服器的原始碼已經在 `cloudflare/gdoc-proxy/` 資料夾裡，但**目前的佔位設定不會放行任何網址**，不設定的話這個按鈕會顯示連線失敗，不影響其他功能。

如果你想要這個功能，步驟：

1. 免費註冊一個 [Cloudflare](https://dash.cloudflare.com/) 帳號（如果還沒有）
2. 安裝 wrangler 並登入：
   ```bash
   npx wrangler login
   ```
   （第一次使用 Workers 會要求你在網頁上註冊一個 `xxx.workers.dev` 子網域，跟著畫面指示做）
3. 打開 `cloudflare/gdoc-proxy/worker.js`，把 `ALLOWED_ORIGINS` 陣列裡的 `REPLACE_ME_your-app-domain.example.com` 換成你自己部署的網址：
   ```js
   const ALLOWED_ORIGINS = [
       'https://你的網址.surge.sh',
       // ...
   ];
   ```
4. 部署代理伺服器：
   ```bash
   cd cloudflare/gdoc-proxy
   npx wrangler deploy
   ```
   部署完成後會給你一個網址，格式類似 `https://gdoc-proxy.你的帳號.workers.dev`
5. 打開 `src/gdoc.ts`，把 `proxies` 陣列第一個網址（`REPLACE_ME_your-worker-name...`）換成上一步拿到的網址
6. 回到專案根目錄重新 build 並部署：
   ```bash
   npm run build
   npx surge dist 你的網址.surge.sh
   ```

不想用這個功能的話，跳過這整節即可，App 其他功能都不受影響，只是「Google文件同步」按鈕點了會顯示連不上。

## 已知限制（不是 bug，是平台本身的限制）

- **iPad／iPhone 一旦「加入主畫面」變成獨立 App 執行，Apple 系統有機率會封鎖語音辨識**——這是 iOS 的系統限制，不是這個 App 的問題。遇到時畫面會跳出提示，請改用 Safari 分頁直接開啟網址測試（不要點主畫面圖示）。
- **「錄影存檔位置」設定只有電腦版 Chrome / Edge 支援**（File System Access API），iPhone Safari 完全不支援這個瀏覽器功能，錄影會維持用瀏覽器預設的下載方式儲存。
- **語音指令**（說「go back / go next / go start / go finish」）的指令詞本身仍是英文，尚未做中文化，因為程式碼裡實際比對的就是這幾個英文單字。
- 中英文混雜語音辨識的準確度目前沒有嚴謹的量化驗證，實際效果請自行實測。

## 技術架構

- **框架**：Vite + TypeScript，純前端、無後端伺服器（Google 文件同步例外，見上）
- **樣式**：Tailwind CSS
- **PWA**：Workbox（離線快取／自動更新）
- **核心 API**：Web Speech API（語音辨識）、MediaRecorder API（錄音錄影）、File System Access API（選用，存檔位置）、localStorage／IndexedDB（設定與稿子記憶）

## 授權

GPL-3 License——可自由使用、修改、散布，但衍生作品也必須以相同授權開源。原始專案：[kosuvorov/VoicePrompter](https://github.com/kosuvorov/VoicePrompter)。
