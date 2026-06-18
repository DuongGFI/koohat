# Kahoot Alternative 🎮

**Game đố vui kiểu Kahoot, tự host trên máy của bạn.** Máy chủ trò (Host) chiếu câu hỏi lên màn hình lớn; người chơi dùng điện thoại quét mã QR (hoặc nhập mã PIN) để tham gia — không cần cài app, không cần đăng ký. Có chọn avatar, đặt cược điểm (x2), bảng xếp hạng, và nút mở cho người chơi ở xa qua Internet.

👉 **Bạn chỉ muốn dùng?** Đọc mục **🚀 Bắt đầu nhanh** ngay dưới đây là đủ — bỏ qua các phần đánh số (dành cho lập trình viên).

---

## 🚀 Bắt đầu nhanh (cho người dùng)

### ⚡ Chạy bằng 1 dòng (dễ nhất)
Mở **Terminal** (macOS/Linux) hoặc **PowerShell** (Windows), dán đúng 1 dòng rồi Enter:

**macOS / Linux**
```bash
curl -fsSL https://raw.githubusercontent.com/DuongGFI/koohat/main/start.sh | bash
```
**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/DuongGFI/koohat/main/start.ps1 | iex
```
Script tự dùng **Docker** nếu máy có, không thì dùng **Node**; xong sẽ in link `http://localhost:1234` để mở trên máy Host.

> Máy Host cần có sẵn **Docker** *hoặc* **Node.js ≥18** (cài 1 lần). Chưa có thì script sẽ hiện link tải. Người chơi thì không cần cài gì — chỉ quét QR.

### 🐳 Hoặc 1 lệnh Docker (nếu đã có Docker)
```bash
docker run -d -p 1234:1234 --name koohat ghcr.io/duonggfi/koohat
```
Để mã QR trỏ đúng cho điện thoại cùng WiFi, thêm IP LAN của máy:
`-e PUBLIC_HOST=<IP-LAN>` (hoặc dùng nút "Mở cho người chơi từ xa" để khỏi cần IP).

### 🛠️ Cách thủ công (clone repo về sửa/đóng góp)
```bash
git clone https://github.com/DuongGFI/koohat.git && cd koohat
docker compose up -d                         # hoặc:
npm run install:all && npm run build && npm start
```
Muốn chạy bền bỉ (tự khởi động lại): xem mục pm2 ở dưới.

### Cách dùng sau khi mở app
1. **Tổ chức** → vào Quản lý câu hỏi, tạo câu hỏi theo **1 trong 3 cách**: (a) tải file Excel/CSV lên (có sẵn file mẫu để tải về điền), (b) dán link Kahoot công khai, hoặc (c) nhập tay từng câu → chỉnh cấu hình phòng → **Bắt đầu tổ chức**.
2. Người chơi mở trang chủ → **Tham gia chơi**, nhập mã PIN + biệt danh + chọn avatar (hoặc quét QR).
3. Host bấm **Bắt đầu** và điều khiển từng câu.

> **Chơi từ xa (khác mạng WiFi)?** Ở màn chờ của Host có nút **🌐 "Mở cho người chơi từ xa (Internet)"**. Bấm vào, sau vài giây mã QR tự đổi sang một link Internet (Cloudflare tunnel) — người chơi ở bất kỳ đâu quét vào học được, không cần cùng WiFi, không cần cấu hình router. Cần máy Host có Internet. Lưu ý: ai có link đều vào được nên chỉ chia sẻ cho người chơi của bạn. Hoạt động cả khi chạy bằng Node lẫn Docker.

> Đổi cổng: `PORT=8080` (Node) hoặc sửa `docker-compose.yml`. Mở firewall cổng tương ứng nếu người chơi không vào được (`sudo ufw allow 1234/tcp`).

---

