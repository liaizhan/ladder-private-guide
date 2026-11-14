// =============================================================================
// netlify/lib/knowledge/method.mjs: the RAG knowledge base (the Ladder method)
// =============================================================================
// Short notes about the Ladder method and about this guide. When a question is
// about the method, rag.mjs finds the best matching notes and the model answers
// from them, citing [M1], [M2]... It must not invent anything that is not here.
//
// Source: the Ladder method by Aizhan Li (created before this event, in 2019)
// and the public self-check on 108psy.com. Only facts that are true for this
// prototype are listed. Keep each note to one idea.
// =============================================================================

export default [
  { id: "M1", topic: "what", text: "The Ladder is a self-reflection method created in 2019 by Aizhan Li, author of the Ladder method. It helps a person see the inner obstacles between them and one goal, and choose where to start." },
  { id: "M2", topic: "goal", text: "The ladder starts with one measurable goal: something you can count, ideally with a date. For example: earn 2,000 dollars a month by June, or run 5 km by May. A vague goal like 'be happy' is turned into something measurable first." },
  { id: "M3", topic: "me", text: "The 'I' point is the bottom of the ladder: where the person is now in relation to the goal, in one honest sentence." },
  { id: "M4", topic: "obstacles", text: "Obstacles are the steps between the 'I' point and the goal, listed from the nearest one up. The self-check uses 3 to 5 obstacles. Each obstacle is a short phrase someone said that the person still believes, written with who said it, for example 'Mom: who needs it?' or 'Teacher: you are bad at maths'." },
  { id: "M5", topic: "nearest", text: "The Ladder works only with what stands between the person and the goal, starting from the nearest obstacle. Work does not start from the hardest or the oldest obstacle." },
  { id: "M6", topic: "fears", text: "Fears sit above the goal: what the person is afraid might happen if the goal comes true. They are optional, up to 5. Many fears above a goal can mean that moving toward the goal feels hard because it also means coming closer to those fears. No fears can mean only the obstacles hold the way." },
  { id: "M7", topic: "questions", text: "Two reflection questions follow a reading. First: whose voice do you hear in the nearest obstacle, and who said it first? Second: what would you do in the next 24 hours if you stopped believing it? The answer to the second question becomes one small step." },
  { id: "M8", topic: "step", text: "The result of a session is one small, concrete step for the next 24 hours that the person chooses in their own words. If a step feels too big, it is made smaller until it feels doable today." },
  { id: "M9", topic: "limits", text: "The Ladder does not work with illnesses, diagnoses, symptoms or medication. For those, see a doctor. It is a self-reflection tool, not therapy, not a diagnosis and not a crisis service, and it does not promise health results." },
  { id: "M10", topic: "who5", text: "This guide measures change with WHO-5, a 5-question well-being index from the World Health Organization. Each answer is 0 to 5 for the last two weeks; the total times 4 gives a score from 0 to 100. The guide suggests taking it before the first session and again after 7 days. A change of 10 points or more is a meaningful change. A score of 50 or below is a reason to talk to a doctor or mental health professional. It is a screening scale, not a diagnosis." },
  { id: "M11", topic: "privacy", text: "Privacy in this guide: no account and no name are needed. Emails, phone numbers, card and ID numbers are masked before the AI model sees the message, and only the masked text is saved. A chat is saved under a random id and the 'Delete chat' button erases it from the server." },
  { id: "M12", topic: "full", text: "This guide is a short version. The full free Ladder diagnostic on 108psy.com adds the steps of the past, a pause and a final question, in Russian, Kazakh and English, with no sign-in needed." },
  { id: "M13", topic: "crisis", text: "If someone writes about suicide, self-harm, wanting to die, or being hurt or threatened by another person, the guide stops the exercise and shows help lines: in the US call or text 988 (Suicide and Crisis Lifeline), 911 in an emergency, 1-800-799-7233 (National Domestic Violence Hotline); in other countries, findahelpline.com." },
];
