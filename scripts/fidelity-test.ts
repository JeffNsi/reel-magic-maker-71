/**
 * Scene Truth fidelity data-flow test. No video rendering, no generation credits.
 * Run with: bun scripts/fidelity-test.ts
 */
import { buildFilmCore } from "@/lib/film.functions";
import { buildGenerationRequest, checkFidelity, REQUIRED_TRUTH_FIELDS } from "@/lib/scene-truth";
import { STYLES } from "@/lib/storyreel.functions";

const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

type Case = {
  key: string;
  id: string;
  session: string;
  idea: string;
  truth: Record<string, unknown>;
  bible: Record<string, unknown>;
};

const CASES: Case[] = [
  {
    key: "T1 train station",
    id: "11111111-1111-4111-8111-111111111201",
    session: "aaaaaaaa-0000-4000-8000-000000000201",
    idea: "A woman walks through a train station. She passes behind a pillar and encounters her younger self, seeing the life she has lived.",
    truth: {
      emotional_core: "A woman encounters her own younger self.",
      what_must_survive: "The emotional recognition between the two versions of her.",
      chosen_execution:
        "One steady tracking shot passes a single pillar and reveals the younger self standing there.",
      source: "user_decision",
    },
    bible: {
      logline: "A woman meets the girl she used to be in a station at dusk.",
      camera: "Steady tracking shot at eye level, no cuts.",
      look: "Cold blue station light with warm amber pooling on the platform",
      mood: "Aching, tender",
      setting: "A vast old railway station at dusk, drifting steam",
      decisions: ["The younger self must remain visible", "One pillar only, no whip pan"],
      twist: null,
    },
  },
  {
    key: "T2 memory loss",
    id: "11111111-1111-4111-8111-111111111202",
    session: "aaaaaaaa-0000-4000-8000-000000000202",
    idea: "A man sits at a breakfast table and realises he no longer remembers his wife.",
    truth: {
      emotional_core: "A man realises his wife has vanished from his memory.",
      what_must_survive: "The second cup of tea he cannot explain.",
      chosen_execution:
        "Static wide of the breakfast table while he stares at the untouched second cup.",
      source: "user_decision",
    },
    bible: {
      logline: "Breakfast for two, remembered by one.",
      camera: "Static wide, locked off",
      look: "Pale morning light, washed colour",
      mood: "Quiet dread",
      setting: "A small kitchen at breakfast, two cups on the table",
      decisions: ["No flashbacks", "The second cup stays in frame"],
      twist: {
        statement: "The wife he cannot remember has been gone for years.",
        emotional_purpose: "Turn forgetting into grief.",
        reveal: "A lit phone screen shows a memorial photo of her.",
        visual_clue: "A phone face-down beside the second cup",
        foreshadowing: ["The second cup is cold", "One chair is pushed in too neatly"],
        ending_implication: "He keeps setting the table for her.",
      },
    },
  },
  {
    key: "T3 five friends",
    id: "11111111-1111-4111-8111-111111111203",
    session: "aaaaaaaa-0000-4000-8000-000000000203",
    idea: "Five friends at a long dinner table. One of them has betrayed the others.",
    truth: {
      emotional_core: "Trust breaks at a table where everyone is still smiling.",
      what_must_survive: "The moment one friend looks away when the others laugh.",
      chosen_execution:
        "Slow push in along the long table, ending on the friend who does not join the laughter.",
      source: "ai_recommendation",
    },
    bible: {
      logline: "A dinner where one seat holds a traitor.",
      camera: "Slow dolly push along the table",
      look: "Candlelight, deep shadow",
      mood: "Warm turning cold",
      setting: "A long candlelit dinner table in a dark room",
      decisions: ["Five friends, no more"],
      twist: {
        statement: "The betrayer is the friend who organised the dinner.",
        emotional_purpose: "Make the warmth itself the weapon.",
        reveal: "He alone is not holding a glass when the toast is raised.",
        visual_clue: "An empty hand at the toast",
        foreshadowing: ["He seats everyone", "He pours but never drinks"],
        ending_implication: "The table keeps eating without knowing.",
      },
    },
  },
  {
    key: "T4 detective corpse",
    id: "11111111-1111-4111-8111-111111111204",
    session: "aaaaaaaa-0000-4000-8000-000000000204",
    idea: "A detective discovers that the corpse is his own future self.",
    truth: {
      emotional_core: "A man recognises himself in the body on the floor.",
      what_must_survive: "The identical silver watch on both wrists.",
      chosen_execution:
        "Static low angle holding both wrists in the same frame as he reaches for the sheet.",
      source: "user_decision",
    },
    bible: {
      logline: "The case he is working is his own death.",
      camera: "Static low angle, no move",
      look: "Sodium light, wet concrete",
      mood: "Cold recognition",
      setting: "A cold examination room at night",
      decisions: ["One reveal only", "No dialogue"],
      twist: {
        statement: "The corpse is the detective's future self.",
        emotional_purpose: "Turn investigation into self-recognition.",
        reveal: "The corpse wears the same silver watch as the detective.",
        visual_clue: "A scratched silver watch",
        foreshadowing: ["He checks his watch twice", "The sheet is already folded back"],
        ending_implication: "He stops solving and starts avoiding.",
      },
    },
  },
  {
    key: "T5 2026 to 1926",
    id: "11111111-1111-4111-8111-111111111205",
    session: "aaaaaaaa-0000-4000-8000-000000000205",
    idea: "A woman steps through a doorway in 2026 and comes out in 1926.",
    truth: {
      emotional_core: "One step carries her a hundred years back.",
      what_must_survive: "The same woman, the same coat, a different century around her.",
      chosen_execution:
        "Single steady shot follows her through one doorway as the world beyond it changes era.",
      source: "user_decision",
    },
    bible: {
      logline: "A doorway between two centuries.",
      camera: "Steady follow through the doorway",
      look: "Modern grey giving way to gaslight amber",
      mood: "Awe",
      setting: "A stone doorway in a city street",
      decisions: ["Her coat never changes", "No visible effects, only the world changes"],
      twist: null,
    },
  },
];

