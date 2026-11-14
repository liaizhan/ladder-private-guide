// =============================================================================
// netlify/lib/checks.mjs: the starter safety checks
// =============================================================================
// FLOW 5 in docs/HOW_IT_WORKS.md.
//
// This is deliberately NOT a complete set. Teams are judged on how safe AND
// how helpful their bot is, so improving these checks is part of the challenge.
// Each check is a small, separate function so it is easy to read, test and extend.
//
// Where each check is used (step numbers from chat/index.mjs):
//   validateMessage    → step 2   reject empty / too-long messages
//   MAX_TURNS_...      → step 5   cap chat length
//   redactPII          → steps 6 and 10   mask personal data in and out
//   looksLikeInjection → step 6   flag jailbreak attempts (does not block)
//   showsDistress      → steps 6 and 9    force a caring reply with help lines
//   mentionsMedical    → step 6   flag medical topics (the prompt declines them)
//   leaksPrompt        → step 9b  replace a reply that leaks the instructions
//   parseModelOutput   → step 8   check the model answered in the right format
// =============================================================================

// ---- Limits -------------------------------------------------------------------
export const MAX_MESSAGE_CHARS = 2000;   // longest message we accept (cost + abuse control)
export const MAX_TURNS_PER_SESSION = 50; // most user messages in one chat
export const HISTORY_TURNS_SENT = 10;    // how many past exchanges the model sees (the "memory window")

// ---- Check 1: input validation ---------------------------------------------------
// Returns { ok: true, text } with surrounding spaces trimmed, or { ok: false, error }.
export function validateMessage(text) {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "message is required" };
  if (text.length > MAX_MESSAGE_CHARS) return { ok: false, error: `message is too long (max ${MAX_MESSAGE_CHARS} characters)` };
  return { ok: true, text: text.trim() };
}

