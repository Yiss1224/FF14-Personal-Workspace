# FF14 Personal Workspace

個人用的 FF14 日課、練等與釣魚進度工具。純前端，可放在 GitHub Pages；本機以 `localStorage` 快取，登入後用 Supabase 同步多裝置進度。

## 目前功能

- 今日 Daily 勾選
- 練等 ETA
  - 單職業快速估算
  - 多職業排程：每個 Daily 一天只分配一次，不會重複算給所有職業
  - 集中練 / 輪替分配兩種模式
  - 可比較「不打某個 Daily」或「把某個 Daily 加回來」會讓全部目標多 / 少幾天
  - 可設定每天額外刷幾本副本
  - 從 FFXIV Wiki Semantic MediaWiki 讀取 Dungeon Base EXP，依目前等級自動挑可用的高等練等副本
  - 額外副本 EXP 會依職業是否低於最高戰鬥職套用兵裝加成（Lv1–89 +100%、Lv90–99 +50%）
  - 每個職業可保存角色類型與平均排隊時間
- 今晚排程器
  - 輸入今晚可玩分鐘數與主要練等職業
  - `今天只想混 / 平衡 / 今天要肝` 三種排序模式
  - 把尚未完成的 Daily、排隊、額外刷本一起塞進時間預算
  - 顯示各活動約 `% EXP條 / 分鐘`
  - 每個 Daily 可自行調整平均本體時間與「想打程度」
  - 排隊時間可換算成可用來釣魚的時間，並依自訂魚種/小時估算可處理魚數
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
  - Daily / 單職與多職練等設定 / 今晚排程 / 釣魚歷史 / 已知魚 ID / 跳過清單同步
  - RLS 限制每個登入帳號只能讀寫自己的資料

## 資料來源與限制

- XIVAPI 只提供遊戲客戶端的靜態資料，不知道玩家本人是否釣過某隻魚。
- Dungeon Base EXP 由 FFXIV Wiki 的 Semantic MediaWiki `Has duty experience` / `Has duty level requirement` 等屬性取得，快取 7 天。
- 6.0 後普通迷宮小怪不再直接給 EXP，等值 EXP 轉移到 Boss；因此 Wiki 的 Base EXP 可作為刷本模型基準。
- 兵裝加成會影響擊敗敵人 / Dungeon Boss 的 EXP，但不影響 Duty Roulette 每日 Bonus；休息、食物、部隊效果目前尚未加入多職業 ETA，因此刷本部分偏保守。
- 每日隨機 EXP 不是固定值，會依職業等級與抽到的任務內容變動；目前可調整的 `% EXP條` 視為該 Roulette 一次的平均總收益，用於規劃而非宣稱遊戲精確公式。
- 今晚排程器的 Duty 時間與排隊時間是個人化估值：Duty 本體時間可在畫面調整，排隊時間取各職業自己輸入的平均值。
- 玩家釣魚完成狀態以魚糕匯入與本工具手動標記為準；魚糕可能漏記，所以「未記錄」只表示待確認。
- 釣魚 ETA 是依近期平均速度做線性推估；後期剩餘魚通常更難，因此 ETA 可能偏樂觀。

## 架構

- HTML / CSS / Vanilla JavaScript
- GitHub Pages
- Supabase Auth + Postgres (RLS)
- XIVAPI v2
- FFXIV Wiki Semantic MediaWiki API
- localStorage 離線快取
