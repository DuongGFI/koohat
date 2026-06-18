// Headless end-to-end test of the game loop.
import { io } from "socket.io-client";

const URL = `http://localhost:${process.env.PORT || 1234}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ack = (sock, ev, p) => new Promise((res) => sock.emit(ev, p, res));

const questions = [
  { text: "2+2=?", answers: ["3", "4", "5", "6"], correctIndex: 1, timeSec: 2 },
  { text: "Thủ đô VN?", answers: ["HCM", "Đà Nẵng", "Hà Nội", "Huế"], correctIndex: 2, timeSec: 2 },
];
const config = { tReadSec: 1, tAnswerSec: 2, pMax: 1000, wagerEnabled: true, wagerPenaltyPct: 0.5 };

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? "✓" : "✗ FAIL"} ${msg}`); if (!cond) failures++; };

const host = io(URL, { transports: ["websocket"] });
const p1 = io(URL, { transports: ["websocket"] });
const p2 = io(URL, { transports: ["websocket"] });

const events = { p1: {}, p2: {} };
p1.on("player:result", (d) => (events.p1.result = d));
p2.on("player:result", (d) => (events.p2.result = d));
let hostResult = null, leaderboard = null, progress = [];
host.on("question:result", (d) => (hostResult = d));
host.on("leaderboard", (d) => (leaderboard = d));
host.on("answer:progress", (d) => progress.push(d.answered));

await new Promise((r) => host.on("connect", r));

const created = await ack(host, "host:create", { config });
check(created.ok && /^\d{6}$/.test(created.pin), `Tạo phòng, PIN=${created.pin}`);
const pin = created.pin;

const loaded = await ack(host, "host:loadQuestions", { pin, questions });
check(loaded.count === 2, "Nạp 2 câu hỏi");

let lobby = null;
host.on("lobby:players", (d) => (lobby = d));
const j1 = await ack(p1, "player:join", { pin, nickname: "An", avatar: "🦊" });
const j2 = await ack(p2, "player:join", { pin, nickname: "Bình", avatar: "🍕" });
check(j1.ok && j2.ok, "2 người chơi tham gia");
check(j1.avatar === "🦊", "Ack trả avatar đã chọn");
await sleep(100);
check(lobby?.players?.some((p) => p.avatar === "🦊"), "Avatar có trong danh sách lobby");

const dup = await ack(p1, "player:join", { pin, nickname: "An" });
check(!!dup.error, "Chặn biệt danh trùng / join lại");

const started = await ack(host, "host:start", { pin });
check(started.ok, "Host bắt đầu");

// Q1: wait for read phase + active, then answer.
await sleep(1100); // past T_read -> ACTIVE
// p1 correct + wager, p2 wrong
const a1 = await ack(p1, "player:answer", { choice: 1, wager: true });
const a2 = await ack(p2, "player:answer", { choice: 0, wager: false });
check(a1.locked && a2.locked, "Ghi nhận đáp án (debounce lock)");
check(progress.includes(1), "Host nhận answer:progress realtime (1 người đã trả lời)");

// answering again should be rejected
const again = await ack(p1, "player:answer", { choice: 2, wager: false });
check(!!again.error, "Chặn trả lời lần 2");

await sleep(300); // both answered -> auto SHOW_RESULT
check(events.p1.result?.correct === true, "P1 đúng");
check(events.p1.result?.doubled === true, "P1 được x2 (cược + đúng)");
check(events.p1.result?.delta > 500, `P1 điểm x2 = ${events.p1.result?.delta}`);
check(events.p2.result?.correct === false && events.p2.result?.delta === 0, "P2 sai, không cược => 0 điểm");
check(hostResult?.distribution?.[1] === 1 && hostResult?.distribution?.[0] === 1, "Phân bố đáp án đúng");

// to leaderboard
await ack(host, "host:next", { pin });
await sleep(100);
check(leaderboard?.top?.[0]?.nickname === "An", "An dẫn đầu bảng xếp hạng");
check(leaderboard?.top?.[0]?.avatar === "🦊", "Avatar có trong bảng xếp hạng");

// Q2
await ack(host, "host:next", { pin }); // next question
await sleep(1100);
// p2 correct + wager, p1 wrong + wager (loses 50% = 500)
await ack(p2, "player:answer", { choice: 2, wager: true });
const p1Before = events.p1.result.totalScore;
await ack(p1, "player:answer", { choice: 0, wager: true });
await sleep(300);
check(events.p1.result.penalty === 500, "P1 sai+cược bị phạt 500");
check(events.p1.result.totalScore === Math.max(0, p1Before - 500), "Trừ điểm phạt vào tổng");
check(events.p2.result.doubled === true, "P2 đúng+cược x2");

await ack(host, "host:next", { pin }); // leaderboard
await ack(host, "host:next", { pin }); // game over
await sleep(150);

// Tunnel: chỉ kiểm tra endpoint status (không mở tunnel thật để khỏi phụ thuộc mạng).
try {
  const st = await (await fetch(`${URL}/api/tunnel/status`)).json();
  check(st && st.active === false && st.url === null, "Endpoint /api/tunnel/status trả trạng thái tắt");
} catch (e) {
  check(false, "Endpoint /api/tunnel/status phản hồi: " + e.message);
}

console.log(`\n${failures === 0 ? "🎉 TẤT CẢ PASS" : `❌ ${failures} test FAIL`}`);
host.close(); p1.close(); p2.close();
process.exit(failures === 0 ? 0 : 1);
