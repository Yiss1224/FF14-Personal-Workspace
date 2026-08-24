# FF14 Personal Workspace

個人用的 FF14 日課、練等與釣魚進度工具。純前端，可放在 GitHub Pages；本機以 `localStorage` 快取，登入後用 Supabase 同步多裝置進度。

## 目前功能

- 今日 Daily 勾選
- 練等 ETA
  - 目前等級 / EXP / 目標等級
  - 自選每日隨機
  - 以可調整的「EXP 條比例」逐日、逐級模擬
  - 可扣掉今天已經做完的 Daily
- 輝煌釣竿 1140 進度
  - 每日魚種數紀錄
  - 3 日 / 7 日平均速度
  - 預估剩餘天數與日期
- 魚糕匯入
  - 支援 `{"completed":[itemId,...]}`
  - 匯入採聯集：只增加已知已釣 ID，不因魚糕漏記刪掉既有紀錄
- 掃圖導航
  - 從 XIVAPI v2 讀取 `FishParameter` / `SpearfishingItem` 靜態資料
  - 依地區 → 釣點顯示尚未記錄魚種
  - 可隱藏魚王、刺魚、已完成或先跳過項目
  - 每隻魚可跳回魚糕查詢
- Supabase 雲端同步
  - Daily / 練等設定 / 釣魚歷史 / 已知魚 ID / 跳過清單同步
  - RLS 限制每個登入帳號只能讀寫自己的資料

## 資料來源與限制

- XIVAPI 只提供遊戲客戶端的靜態資料，不知道玩家本人是否釣過某隻魚。
- 玩家完成狀態以魚糕匯入與本工具手動標記為準。
- 魚糕資料可能漏記，因此畫面上的「未記錄」只表示待確認，不等於一定沒釣過。
- 每日隨機 EXP 不是固定值，會依職業等級與抽到的任務內容變動；練等 ETA 是規劃用估算，不宣稱為遊戲精確公式。
- 釣魚 ETA 是依近期平均速度做線性推估；後期剩餘魚通常更難，因此 ETA 可能偏樂觀。

## 架構

- HTML / CSS / Vanilla JavaScript
- GitHub Pages
- Supabase Auth + Postgres (RLS)
- XIVAPI v2
- localStorage 離線快取
