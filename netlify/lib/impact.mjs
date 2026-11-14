// =============================================================================
// netlify/lib/impact.mjs: anonymous impact counters (numbers only, no text)
// =============================================================================
// Flow 14 in docs/HOW_IT_WORKS.md.
//
// To show impact without reading anyone's chat, the server keeps a few
// totals. Each chat adds to a counter at most once per milestone:
//   chats_started   a new chat got its first message
//   goal_named      the ladder got a goal
//   step_chosen     the person agreed on a 24-hour step
//   came_back       the person pressed "I'm back" (the 24-hour check-in)
//   steps_done      a step moved to done_steps (counted per step)
//   who5_pairs      a chat has a second WHO-5 score; who5_change_sum adds (last - first)
//   care_replies    the bot answered with CARE (crisis help lines shown)
//
// What is stored: only these integers and a start date. No message text, no
// ids, no IP, no time per person. Deleting a chat does not change the totals,
// because they cannot be traced back to it.
//
// Storage: Netlify Blobs store "impact-stats" (key "totals"), or memory when
// running tests locally. Read-modify-write without locking: two chats at the
// same millisecond can lose one increment. Good enough for a prototype.
// Test runs over HTTP send the header x-test-run: 1 and are not counted.
// =============================================================================

const KEYS = ["chats_started", "goal_named", "step_chosen", "came_back", "steps_done", "who5_pairs", "who5_change_sum", "care_replies"];
let memory = null;
let blobs; // undefined = not checked yet, null = not available

async function store() {
  if (blobs !== undefined) return blobs;
  try {
    const { getStore } = await import("@netlify/blobs");
    const s = getStore("impact-stats");
    await s.get("__probe__");
    blobs = s;
  } catch {
    blobs = null;
  }
  return blobs;
}

const empty = () => ({ ...Object.fromEntries(KEYS.map((k) => [k, 0])), since: new Date().toISOString().slice(0, 10) });

export async function readTotals() {
  const s = await store();
  const t = s ? await s.get("totals", { type: "json" }) : memory;
  return { ...empty(), ...(t ?? {}) };
}

async function add(delta) {
  if (!Object.values(delta).some(Boolean)) return;
  const t = await readTotals();
  for (const [k, v] of Object.entries(delta)) t[k] = (t[k] ?? 0) + v;
  const s = await store();
  if (s) await s.setJSON("totals", t);
  else memory = t;
}

// Called once per chat turn, AFTER the session was updated. `before` is what the
// session looked like before this turn: { userTurns, ladder, who5Count }.
// Milestones already counted for this chat are remembered in session.impact
// (booleans only), so nothing is counted twice.
export async function countTurn(session, before, { behavior, checkIn }) {
  const seen = (session.impact ??= {});
  const d = {};
  const l = session.ladder ?? {};
  if (before.userTurns === 0) d.chats_started = 1;
  if (l.goal && !seen.goal) { d.goal_named = 1; seen.goal = true; }
  if (l.step && !seen.step) { d.step_chosen = 1; seen.step = true; }
  if (checkIn && !seen.back) { d.came_back = 1; seen.back = true; }
  const doneNow = l.done_steps?.length ?? 0, doneBefore = before.ladder?.done_steps?.length ?? 0;
  if (doneNow > doneBefore) d.steps_done = doneNow - doneBefore;
  const w = session.who5 ?? [];
  if (w.length >= 2 && before.who5Count < 2 && !seen.who5) {
    d.who5_pairs = 1;
    d.who5_change_sum = w.at(-1).score - w[0].score;
    seen.who5 = true;
  }
  if (behavior === "CARE") d.care_replies = 1;
  try { await add(d); } catch { /* counting must never break a chat */ }
}

// The public numbers for GET /api/stats.
export async function publicStats() {
  const t = await readTotals();
  return {
    since: t.since,
    chats_started: t.chats_started,
    goal_named: t.goal_named,
    step_chosen: t.step_chosen,
    came_back: t.came_back,
    steps_done: t.steps_done,
    care_replies: t.care_replies,
    who5_pairs: t.who5_pairs,
    who5_avg_change: t.who5_pairs ? +(t.who5_change_sum / t.who5_pairs).toFixed(1) : null,
  };
}