const style = STYLES[0]!.value;

for (const testCase of CASES) {
  await supabaseAdmin.from("director_sessions").upsert({
    id: testCase.id,
    session_id: testCase.session,
    idea: testCase.idea,
    style,
    status: "ready",
    understanding: testCase.idea,
    film_bible: testCase.bible,
    blueprint: testCase.truth["chosen_execution"],
    creative_truth: testCase.truth,
  });

  try {
    // Explicit owner: set FIDELITY_USER_ID to own (and quota-count) the test films;
    // without it they are owner-less, read-only and never renderable.
    const film = await buildFilmCore(
      {
        director_session_id: testCase.id,
        session_id: testCase.session,
        style,
      },
      process.env["FIDELITY_USER_ID"] || undefined,
    );

    console.log(`\n=== ${testCase.key} — "${film.title}" (${film.scenes.length} scenes)`);
    for (const scene of film.scenes) {
      const truth = scene.truth;
      if (!truth) {
        console.log(`  scene ${scene.scene_number}: NO SCENE TRUTH`);
        continue;
      }
      const request = buildGenerationRequest(truth, {
        style_prefix: "",
        original_idea: film.logline,
        scene_number: scene.scene_number,
        scene_title: scene.title,
        cast: film.characters.map((c) => `${c.name}: ${c.look}`).join(". "),
        film_setting: film.setting,
        film_continuity: truth.continuity,
      });
      const fidelity = checkFidelity(truth, request);
      const reached = (Object.keys(truth) as (keyof typeof truth)[])
        .filter((k) => k !== "provenance" && k !== "user_decisions")
        .filter((k) => typeof truth[k] === "string" && truth[k])
        .filter((k) => request.toLowerCase().includes(String(truth[k]).toLowerCase().slice(0, 30)));
      console.log(
        `  scene ${scene.scene_number} | required: ${REQUIRED_TRUTH_FIELDS.map(
          (f) => `${f}=${truth[f] ? "yes" : "NO"}`,
        ).join(
          " ",
        )} | fidelity ${fidelity.ok ? "OK" : `FAIL ${JSON.stringify(fidelity)}`} | reached: ${reached.join(",")}`,
      );
      if (scene.scene_number === 1) {
        console.log(`  core: ${truth.emotional_core}`);
        console.log(`  survive: ${truth.what_must_survive}`);
        console.log(`  exec: ${truth.chosen_execution}`);
        console.log(`  provenance: ${JSON.stringify(truth.provenance)}`);
      }
      if (truth.twist || truth.reveal) {
        console.log(
          `  twist/reveal reaches request: ${request.includes(truth.reveal || truth.twist)}`,
        );
      }
    }
  } catch (error) {
    console.log(`\n=== ${testCase.key} FAILED: ${(error as Error).message}`);
  }
}
