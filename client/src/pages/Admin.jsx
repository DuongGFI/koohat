import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ANSWERS, Shape } from "../shapes.jsx";

const DEFAULT_CONFIG = {
  tReadSec: 5,
  tAnswerSec: 20,
  pMax: 1000,
  wagerEnabled: true,
  wagerPenaltyPct: 0.5,
};

function loadStored(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export default function Admin() {
  const nav = useNavigate();
  const [questions, setQuestions] = useState(() => loadStored("kahoot.questions", []));
  const [config, setConfig] = useState(() => ({ ...DEFAULT_CONFIG, ...loadStored("kahoot.config", {}) }));
  const [kahootUrl, setKahootUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("kahoot.questions", JSON.stringify(questions));
  }, [questions]);
  useEffect(() => {
    localStorage.setItem("kahoot.config", JSON.stringify(config));
  }, [config]);

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function importExcel(file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/excel", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuestions(data.questions);
      flash("ok", `Đã nạp ${data.questions.length} câu hỏi từ Excel.`);
    } catch (e) {
      flash("err", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function importKahoot() {
    if (!kahootUrl.trim()) return flash("err", "Hãy dán link share của Koohat.");
    setBusy(true);
    try {
      const res = await fetch("/api/import/kahoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: kahootUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuestions(data.questions);
      const skip = data.skipped ? ` (bỏ qua ${data.skipped} câu không phải trắc nghiệm)` : "";
      flash("ok", `Đã nhập ${data.questions.length} câu từ Koohat “${data.title}”${skip}.`);
    } catch (e) {
      flash("err", e.message);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) importExcel(file);
  }

  function addBlank() {
    setQuestions((qs) => [
      ...qs,
      { id: qs.length + 1, text: "", answers: ["", "", "", ""], correctIndex: 0, timeSec: config.tAnswerSec },
    ]);
  }
  function updateQ(i, patch) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function removeQ(i) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  function startHosting() {
    const valid = questions.filter(
      (q) =>
        q.text.trim() &&
        q.answers.filter((a) => a.trim() !== "").length >= 2 &&
        q.answers[q.correctIndex]?.trim()
    );
    if (!valid.length)
      return flash("err", "Cần ít nhất một câu hợp lệ (có nội dung, ≥2 đáp án, và đáp án đúng không để trống).");
    localStorage.setItem("kahoot.questions", JSON.stringify(questions));
    localStorage.setItem("kahoot.config", JSON.stringify(config));
    nav("/host");
  }

  return (
    <div className="app-bg min-h-full text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-extrabold">⚙️ Quản lý câu hỏi</h1>
          <button onClick={() => nav("/")} className="btn-ghost text-sm">← Trang chủ</button>
        </div>

        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mb-4 rounded-xl px-4 py-3 font-semibold ${
                msg.type === "ok" ? "bg-green-500/30 border border-green-300/40" : "bg-red-500/30 border border-red-300/40"
              }`}
            >
              {msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Import */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div
            className="glass rounded-2xl p-5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold">📄 Import file (.xlsx / .csv)</h2>
              <a
                href="/mau-cau-hoi.csv"
                download
                className="text-sm font-semibold underline decoration-dotted hover:text-yellow-200"
              >
                ⬇ Tải file mẫu (.csv)
              </a>
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-white/40 rounded-xl p-6 text-center cursor-pointer hover:bg-white/5"
            >
              Kéo-thả file vào đây hoặc bấm để chọn
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={(e) => importExcel(e.target.files?.[0])}
              />
            </div>
            <p className="text-xs text-white/60 mt-2">
              Cột: Câu hỏi · Đáp án A/B/C/D · Đáp án đúng (A-D) · Thời gian (giây). Tải file mẫu, điền câu hỏi rồi import lại.
            </p>
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="font-bold mb-2">🟣 Import từ Koohat</h2>
            <input
              value={kahootUrl}
              onChange={(e) => setKahootUrl(e.target.value)}
              placeholder="Dán link share Koohat (create.kahoot.it/share/...)"
              className="w-full rounded-xl px-3 py-2 bg-white text-gray-900 mb-2"
            />
            <button onClick={importKahoot} disabled={busy} className="btn-primary w-full">
              {busy ? "Đang tải..." : "Nhập từ Koohat"}
            </button>
            <p className="text-xs text-white/60 mt-2">
              Chỉ lấy câu trắc nghiệm 1 đáp án đúng. Koohat phải ở chế độ công khai.
            </p>
          </div>
        </div>

        {/* Config */}
        <div className="glass rounded-2xl p-5 mb-6">
          <h2 className="font-bold mb-3">🎛️ Cấu hình phòng</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <NumField label="T_read (giây)" value={config.tReadSec}
              onChange={(v) => setConfig((c) => ({ ...c, tReadSec: v }))} />
            <NumField label="T_answer (giây)" value={config.tAnswerSec}
              onChange={(v) => setConfig((c) => ({ ...c, tAnswerSec: v }))} />
            <NumField label="P_max (điểm)" value={config.pMax} step={50}
              onChange={(v) => setConfig((c) => ({ ...c, pMax: v }))} />
            <NumField label="Phạt cược (%)" value={Math.round(config.wagerPenaltyPct * 100)} step={5}
              onChange={(v) => setConfig((c) => ({ ...c, wagerPenaltyPct: v / 100 }))} />
          </div>
          <label className="flex items-center gap-3 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.wagerEnabled}
              onChange={(e) => setConfig((c) => ({ ...c, wagerEnabled: e.target.checked }))}
              className="w-5 h-5"
            />
            <span className="font-semibold">Bật tính năng Đặt cược (Wager)</span>
          </label>
        </div>

        {/* Question list */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-xl">Ngân hàng câu hỏi ({questions.length})</h2>
          <div className="flex gap-2">
            <button onClick={addBlank} className="btn-ghost text-sm">+ Thêm câu</button>
            <button onClick={() => setQuestions([])} className="btn-ghost text-sm">Xóa hết</button>
          </div>
        </div>

        <div className="space-y-3 mb-24">
          {questions.map((q, i) => (
            <div key={i} className="glass rounded-2xl p-4">
              <div className="flex gap-2 items-start mb-3">
                <span className="bg-white/20 rounded-lg px-2 py-1 text-sm font-bold">#{i + 1}</span>
                <input
                  value={q.text}
                  onChange={(e) => updateQ(i, { text: e.target.value })}
                  placeholder="Nội dung câu hỏi"
                  className="flex-1 rounded-xl px-3 py-2 bg-white text-gray-900 font-semibold"
                />
                <input
                  type="number"
                  value={q.timeSec}
                  onChange={(e) => updateQ(i, { timeSec: Number(e.target.value) })}
                  className="w-20 rounded-xl px-2 py-2 bg-white text-gray-900"
                  title="Thời gian (giây)"
                />
                <button onClick={() => removeQ(i)} className="text-red-200 hover:text-red-100 px-2 py-2">✕</button>
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                {ANSWERS.map((a, ai) => (
                  <label key={ai} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${a.bg}`}>
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.correctIndex === ai}
                      onChange={() => updateQ(i, { correctIndex: ai })}
                      className="w-4 h-4 accent-white"
                      title="Đáp án đúng"
                    />
                    <Shape type={a.shape} className="w-4 h-4 shrink-0" />
                    <input
                      value={q.answers[ai]}
                      onChange={(e) => {
                        const answers = [...q.answers];
                        answers[ai] = e.target.value;
                        updateQ(i, { answers });
                      }}
                      placeholder={`Đáp án ${a.label}`}
                      className="flex-1 bg-white/90 rounded-lg px-2 py-1 text-gray-900"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          {!questions.length && (
            <div className="text-center text-white/60 py-12">Chưa có câu hỏi. Import hoặc thêm thủ công.</div>
          )}
        </div>

        {/* Sticky action bar */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/30 backdrop-blur-md">
          <div className="max-w-5xl mx-auto flex justify-end">
            <button onClick={startHosting} className="btn-primary text-lg px-8">
              🚀 Bắt đầu tổ chức →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }) {
  return (
    <label className="block">
      <span className="text-sm text-white/80">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-xl px-3 py-2 bg-white text-gray-900 mt-1"
      />
    </label>
  );
}
