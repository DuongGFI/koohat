// Question import: Excel (.xlsx) and public Google Sheets (CSV export).
//
// Expected columns (header row, case-insensitive, Vietnamese or English):
//   Câu hỏi / Question
//   Đáp án A / A
//   Đáp án B / B
//   Đáp án C / C
//   Đáp án D / D
//   Đáp án đúng / Correct   -> one of A B C D (or 1..4)
//   Thời gian / Time        -> seconds (optional, default 20)

import xlsx from "xlsx";

const HEADER_ALIASES = {
  question: ["câu hỏi", "cau hoi", "question", "nội dung", "noi dung"],
  a: ["đáp án a", "dap an a", "answer a", "a", "lựa chọn a"],
  b: ["đáp án b", "dap an b", "answer b", "b", "lựa chọn b"],
  c: ["đáp án c", "dap an c", "answer c", "c", "lựa chọn c"],
  d: ["đáp án d", "dap an d", "answer d", "d", "lựa chọn d"],
  correct: ["đáp án đúng", "dap an dung", "correct", "answer", "đúng"],
  time: ["thời gian", "thoi gian", "time", "duration", "giây", "giay"],
};

function normalize(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((raw, idx) => {
    const h = normalize(raw);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(h)) {
        if (map[key] === undefined) map[key] = idx;
      }
    }
  });
  return map;
}

const LETTER_TO_INDEX = { a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3 };

function rowsToQuestions(rows, defaultTime = 20) {
  if (!rows.length) return [];
  const headerMap = buildHeaderMap(rows[0]);
  const required = ["question", "a", "b", "c", "d", "correct"];
  const missing = required.filter((k) => headerMap[k] === undefined);
  if (missing.length) {
    throw new Error(
      `Thiếu cột bắt buộc: ${missing.join(", ")}. Cần có: Câu hỏi, Đáp án A/B/C/D, Đáp án đúng.`
    );
  }

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const text = String(r[headerMap.question] ?? "").trim();
    if (!text) continue; // skip blank rows
    const answers = [
      String(r[headerMap.a] ?? "").trim(),
      String(r[headerMap.b] ?? "").trim(),
      String(r[headerMap.c] ?? "").trim(),
      String(r[headerMap.d] ?? "").trim(),
    ];
    const correctRaw = normalize(r[headerMap.correct]);
    const correctIndex = LETTER_TO_INDEX[correctRaw];
    if (correctIndex === undefined) {
      throw new Error(
        `Dòng ${i + 1}: "Đáp án đúng" không hợp lệ ("${r[headerMap.correct]}"). Phải là A, B, C hoặc D.`
      );
    }
    let time = defaultTime;
    if (headerMap.time !== undefined) {
      const t = parseInt(r[headerMap.time], 10);
      if (!Number.isNaN(t) && t > 0) time = t;
    }
    out.push({ id: out.length + 1, text, answers, correctIndex, timeSec: time });
  }
  if (!out.length) throw new Error("Không tìm thấy câu hỏi hợp lệ nào trong dữ liệu.");
  return out;
}

/** Parse an uploaded .xlsx file buffer into questions. */
export function parseExcelBuffer(buffer) {
  const wb = xlsx.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
  return rowsToQuestions(rows);
}

/**
 * Convert a Google Sheets URL into a CSV export URL.
 * Works for sheets shared as "Anyone with the link".
 */
export function toCsvExportUrl(url) {
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error("URL Google Sheets không hợp lệ.");
  const id = m[1];
  const gidMatch = String(url).match(/[#&?]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Fetch a public Google Sheet and parse it into questions. */
export async function fetchGoogleSheet(url) {
  const csvUrl = toCsvExportUrl(url);
  const res = await fetch(csvUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      `Không tải được Google Sheet (HTTP ${res.status}). Hãy đảm bảo sheet đã chia sẻ ở chế độ "Anyone with the link".`
    );
  }
  const text = await res.text();
  if (text.trim().startsWith("<!DOCTYPE html") || text.includes("<html")) {
    throw new Error(
      'Sheet chưa công khai. Hãy đặt quyền chia sẻ "Anyone with the link" rồi thử lại.'
    );
  }
  const rows = parseCsv(text);
  return rowsToQuestions(rows);
}

// ---------------------------------------------------------------------------
// Kahoot import (public quizzes via the unofficial REST endpoint)
//
// Share link looks like:
//   https://create.kahoot.it/share/<slug>/<uuid>
// The quiz JSON is served (for public/visible quizzes) at:
//   https://create.kahoot.it/rest/kahoots/<uuid>
// ---------------------------------------------------------------------------

/** Strip HTML tags + decode the few entities Kahoot emits, collapse whitespace. */
function htmlToText(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a UUID out of a Kahoot share URL (or accept a bare UUID). */
export function extractKahootUuid(url) {
  const m = String(url).match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  if (!m) throw new Error("Không tìm thấy ID Kahoot trong đường dẫn. Hãy dán link share đầy đủ.");
  return m[0];
}

/**
 * Map a Kahoot quiz JSON into our question shape.
 * Only single-answer multiple-choice ("quiz") questions are imported; slides,
 * surveys, open-ended, jumble and multi-select are skipped (our game model has
 * exactly one correct answer among four buttons).
 * @returns {{ title:string, questions:Array, skipped:number, total:number }}
 */
export function mapKahootQuiz(data) {
  const list = Array.isArray(data?.questions) ? data.questions : [];
  const out = [];
  let skipped = 0;

  for (const q of list) {
    if (q?.type !== "quiz") { skipped++; continue; } // not single-answer MCQ
    const choices = (q.choices || []).filter((c) => typeof c?.answer === "string");
    const texts = choices.map((c) => htmlToText(c.answer));
    let correct = choices.findIndex((c) => c.correct);
    const text = htmlToText(q.question);
    if (!text || correct < 0 || texts.length < 2) { skipped++; continue; }

    const answers = texts.slice(0, 4);
    // If the correct choice sits beyond the 4th slot (rare), force it into slot 4.
    if (correct > 3) {
      answers[3] = texts[correct];
      correct = 3;
    }
    while (answers.length < 4) answers.push(""); // pad true/false etc. to 4

    const timeSec = Math.max(5, Math.round((Number(q.time) || 20000) / 1000));
    out.push({ id: out.length + 1, text, answers, correctIndex: correct, timeSec });
  }

  return { title: htmlToText(data?.title) || "Kahoot", questions: out, skipped, total: list.length };
}

/** Fetch a public Kahoot quiz and map it into questions. */
export async function fetchKahoot(url) {
  const uuid = extractKahootUuid(url);
  const endpoint = `https://create.kahoot.it/rest/kahoots/${uuid}`;
  const res = await fetch(endpoint, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    redirect: "follow",
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Kahoot này ở chế độ riêng tư — không thể nhập. Cần một Kahoot công khai (visible).");
  }
  if (res.status === 404) {
    throw new Error("Không tìm thấy Kahoot với ID này.");
  }
  if (!res.ok) throw new Error(`Không tải được Kahoot (HTTP ${res.status}).`);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Phản hồi từ Kahoot không hợp lệ.");
  }
  const mapped = mapKahootQuiz(data);
  if (!mapped.questions.length) {
    throw new Error("Không có câu hỏi trắc nghiệm (quiz) nào để nhập từ Kahoot này.");
  }
  return mapped;
}
