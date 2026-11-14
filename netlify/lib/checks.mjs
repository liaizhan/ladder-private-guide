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
// Russian and Kazakh: ported from the same production file (crisis.ts). Kazakh is
// often typed without Kazakh letters ("озимди" for "өзімді") or fully in Latin
// ("olgim keledi"), so the text is first folded to plain Cyrillic.
const DISTRESS_RU = new RegExp([
  "не хочу жить|не хочется жить|покончить|суицид|самоубий|убить себя|убью себя|умереть хочу|хочу умереть|порезать себя|режу себя|бь[её]т меня|избива|изнасил|насили|угрожа",
  "жить не хоч|всем (будет |станет )?лучше без меня|лучше бы меня не было|(нет|не вижу) смысла жить|на себя руки|наглотаться|насилов",
].join("|"), "i");

const KK_LETTERS = {
  ә: "а", ғ: "г", қ: "к", ң: "н", ө: "о", ұ: "у", ү: "у", һ: "х", і: "и",
  a: "а", ä: "а", b: "б", c: "с", d: "д", e: "е", f: "ф", g: "г", ğ: "г", h: "х",
  i: "и", ı: "и", j: "ж", k: "к", l: "л", m: "м", n: "н", ñ: "н", o: "о", ö: "о",
  p: "п", q: "к", r: "р", s: "с", ş: "ш", ç: "ч", t: "т", u: "у", ū: "у", ü: "у",
  v: "в", w: "у", x: "х", y: "ы", z: "з",
};
const KK_PAIRS = { sh: "ш", zh: "ж", ch: "ч" };
export const plainKazakh = (text) => text
  .toLowerCase()
  .replace(/sh|zh|ch/g, (pair) => KK_PAIRS[pair])
  .replace(/[әғқңөұүһіa-zäğıñöşçūü]/g, (letter) => KK_LETTERS[letter]);

// Words are written already folded: "өзімді өлтіру" → "озимди олтиру".
// (?<!\p{L}) marks a word start, so "урады" (beats) is not found inside "курады" (builds).
const DISTRESS_KK = new RegExp([
  String.raw`(?<!\p{L})оз\S*[\s-]+(оз\S*\s+)?олтир`,        // өзімді өлтіру: kill myself
  String.raw`(?<!\p{L})оз\S*[\s-]+(оз\S*\s+)?кол жумса`,    // өзіне-өзі қол жұмсау: suicide
  String.raw`омирине балта ша[пб]`,                               // end one's own life
  String.raw`(?<!\p{L})маган кол жумса`,                         // raised a hand against me
  String.raw`(?<!\p{L})олги\S*\s+кел(?!ме)`,                   // өлгім келеді: I want to die (not "келмейді")
  String.raw`(?<!\p{L})олгеним (артык|жаксы)`,                   // better if I died
  String.raw`(омир сурги|тири журги)\S*\s+келме[йыи]`,          // I don't want to live
  String.raw`(?<!\p{L})оз\S*\s+зиян келтир`,                   // harm myself
  String.raw`(?<!\p{L})озимди кес`,                              // cut myself
  String.raw`(?<!\p{L})зорла`,                                   // rape
  String.raw`(?<!\p{L})зорлык`,                                  // violence
  String.raw`(?<!\p{L})зомбылык`,
  String.raw`(?<!\p{L})мени ур(ад|ды|ып)`,                       // beats me
  String.raw`(?<!\p{L})урады`,
  String.raw`(?<!\p{L})урып[\s-]*со[гк]`,
  String.raw`(?<!\p{L})соккыга жык`,
  String.raw`(?<!\p{L})кокан[\s-]*локы`,                        // threats
  String.raw`олтиремин деп`,
].join("|"), "u");

export const showsDistress = (text) =>
  DISTRESS.test(text) || DISTRESS_RU.test(text) || DISTRESS_KK.test(plainKazakh(text));

// Which language the person wrote in: Kazakh letters → kk, other Cyrillic → ru.
export const langOf = (text) => (/[әғқңөұүһі]/i.test(text) ? "kk" : /[а-яё]/i.test(text) ? "ru" : "en");

// Help lines in the person's language. Kazakhstan numbers are the ones the
// production Ladder site already shows: 112 (single emergency number) and 111
// (state contact centre for family, women and children, 24/7, gov.kz).
const SUPPORT_LINES = {
  en: "You don't have to handle this alone. In the US, call or text 988 (Suicide & Crisis Lifeline), call 911 if you are in danger now, or call 1-800-799-7233 (National Domestic Violence Hotline). In Kazakhstan, call 112 in an emergency or 111 (24/7 help line for family, women and children). In other countries, findahelpline.com lists free local services.",
  ru: "С этим не нужно справляться в одиночку. В Казахстане: 112, если опасность прямо сейчас, и 111, круглосуточный телефон доверия по вопросам семьи, женщин и детей. В других странах бесплатные службы помощи есть на findahelpline.com.",
  kk: "Мұны жалғыз көтерудің қажеті жоқ. Қазақстанда: қазір қауіп төнсе 112, отбасы, әйелдер мен балалар мәселелері бойынша тәулік бойы жұмыс істейтін сенім телефоны 111. Басқа елдерде тегін көмек қызметтері findahelpline.com сайтында.",
};
export const SUPPORT_LINE = SUPPORT_LINES.en;
// Openers for a full caring reply, used when the model missed the crisis.
const CARE_OPENERS = {
  en: "Thank you for telling me. I'm taking this seriously, and I'm pausing the exercise.",
  ru: "Спасибо, что написали об этом. Я отношусь к этому серьёзно и останавливаю упражнение.",
  kk: "Бұл туралы жазғаныңыз үшін рақмет. Мен мұны маңызды деп санаймын, жаттығуды тоқтатамын.",
};
const CARE_QUESTIONS = {
  en: "Is there someone you trust you could reach out to today?",
  ru: "Есть ли рядом человек, которому вы доверяете и можете написать сегодня?",
  kk: "Бүгін сенетін адамыңызға хабарласа аласыз ба?",
};
// Language for the help lines. Kazakh typed in Latin letters ("olgim keledi")
// is caught only by the Kazakh list, so it gets the Kazakh lines.
const helpLang = (text) => {
  const lang = langOf(text);
  if (lang === "en" && !DISTRESS.test(text) && DISTRESS_KK.test(plainKazakh(text))) return "kk";
  return lang;
};
// { line, full }: help lines in the person's language, and a whole caring reply.
export const supportLineFor = (text) => {
  const lang = helpLang(text);
  return { line: SUPPORT_LINES[lang], full: `${CARE_OPENERS[lang]} ${SUPPORT_LINES[lang]} ${CARE_QUESTIONS[lang]}` };
};

