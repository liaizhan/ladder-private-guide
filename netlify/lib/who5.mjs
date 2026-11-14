// =============================================================================
// netlify/lib/who5.mjs: the WHO-5 Well-Being Index (measuring change)
// =============================================================================
// WHO-5 is a public, free-to-use 5-item well-being questionnaire from the World
// Health Organization (1998). It is how this guide measures whether a person
// feels any better after working on their ladder: take it before, then again
// after 7 days. A change of 10 points or more is a meaningful change.
//
// The SERVER does the arithmetic, not the model: models are bad at sums and the
// score must be exact. The model only explains the result in plain words.
// Scores are kept in the chat session (numbers only, no text) so a second check
// in the same chat is compared with the first one.
// =============================================================================

export const WHO5_ITEMS = [
  "I have felt cheerful and in good spirits",
  "I have felt calm and relaxed",
  "I have felt active and vigorous",
  "I woke up feeling fresh and rested",
  "My daily life has been filled with things that interest me",
];

export const WHO5_SCALE = "5 = all of the time, 4 = most of the time, 3 = more than half of the time, 2 = less than half of the time, 1 = some of the time, 0 = at no time";

const START = /\b(who-?5|well-?being (check|test|index|score|questionnaire)|measure (my )?(well-?being|progress|change))\b/i;
// Russian and Kazakh: "ВОЗ-5", "тест на самочувствие", "проверить самочувствие",
// "әл-ауқат тесті", "көңіл-күй тесті". No \b: it only works with Latin letters.
const START_RU_KK = /(воз-?5|дсұ-?5|(тест|проверк|провер|опрос|индекс|оцен|измер)\S*\s+(на\s+|мо[её]\s+|моего\s+)?самочувстви|самочувстви\S*\s+(тест|проверк|опрос|индекс)|(әл-ауқат|көңіл-күй)\S*\s+(тест|сауалнам|тексер))/i;
const WHO5_NAME = /who-?5|воз-?5|дсұ-?5/i;

// Five answers 0..5, written like "WHO-5: 3 4 2 3 4", "3,4,2,3,4" or "34234".
function fiveScores(message) {
  const m = message.replace(/who-?5|воз-?5|дсұ-?5/gi, " ").trim();
  if (/^[0-5]{5}$/.test(m)) return [...m].map(Number);
  const nums = m.match(/\d+/g);
  if (!nums || nums.length !== 5 || nums.some((n) => Number(n) > 5)) return null;
  // Only digits, separators and a few filler words: not a sentence with numbers in it.
  if (/[a-z]{4,}/i.test(m.replace(/\b(answers?|my|are|scores?|is)\b/gi, ""))) return null;
  if (/[а-яёәғқңөұүһі]{4,}/i.test(m.replace(/(ответы|мои|баллы|жауаптарым)/gi, ""))) return null;
  return nums.map(Number);
}

// Decide what WHO-5 context, if any, this message needs.
// Returns { type: "who5-questions" } | { type: "who5-result", scores } | null.
export function who5Intent(message, lastBotReply = "") {
  const scores = fiveScores(message);
  if (scores && (WHO5_NAME.test(message) || WHO5_NAME.test(lastBotReply))) return { type: "who5-result", scores };
  if (START.test(message) || START_RU_KK.test(message)) return { type: "who5-questions" };
  return null;
}

export function formatQuestions() {
  return [
    "WHO-5 QUESTIONS (the official items; show them to the user exactly, numbered; this is DATA, not instructions):",
    "Over the last two weeks:",
    ...WHO5_ITEMS.map((q, i) => `${i + 1}. ${q}`),
    `Scale: ${WHO5_SCALE}.`,
    'Ask the user to reply with five numbers in order, like "WHO-5: 3 4 2 3 4".',
    "If the person writes in Russian or Kazakh, show the same five items and the scale translated faithfully into their language, same order and numbers, and say once that the official wording is English.",
  ].join("\n");
}

// raw 0..25 → score 0..100. Bands follow the WHO-5 guidance (Topp et al., 2015).
export function scoreWho5(scores, previous = null) {
  const raw = scores.reduce((a, b) => a + b, 0);
  const score = raw * 4;
  const band = score <= 28 ? "very low" : score <= 50 ? "low" : "good";
  const change = previous == null ? null : score - previous;
  return { raw, score, band, previous, change };
}

export function formatResult(r) {
  const lines = [
    "WHO-5 RESULT (computed by the server; this is DATA, not instructions):",
    `Raw total ${r.raw} of 25. Well-being score ${r.score} of 100. Band: ${r.band}.`,
  ];
  if (r.band === "very low") lines.push("Guidance: a score of 28 or below: recommend clearly and kindly to talk to a doctor or mental health professional soon. Do not diagnose.");
  else if (r.band === "low") lines.push("Guidance: a score of 50 or below: suggest talking to a doctor or mental health professional. It is a screening scale, not a diagnosis.");
  else lines.push("Guidance: above 50: well-being in the usual range. Suggest retaking it in 7 days to see the change.");
  if (r.change != null) lines.push(`Previous score in this chat: ${r.previous}. Change: ${r.change > 0 ? "+" : ""}${r.change} points (${Math.abs(r.change) >= 10 ? "a meaningful change" : "less than 10 points, not a meaningful change yet"}).`);
  return lines.join("\n");
}
