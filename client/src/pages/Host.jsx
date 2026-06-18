import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { socket, emitAck } from "../socket.js";
import { ANSWERS, Shape } from "../shapes.jsx";

export default function Host() {
  const nav = useNavigate();
  const [pin, setPin] = useState(null);
  const [qr, setQr] = useState(null);
  const [lanBase, setLanBase] = useState(null);
  const [tunnelUrl, setTunnelUrl] = useState(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [players, setPlayers] = useState([]);
  const [state, setState] = useState("INIT");
  const [meta, setMeta] = useState({ index: 0, total: 0 });
  const [pre, setPre] = useState(null);
  const [active, setActive] = useState(null);
  const [answered, setAnswered] = useState(0);
  const [result, setResult] = useState(null);
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const started = useRef(false);

  // Bootstrap: create room, load questions from Admin handoff.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const questions = JSON.parse(localStorage.getItem("kahoot.questions") || "[]");
    const config = JSON.parse(localStorage.getItem("kahoot.config") || "{}");
    if (!questions.length) {
      setError("Chưa có câu hỏi. Hãy vào trang Quản lý để nạp câu hỏi trước.");
      return;
    }
    (async () => {
      const created = await emitAck("host:create", { config });
      if (created.error) return setError(created.error);
      setPin(created.pin);
      await emitAck("host:loadQuestions", { pin: created.pin, questions });
      setState("LOBBY");
      // QR dùng IP LAN do server cung cấp (máy Host có thể đang vào qua localhost/tunnel).
      const base = created.joinBaseUrl || window.location.origin;
      setLanBase(base);
      await genQr(base, created.pin);
    })();
  }, []);

  // Sinh QR cho URL tham gia từ một base bất kỳ (LAN hoặc tunnel).
  async function genQr(base, pinVal) {
    const res = await fetch(`/api/qr?url=${encodeURIComponent(`${base}/join/${pinVal}`)}`);
    const data = await res.json();
    if (data.dataUrl) setQr(data.dataUrl);
  }

  // Bật/tắt "Mở cho người chơi từ xa" (Cloudflare tunnel).
  async function toggleTunnel() {
    setTunnelBusy(true);
    try {
      if (tunnelUrl) {
        await fetch("/api/tunnel/stop", { method: "POST" });
        setTunnelUrl(null);
        await genQr(lanBase, pin);
      } else {
        const res = await fetch("/api/tunnel/start", { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.url) {
          setError(null);
          alert(data.error || "Không mở được kết nối từ xa.");
        } else {
          setTunnelUrl(data.url);
          await genQr(data.url, pin);
        }
      }
    } catch (e) {
      alert("Lỗi: " + e.message);
    } finally {
      setTunnelBusy(false);
    }
  }

  // Socket listeners.
  useEffect(() => {
    const onLobby = (d) => setPlayers(d.players);
    const onState = (d) => setState(d.state) || setMeta({ index: d.currentIndex, total: d.total });
    const onPre = (d) => { setPre(d); setActive(null); setResult(null); setBoard(null); setAnswered(0); };
    const onActive = (d) => { setActive(d); setResult(null); setAnswered(0); };
    const onProgress = (d) => setAnswered(d.answered);
    const onResult = (d) => setResult(d);
    const onBoard = (d) => setBoard(d);
    const onOver = (d) => setBoard({ top: d.ranking.slice(0, 10), full: d.ranking, isFinal: true });
    const onClosed = (d) => setError(d.reason || "Phòng đã đóng.");

    socket.on("lobby:players", onLobby);
    socket.on("room:state", onState);
    socket.on("question:pre", onPre);
    socket.on("question:active", onActive);
    socket.on("answer:progress", onProgress);
    socket.on("question:result", onResult);
    socket.on("leaderboard", onBoard);
    socket.on("game:over", onOver);
    socket.on("room:closed", onClosed);
    return () => {
      socket.off("lobby:players", onLobby);
      socket.off("room:state", onState);
      socket.off("question:pre", onPre);
      socket.off("question:active", onActive);
      socket.off("answer:progress", onProgress);
      socket.off("question:result", onResult);
      socket.off("leaderboard", onBoard);
      socket.off("game:over", onOver);
      socket.off("room:closed", onClosed);
    };
  }, []);

  // Fireworks on leaderboard / final.
  useEffect(() => {
    if (state === "LEADERBOARD" || state === "GAME_OVER") {
      const end = Date.now() + 1200;
      (function frame() {
        confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0 } });
        confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1 } });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    }
  }, [state]);

  const start = () => emitAck("host:start", { pin }).then((r) => r.error && setError(r.error));
  const next = () => emitAck("host:next", { pin });

  if (error) {
    return (
      <Screen>
        <div className="glass rounded-3xl p-8 text-center max-w-md">
          <p className="text-xl font-bold mb-4">⚠️ {error}</p>
          <button onClick={() => nav("/admin")} className="btn-primary">Vào trang Quản lý</button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      {state === "INIT" && <div className="text-2xl font-bold animate-pulse">Đang tạo phòng…</div>}
      {state === "LOBBY" && (
        <Lobby
          pin={pin}
          qr={qr}
          players={players}
          onStart={start}
          tunnelUrl={tunnelUrl}
          tunnelBusy={tunnelBusy}
          onToggleTunnel={toggleTunnel}
        />
      )}
      {state === "PRE_QUESTION" && pre && <PreQuestion pre={pre} meta={meta} />}
      {state === "ACTIVE_QUESTION" && active && (
        <ActiveQuestion active={active} answered={answered} total={players.length} onEnd={next} />
      )}
      {state === "SHOW_RESULT" && active && result && (
        <ResultChart active={active} result={result} onNext={next} />
      )}
      {(state === "LEADERBOARD" || state === "GAME_OVER") && board && (
        <Leaderboard board={board} state={state} onNext={next} onHome={() => nav("/")} />
      )}
    </Screen>
  );
}

