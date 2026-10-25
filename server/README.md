# 自架同步伺服器

`server.js` 是不需要安裝套件的 Node.js 小伺服器，同時提供兩件事：

- 靜態網頁：專案根目錄的 `index.html`、`submarine.html` 等（可用 `FF14_STATIC_DIR=''` 關閉，只留 API）
- 同步 API：以 `scope` 區分頁面，每個 scope 存成 `data/<scope>.json`，上一版保留為 `.bak`

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/health` | 健康檢查，不需金鑰 |
| GET | `/api/state/workspace`、`/api/state/submarine` | 取回 `{data, updatedAt}`；尚無資料回 404 |
| PUT | `/api/state/workspace`、`/api/state/submarine` | 送出 `{data}`，回傳 `{updatedAt}` |

所有 `/api/state` 請求都要帶 `Authorization: Bearer <FF14_TOKEN>`。

## 本機試跑

```sh
FF14_TOKEN=換成一串長亂碼 node server/server.js
# 開 http://localhost:8080 ，再把 ff14-config.js 的 apiBase 改成 'http://localhost:8080'
# 首頁按「同步金鑰」輸入同一串 FF14_TOKEN
```

## 甲骨文 Oracle Cloud 免費主機部署

以下以 Ubuntu 映像、網域 `ff14.example.com` 為例。

1. 安裝 Node.js 18 以上與 Caddy（自動申請 HTTPS 憑證）：
   ```sh
   sudo apt update && sudo apt install -y nodejs caddy git
   ```
2. 取得程式碼：
   ```sh
   sudo git clone https://github.com/Yiss1224/FF14-Personal-Workspace.git /opt/ff14
   ```
3. 建立 systemd 服務 `/etc/systemd/system/ff14.service`：
   ```ini
   [Unit]
   Description=FF14 Personal Workspace
   After=network.target

   [Service]
   WorkingDirectory=/opt/ff14
   Environment=PORT=8080
   Environment=FF14_TOKEN=換成一串長亂碼
   Environment=FF14_DATA_DIR=/var/lib/ff14
   ExecStart=/usr/bin/node /opt/ff14/server/server.js
   Restart=on-failure
   DynamicUser=yes
   StateDirectory=ff14

   [Install]
   WantedBy=multi-user.target
   ```
   ```sh
   sudo systemctl daemon-reload && sudo systemctl enable --now ff14
   ```
4. Caddy 反向代理 `/etc/caddy/Caddyfile`：
   ```
   ff14.example.com {
     reverse_proxy 127.0.0.1:8080
   }
   ```
   ```sh
   sudo systemctl reload caddy
   ```
5. 開放防火牆：Oracle Cloud 主控台的 VCN Security List 加入 TCP 80、443 入站規則；主機內的 iptables 也要放行：
   ```sh
   sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
6. 把 `ff14-config.js` 的 `apiBase` 設為 `'https://ff14.example.com'`（網頁也由這台提供時可用 `location.origin`），並刪掉過渡期的 `supabase` 設定，推上 GitHub 後在主機 `git pull`。切換前先在資料最新的裝置開一次網站，讓 Supabase 的資料同步回本機。
7. 在每台裝置的首頁按「同步金鑰」輸入 `FF14_TOKEN`。第一台會把本機資料上傳成初始值，其他裝置載入時會改用伺服器版本，所以請先在資料最新的裝置設定。

### 繼續放在 GitHub Pages、只把 API 放甲骨文

網頁留在 GitHub Pages 也可以，伺服器加上 `Environment=FF14_ALLOW_ORIGIN=https://yiss1224.github.io` 允許跨網域呼叫，`apiBase` 填甲骨文主機網址即可。

### 備份

資料只有 `/var/lib/ff14/*.json` 幾個小檔，定期複製出來即可；前端的「匯出備份」也隨時可用。
