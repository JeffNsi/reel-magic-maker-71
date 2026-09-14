import { buildFilmCore } from "../src/lib/film.functions";
import { buildGenerationRequest, checkFidelity } from "../src/lib/scene-truth";

const cases = [
  ["11111111-1111-4111-8111-111111111101","aaaaaaaa-0000-4000-8000-000000000001","Train station / younger self"],
  ["11111111-1111-4111-8111-111111111102","aaaaaaaa-0000-4000-8000-000000000002","Memory loss / breakfast"],
  ["11111111-1111-4111-8111-111111111103","aaaaaaaa-0000-4000-8000-000000000003","Five friends / betrayal"],
  ["11111111-1111-4111-8111-111111111104","aaaaaaaa-0000-4000-8000-000000000004","Detective / future corpse"],
  ["11111111-1111-4111-8111-111111111105","aaaaaaaa-0000-4000-8000-000000000005","2026 -> 1926 threshold"],
];

for (const [ds, sess, label] of cases) {
  try {
    const film = await buildFilmCore({ director_session_id: ds, session_id: sess } as any);
    console.log("\n=====", label, "|", film.title, "| scenes:", film.scenes.length);
    for (const scene of film.scenes) {
      const t = scene.truth;
      if (!t) { console.log(scene.scene_number, "NO TRUTH"); continue; }
      const req = buildGenerationRequest(t, {
        style_prefix: "Cinematic, ", original_idea: film.logline,
        scene_number: scene.scene_number, scene_title: scene.title,
        cast: film.characters.map(c=>`${c.name}: ${c.look}`).join(". "),
        film_setting: film.setting, film_continuity: t.continuity,
      });
      const f = checkFidelity(t, req);
      console.log(`--- scene ${scene.scene_number} core=${!!t.emotional_core} survive=${!!t.what_must_survive} exec=${!!t.chosen_execution} twist=${!!t.twist} reveal=${!!t.reveal} fore=${!!t.foreshadowing} cont=${!!t.continuity} sound=${!!t.sound} fidelity=${f.ok} missing=${f.missing} semantic=${f.semantic} prov=${JSON.stringify(t.provenance)}`);
      if (scene.scene_number === 1) console.log(req);
    }
  } catch (e) { console.log("\n=====", label, "FAILED:", (e as Error).message); }
}
