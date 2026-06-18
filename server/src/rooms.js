// Room lifecycle + strict state machine (see spec.md §4.1).
//
// States: LOBBY -> PRE_QUESTION -> ACTIVE_QUESTION -> SHOW_RESULT -> LEADERBOARD -> (loop) -> GAME_OVER
//
// Timed phases (PRE_QUESTION, ACTIVE_QUESTION) auto-advance via timers.
// Host drives SHOW_RESULT -> LEADERBOARD -> next question.

import { generatePin } from "./pin.js";
import { computeScore } from "./scoring.js";

export const STATE = {
  LOBBY: "LOBBY",
  PRE_QUESTION: "PRE_QUESTION",
  ACTIVE_QUESTION: "ACTIVE_QUESTION",
  SHOW_RESULT: "SHOW_RESULT",
  LEADERBOARD: "LEADERBOARD",
  GAME_OVER: "GAME_OVER",
};

const DEFAULT_CONFIG = {
  tReadSec: 5, // T_read
  tAnswerSec: 20, // T_answer (fallback; per-question time overrides)
  pMax: 1000, // P_max
  wagerEnabled: true,
  wagerPenaltyPct: 0.5, // wrong + wager => lose 50% of P_max
};

let idCounter = 1;

class Room {
  constructor(io, pin, config) {
    this.io = io;
    this.pin = pin;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.questions = [];
    this.players = new Map(); // playerId -> player
    this.state = STATE.LOBBY;
    this.currentIndex = -1;
    this.activeStartMs = 0;
    this.responses = new Map(); // playerId -> response (current question)
    this.timers = { phase: null };
    this.createdAt = Date.now();
  }

  get channel() {
    return `room:${this.pin}`;
  }

  get hostChannel() {
    return `host:${this.pin}`;
  }

  // ---- players -------------------------------------------------------------