> **Phần còn lại của tài liệu viết cho coding agent / lập trình viên.** Đọc hết "Kiến trúc", "Hợp đồng sự kiện WebSocket" và "Hướng dẫn mở rộng" trước khi sửa code — phần lớn lỗi đến từ việc không nắm contract giữa client và server.
>
> **Tóm tắt kỹ thuật:** clone Kahoot chạy LAN, đồng bộ thời gian thực bằng **WebSocket (Socket.IO)**, state in-memory; có cơ chế **Đặt cược (Wager)**, tính điểm chuẩn Kahoot, hiệu chỉnh độ trễ mạng (RTT), và Cloudflare quick tunnel để chơi từ xa.

---

## 1. TL;DR vận hành (dev)

```bash
# Cài + build (một lần)
npm run install:all
npm run build

# Chạy ổn định bằng pm2 (khuyến nghị)
pm2 start ecosystem.config.cjs
pm2 logs kahoot-local          # xem log realtime
pm2 restart kahoot-local       # SAU MỖI LẦN sửa code server/ -> phải restart
pm2 stop kahoot-local

# Hoặc chạy nhanh không pm2
npm start                      # cd server && node src/index.js
```

- Server mặc định cổng **1234** (đổi bằng `PORT=xxxx`). Đã mở `ufw allow 1234/tcp`.
- Host mở `http://<IP-LAN>:1234` → **Tổ chức**. Người chơi vào cùng URL hoặc quét QR.
- **Quan trọng:** sau khi sửa bất kỳ file nào trong `server/`, phải `pm2 restart kahoot-local`. Sửa `client/` thì phải `npm run build` lại (server phục vụ bản build tĩnh ở `client/dist`).

---

## 2. Kiến trúc tổng thể

```
┌─────────────┐   WebSocket (Socket.IO)   ┌──────────────────────────┐
│  Host (TV)  │◄─────────────────────────►│   Node server (cổng 1234)│
└─────────────┘                           │  - Express REST          │
┌─────────────┐                           │  - Socket.IO             │
│ Player (📱) │◄─────────────────────────►│  - State in-memory (RAM) │
└─────────────┘                           │  - phục vụ client/dist   │
                                          └──────────────────────────┘
```

- **State lưu hoàn toàn trong RAM** (Map của các `Room`). Không có Redis/DB. Restart server = mất mọi phòng đang chơi. Đây là lựa chọn cố ý cho mục tiêu "local" (xem spec.md §4 nếu cần nâng lên Redis để scale).
- **Hệ quả bắt buộc:** pm2 chạy `instances: 1`, `exec_mode: fork`. KHÔNG dùng cluster/nhiều instance — mỗi instance sẽ có RAM riêng, người chơi và host rơi vào instance khác nhau sẽ không thấy nhau.

### Cây thư mục

```
kahoot_local/
├── Dockerfile                # build image (multi-stage: client build -> server runtime)
├── docker-compose.yml        # chạy bằng docker compose
├── start.sh / start.ps1      # script "1 dòng" (curl|bash / irm|iex): tự chọn Docker hoặc Node
├── .github/workflows/        # CI: tự build & đẩy image lên ghcr.io/duonggfi/koohat
├── ecosystem.config.cjs      # cấu hình pm2 (CommonJS vì project là ESM)
├── package.json              # script tiện ích gọi xuống server/ và client/
├── spec.md                   # đặc tả gốc (bị cắt ở §4.3 — xem "Quyết định thiết kế")
├── server/
│   ├── package.json
│   ├── e2e-test.mjs          # 21 assertion luồng chơi qua socket thật (gồm avatar)
│   └── src/
│       ├── index.js          # bootstrap: Express REST + wiring Socket.IO + detectLanIp()
│       ├── rooms.js          # Room + RoomManager + STATE machine  ← TRÁI TIM hệ thống
│       ├── scoring.js        # computeScore(): điểm + cược (thuần, dễ unit-test)
│       ├── questions.js      # import câu hỏi: Excel/CSV (.xlsx/.csv) + link Kahoot
│       └── pin.js            # sinh mã PIN 6 số
└── client/                   # React + Vite + Tailwind + Framer Motion
    ├── public/
    │   └── mau-cau-hoi.csv   # file CSV mẫu cho người dùng tải về (BOM UTF-8)
    ├── vite.config.js        # dev proxy /api & /socket.io -> :1234
    ├── tailwind.config.js
    └── src/
        ├── main.jsx          # router: / , /host , /admin , /play , /join/:pin
        ├── socket.js         # singleton socket + vòng lặp hiệu chỉnh RTT + emitAck()
        ├── shapes.jsx        # 4 màu/hình đáp án (ANSWERS) + component <Shape/>
        ├── avatars.js        # AVATAR_CATEGORIES (emoji theo danh mục) + randomAvatar()
        └── pages/
            ├── Home.jsx      # màn chọn vai trò
            ├── Admin.jsx     # ngân hàng câu hỏi + import + cấu hình phòng
            ├── Host.jsx      # toàn bộ màn trình chiếu theo từng STATE (leaderboard top 10)
            └── Player.jsx    # mobile: join + chọn avatar + đề bài/đáp án + kết quả
```

