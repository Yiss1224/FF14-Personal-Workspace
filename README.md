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
- 魚餌 / 釣法 / 秒數
  - 讀取 Carbuncle Plushy 的社群釣法資料，顯示推薦起始餌、泳餌路線、`! / !! / !!!`、提鉤、ET 時間、天氣、Snagging、傳承錄
  - 每隻魚可標記「萬能餌可用 / 不可用 / 未確認」；未確認預設為先試萬能餌，不會把推薦餌誤判成必須攜帶
  - 可從 Lodinn 的釣點社群統計讀取咬鉤秒數範圍，優先匹配推薦起始餌；資料不足時保留手動秒數
  - 秒數資料只在本次頁面工作階段快取，避免大型釣點統計塞爆 `localStorage`
- 魚餌採買與掃圖路線
  - 依目前篩選與「萬能餌不可用」判定，自動整理指定魚餌購物清單
  - 可標記已持有魚餌與自己的取得備註
  - 透過 XIVAPI 解析 Item ID，再用 Garland Tools item 資料嘗試列出 Gil NPC、特殊商店、價格、區域、座標，以及製作 / 採集 / 精選 / 掉落等其他來源
  - 可把同一 NPC 能買到的多種餌合併成採買點，減少跑腿
  - 掃圖路線會優先推薦「目前餌已備妥、可以直接處理最多缺魚」的釣點；若缺指定餌會標出卡住數量與缺哪幾種餌
- Supabase 雲端同步
  - Daily / 單職與多職練等設定 / 今晚排程 / 釣魚歷史 / 已知魚 ID / 跳過清單同步
  - 萬能餌人工判定、魚餌持有狀態、魚餌備註、手動秒數與釣魚 UI 偏好同步
  - RLS 限制每個登入帳號只能讀寫自己的資料

## 資料來源與限制

- XIVAPI 只提供遊戲客戶端的靜態資料，不知道玩家本人是否釣過某隻魚。
- Carbuncle Plushy 的 `fishData.yaml` 是社群整理的釣法資料；`bestCatchPath` 用來當推薦起始餌 / 泳餌路線，不代表其他餌一定無效。
- 萬能餌是否可用由使用者自行確認；只有明確標記「不可用」的魚才會被當成指定餌硬需求。
- Lodinn 秒數是社群實測統計，不是官方固定秒數。工具顯示的是資料中的 bite-time 範圍，且會受使用魚餌與樣本情況影響；沒有可靠資料時不硬填。
- Garland Tools 的 NPC / 商店資料由瀏覽器即時查詢。若外部服務或 CORS 無法使用，工具仍保留 Teamcraft / Garland 連結與手動備註，不會把缺資料假裝成「買不到」。
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
- Carbuncle Plushy fish data
- Lodinn community bite-time data
- Garland Tools item / vendor data
- localStorage 離線快取