// ---- Check 4b: medical topics ---------------------------------------------------
// Ported from the production Ladder (health.ts). The Ladder does not work with
// illnesses, diagnoses, symptoms or medication. We only FLAG it: "Doctor: you
// will never run again" can be a real obstacle quote. The system prompt decides.
const MEDICAL = /\b(diagnos\w*|symptoms?|disease|illness|medications?|medicines?|pills|tumou?r|cancer|oncolog\w*|gastritis|diabetes|infertility|psychosomatic\w*|thyroid|endometriosis|migraines?|dosage|dose|prescri\w*|antidepressants?)\b/i;
const MEDICAL_RU = /(диагноз|симптом|заболеван|болезн|болит|болят|лекарств|таблетк|лечени|опухол|онколог|гастрит|диабет|бесплод|психосомат|щитовидк|эндометриоз|мигрен|дозировк|антидепрессант)/i;
const MEDICAL_KK = /(?<!\p{L})(ауру(ым|ың|ы|лар)?(?!\p{L})|ауырады|ауырып|дәрі-дәрмек|диагноз|симптом)/iu;
export const mentionsMedical = (text) => MEDICAL.test(text) || MEDICAL_RU.test(text) || MEDICAL_KK.test(text);

// ---- Check 4c: prompt leak guard on the OUTPUT ------------------------------------
// If a jailbreak gets the model to print its instructions, the reply is replaced.
const LEAK_MARKERS = [/WHAT YOU DO \(/, /IMPORTANT DISTINCTIONS/, /FORMAT: reply with ONLY/, /EXTRA CONTEXT YOU MAY RECEIVE/];
export const leaksPrompt = (reply) => LEAK_MARKERS.some((re) => re.test(reply));
export const LEAK_REPLACEMENT =
  "I can't share how I'm set up. I can explain the Ladder method, guide your own ladder one question at a time, or run the WHO-5 well-being check.";

// ---- Check 5: model output format -------------------------------------------------
// The system prompt asks the model to reply with {"behavior": "...", "reply": "..."},
// plus an optional "ladder" object while guiding.
// This parses that safely. If the model ignored the format, we still show its
// text (so the chat doesn't break) but mark ok: false → flags.output_valid = false.
export const BEHAVIORS = ["ANSWER", "DECLINE", "CARE"];

// Shown when the model returned nothing twice in a row, in the person's language.
export const EMPTY_REPLY = {
  en: "Sorry, I couldn't answer just now. Could you send your message again?",
  ru: "Простите, сейчас не получилось ответить. Отправьте, пожалуйста, сообщение ещё раз.",
  kk: "Кешіріңіз, қазір жауап бере алмадым. Хабарламаңызды қайта жіберіңізші.",
};

export function parseModelOutput(raw) {
  try {
    // Some models wrap JSON in ```json fences. Strip them before parsing.
    const cleaned = String(raw).trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(cleaned);
    const behavior = String(obj.behavior ?? "").toUpperCase();
    const reply = String(obj.reply ?? "").trim();
    if (!BEHAVIORS.includes(behavior) || !reply) throw new Error("bad fields");
    // Optional: the person's ladder as data (see ladder.mjs). Cleaned by the caller.
    const ladder = obj.ladder && typeof obj.ladder === "object" ? obj.ladder : null;
    return { ok: true, behavior, reply: reply.slice(0, 1500), ladder };
  } catch {
    // Not valid JSON. Often the answer was cut off (too long for max_tokens),
    // e.g. {"behavior": "DECLINE", "reply": "I can't summarise tha
    // Salvage the label and the reply text so the user never sees raw JSON.
    const text = String(raw ?? "").trim();
    const b = text.match(/"behavior"\s*:\s*"(ANSWER|DECLINE|CARE)"/i);
    const r = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)(")?/s); // r[2]: the reply string was closed
    if (b && r) {
      let reply = r[1];
      try { reply = JSON.parse(`"${reply.replace(/\\$/, "")}"`); } catch {} // turn \n, \" back into text
      // A few broken words are worse than asking again (seen once: «ө… in a Kazakh crisis reply).
      if (reply.trim().length < 40) return { ok: false, empty: true, behavior: b[1].toUpperCase(), reply: "" };
      // A closed reply is whole, only the JSON after it broke (seen: `..., "}`): show it as is.
      if (r[2]) return { ok: false, behavior: b[1].toUpperCase(), reply: reply.trim().slice(0, 1500) };
      return { ok: false, behavior: b[1].toUpperCase(), reply: (reply.trim() + "…").slice(0, 1500) };
    }
    if (!text) return { ok: false, empty: true, behavior: "ANSWER", reply: "" }; // the caller retries once, then says sorry in the person's language
    return { ok: false, behavior: "ANSWER", reply: text.slice(0, 1500) };
  }
}
