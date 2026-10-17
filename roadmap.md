# Roadmap

- [x] Controlled owner trial readback: balance stayed 140; both prepared films have no generation rows and no clips.
- [ ] Point 2 only: enable supported image-reference adapter and verify outgoing media with mocked transport; no paid generation or point 3 in this phase.

- [x] Character library + film start screen: own uploads, locked traits, approval, editable template scenes and full-film cost before rendering
- [ ] Paid film / published tick verification — blocked until owner approves displayed price; scenes are collected, never auto-published
- [x] Publish requested changes after security check; publishing scheduled, owner shares public link
- [ ] Repository-wide ESLint cleanup — blocked by scope: 1471 existing/mixed errors across unrelated files; changed film-library files are clean

- [x] Publish homepage (Creator copy + gallery loglines)
- [x] Universe memory: versioned, locked traits, conflicts asked, picker before Director, film card, /universe page
- [x] Creator gate (locked view with Go Creator button)
- [ ] Verify Creator path live — blocked: no account has Creator; needs owner's OK to mark own account Creator for a test, or a test-mode purchase
- [ ] Homepage Creator perks + FAQ — after the Creator path is verified live
- [ ] Custom domain — blocked: owner connects in Project Settings → Domains
- [ ] Full scene run end to end — blocked: fal.ai balance must be topped up by owner
- [x] Film pipeline step 1 + 1b (ownership, status, daily limit, renderScene core split)
- [x] Film pipeline step 2 (14/scene atomic charge, startFilmRender, cron tick, stop auto-publish)
- [x] Unpublish the 17 scene clips — completed in earlier phase
- [ ] Character portrait price — waiting for owner
- [ ] Start-screen extensions: kids rules+AI safety check, style-image conditioning, AI scene writing — unavailable in template start flow; no paid calls without owner approval