function Screen({ children }) {
  return (
    <div className="app-bg min-h-full flex flex-col items-center justify-center text-white p-6">
      {children}
    </div>
  );
}

function Lobby({ pin, qr, players, onStart, tunnelUrl, tunnelBusy, onToggleTunnel }) {
  return (
    <div className="w-full max-w-6xl">
      <div className="text-center mb-6">
        <p className="text-white/70 uppercase tracking-widest">Quét QR hoặc nhập mã PIN để tham gia</p>
      </div>
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-white/70 mb-1">Mã PIN phòng</p>
          <motion.div
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            className="text-7xl md:text-8xl font-extrabold tracking-[0.15em] mb-4"
          >
            {pin}
          </motion.div>
          {qr && <img src={qr} alt="QR" className="mx-auto rounded-2xl w-48 h-48 bg-white p-1" />}
          <p className="text-white/60 text-sm mt-2">Quét mã hoặc nhập PIN trên điện thoại</p>

          {/* Mở cho người chơi từ xa (Cloudflare tunnel) */}
          <div className="mt-4 pt-4 border-t border-white/15">
            <button
              onClick={onToggleTunnel}
              disabled={tunnelBusy}
              className={`btn w-full text-base ${
                tunnelUrl ? "bg-green-500/30 text-white border border-green-300/40" : "btn-ghost"
              }`}
            >
              {tunnelBusy
                ? "⏳ Đang xử lý…"
                : tunnelUrl
                ? "🌐 Đang mở từ xa — bấm để tắt"
                : "🌐 Mở cho người chơi từ xa (Internet)"}
            </button>
            {tunnelUrl ? (
              <p className="text-green-200 text-xs mt-2 break-all">
                QR đang dùng link Internet. Ai có link/QR đều vào được — chỉ chia sẻ cho người chơi của bạn.
              </p>
            ) : (
              <p className="text-white/50 text-xs mt-2">
                Cho người chơi khác mạng WiFi tham gia (cần Internet, vài giây để mở).
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xl font-bold">👥 Người chơi ({players.length})</h2>
            <button onClick={onStart} disabled={!players.length} className="btn-primary text-lg px-8">
              ▶ Bắt đầu
            </button>
          </div>
          <div className="flex flex-wrap gap-3 content-start min-h-[200px]">
            <AnimatePresence>
              {players.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ y: 40, scale: 0.6, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  className="glass rounded-xl px-4 py-2 font-bold text-lg flex items-center gap-2"
                >
                  <span className="text-2xl">{p.avatar}</span>
                  {p.nickname}
                </motion.div>
              ))}
            </AnimatePresence>
            {!players.length && <p className="text-white/50">Đang chờ người chơi tham gia…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({ duration, colorClass = "bg-yellow-300" }) {
  return (
    <div className="w-full h-5 rounded-full bg-white/20 overflow-hidden">
      <motion.div
        className={`h-full ${colorClass}`}
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration, ease: "linear" }}
      />
    </div>
  );
}

function PreQuestion({ pre, meta }) {
  return (
    <div className="w-full max-w-4xl text-center">
      <p className="text-white/70 mb-2">Câu {meta.index + 1} / {meta.total}</p>
      <motion.h1
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-4xl md:text-5xl font-extrabold mb-10 leading-tight"
      >
        {pre.text}
      </motion.h1>
      <p className="text-white/70 mb-3 animate-pulse">Đọc kỹ câu hỏi… đáp án sắp hiện!</p>
      <Bar duration={pre.tReadSec} />
    </div>
  );
}

function ActiveQuestion({ active, answered = 0, total = 0, onEnd }) {
  return (
    <div className="w-full max-w-5xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-bold">Câu {active.index + 1} / {active.total}</span>
        <span className="glass rounded-full px-4 py-1 font-bold">{answered}/{total} đã trả lời</span>
      </div>
      <div className="mb-5"><Bar duration={active.tAnswerSec} colorClass="bg-pink-400" /></div>
      <motion.h1
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-3xl md:text-4xl font-extrabold text-center mb-8"
      >
        {active.text}
      </motion.h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ANSWERS.map((a, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.08 }}
            className={`${a.bg} rounded-2xl p-5 flex items-center gap-4 text-xl font-bold shadow-lg`}
          >
            <Shape type={a.shape} className="w-8 h-8 shrink-0" />
            <span>{active.answers[i]}</span>
          </motion.div>
        ))}
      </div>
      <div className="text-center mt-6">
        <button onClick={onEnd} className="btn-ghost text-sm">⏭ Kết thúc sớm</button>
      </div>
    </div>
  );
}

