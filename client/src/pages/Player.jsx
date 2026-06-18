import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { socket, emitAck, startRttCalibration } from "../socket.js";
import { ANSWERS, Shape } from "../shapes.jsx";
import { AVATAR_CATEGORIES, randomAvatar } from "../avatars.js";

export default function Player() {
  const { pin: pinParam } = useParams();
  const [pin, setPin] = useState(pinParam || "");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(() => randomAvatar());
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState("LOBBY");
  const [pre, setPre] = useState(null);
  const [active, setActive] = useState(null);
  const [wager, setWager] = useState(false);
  const [locked, setLocked] = useState(false);
  const [myChoice, setMyChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [rank, setRank] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => startRttCalibration(), []);

  useEffect(() => {
    const onState = (d) => {
      setState(d.state);
      if (d.state === "PRE_QUESTION") {
        setLocked(false);
        setMyChoice(null);
        setResult(null);
      }
    };
    const onPre = (d) => setPre(d);
    const onActive = (d) => setActive(d);
    const onResult = (d) => { setResult(d); setRank(d.rank); };
    const onBoard = (d) => {
      const me = d.full?.find((p) => p.nickname === nickname);
      if (me) setRank(d.full.indexOf(me) + 1);
    };
    const onClosed = (d) => setError(d.reason || "Phòng đã đóng.");

    socket.on("room:state", onState);
    socket.on("question:pre", onPre);
    socket.on("question:active", onActive);
    socket.on("player:result", onResult);
    socket.on("leaderboard", onBoard);
    socket.on("room:closed", onClosed);
    return () => {
      socket.off("room:state", onState);
      socket.off("question:pre", onPre);
      socket.off("question:active", onActive);
      socket.off("player:result", onResult);
      socket.off("leaderboard", onBoard);
      socket.off("room:closed", onClosed);
    };
  }, [nickname]);

  async function join() {
    const r = await emitAck("player:join", { pin: pin.trim(), nickname: nickname.trim(), avatar });
    if (r.error) return setError(r.error);
    setError(null);
    setJoined(true);
  }

  async function answer(choice) {
    if (locked || state !== "ACTIVE_QUESTION") return;
    setLocked(true);
    setMyChoice(choice);
    const r = await emitAck("player:answer", { choice, wager });
    if (r.error) {
      setLocked(false);
      setMyChoice(null);
    }
  }

  // ---- join screen ----
  if (!joined) {
    return (
      <Wrap>
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass rounded-3xl p-6 w-full max-w-sm">
          <h1 className="text-3xl font-extrabold text-center mb-5">Tham gia</h1>

          {/* Avatar đang chọn + nút random */}
          <div className="flex flex-col items-center mb-4">
            <motion.div
              key={avatar}
              initial={{ scale: 0.6, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              className="w-20 h-20 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center text-5xl"
            >
              {avatar}
            </motion.div>
            <button
              onClick={() => setAvatar(randomAvatar())}
              className="mt-2 text-sm font-semibold text-white/80 hover:text-white underline decoration-dotted"
            >
              🎲 Ngẫu nhiên
            </button>
          </div>

          {/* Bộ chọn avatar theo danh mục */}
          <AvatarPicker selected={avatar} onSelect={setAvatar} />

          {!pinParam && (
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              placeholder="Mã PIN"
              className="w-full text-center text-2xl tracking-widest rounded-xl px-4 py-3 bg-white/15 text-white placeholder-white/50 border border-white/30 mb-3 font-bold focus:outline-none focus:border-white/70"
            />
          )}
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Biệt danh của bạn"
            maxLength={20}
            className="w-full text-center text-xl rounded-xl px-4 py-3 bg-white/15 text-white placeholder-white/50 border border-white/30 mb-4 font-semibold focus:outline-none focus:border-white/70"
          />
          {error && <p className="text-red-200 text-center mb-3 font-semibold">{error}</p>}
          <button onClick={join} disabled={!pin || !nickname} className="btn-primary w-full text-xl py-4">
            Vào phòng →
          </button>
        </motion.div>
      </Wrap>
    );
  }

  if (error) {
    return <Wrap><div className="glass rounded-3xl p-8 text-center text-xl font-bold">⚠️ {error}</div></Wrap>;
  }

  // ---- play screens ----
  if (state === "ACTIVE_QUESTION" && active && !locked) {
    return (
      <div className="app-bg min-h-full flex flex-col">
        {/* Đề bài trên điện thoại để người chơi đọc và chọn */}
        <div className="px-4 pt-4 pb-2 text-center">
          <p className="text-xs text-white/60 mb-1">
            Câu {active.index + 1}/{active.total}
          </p>
          <h2 className="text-lg font-bold leading-snug">{active.text}</h2>
        </div>
        <WagerToggle wager={wager} setWager={setWager} enabled={active?.wagerEnabled} sticky />
        <div className="grid grid-cols-2 gap-3 p-3 flex-1">
          {ANSWERS.map((a, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.92 }}
              onClick={() => answer(i)}
              disabled={!active.answers[i]}
              className={`${a.bg} rounded-2xl flex flex-col items-center justify-center gap-2 text-white shadow-xl p-3 disabled:opacity-30`}
            >
              <Shape type={a.shape} className="w-9 h-9 shrink-0" />
              <span className="text-base font-bold leading-tight text-center break-words">
                {active.answers[i]}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  if (state === "ACTIVE_QUESTION" && locked) {
    return (
      <Wrap>
        <div className="text-center">
          <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-2xl font-bold mb-2">
            ✅ Đã chọn đáp án {ANSWERS[myChoice]?.label}
          </motion.div>
          {wager && <p className="text-yellow-300 font-bold">🎲 Đã ĐẶT CƯỢC câu này</p>}
          <p className="text-white/70 mt-3 animate-pulse">Chờ kết quả…</p>
        </div>
      </Wrap>
    );
  }

  if (state === "SHOW_RESULT" && result) {
    return (
      <Wrap>
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`rounded-3xl p-10 text-center w-full max-w-sm ${result.correct ? "bg-green-500/30" : "bg-red-500/30"}`}
        >
          <div className="text-6xl mb-3">{result.correct ? "🎉" : result.answered ? "❌" : "⏰"}</div>
          <h2 className="text-3xl font-extrabold mb-2">
            {result.correct ? "Chính xác!" : result.answered ? "Sai rồi" : "Hết giờ"}
          </h2>
          {result.delta !== 0 && (
            <p className={`text-2xl font-bold ${result.delta > 0 ? "text-green-200" : "text-red-200"}`}>
              {result.delta > 0 ? "+" : ""}{result.delta} điểm
              {result.doubled && <span className="ml-1 text-yellow-300">(x2 cược)</span>}
              {result.penalty > 0 && <span className="ml-1 text-red-300">(phạt cược)</span>}
            </p>
          )}
          <div className="mt-4 text-lg">
            Tổng: <b>{result.totalScore}</b>
            {rank && <span className="block text-white/80">Hạng #{rank}</span>}
            {result.streak >= 2 && <span className="block text-orange-300">🔥 Chuỗi {result.streak}</span>}
          </div>
        </motion.div>
      </Wrap>
    );
  }

  // LOBBY / PRE_QUESTION / LEADERBOARD / GAME_OVER waiting states
  return (
    <Wrap>
      <div className="text-center">
        <div className="text-6xl mb-1">{avatar}</div>
        <p className="text-2xl font-bold mb-2">{nickname}</p>
        {state === "LOBBY" && <p className="text-white/80 animate-pulse">Đã vào phòng! Chờ Host bắt đầu…</p>}
        {state === "PRE_QUESTION" && (
          <>
            {pre && (
              <div className="glass rounded-2xl px-4 py-4 mb-4">
                <p className="text-xs text-white/60 mb-1">Câu {pre.index + 1}/{pre.total}</p>
                <h2 className="text-xl font-bold leading-snug">{pre.text}</h2>
              </div>
            )}
            <p className="text-white/80 mb-3 animate-pulse">Đọc kỹ, đáp án sắp xuất hiện…</p>
            <WagerToggle wager={wager} setWager={setWager} enabled />
          </>
        )}
        {(state === "LEADERBOARD" || state === "GAME_OVER") && (
          <AnimatePresence>
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="glass rounded-3xl p-8">
              <p className="text-xl">Hạng của bạn</p>
              <p className="text-6xl font-extrabold my-2">#{rank ?? "—"}</p>
              {state === "GAME_OVER" && <p className="text-white/80">Cảm ơn đã chơi! 🎊</p>}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </Wrap>
  );
}

function Wrap({ children }) {
  return (
    <div className="app-bg min-h-full flex items-center justify-center text-white p-5">{children}</div>
  );
}

function AvatarPicker({ selected, onSelect }) {
  const [cat, setCat] = useState(AVATAR_CATEGORIES[0].key);
  const active = AVATAR_CATEGORIES.find((c) => c.key === cat) || AVATAR_CATEGORIES[0];
  return (
    <div className="mb-4">
      <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
        {AVATAR_CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={`shrink-0 text-xs font-semibold rounded-full px-3 py-1 transition ${
              cat === c.key ? "bg-white text-indigo-700" : "bg-white/15 text-white"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {active.emojis.map((e) => (
          <button
            key={e}
            onClick={() => onSelect(e)}
            className={`aspect-square rounded-xl text-2xl flex items-center justify-center transition ${
              selected === e ? "bg-white/40 ring-2 ring-white" : "bg-white/10 hover:bg-white/20"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function WagerToggle({ wager, setWager, enabled, sticky }) {
  if (!enabled) return null;
  return (
    <div className={sticky ? "p-3" : ""}>
      <button
        onClick={() => setWager((w) => !w)}
        className={`w-full rounded-2xl py-3 font-bold text-lg border-2 transition ${
          wager ? "bg-yellow-400 text-gray-900 border-yellow-200" : "bg-white/10 text-white border-white/30"
        }`}
      >
        🎲 ĐẶT CƯỢC {wager ? "ĐANG BẬT" : "(tắt)"}
      </button>
      <p className="text-center text-xs text-white/60 mt-1">
        Đúng → x2 điểm · Sai → bị trừ điểm
      </p>
    </div>
  );
}