// ---- Check 2: personal data (PII) masking -----------------------------------------
// Replaces emails, card numbers, SSNs, national ids and phone numbers with
// placeholders like [EMAIL] before the text reaches the model, the saved chat or
// the logs. A ladder is personal: people quote family members, so this runs on
// every message. Names are not masked (the method quotes "Mom: ..."), and the
// guide never asks for a name. Order matters: cards and ids before phones.
const PII = [
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ["card", /\b(?:\d[ -]?){13,16}\b/g],                                // 13–16 digits, spaces/dashes allowed
  ["ssn", /\b\d{3}-\d{2}-\d{4}\b/g],                                   // 123-45-6789
  ["id", /\b\d{12}\b/g],                                               // 12-digit national id (e.g. Kazakhstan IIN)
  ["phone", /\+\d{1,3}[ .-]?\(?\d{2,4}\)?(?:[ .-]?\d{2,4}){2,3}\b/g],  // international, +7 701 123 45 67
  ["phone", /(?:\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g],  // US-style numbers
];

// Help-line numbers the bot itself gives must survive masking in replies.
const HELPLINES = ["1-800-799-7233", "1-800-422-4453"];

// Returns { text: "masked text", found: ["email", "phone", ...] }.
export function redactPII(text) {
  const found = new Set();
  let out = text;
  HELPLINES.forEach((n, i) => { out = out.split(n).join(`\u0000HL${i}\u0000`); });
  for (const [type, re] of PII) {
    out = out.replace(re, () => {
      found.add(type);
      return `[${type.toUpperCase()}]`;
    });
  }
  HELPLINES.forEach((n, i) => { out = out.split(`\u0000HL${i}\u0000`).join(n); });
  return { text: out, found: [...found] };
}

// ---- Check 3: prompt-injection signal -------------------------------------------
// Spots common jailbreak phrasing. We only FLAG it (flags.injection_suspected),
// we don't block, because blocking on keywords also blocks legitimate text such
// as an obstacle the user quotes: "Dad: ignore your dreams". The real defence is the
// system prompt in llm.mjs; this flag helps you spot attacks in tests and logs.
const INJECTION = [
  /ignore (all |any )?(the )?(previous|prior|above|earlier|your) (instructions|prompts?|rules)/i,
  /disregard (all |any )?(the )?(previous|prior|above|your) (instructions|rules|prompt)/i,
  /(reveal|show|print|repeat) (me )?(your|the) (system )?(prompt|instructions|rules)/i,
  /(developer|dan|admin|god|jailbreak) mode/i,
  /pretend (you are|you're|to be) (a |an )?(general|different|unrestricted)/i,
  /^\s*(system|admin|developer)\s*:/im, // fake "SYSTEM:" messages
  /\byou are now\b/i,
  /\b(act|behave|respond) as (a |an |my )?(?!if\b)\w+/i,
  /\brole-?play\b/i,
  /\bnew (instructions|rules|persona)\b/i,
  /\b(system prompt|your instructions|hidden rules|initial prompt)\b/i,
  /\bno (rules|restrictions|limits|filters)\b/i,
  /\brepeat (the |all |everything )?(text )?(above|written above)\b/i,
  /\b(debug|admin) mode\b/i,
];
export const looksLikeInjection = (text) => INJECTION.some((re) => re.test(text));

// ---- Check 4: crisis (distress, self-harm, violence) ------------------------------
// Ported from the production Ladder guide (crisis.ts, written before this event).
// If someone mentions suicide, self-harm, wanting to die, or being hurt or
// threatened by another person, the reply always becomes CARE with help lines
// (step 9), whatever the model said. Negations are cut on purpose:
// "I don't want to die alone" is a fear above the goal, not a crisis, and
// "he hit me up" means "he texted me".
const DISTRESS = new RegExp([
  String.raw`(?<!\bnot )\bsuicid`,
  String.raw`\bkill(ing)? myself\b`,
  String.raw`\b(end|ending|take|taking) my (own )?life\b`,
  String.raw`(?<!\b(don['’]?t|do not|never) )\b(want|wanna|wanted) (to )?die\b`,
  String.raw`\bwish i (was|were) dead\b`,
  String.raw`\bwish i(['’]d| had) died\b`,
  String.raw`\bbetter off dead\b`,
  String.raw`\b(don['’]?t|do not) want to (live|be alive|be here)\b`,
  String.raw`\bno reason to live\b`,
  String.raw`\bbetter off without me\b`,
  String.raw`\b(no|any|see the|see any) point (in|of) (living|anything|life)\b`,
  String.raw`\bend it all\b`,
  String.raw`\bself[- ]?harm`,
  String.raw`\b(harm(ing)?|cutting|hurting|hurt) myself\b`,
  String.raw`\b(he|she|husband|wife|partner|boyfriend|girlfriend|father|dad|mother|mom|stepfather|stepmother) (beats|hits|beat|hit|kicks|kicked|chokes|choked) me\b(?! up\b)`,
  String.raw`\bbeat(s|ing)? me up\b`,
  String.raw`\brap(e|ed|es|ing|ist)\b`,
  String.raw`\bmolest`,
  String.raw`\bsexual(ly)? (assault|abuse)`,
  String.raw`(?<!\b(alcohol|drug|substance) )\babus(e|ed|er|es|ing|ive)\b`,
  String.raw`\b(domestic|sexual) violence\b`,
  String.raw`\bthreaten(s|ed|ing)? (me|to kill)\b`,
].join("|"), "i");
export const showsDistress = (text) => DISTRESS.test(text);
export const SUPPORT_LINE =
  "You don't have to handle this alone. In the US, call or text 988 (Suicide & Crisis Lifeline), call 911 if you are in danger now, or call 1-800-799-7233 (National Domestic Violence Hotline). In other countries, findahelpline.com lists free local services.";

// ---- Check 4b: medical topics ---------------------------------------------------
// Ported from the production Ladder (health.ts). The Ladder does not work with
// illnesses, diagnoses, symptoms or medication. We only FLAG it: "Doctor: you
// will never run again" can be a real obstacle quote. The system prompt decides.
const MEDICAL = /\b(diagnos\w*|symptoms?|disease|illness|medications?|medicines?|pills|tumou?r|cancer|oncolog\w*|gastritis|diabetes|infertility|psychosomatic\w*|thyroid|endometriosis|migraines?|dosage|dose|prescri\w*|antidepressants?)\b/i;
export const mentionsMedical = (text) => MEDICAL.test(text);

// ---- Check 4c: prompt leak guard on the OUTPUT ------------------------------------
// If a jailbreak gets the model to print its instructions, the reply is replaced.
const LEAK_MARKERS = [/WHAT YOU DO \(/, /IMPORTANT DISTINCTIONS/, /FORMAT: reply with ONLY/, /EXTRA CONTEXT YOU MAY RECEIVE/];
export const leaksPrompt = (reply) => LEAK_MARKERS.some((re) => re.test(reply));
export const LEAK_REPLACEMENT =
  "I can't share how I'm set up. I can explain the Ladder method, guide your own ladder one question at a time, or run the WHO-5 well-being check.";

// ---- Check 5: model output format -------------------------------------------------
// The system prompt asks the model to reply with {"behavior": "...", "reply": "..."}.
// This parses that safely. If the model ignored the format, we still show its
// text (so the chat doesn't break) but mark ok: false → flags.output_valid = false.
export const BEHAVIORS = ["ANSWER", "DECLINE", "CARE"];

export function parseModelOutput(raw) {
  try {
    // Some models wrap JSON in ```json fences. Strip them before parsing.
    const cleaned = String(raw).trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(cleaned);
    const behavior = String(obj.behavior ?? "").toUpperCase();
    const reply = String(obj.reply ?? "").trim();
    if (!BEHAVIORS.includes(behavior) || !reply) throw new Error("bad fields");
    return { ok: true, behavior, reply: reply.slice(0, 1500) };
  } catch {
    // Not valid JSON. Often the answer was cut off (too long for max_tokens),
    // e.g. {"behavior": "DECLINE", "reply": "I can't summarise tha
    // Salvage the label and the reply text so the user never sees raw JSON.
    const text = String(raw ?? "").trim();
    const b = text.match(/"behavior"\s*:\s*"(ANSWER|DECLINE|CARE)"/i);
    const r = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/s);
    if (b && r) {
      let reply = r[1];
      try { reply = JSON.parse(`"${reply.replace(/\\$/, "")}"`); } catch {} // turn \n, \" back into text
      return { ok: false, behavior: b[1].toUpperCase(), reply: (reply.trim() + "…").slice(0, 1500) };
    }
    return { ok: false, behavior: "ANSWER", reply: text.slice(0, 1500) || "Sorry, something went wrong. Please try again." };
  }
}