function ResultChart({ active, result, onNext }) {
  const max = Math.max(1, ...result.distribution);
  return (
    <div className="w-full max-w-5xl">
      <h1 className="text-3xl font-extrabold text-center mb-8">{active.text}</h1>
      <div className="grid grid-cols-4 gap-4 items-end h-64 mb-8">
        {ANSWERS.map((a, i) => {
          const count = result.distribution[i];
          const isCorrect = i === result.correctIndex;
          return (
            <div key={i} className="flex flex-col items-center justify-end h-full">
              <span className="font-bold mb-1">{count}</span>
              <motion.div
                className={`${a.bg} w-full rounded-t-xl ${isCorrect ? "ring-4 ring-white" : "opacity-60"}`}
                initial={{ height: 0 }}
                animate={{ height: `${(count / max) * 100}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                style={{ minHeight: 8 }}
              />
              <div className={`mt-2 flex items-center gap-2 ${isCorrect ? "" : "opacity-60"}`}>
                <Shape type={a.shape} className="w-6 h-6" />
                {isCorrect && <span className="text-2xl">✅</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-white/80 mb-6">
        Đáp án đúng: <b>{ANSWERS[result.correctIndex].label}. {active.answers[result.correctIndex]}</b>
      </p>
      <div className="text-center">
        <button onClick={onNext} className="btn-primary text-lg px-10">Xem bảng xếp hạng →</button>
      </div>
    </div>
  );
}

// Khung sặc sỡ cho top 3 (vàng / bạc / đồng).
const PODIUM = [
  "bg-gradient-to-r from-yellow-300/95 to-amber-500/95 text-gray-900 ring-4 ring-yellow-200 shadow-xl shadow-yellow-500/40",
  "bg-gradient-to-r from-slate-100/95 to-slate-300/95 text-gray-900 ring-4 ring-white shadow-xl shadow-slate-300/40",
  "bg-gradient-to-r from-orange-400/95 to-amber-700/95 text-white ring-4 ring-orange-200 shadow-xl shadow-orange-700/40",
];

function Leaderboard({ board, state, onNext, onHome }) {
  const top = board.top || [];
  const isFinal = board.isFinal || state === "GAME_OVER";
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="w-full max-w-3xl text-center">
      <h1 className="text-4xl font-extrabold mb-6">
        {isFinal ? "🏆 Kết quả chung cuộc" : "📊 Bảng xếp hạng"}
      </h1>
      <div className="space-y-2 mb-6">
        <AnimatePresence>
          {top.map((p, i) => {
            const isPodium = i < 3;
            return (
              <motion.div
                key={p.id}
                layout
                initial={{ x: -60, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 220 }}
                className={`rounded-2xl flex items-center justify-between ${
                  isPodium
                    ? `${PODIUM[i]} px-6 py-4 text-2xl font-extrabold`
                    : "glass px-5 py-2.5 text-xl font-semibold"
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className={isPodium ? "w-10 text-3xl" : "w-9 text-base opacity-80"}>
                    {medals[i] || `#${i + 1}`}
                  </span>
                  <span className={isPodium ? "text-3xl" : "text-2xl"}>{p.avatar}</span>
                  <span className="truncate">{p.nickname}</span>
                  {p.streak >= 2 && (
                    <span className={`text-base ${isPodium ? "text-orange-700" : "text-orange-300"}`}>
                      🔥{p.streak}
                    </span>
                  )}
                </span>
                <motion.span
                  key={p.score}
                  initial={{ scale: 1.4 }}
                  animate={{ scale: 1 }}
                  className="shrink-0 pl-3"
                >
                  {p.score}
                </motion.span>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!top.length && <p className="text-white/60">Chưa có điểm.</p>}
      </div>
      {isFinal ? (
        <button onClick={onHome} className="btn-primary text-lg px-10">🏠 Về trang chủ</button>
      ) : (
        <button onClick={onNext} className="btn-primary text-lg px-10">Câu tiếp theo →</button>
      )}
    </div>
  );
}
