import { buildFilm, reviewScenes } from "./src/lib/film.functions";
const s = "11111111-2222-3333-4444-555555555555";
const film = await (buildFilm as any)({ data: { director_session_id: "7ccfee23-3afc-4b2b-8261-5d54e0bab99e", session_id: s } });
console.log(JSON.stringify(film, null, 2));
