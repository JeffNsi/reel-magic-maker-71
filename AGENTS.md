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
- EZY sends canon reference images as validated inline media in the existing Gemini request; only signed project-storage URLs are fetched, while unchanged fal/live text endpoints remain text-only.
