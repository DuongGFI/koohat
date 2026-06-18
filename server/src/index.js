import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import multer from "multer";
import QRCode from "qrcode";
import { Server } from "socket.io";

import { RoomManager, STATE } from "./rooms.js";
import { parseExcelBuffer, fetchGoogleSheet, fetchKahoot } from "./questions.js";
import { startTunnel, stopTunnel, tunnelStatus } from "./tunnel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 1234;

// Địa chỉ LAN dùng để dựng URL tham gia trong mã QR. Vì máy Host có thể truy cập
// server qua localhost (vd SSH tunnel) nên client KHÔNG biết IP thật — server tự
// suy ra. Ưu tiên biến môi trường PUBLIC_HOST, nếu không thì tự dò card mạng thật
// (bỏ qua các interface ảo của docker/lxd/vpn).
function detectLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (/^(lo|docker|br-|lxdbr|veth|virbr|tun|tap|utun)/i.test(name)) continue;
    for (const ni of ifaces[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) return ni.address;
    }
  }
  return "localhost";
}
const LAN_HOST = process.env.PUBLIC_HOST || detectLanIp();
const JOIN_BASE_URL = `http://${LAN_HOST}:${PORT}`;

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const rooms = new RoomManager(io);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ---- REST: question import ------------------------------------------------

