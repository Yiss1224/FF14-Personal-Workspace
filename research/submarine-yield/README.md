# 潛水艇配置收益評估（原型）

未接到網頁，只是驗證「用期望 Gil 選配置」做不做得到。

- `extract.py`：從 Infiziert90/FFXIVGachaSpreadsheet `Submarines.json`、SubmarineTracker `Data/Sectors.cs`、
  xivapi/ffxiv-datamining `SubmarinePart.csv` 產生 `yield-data.json`（皆 MIT／遊戲表）。
- `yield-model.cjs`：`node research/submarine-yield/yield-model.cjs 85 O,J [--modified]`，
  列出該 Rank 能跑該航線的全部配置與每趟期望 Gil。啟動時會檢查部件速度／航程與 `submarine-calculator.js` 的 `partStats` 一致。

## 模型
每個航點分別判斷：
1. 探索 ≥ T3 門檻 → High，≥ T2 → Mid，否則 Min；依社群資料中該探索等級實際掉到各階的比例決定 T1/T2/T3 機率。
2. 階內物品機率用該階總體比例（假設與數值無關）。
3. 收集 ≥ Optimal → 優、≥ Normal → 普，否則差；數量取該等級範圍中點。
4. 恩惠 ≥ 門檻 → 有機會掉第二件。來源以「件」計數，無法精確換回「每趟」，所以給區間：
   低 = (DoubleDips/2)/(Favor−DoubleDips/2)，高 = DoubleDips/Favor（Infi 網站的算法）。
5. 只有回收飾品有 NPC 價；其他材料算未計價，另列機率。

門檻值（breakpoints）是社群統計推得，不是遊戲表數值。
