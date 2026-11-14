// =============================================================================
// netlify/functions/stats/index.mjs: GET /api/stats (anonymous impact numbers)
// =============================================================================
// Flow 14 in docs/HOW_IT_WORKS.md. Returns totals only, never text or ids:
// { since, chats_started, goal_named, step_chosen, came_back, steps_done,
//   care_replies, who5_pairs, who5_avg_change }
// The page shows them under "Impact so far". Counting lives in lib/impact.mjs.
// =============================================================================

import { publicStats } from "../../lib/impact.mjs";

export default async (req) => {
  if (req.method !== "GET") return Response.json({ error: "Use GET" }, { status: 405 });
  return Response.json(await publicStats(), { headers: { "cache-control": "public, max-age=60" } });
};

export const config = { path: "/api/stats" };