---

## 3. Vòng đời trận đấu (State Machine)

Định nghĩa tại `server/src/rooms.js` (`STATE` + class `Room`). Mọi client trong phòng nhận event `room:state` mỗi khi state đổi.

```
LOBBY ──host:start──► PRE_QUESTION ──(auto sau T_read giây)──► ACTIVE_QUESTION
                                                                     │
                          ┌──(auto sau T_answer giây HOẶC tất cả đã trả lời)─┘
                          ▼
                     SHOW_RESULT ──host:next──► LEADERBOARD ──host:next──► (câu kế: PRE_QUESTION)
                                                          └──(hết câu)──► GAME_OVER
```

- **PRE_QUESTION** và **ACTIVE_QUESTION** tự chuyển tiếp bằng `setTimeout` (lưu ở `room.timers.phase`). Mọi nơi chuyển state phải gọi `clearTimer()` trước để tránh timer mồ côi.
- **ACTIVE_QUESTION** kết thúc sớm khi `responses.size >= số người đang kết nối` (xem `submitAnswer`), hoặc host bấm "Kết thúc sớm" (`host:next` khi đang ACTIVE).
- Host điều khiển các bước **không có timer** (SHOW_RESULT → LEADERBOARD → câu kế) qua `room.next()`.

**Giao diện render theo STATE (client lắng nghe `room:state` + event chuyên dụng):**
| STATE | Host (`Host.jsx`) | Player (`Player.jsx`) |
|---|---|---|
| LOBBY | PIN + QR + namecard (kèm avatar) | avatar + nickname, chờ |
| PRE_QUESTION | đề bài + thanh đọc hiểu | **đề bài** (qua `question:pre`) + nút Đặt cược |
| ACTIVE_QUESTION | đề bài + 4 đáp án + đếm giờ + **bộ đếm "đã trả lời" realtime** (`answer:progress`) | **đề bài + 4 nút có chữ đáp án** + Đặt cược |
| SHOW_RESULT | biểu đồ cột phân bố | đúng/sai + điểm + tổng/hạng |
| LEADERBOARD | **top 10**, top 3 khung sặc sỡ + pháo hoa | hạng của mình |
| GAME_OVER | bục vinh danh chung cuộc | hạng chung cuộc |

> Player phải lắng nghe `question:pre` để hiện đề bài sớm; nếu quên đăng ký listener này, giai đoạn PRE sẽ trống đề bài (lỗi từng gặp).
>
> **Cạm bẫy thứ tự event:** server phát `room:state`(ACTIVE) **trước** `question:active`, nên có khoảnh khắc `state==="ACTIVE_QUESTION"` mà `active` còn `null`. Mọi nhánh render ACTIVE phải guard `active &&` trước khi đọc `active.text/.answers` — nếu không sẽ crash trắng/đen màn hình (đã từng xảy ra trên desktop, điện thoại may mắn batch 2 event nên không lộ).

---

## 4. Hợp đồng sự kiện WebSocket (QUAN TRỌNG NHẤT)

Đây là contract giữa `client/src/*` và `server/src/index.js`. Đổi tên/payload một bên thì PHẢI đổi bên kia.

