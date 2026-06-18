// Scoring & wager engine — see spec.md §3
//
// Base (Kahoot-style):
//   correct  -> score = round(Pmax * (1 - (t_response / T_answer) / 2))   (50%..100% of Pmax)
//   wrong    -> 0
//
// Wager (toggled by player before answering):
//   correct + wager -> score * 2
//   wrong   + wager -> score 0, AND a penalty of (wagerPenaltyPct * Pmax) is subtracted from total
//
// All times in milliseconds.

/**
 * @param {Object} p
 * @param {boolean} p.correct      whether the chosen answer is the correct one
 * @param {boolean} p.answered     whether the player answered at all (vs. timeout)
 * @param {number}  p.tResponseMs  response time in ms (already RTT-calibrated)
 * @param {number}  p.tAnswerMs    answer window length in ms (T_answer)
 * @param {number}  p.pMax         max points for the question (P_max)
 * @param {boolean} p.wager        whether the player enabled wager for this question
 * @param {number}  p.wagerPenaltyPct  fraction of pMax lost on wrong+wager (e.g. 0.5)
 * @returns {{ delta:number, base:number, doubled:boolean, penalty:number }}
 */
export function computeScore({
  correct,
  answered,
  tResponseMs,
  tAnswerMs,
  pMax,
  wager,
  wagerPenaltyPct,
}) {
  // No answer at all -> nothing happens (no points, no penalty).
  if (!answered) {
    return { delta: 0, base: 0, doubled: false, penalty: 0 };
  }

  if (correct) {
    const ratio = clamp(tResponseMs / tAnswerMs, 0, 1);
    let base = Math.round(pMax * (1 - ratio / 2));
    const doubled = !!wager;
    const delta = doubled ? base * 2 : base;
    return { delta, base, doubled, penalty: 0 };
  }

  // Wrong answer.
  if (wager) {
    const penalty = Math.round(pMax * wagerPenaltyPct);
    return { delta: -penalty, base: 0, doubled: false, penalty };
  }

  return { delta: 0, base: 0, doubled: false, penalty: 0 };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