app.post("/api/import/excel", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Chưa có file được tải lên." });
    const questions = parseExcelBuffer(req.file.buffer);
    res.json({ questions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/import/sheets", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Thiếu URL Google Sheets." });
    const questions = await fetchGoogleSheet(url);
    res.json({ questions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/import/kahoot", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Thiếu đường dẫn Kahoot." });
    const { questions, title, skipped, total } = await fetchKahoot(url);
    res.json({ questions, title, skipped, total });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- REST: QR code for a room join URL ------------------------------------

app.get("/api/qr", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Thiếu URL." });
    const dataUrl = await QRCode.toDataURL(String(url), {
      width: 320,
      margin: 1,
      color: { dark: "#1e1b4b", light: "#ffffff" },
    });
    res.json({ dataUrl });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- REST: Cloudflare tunnel ("Mở cho người chơi từ xa") ------------------

app.post("/api/tunnel/start", async (_req, res) => {
  try {
    const url = await startTunnel(PORT);
    res.json({ ok: true, url });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Không mở được kết nối từ xa: " + err.message + ". Kiểm tra internet rồi thử lại." });
  }
});

app.post("/api/tunnel/stop", async (_req, res) => {
  await stopTunnel();
  res.json({ ok: true });
});

app.get("/api/tunnel/status", (_req, res) => res.json(tunnelStatus()));

app.get("/api/health", (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));

// ---- WebSocket: game protocol ---------------------------------------------

io.on("connection", (socket) => {
  // Per-socket context.
  socket.data.role = null; // 'host' | 'player'
  socket.data.pin = null;
  socket.data.playerId = null;

  // RTT calibration: client reports its measured round-trip; we keep an EMA.
  socket.on("rtt:ping", (clientTs) => {
    socket.emit("rtt:pong", clientTs);
  });
  socket.on("rtt:report", ({ rtt }) => {
    const pin = socket.data.pin;
    const playerId = socket.data.playerId;
    if (!pin || !playerId) return;
    const room = rooms.get(pin);
    const player = room?.players.get(playerId);
    if (player && typeof rtt === "number" && rtt >= 0 && rtt < 5000) {
      player.rtt = player.rtt ? player.rtt * 0.5 + rtt * 0.5 : rtt;
    }
  });

  // --- Host ---
  socket.on("host:create", ({ config } = {}, cb) => {
    const room = rooms.create(config || {});
    socket.data.role = "host";
    socket.data.pin = room.pin;
    socket.join(room.channel);
    socket.join(room.hostChannel);
    cb?.({ ok: true, pin: room.pin, config: room.config, joinBaseUrl: JOIN_BASE_URL });
  });

  socket.on("host:loadQuestions", ({ pin, questions } = {}, cb) => {
    const room = rooms.get(pin);
    if (!room) return cb?.({ error: "Phòng không tồn tại." });
    if (!Array.isArray(questions) || !questions.length) {
      return cb?.({ error: "Danh sách câu hỏi rỗng." });
    }
    room.questions = questions.map((q, i) => ({
      id: i + 1,
      text: String(q.text || "").trim(),
      answers: (q.answers || []).map((a) => String(a ?? "")),
      correctIndex: Number(q.correctIndex),
      timeSec: Number(q.timeSec) || room.config.tAnswerSec,
    }));
    cb?.({ ok: true, count: room.questions.length });
  });

  socket.on("host:updateConfig", ({ pin, config } = {}, cb) => {
    const room = rooms.get(pin);
    if (!room) return cb?.({ error: "Phòng không tồn tại." });
    if (room.state !== STATE.LOBBY) return cb?.({ error: "Chỉ đổi cấu hình khi đang ở Lobby." });
    room.config = { ...room.config, ...config };
    cb?.({ ok: true, config: room.config });
  });

  socket.on("host:start", ({ pin } = {}, cb) => {
    const room = rooms.get(pin);
    if (!room) return cb?.({ error: "Phòng không tồn tại." });
    const r = room.start();
    cb?.(r);
  });

  socket.on("host:next", ({ pin } = {}, cb) => {
    const room = rooms.get(pin);
    if (!room) return cb?.({ error: "Phòng không tồn tại." });
    cb?.(room.next());
  });

  // --- Player ---
  socket.on("player:join", ({ pin, nickname, avatar } = {}, cb) => {
    const room = rooms.get(pin);
    if (!room) return cb?.({ error: "Mã PIN không đúng." });
    if (room.state !== STATE.LOBBY) return cb?.({ error: "Trò chơi đã bắt đầu." });
    const name = String(nickname || "").trim().slice(0, 20);
    if (!name) return cb?.({ error: "Hãy nhập biệt danh." });
    const dup = [...room.players.values()].some(
      (p) => p.nickname.toLowerCase() === name.toLowerCase()
    );
    if (dup) return cb?.({ error: "Biệt danh đã có người dùng." });

    // Avatar là emoji (1–4 ký tự code point). Nếu không hợp lệ thì dùng mặc định.
    const av = typeof avatar === "string" && avatar.trim() ? [...avatar.trim()].slice(0, 4).join("") : "🙂";
    const player = room.addPlayer(socket.id, name, av);
    socket.data.role = "player";
    socket.data.pin = pin;
    socket.data.playerId = player.id;
    socket.join(room.channel);
    room.broadcastLobby();
    cb?.({ ok: true, playerId: player.id, nickname: name, avatar: av });
  });

  socket.on("player:answer", ({ choice, wager } = {}, cb) => {
    const { pin, playerId } = socket.data;
    const room = rooms.get(pin);
    if (!room || !playerId) return cb?.({ error: "Chưa tham gia phòng." });
    cb?.(room.submitAnswer(playerId, choice, wager));
  });

  // --- disconnect ---
  socket.on("disconnect", () => {
    const { role, pin, playerId } = socket.data;
    const room = rooms.get(pin);
    if (!room) return;
    if (role === "host") {
      // Host left: tear the room down after a short grace period.
      io.to(room.channel).emit("room:closed", { reason: "Host đã rời phòng." });
      rooms.remove(pin);
    } else if (role === "player" && playerId) {
      const player = room.players.get(playerId);
      if (player) {
        if (room.state === STATE.LOBBY) {
          room.removePlayer(playerId);
          room.broadcastLobby();
        } else {
          player.connected = false; // keep score; allow reconnect logic later
        }
      }
    }
  });
});

// ---- serve built client (production) --------------------------------------

const clientDist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Koohat Local server đang chạy:`);
  console.log(`  → Host (máy này):     http://localhost:${PORT}`);
  console.log(`  → Người chơi (LAN):   ${JOIN_BASE_URL}  ← dùng cho mã QR`);
  console.log(`  (đặt PUBLIC_HOST=<ip> để ép IP trong QR, PORT=<cổng> để đổi cổng)\n`);
});