### Kênh broadcast (server-side)
- `room:{pin}` — mọi người trong phòng (host + tất cả player). Host `join` cả kênh này.
- `host:{pin}` — chỉ host. Dùng cho dữ liệu nhạy cảm (phân bố đáp án, đáp án đúng) không nên lộ cho player sớm.
- `socket.id` của từng player — kết quả cá nhân hoá.

### Client → Server (đều có callback `cb(ack)`)
| Event | Payload | Ack trả về | Ghi chú |
|---|---|---|---|
| `host:create` | `{config}` | `{ok,pin,config}` | tạo phòng, host tự join 2 kênh |
| `host:loadQuestions` | `{pin, questions}` | `{ok,count}` | nạp ngân hàng câu hỏi vào phòng |
| `host:updateConfig` | `{pin, config}` | `{ok,config}` | chỉ cho phép ở LOBBY |
| `host:start` | `{pin}` | `{ok}` / `{error}` | cần có câu hỏi + ≥1 người chơi |
| `host:next` | `{pin}` | `{ok}` / `{error}` | đẩy state machine tiến 1 bước |
| `player:join` | `{pin, nickname, avatar}` | `{ok,playerId,nickname,avatar}` / `{error}` | chỉ ở LOBBY, chặn nickname trùng; `avatar` là emoji (mặc định 🙂 nếu thiếu) |
| `player:answer` | `{choice:0..3, wager:bool}` | `{ok,locked}` / `{error}` | **debounce**: chỉ lần đầu được tính |
| `rtt:ping` | `clientTs` | (server `rtt:pong`) | đo RTT |
| `rtt:report` | `{rtt}` | — | client gửi RTT đã làm mượt; server lưu `player.rtt` |

### Server → Client
| Event | Payload | Tới ai |
|---|---|---|
| `lobby:players` | `{players:[{id,nickname,avatar}], count}` | phòng |
| `room:state` | `{state, currentIndex, total}` | phòng |
| `question:pre` | `{index, total, text, tReadSec, serverNow}` | phòng |
| `question:active` | `{index, total, text, answers[4], tAnswerSec, wagerEnabled, serverStartMs}` | phòng |
| `answer:progress` | `{answered, total}` | **chỉ host** (phát mỗi khi 1 player trả lời, cập nhật bộ đếm realtime) |
| `question:result` | `{index, correctIndex, distribution[4], answeredCount, totalPlayers}` | **chỉ host** |
| `player:result` | `{correct, answered, delta, base, doubled, penalty, totalScore, streak, rank, correctIndex, tResponseMs}` | **từng player** |
| `leaderboard` | `{top[≤10], full[], isFinal, index, total}` (mỗi player có `{id,nickname,avatar,score,streak}`; top 3 được tô nổi bật ở Host) | phòng |
| `game:over` | `{ranking[]}` | phòng |
| `room:closed` | `{reason}` | phòng (khi host rời) |

> Tiện ích `emitAck(event, payload)` ở `client/src/socket.js` bọc emit-có-callback thành Promise — dùng nó thay vì `socket.emit` thủ công.

---

## 5. Mô hình dữ liệu

**Question** (sau khi nạp vào `room.questions`):
```js
{ id, text, answers: [a,b,c,d], correctIndex: 0..3, timeSec }
```

**Player** (`room.players: Map<playerId, …>`):
```js
{ id, nickname, avatar, socketId, score, rtt, streak, connected }
```
`avatar` là 1 emoji người chơi chọn ở màn join (`client/src/avatars.js`), mặc định random; server lưu nguyên chuỗi (cắt tối đa 4 code point), không validate phải nằm trong danh sách.

**Config phòng** (mặc định ở `rooms.js > DEFAULT_CONFIG`):
```js
{ tReadSec: 5, tAnswerSec: 20, pMax: 1000, wagerEnabled: true, wagerPenaltyPct: 0.5 }
```
`timeSec` của từng câu (nếu có) sẽ ghi đè `tAnswerSec` cho câu đó.

---

## 6. Tính điểm & Đặt cược (`server/src/scoring.js`)

