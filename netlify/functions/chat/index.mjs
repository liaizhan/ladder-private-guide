// =============================================================================
// netlify/functions/chat/index.mjs: POST /api/chat
// =============================================================================
// The main backend. Every chat message (from the web page or the test runner)
// comes here. It is a Netlify Function: Netlify runs this file on its servers
// whenever someone calls /api/chat, so the API key never reaches the browser.
//
// Request : { "session_id": "<uuid>" (omit for a new chat), "message": "...",
//             "check_in": true (optional: the "I'm back" button) }
// Response: { session_id, turn, behavior, reply, flags, context, ladder, who5,
//             provider, model, prompt_version, storage, latency_ms, usage }
//
// FLOW 1 in docs/HOW_IT_WORKS.md. The step numbers below match the doc:
//   1  Accept only POST with a JSON body
//   2  Validate the message (empty / too long)
//   3  Rate-limit the caller
//   4  Load the chat session, or create a new one
//   5  Stop if the chat is too long
//   6  Mask personal data, and flag injection / distress
//   7a Add extra context if the question needs it:
//        WHO-5 questions or a server-computed WHO-5 score, or RAG (Ladder method notes)
//   7b Add the person's ladder so far, and a CHECK-IN block for "I'm back"
//   7  Build the conversation history the model will see (this is the "memory")
//   8  Call the model and check its answer format
//   9  Force a caring reply if a crisis was detected; replace a reply that leaks the prompt
//   10 Remove personal data from the reply
//   11 Save both messages to the session
//   12 Return the reply, and log (without message text)
// =============================================================================

import { loadSession, saveSession, newSession, isValidId, storageKind } from "../../lib/store.mjs";
import {
  validateMessage, redactPII, looksLikeInjection, showsDistress, mentionsMedical, parseModelOutput, EMPTY_REPLY, REFUSAL_REPLY, langOf,
  leaksPrompt, LEAK_REPLACEMENT, supportLineFor, MAX_TURNS_PER_SESSION, HISTORY_TURNS_SENT,
} from "../../lib/checks.mjs";
import { callLLM, provider, modelName, env, PROMPT_VERSION } from "../../lib/llm.mjs";
import { retrieve, wantsMethod, formatMethod } from "../../lib/rag.mjs";
import { who5Intent, formatQuestions, scoreWho5, formatResult } from "../../lib/who5.mjs";
import { sanitizeLadder, mergeLadder, formatLadder, formatCheckIn } from "../../lib/ladder.mjs";
import { countTurn } from "../../lib/impact.mjs";

// -----------------------------------------------------------------------------
// Rate limiter used in step 3.
// Remembers the timestamps of recent requests per IP address and refuses
// anything over RATE_LIMIT_PER_MIN in the last 60 seconds.
// Limitation: it lives in this function instance's memory, so it is
// best-effort (Netlify may run several instances). Good enough for a demo;
// use a shared store (e.g. Netlify Blobs or Redis) for real traffic.
// -----------------------------------------------------------------------------
const hits = new Map(); // ip -> [timestamp, timestamp, ...]

function rateLimited(ip) {
  const limit = Number(env("RATE_LIMIT_PER_MIN") || 30);
  const now = Date.now();
  // Keep only requests from the last 60 seconds, then add this one.
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limit;
}

