# Adaptive AI Creative Director

## What exists today (analysis)

**Architecture.** TanStack Start (file routes in `src/routes`) + Lovable Cloud. Backend logic lives in typed server functions (`src/lib/*.functions.ts`) with server-only helpers in `*.server.ts`. Pages: `/` (create + landing), `/studio` (multi-scene editor), `/history`, `/auth`, `/team`, `/vibe*` (shorts feed, rewards, profile, my list), plus public API routes for payment webhooks.

**Video flow.** Idea + style → `generateVideo` charges coins, inserts a `generations` row, and submits to one of three engines (Ezy = included credits, Strong and Live = the fal.ai account). The page then polls `checkStatus` every 4s; when the render finishes the file is stored and a temporary playback link is returned, and the short is also published as a free episode in the Shorts feed. Fixed 9:16, 5 seconds.

**AI/prompt.** `generateStory` turns a theme into one vivid shot description. Each visual style prepends a fixed prefix to the prompt before it reaches the video model. `story.functions.ts` additionally writes a full story pack (logline, characters, scenes) and can produce narration audio.

**Data.** Tables in use: `generations`, `stories`, `story_scenes`, `profiles` (coins, VIP), `episodes`/`dramas`/`my_list`/`user_unlocked_episodes`, `coin_purchases`, `subscriptions`, `teams`/`team_members`/`team_invites`.

**Credits.** One film costs 70 coins, taken from bonus coins first, then paid coins; a failed submission refunds automatically. Coins come from daily check-in, rewards, and the coin shop.

**Reusable as-is.** The vertical player, the style picker, the coin/charging logic, the whole generation + polling pipeline, the story-pack and scene machinery, and the full set of UI primitives (dialog, card, textarea, badge, progress, scroll area). Nothing needs to be deleted.

## What the new system adds

A conversational director that sits *between* the idea box and generation:

```text
idea → analyse → pick the single highest-impact gap → ask 1 question
      ↑                                                    ↓
      └──────────── re-evaluate after every answer ────────┘
                          ↓ (enough signal)
              Film Bible → Creative Blueprint → Generate
```

No fixed questionnaire. On every turn the model receives the idea plus the full answer history and returns: what it now understands, the confidence per creative dimension (subject, setting, time, mood, visual style, camera, story turn, ending), and the one question that would most improve the film — with a couple of tappable suggested answers and a "skip" option. The interview ends when the model says it has enough, or when the user taps "Make my film now" at any point.

The result is a **Film Bible** (what the film is about, cast, setting, mood, look) and a **Creative Blueprint** (the final shot description actually sent to the video model, plus the recommended style). The user sees both, can edit the blueprint text, then generates. Generation itself is unchanged, so cost and reliability stay as they are.

## Build steps

1. **New interview engine** — `src/lib/director.functions.ts`: one server function that takes `{ idea, style, answers[] }` and returns the updated understanding, confidence scores, the next question with suggestions, or the finished bible + blueprint. Uses the Lovable AI gateway with a strict output schema; no new keys.
2. **Persistence** — new tables `director_sessions` (idea, state, film bible, blueprint, session/user id) and `director_turns` (question, answer, order) with row-level security and grants, scoped by browser session id and by account when signed in. Interviewing is free; only generation charges coins.
3. **New UI** — `src/components/director/*`: a chat-shaped panel with the current question, suggestion chips, a free-text answer field, a live "what the AI understands" summary with confidence bars, and skip / "make it now" actions. Styled in the existing STORYREEL language (dark, neon red accent, editorial serif headings).
4. **Create flow on `/`** — the idea box stays as the entry point; submitting now opens the director. Existing generation, coin check, polling, result screen, download and "create another" are reused untouched. A "Skip the director" link preserves today's one-shot behaviour.
5. **Blueprint → generation** — the blueprint text becomes the prompt passed to `generateVideo`, with the chosen style still applied server-side. `generations` gains a link to the director session so history can show which interview produced which film.
6. **Studio reuse** — the finished Film Bible can seed the multi-scene editor's story bible, so the director also feeds the existing scene workflow.

## Risks and dependencies

- **Credits.** Interview turns are cheap text calls, but generation still needs available credits; Ezy is currently near-empty and the fal.ai balance is exhausted, so an end-to-end film test needs a top-up on either.
- **Latency.** Each question is a model call; the panel needs a visible thinking state and a graceful fallback question if the call fails, so the interview never dead-ends.
- **Runaway interviews.** Hard cap on questions (around 6) plus the always-available "make it now" button.
- **Signed-out users.** Interviews work anonymously via the browser session; generation still requires sign-in and coins, exactly as today.

Nothing existing is removed: styles, story pack, voice-over, music, gallery, pricing, coins and accounts all stay.