Hàm thuần `computeScore({correct, answered, tResponseMs, tAnswerMs, pMax, wager, wagerPenaltyPct})`:

```
Đúng:           base = round(pMax × (1 − (tResponseMs / tAnswerMs) / 2))   // 50%..100% pMax
Đúng + cược:    delta = base × 2          (doubled = true)
Sai:            delta = 0
Sai + cược:     delta = −round(pMax × wagerPenaltyPct)   (penalty, mặc định 50% = 500)
Không trả lời:  delta = 0, không phạt
```
- `tResponseMs` do server tính trong `submitAnswer`: `(now − activeStartMs) − player.rtt/2`, clamp ≥ 0 (hiệu chỉnh RTT, spec §4.2).
- `room.score` không bao giờ < 0 (`Math.max(0, score + delta)`).
- `streak` tăng khi trả lời đúng, reset khi sai/không trả lời.
- **Đây là nơi sửa luật điểm.** Hàm thuần, nên thêm unit test trực tiếp rất dễ.

---

## 7. Tạo câu hỏi (`server/src/questions.js`)

Có **3 cách** tạo câu hỏi (xem trang Admin):

**Cách 1 — Tải file lên (Excel/CSV).** Cấu trúc cột (header, không phân biệt hoa thường, hỗ trợ alias Việt/Anh — xem `HEADER_ALIASES`):

| Câu hỏi | Đáp án A | Đáp án B | Đáp án C | Đáp án D | Đáp án đúng | Thời gian |
|---------|----------|----------|----------|----------|-------------|-----------|
| 1+1=?   | 1        | 2        | 3        | 4        | B           | 20        |

- **Đáp án đúng**: A/B/C/D hoặc 1–4.
- **Thời gian**: giây, tùy chọn (mặc định 20).
- **File mẫu:** `client/public/mau-cau-hoi.csv` (BOM UTF-8 để Excel mở đúng tiếng Việt), tải tại link "⬇ Tải file mẫu" trong trang Admin (URL `/mau-cau-hoi.csv`). Người dùng tải về, điền câu hỏi rồi import lại.
- API: `POST /api/import/excel` (multipart, field `file`). Endpoint chấp nhận cả `.xlsx`, `.xls`, `.csv` — thư viện `xlsx` (SheetJS) tự nhận dạng định dạng.

**Cách 2 — Dán link Kahoot công khai.** `POST /api/import/kahoot` `{url}` → trích UUID từ link share (`extractKahootUuid`), fetch `https://create.kahoot.it/rest/kahoots/<uuid>` (endpoint công khai không chính thức), map qua `mapKahootQuiz`. Trả thêm `{title, skipped, total}`. **Chỉ nhập câu `type:"quiz"` (1 đáp án đúng)** — slide/survey/open-ended/jumble/multi-select bị bỏ qua và đếm vào `skipped`. Text được strip HTML, `time(ms)→giây`, choices pad/cắt về đúng 4 (true/false → 2 đáp án + 2 ô trống). Chỉ chạy với Kahoot công khai (visible); private trả 401/403.

**Cách 3 — Nhập tay từng câu.** Hoàn toàn ở client (`Admin.jsx`): nút "+ Thêm câu" tạo dòng trống, sửa nội dung/đáp án/đáp án đúng/thời gian ngay trên form. Không qua API; lưu tạm vào `localStorage` (`kahoot.questions`) như cả 2 cách trên, rồi nạp vào phòng khi bấm "Bắt đầu tổ chức".
- REST chỉ *parse và trả JSON*; việc nạp vào phòng do client gọi tiếp `host:loadQuestions`.
- **Lưu ý validation:** `Admin.jsx::startHosting` chấp nhận câu có **≥2 đáp án** không rỗng và đáp án đúng không rỗng (để hỗ trợ true/false từ Kahoot), không bắt buộc đủ 4 như trước.

---

## 7b. Chơi từ xa qua Cloudflare tunnel (`server/src/tunnel.js`)

