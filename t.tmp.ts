import { buildFilmCore, reviewScenesCore } from "./src/lib/film.functions";
const s = "11111111-2222-3333-4444-555555555555";
const film = await buildFilmCore({ director_session_id: "7ccfee23-3afc-4b2b-8261-5d54e0bab99e", session_id: s });
console.log(film.id, film.title, "|", film.logline);
for (const sc of film.scenes) console.log(sc.scene_number, sc.title, "| c" + sc.complexity, sc.clarity_verdict, sc.credit_cost, "\n   ", sc.idea, "\n   note:", sc.clarity_note);
const r = await reviewScenesCore({ film_id: film.id, session_id: s });
console.log("--- after review ---");
for (const sc of r.scenes) console.log(sc.scene_number, sc.clarity_verdict, "c" + sc.complexity, sc.credit_cost, "|", sc.clarity_note);