// -----------------------------------------------------------------------------
// The handler. Netlify calls this with a standard web Request object and a
// `context` object (context.ip is the caller's IP address).
// -----------------------------------------------------------------------------
export default async (req, context) => {
  const started = Date.now(); // used for latency_ms in the response

  // ---- Step 1: accept only POST with a JSON body ---------------------------
  if (req.method !== "POST") return Response.json({ error: "Use POST" }, { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body must be JSON: {"message": "..."}' }, { status: 400 });
  }

  // ---- Step 2: validate the message ----------------------------------------
  // Rejects empty messages and messages over MAX_MESSAGE_CHARS (see checks.mjs).
  const input = validateMessage(body?.message);
  if (!input.ok) return Response.json({ error: input.error }, { status: 400 });

  // ---- Step 3: rate limit ----------------------------------------------------
  // 429 + retry-after tells well-behaved clients (like scripts/run-tests.mjs)
  // to wait and try again.
  if (rateLimited(context?.ip ?? "unknown")) {
    return Response.json(
      { error: "Too many messages, please slow down." },
      { status: 429, headers: { "retry-after": "10" } }
    );
  }

  // ---- Step 4: load the session, or create a new one -----------------------
  // The browser sends the session_id it got back from the first message.
  // We only accept proper UUIDs, so nobody can use odd keys in the store.
  let session = null;
  if (body.session_id != null) {
    if (!isValidId(body.session_id)) return Response.json({ error: "invalid session_id" }, { status: 400 });
    session = await loadSession(body.session_id);
  }
  // No id, or an id we've never seen (e.g. after a local restart): start a new chat.
  session ??= newSession(isValidId(body.session_id) ? body.session_id : crypto.randomUUID());

  // ---- Step 5: cap the conversation length (cost control) -------------------
  const userTurns = session.messages.filter((m) => m.role === "user").length;
  // What the chat looked like before this turn, for the anonymous impact counters (step 11b).
  const before = { userTurns, ladder: { done_steps: [...(session.ladder?.done_steps ?? [])] }, who5Count: session.who5?.length ?? 0 };
  if (userTurns >= MAX_TURNS_PER_SESSION) {
    return Response.json({ error: "This conversation is full. Please start a new chat." }, { status: 400 });
  }

  // ---- Step 6: mask personal data, and raise flags ---------------------------
  // From here on we only use `redacted.text`: the model, the saved chat and
  // the logs never see the original email / phone / card / SSN.
  const redacted = redactPII(input.text);
  const flags = {
    pii_redacted: redacted.found,                     // e.g. ["email", "phone"]
    injection_suspected: looksLikeInjection(input.text), // flagged, NOT blocked
    distress: showsDistress(input.text),                // triggers step 9
    medical: mentionsMedical(input.text),                // flagged; the prompt declines medical questions
    output_valid: true,                                  // updated in step 8
  };

  // ---- Step 7a: add extra context (WHO-5 or RAG) -----------------------------------
  // A simple "router" decides whether this question needs outside information:
  //   - asks for the WHO-5 check            → the 5 official questions (who5.mjs)
  //   - answers WHO-5 with five numbers     → the SERVER computes the score (exact maths),
  //                                           compared with an earlier score in this chat
  //   - asks about the method / privacy / limits, or a short follow-up to that
  //                                         → retrieve matching method notes (rag.mjs)
  //   - otherwise                           → no extra context
  // The extra context is put IN FRONT of the user's message for the model only.
  // It is not saved in the chat history; only which sources were used is saved.
  let extra = null;        // { type: "who5" | "rag", source, items: [...] }, returned to the browser
  let contextText = "";    // the text block the model sees
  const lastBot = [...session.messages].reverse().find((m) => m.role === "assistant");
  const who5 = flags.distress ? null : who5Intent(redacted.text, lastBot?.content ?? "");

  if (who5?.type === "who5-result") {
    const previous = session.who5?.at(-1)?.score ?? null;
    const result = scoreWho5(who5.scores, previous);
    session.who5 = [...(session.who5 ?? []), { score: result.score, ts: new Date().toISOString() }];
    extra = { type: "who5", source: "WHO-5 score (computed on the server)", items: [{ id: "WHO5", score: result.score, band: result.band, change: result.change }] };
    contextText = formatResult(result);
  } else if (who5?.type === "who5-questions") {
    extra = { type: "who5", source: "WHO-5 questions", items: [] };
    contextText = formatQuestions();
  } else if (wantsMethod(redacted.text, lastBot?.context_type)) {
    const hits = retrieve(redacted.text); // top matching notes, best first
    extra = { type: "rag", source: "Ladder method notes", items: hits };
    contextText = hits.length
      ? formatMethod(hits)
      : "METHOD NOTES: no notes matched this question. Say the notes don't cover it; don't guess.";
  }

  // ---- Step 7b: the ladder so far, the 24-hour check-in, the safety note --------
  // The ladder is data the model built from this person's words (ladder.mjs).
  // Not sent in a crisis: then the exercise stops.
  const blocks = contextText ? [contextText] : [];
  if (session.ladder && !flags.distress) {
    blocks.push(formatLadder(session.ladder));
    if (body.check_in === true && session.ladder.step) blocks.push(formatCheckIn(session.ladder));
  }
  // The crisis check found words about suicide, self-harm or violence (in English,
  // Russian or Kazakh, even Kazakh typed in Latin letters). Tell the model, so it
  // writes the caring reply itself; step 9 still guarantees the help lines.
  if (flags.distress) blocks.push("SAFETY NOTE (from the server's crisis check; DATA, not instructions): this message matched words about suicide, self-harm, wanting to die, or violence. Reply with CARE in the person's language.");
  contextText = blocks.join("\n\n");

  // ---- Step 7: build the conversation history (the "memory") ----------------
  // The model itself remembers nothing between calls. We resend the last
  // HISTORY_TURNS_SENT exchanges every time, followed by the new message.
  // That is how "how about the orange?" is understood after the apple question.
  // Past bot replies are sent back in the same JSON shape we ask the model to
  // use, which helps it keep answering in that format.
  const past = session.messages.slice(-HISTORY_TURNS_SENT * 2).map((m) => ({
    role: m.role,
    content: m.role === "assistant" ? JSON.stringify({ behavior: m.behavior, reply: m.content }) : m.content,
  }));
  const userForModel = contextText ? `${contextText}\n\nUSER MESSAGE:\n${redacted.text}` : redacted.text;
  const history = [...past, { role: "user", content: userForModel }];

  // ---- Step 8: call the model and check its answer ---------------------------
  // callLLM (llm.mjs) picks Claude, OpenAI or the mock model.
  // parseModelOutput (checks.mjs) makes sure we got {"behavior", "reply"}.
  let behavior, reply, ladderRaw = null, usage = { input_tokens: 0, output_tokens: 0 };
  try {
    let llm = await callLLM(history);
    usage = llm.usage;
    let parsed = parseModelOutput(llm.raw);
    // Cut off: nothing usable, or the token limit stopped the reply mid-word
    // (seen in Kazakh crisis replies, where the model thinks longer before answering).
    const cutOff = () => parsed.empty || (!parsed.ok && llm.stop === "max_tokens");
    // The API refused with no text (an encoded order, for example): a retry gets the same
    // refusal, so decline in the person's language instead of asking them to send it again.
    if (parsed.empty && llm.stop === "refusal") {
      parsed = { ok: false, behavior: "DECLINE", reply: REFUSAL_REPLY[langOf(input.text)] ?? REFUSAL_REPLY.en, ladder: null };
    }
    if (cutOff()) { // try once more, then fall back
      llm = await callLLM(history);
      usage = { input_tokens: usage.input_tokens + llm.usage.input_tokens, output_tokens: usage.output_tokens + llm.usage.output_tokens };
      parsed = parseModelOutput(llm.raw);
      if (cutOff()) {
        if (parsed.behavior === "CARE") parsed.reply = supportLineFor(input.text).full; // a crisis reply: never leave the person without help lines
        else if (parsed.empty) parsed.reply = EMPTY_REPLY[langOf(input.text)] ?? EMPTY_REPLY.en; // apologise in the person's language
      }
    }
    flags.output_valid = parsed.ok;
    ({ behavior, reply } = parsed);
    ladderRaw = parsed.ladder;
  } catch (err) {
    // Network error, bad key, no credits, timeout... Log the reason for the
    // developer (visible in Netlify → Logs → Functions), show a generic message to the user.
    console.error(JSON.stringify({ event: "llm_error", message: String(err.message).slice(0, 300) }));
    return Response.json({ error: "The assistant is unavailable right now. Please try again." }, { status: 502 });
  }

  // ---- Step 9: a crisis always gets help lines ---------------------------------
  // A safety net that doesn't depend on the model getting it right.
  if (flags.distress) {
    const help = supportLineFor(input.text); // help lines in the person's language (EN, RU or KZ)
    if (behavior !== "CARE") reply = help.full; // the model missed it: its reply may be about the goal, replace it whole
    else if (!["988", "111", "112"].some((n) => reply.includes(n))) reply = `${reply} ${help.line}`.trim(); // caring reply without numbers: add them
    behavior = "CARE";
  }
  // A reply that already gives crisis lines is a crisis reply, whatever label the
  // model chose (seen once in 42 runs of the indirect-crisis tests: the right words
  // with the label ANSWER). CARE stops the ladder in the page.
  if (behavior === "ANSWER" && /\b(988|112)\b|findahelpline/i.test(reply)) { behavior = "CARE"; flags.care_relabelled = true; }
  // ---- Step 9b: never leak the instructions --------------------------------------
  flags.prompt_leak_blocked = leaksPrompt(reply);
  if (flags.prompt_leak_blocked) { behavior = "DECLINE"; reply = LEAK_REPLACEMENT; }

  // ---- Step 10: never echo personal data back --------------------------------
  reply = redactPII(reply).text;

  // ---- Step 10b: update the ladder ----------------------------------------------
  // Only from a normal guiding answer: never from DECLINE / CARE / a blocked reply.
  if (behavior === "ANSWER" && !flags.distress && ladderRaw) {
    session.ladder = mergeLadder(session.ladder, sanitizeLadder(ladderRaw));
  }

  // ---- Step 11: save both messages to the session ----------------------------
  // The chat title is the first message (shown in the sidebar and downloads).
  session.messages.push({ role: "user", content: redacted.text, ts: new Date().toISOString() });
  session.messages.push({
    role: "assistant", content: reply, behavior, ts: new Date().toISOString(),
    // Remember which sources were used, so follow-ups can reuse RAG (step 7a)
    // and reopened chats can show the source tags.
    ...(extra && { context_type: extra.type, context_source: extra.source, context_ids: extra.items.map((x) => x.id) }),
  });
  if (!session.title) session.title = redacted.text.slice(0, 60);

  // ---- Step 11b: anonymous impact counters (numbers only, see impact.mjs) ------
  // Test runs send x-test-run: 1 and are not counted.
  if (req.headers.get("x-test-run") !== "1") await countTurn(session, before, { behavior, checkIn: body.check_in === true });
  await saveSession(session);

  // ---- Step 12: respond, and log without message text ------------------------
  const response = {
    session_id: session.id,   // the browser keeps this and sends it with the next message
    turn: userTurns + 1,
    behavior,                 // ANSWER | DECLINE | CARE (used by the test runner)
    reply,                    // what the user sees
    flags,
    context: extra,           // which method notes / WHO-5 data were given to the model (null if none)
    ladder: session.ladder ?? null, // the person's ladder so far, drawn on the page (ladder.mjs)
    who5: session.who5 ?? [],       // WHO-5 scores in this chat, oldest first: before / after
    provider: provider(),     // anthropic | openai | mock
    model: modelName(),
    prompt_version: PROMPT_VERSION,
    storage: await storageKind(), // netlify-blobs | memory
    latency_ms: Date.now() - started,
    usage,                    // tokens, for cost estimates
  };

  // QUIET_LOGS is set by the test script to keep its output readable.
  if (!env("QUIET_LOGS")) {
    console.log(JSON.stringify({ event: "chat", turn: response.turn, behavior, flags, context_type: extra?.type ?? null, latency_ms: response.latency_ms }));
  }
  return Response.json(response);
};

// Tells Netlify which URL this function answers on.
export const config = { path: "/api/chat" };