Tính năng "Mở cho người chơi từ xa" mở một **Cloudflare quick tunnel** (không cần tài khoản/domain) trỏ về cổng server, cho ra URL `https://<random>.trycloudflare.com`. Host bấm nút ở lobby → QR đổi sang URL này.

- Dùng gói npm **`cloudflared`** (tự tải binary lần đầu, cache lại). Trong Docker binary được tải sẵn lúc build.
- **Quan trọng — phải truyền MẢNG args thô** `["tunnel","--config",<empty>,"--url",...]` cho `tunnel()`, KHÔNG dùng dạng object: helper `build_args` của gói luôn chèn `run` → `cloudflared tunnel run` (dành cho *named* tunnel) làm quick tunnel thoát ngay.
- **Phải ép `--config <file rỗng>`** để tránh `~/.cloudflared/config.yml` toàn cục (nếu máy có named tunnel khác) chiếm quyền khiến không lấy được URL.
- URL lấy qua event `instance.on("url", …)` (gói parse stdout của cloudflared), có timeout 45s.
- REST: `POST /api/tunnel/start` → `{url}`, `POST /api/tunnel/stop`, `GET /api/tunnel/status` → `{active,url}`. Client tự sinh lại QR theo URL tunnel khi bật, về LAN khi tắt.
- **Cạm bẫy QR:** vì URL tunnel là `https://...` không kèm cổng, client KHÔNG dùng `joinBaseUrl` (dạng `http://ip:port`) mà dùng nguyên URL tunnel server trả về. Đừng ghép thêm `:1234`.

---

## 8. Hiệu chỉnh RTT (`client/src/socket.js` + `rooms.js`)

`startRttCalibration()` ping liên tục (burst 6 lần rồi nhịp 4s), tính RTT trung vị có làm mượt, gửi `rtt:report`. Server lưu `player.rtt` (EMA) và trừ `rtt/2` khỏi thời gian phản hồi. **Giới hạn:** chỉ giảm lệch ~80–90%, không đạt đồng bộ mili-giây tuyệt đối (giới hạn vật lý của mạng + đồng hồ trình duyệt). Đừng hứa "tuyệt đối chính xác" trong UI.

---

## 9. Kiểm thử

```bash
# server đang chạy ở cổng 1234 (pm2 hoặc npm start), rồi:
cd server && node e2e-test.mjs       # 21 assertion: tạo phòng, join, avatar, debounce, điểm, cược, leaderboard
# đổi cổng test: PORT=xxxx node e2e-test.mjs
```
`e2e-test.mjs` là client Socket.IO headless mô phỏng 1 host + 2 player chơi 2 câu, kiểm tra điểm/cược/phạt/xếp hạng/avatar. **Chạy lại nó sau mỗi thay đổi logic server.** Khi thêm tính năng, thêm assertion vào đây.

---

## 10. Hướng dẫn mở rộng (công thức cho các yêu cầu hay gặp)

- **Thêm/đổi luật điểm hoặc cược** → sửa `scoring.js::computeScore` (+ assertion trong `e2e-test.mjs`). Nếu thêm tham số cấu hình: bổ sung vào `DEFAULT_CONFIG` (rooms.js), field nhập ở `Admin.jsx`, và truyền qua `host:create`/`host:updateConfig`.
- **Thêm một STATE mới** (vd màn "giải thích đáp án") → thêm vào `STATE`, viết hàm chuyển trong `Room`, phát `room:state`, rồi render nhánh tương ứng ở `Host.jsx`/`Player.jsx`. Nhớ `clearTimer()` khi rời state có timer.
- **Thêm loại event server→client** → emit ở `rooms.js`, đăng ký listener trong `useEffect` của trang liên quan, và **nhớ `socket.off` ở cleanup** (tránh double-handler do React StrictMode mount 2 lần).
- **Reconnect cho player rớt mạng** → hiện chỉ đặt `player.connected=false` khi disconnect giữa game (giữ điểm). Cần map lại `socketId` khi player join lại bằng cùng nickname + token.
- **Đổi cổng** → `ecosystem.config.cjs > env.PORT` + `client/vite.config.js` proxy + `ufw allow`.
- **Sửa giao diện** → `client/` rồi `npm run build` (server phục vụ `client/dist`). Khi phát triển nhanh dùng `npm run dev:client` (proxy sang :1234).

