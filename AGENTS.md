<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Homepage pricing copy is shared in the landing copy module and reads existing price constants, so presentation cannot drift from generation or clip purchase prices.
- Homepage layout and contrast overrides are scoped to its wrapper; other routes retain their existing presentation.
- Rolling universe lives in `src/lib/universe.ts` (pure merge/versioning) and `universe.functions.ts`; every change is a new `universe_versions` row, locked traits are never overwritten, contradictions become pending rows the creator resolves — so history is always recoverable and nothing changes silently.
- Creator status is read server-side from the existing active monthly plan on the profile; no payment code is changed for gating — keeps checkout untouched.
- Character-library uploads are free and owner-scoped; film creation snapshots their locked traits and reference into existing film canon atomically, so later library edits never change old films.
- The explicit template start flow reuses stories, story_scenes, SceneTruth and the existing render path; no provider is called while writing, approving or saving a draft.
- New film tools use useLocale for bilingual copy; the rest of the existing homepage remains unchanged.
- EZY sends readable canon references as validated inline media from signed project-storage URLs; optional image failures are logged and persisted as dismissible scene warnings, never render blockers. Existing fal/live endpoints remain text-only.
- Inflight film scenes are unique in the database; persisted failed jobs refund through service-role-only refund_generation, while insert failures use refund_coins and surface errors — this prevents double starts and makes refund retries idempotent.
- Coin Apple Pay prepares a SumUp checkout before the gesture, validates owner/pack/amount/currency server-side, and confirms through the existing purchase fulfillment — Safari requires synchronous wallet opening and credits must follow provider confirmation.
