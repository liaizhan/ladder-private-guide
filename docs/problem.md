# Problem statement: Ladder Guide

**GTransformer AI Buildathon 2026, AI for Global Good. Theme: Wellbeing.**
Author: Aizhan Li, author of the Ladder method.

## 1. The problem in one sentence

Many adults know what they want to change but keep postponing it, because of inner
obstacles they cannot see clearly (often a sentence someone said years ago that they
still believe), and the first step to talk about it with another person costs money,
time and courage.

## 2. Who has this problem

- Adults who feel stuck on one goal (work, health habits, money, family, study) and do
  not get professional support.
- Evidence that the support gap is large (CDC, United States):
  - In 2022, 21.4% of women and 14.8% of men had symptoms of anxiety
    ([CDC NCHS, NHSR 213](https://www.cdc.gov/nchs/data/nhsr/nhsr213.pdf)).
  - In 2021 to 2023, 16.0% of women had depression, and only 43% of them received
    therapy in the past 12 months
    ([CDC NCHS Data Brief 527](https://www.cdc.gov/nchs/products/databriefs/db527.htm)).
- Ladder Guide is not a treatment for anxiety or depression. These numbers show how many
  people carry a heavy load without help; the guide offers a safe, private first step of
  self-reflection and points to professionals when needed.
- We also build for Kazakhstan: Russian and Kazakh replies, Kazakhstan help lines
  (112 and 111), Kazakh crisis words even when typed in Latin letters.

## 3. Why existing options fall short

| Option | Gap |
|---|---|
| A psychologist or therapist | Costs money and time; many people are not ready to say private things out loud to a person. |
| General chatbots | Answer anything, give advice and sometimes diagnoses; no structure, no step, no measured change, no crisis routing in Russian or Kazakh. |
| Self-help books and apps | Generic; they do not use the person's own words or help choose one small step for today. |

## 4. Our approach

The Ladder method (Aizhan Li, 2019) turns a vague "I am stuck" into a picture:
"I" at the bottom, one measurable goal on top, the obstacles in between from the
nearest one up, and fears above the goal. Work starts at the nearest obstacle.

Ladder Guide is an AI self-reflection guide built on the method:

1. It asks one question at a time and builds the ladder from the person's own words,
   drawn live next to the chat.
2. It asks two reflection questions ("Whose voice do you hear in it?", "What would you do
   in the next 24 hours if you stopped believing it?") and helps choose one small step.
3. It brings the person back after 24 hours ("I'm back", a calendar reminder) to check
   the step, mark it done or make it smaller.
4. It measures change with WHO-5, a public, validated well-being index, before and now.
5. It stays in its role: no diagnosis, no therapy claims, crisis help lines first.

## 5. What success looks like

| Metric | How we measure it | Where |
|---|---|---|
| People name one goal | `goal_named` / `chats_started` | Anonymous impact counter (`GET /api/stats`) |
| People choose a 24-hour step | `step_chosen` / `goal_named` | Same |
| People come back | `came_back` / `step_chosen` | Same |
| Steps done | `steps_done` | Same |
| Well-being changes | Average WHO-5 change for people with two scores (10 points or more is meaningful) | Same |
| The guide stays safe and on task | Pass rate, LLM judge scores, bias pairs, stability across runs | [eval_report.md](eval_report.md), [safety_report.md](safety_report.md) |

Only numbers are stored for these metrics: no text, no ids, no IP.

## 6. Scope and limits

- A self-reflection tool, not therapy, not a psychologist, not medical advice. It does
  not promise a health result.
- Adults only. In a crisis it stops the method and shows help lines.
- Prototype built during the event: no accounts, chats kept for the session in Netlify
  Blobs and deletable with one button.
- English, Russian and Kazakh. Tested on Claude Haiku 5.5.

## 7. What existed before

The Ladder method (2019) and its production guide at 108psy.com (a free self-check since
September 2026). The crisis and medical word lists were ported from it. Everything
else in this repository was built during the event; see the README.