---

## 11. Quyết định thiết kế & cạm bẫy (đọc kỹ)

- **spec.md bị cắt ở §4.3** và **không chứa công thức điểm/luật cược cụ thể**. Các luật hiện tại được chốt với chủ dự án: điểm chuẩn Kahoot; cược đúng→x2, sai→trừ 50% pMax; debounce khoá đáp án đầu tiên. Nếu yêu cầu mâu thuẫn spec, hỏi lại chủ dự án.
- **In-memory ⇒ instances=1.** Đừng bật cluster trong pm2.
- **React StrictMode** (main.jsx) mount component 2 lần ở dev → mọi `socket.on` phải có `socket.off` tương ứng; `Host.jsx` dùng `started.current` để không tạo 2 phòng.
- **Mã QR dùng IP LAN do SERVER cung cấp**, không dùng `window.location`. Server tự dò IP card mạng thật (`detectLanIp()` trong `index.js`, bỏ qua interface ảo docker/lxd/veth) và trả về trong ack `host:create` field `joinBaseUrl`. Nhờ vậy host vào qua `localhost`/SSH tunnel thì QR vẫn in IP LAN đúng cho điện thoại. Ép IP thủ công bằng env `PUBLIC_HOST=<ip>` (set trong `ecosystem.config.cjs`) nếu dò sai. Màn sảnh **không** còn hiển thị địa chỉ dạng text — chỉ còn QR + PIN.
- **Ô input trên nền tối:** dùng `bg-white/15 text-white placeholder-white/50` (xem màn join `Player.jsx`). Tránh `text-gray-900` không có nền sáng — trên thiết bị dark-mode (`color-scheme: light dark` ở `index.css`) chữ tối sẽ chìm vào nền tối.
- **`pm2 restart` sau mỗi sửa server**, nếu không bạn vẫn chạy code cũ và tưởng là bug.
- **Tránh chạy `node src/index.js` thủ công song song với pm2** → trùng cổng `EADDRINUSE`, pm2 crash-loop.

---

## 12. Trạng thái hiện tại

- ✅ Đang chạy ổn định dưới pm2: app `kahoot-local`, cổng 1234, `instances:1 fork`, đã `pm2 save`.
- ✅ Build client thành công, server phục vụ `client/dist`.
- ✅ 21/21 e2e test pass.
- ✅ Tạo câu hỏi 3 cách: tải file Excel/CSV (kéo-thả, có file mẫu), dán link Kahoot công khai, hoặc nhập tay từng câu.
- ✅ Avatar emoji cho người chơi (chọn theo danh mục hoặc random) — hiện ở namecard sảnh + bảng xếp hạng + màn chờ của người chơi.
- ✅ Người chơi thấy đề bài ngay từ giai đoạn PRE_QUESTION, và đề bài + chữ đáp án ở ACTIVE_QUESTION.
- ✅ Ô nhập biệt danh/PIN dùng nền mờ + chữ trắng (tương phản rõ trên nền tối).
- ✅ Leaderboard hiển thị top 10, top 3 tô khung gradient vàng/bạc/đồng nổi bật.
- ✅ Mã QR dùng IP LAN do server tự dò; màn sảnh không lộ địa chỉ dạng text.
- ✅ "Mở cho người chơi từ xa" qua Cloudflare quick tunnel (nút ở lobby Host) — chơi khác mạng WiFi, chạy được cả Node lẫn Docker.
- ⛔ Chưa làm: reconnect tự động cho player, âm thanh nền, dark/light toggle, lưu lịch sử trận.

### Lệnh pm2 hay dùng
```bash
pm2 status                       # xem tất cả app
pm2 logs kahoot-local --lines 50 # log gần đây
pm2 restart kahoot-local
pm2 save                         # lưu danh sách để khôi phục
# pm2 startup                    # (cần sudo) tự chạy lại pm2 khi máy reboot
```