  addPlayer(socketId, nickname, avatar = "🙂") {
    const id = `p${idCounter++}`;
    const player = {
      id,
      nickname,
      avatar,
      socketId,
      score: 0,
      rtt: 0,
      streak: 0,
      connected: true,
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  playerBySocket(socketId) {
    for (const p of this.players.values()) if (p.socketId === socketId) return p;
    return null;
  }

  lobbyList() {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
    }));
  }

  // ---- broadcasting --------------------------------------------------------

  broadcastLobby() {
    this.io.to(this.channel).emit("lobby:players", {
      players: this.lobbyList(),
      count: this.players.size,
    });
  }

  emitState() {
    this.io.to(this.channel).emit("room:state", {
      state: this.state,
      currentIndex: this.currentIndex,
      total: this.questions.length,
    });
  }

  // ---- game flow -----------------------------------------------------------

  clearTimer() {
    if (this.timers.phase) {
      clearTimeout(this.timers.phase);
      this.timers.phase = null;
    }
  }

  start() {
    if (this.state !== STATE.LOBBY) return { error: "Trò chơi đã bắt đầu." };
    if (!this.questions.length) return { error: "Chưa có câu hỏi nào được nạp." };
    if (!this.players.size) return { error: "Chưa có người chơi nào tham gia." };
    this.beginQuestion(0);
    return { ok: true };
  }

  beginQuestion(index) {
    this.clearTimer();
    this.currentIndex = index;
    this.responses = new Map();
    this.state = STATE.PRE_QUESTION;
    const q = this.questions[index];

    this.emitState();
    // Host sees the question text during the read phase; players just wait.
    this.io.to(this.channel).emit("question:pre", {
      index,
      total: this.questions.length,
      text: q.text,
      tReadSec: this.config.tReadSec,
      serverNow: Date.now(),
    });

    this.timers.phase = setTimeout(() => this.activateQuestion(), this.config.tReadSec * 1000);
  }

  activateQuestion() {
    this.clearTimer();
    this.state = STATE.ACTIVE_QUESTION;
    this.activeStartMs = Date.now();
    const q = this.questions[this.currentIndex];
    const tAnswerSec = q.timeSec || this.config.tAnswerSec;

    this.emitState();
    this.io.to(this.channel).emit("question:active", {
      index: this.currentIndex,
      total: this.questions.length,
      text: q.text,
      answers: q.answers,
      tAnswerSec,
      wagerEnabled: this.config.wagerEnabled,
      serverStartMs: this.activeStartMs,
    });

    this.timers.phase = setTimeout(() => this.showResult(), tAnswerSec * 1000);
  }

  /** Record a player's answer (debounced: only the first valid one counts). */
  submitAnswer(playerId, choice, wager) {
    if (this.state !== STATE.ACTIVE_QUESTION) return { error: "Không trong thời gian trả lời." };
    const player = this.players.get(playerId);
    if (!player) return { error: "Người chơi không tồn tại." };
    if (this.responses.has(playerId)) return { error: "Đã trả lời rồi." }; // lock / debounce
    if (typeof choice !== "number" || choice < 0 || choice > 3) {
      return { error: "Lựa chọn không hợp lệ." };
    }

    // RTT calibration: subtract half the player's measured round-trip from the
    // raw elapsed time so every device shares the same t=0 with the host.
    const rawElapsed = Date.now() - this.activeStartMs;
    const tResponseMs = Math.max(0, rawElapsed - player.rtt / 2);

    const q = this.questions[this.currentIndex];
    const correct = choice === q.correctIndex;
    this.responses.set(playerId, {
      choice,
      wager: this.config.wagerEnabled ? !!wager : false,
      tResponseMs,
      correct,
    });

    // Cập nhật realtime cho Host số người đã trả lời.
    this.io.to(this.hostChannel).emit("answer:progress", {
      answered: this.responses.size,
      total: this.players.size,
    });

    // Auto-advance if everyone connected has answered.
    const connected = [...this.players.values()].filter((p) => p.connected).length;
    if (this.responses.size >= connected) {
      this.showResult();
    }
    return { ok: true, locked: true };
  }

  showResult() {
    if (this.state !== STATE.ACTIVE_QUESTION) return;
    this.clearTimer();
    this.state = STATE.SHOW_RESULT;
    const q = this.questions[this.currentIndex];
    const tAnswerMs = (q.timeSec || this.config.tAnswerSec) * 1000;

    const distribution = [0, 0, 0, 0];
    const perPlayer = [];

    for (const [playerId, player] of this.players) {
      const resp = this.responses.get(playerId);
      const answered = !!resp;
      if (answered) distribution[resp.choice]++;

      const { delta, base, doubled, penalty } = computeScore({
        correct: answered && resp.correct,
        answered,
        tResponseMs: answered ? resp.tResponseMs : tAnswerMs,
        tAnswerMs,
        pMax: this.config.pMax,
        wager: answered ? resp.wager : false,
        wagerPenaltyPct: this.config.wagerPenaltyPct,
      });

      const gainedPoints = answered && resp.correct;
      player.streak = gainedPoints ? player.streak + 1 : 0;
      player.score = Math.max(0, player.score + delta); // never below zero

      perPlayer.push({
        player,
        answered,
        correct: answered && resp.correct,
        choice: answered ? resp.choice : null,
        wager: answered ? resp.wager : false,
        delta,
        base,
        doubled,
        penalty,
        tResponseMs: answered ? Math.round(resp.tResponseMs) : null,
      });
    }

    const ranking = this.rankedPlayers();
    const rankOf = new Map(ranking.map((r, i) => [r.id, i + 1]));

    // Host: full stats.
    this.io.to(this.hostChannel).emit("question:result", {
      index: this.currentIndex,
      correctIndex: q.correctIndex,
      distribution,
      answeredCount: this.responses.size,
      totalPlayers: this.players.size,
    });

    // Each player: personalised result.
    for (const r of perPlayer) {
      this.io.to(r.player.socketId).emit("player:result", {
        correct: r.correct,
        answered: r.answered,
        delta: r.delta,
        base: r.base,
        doubled: r.doubled,
        penalty: r.penalty,
        totalScore: r.player.score,
        streak: r.player.streak,
        rank: rankOf.get(r.player.id),
        correctIndex: q.correctIndex,
        tResponseMs: r.tResponseMs,
      });
    }

    this.emitState();
  }

  rankedPlayers() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, streak: p.streak }))
      .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  }

  showLeaderboard() {
    this.clearTimer();
    this.state = STATE.LEADERBOARD;
    const ranking = this.rankedPlayers();
    this.io.to(this.channel).emit("leaderboard", {
      top: ranking.slice(0, 10),
      full: ranking,
      isFinal: this.currentIndex >= this.questions.length - 1,
      index: this.currentIndex,
      total: this.questions.length,
    });
    this.emitState();
  }

  /** Host-driven advance from non-timed states. */
  next() {
    if (this.state === STATE.SHOW_RESULT) {
      this.showLeaderboard();
      return { ok: true };
    }
    if (this.state === STATE.LEADERBOARD) {
      if (this.currentIndex >= this.questions.length - 1) {
        this.state = STATE.GAME_OVER;
        this.io.to(this.channel).emit("game:over", { ranking: this.rankedPlayers() });
        this.emitState();
        return { ok: true };
      }
      this.beginQuestion(this.currentIndex + 1);
      return { ok: true };
    }
    if (this.state === STATE.ACTIVE_QUESTION) {
      // Host may end the answer window early.
      this.showResult();
      return { ok: true };
    }
    return { error: `Không thể chuyển tiếp từ trạng thái ${this.state}.` };
  }

  destroy() {
    this.clearTimer();
  }
}

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // pin -> Room
  }

  create(config) {
    const pin = generatePin((p) => this.rooms.has(p));
    const room = new Room(this.io, pin, config);
    this.rooms.set(pin, room);
    return room;
  }

  get(pin) {
    return this.rooms.get(String(pin));
  }

  remove(pin) {
    const room = this.rooms.get(pin);
    if (room) {
      room.destroy();
      this.rooms.delete(pin);
    }
  }
}
