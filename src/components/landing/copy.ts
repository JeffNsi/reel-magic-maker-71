import { COIN_COST } from "@/lib/storyreel.functions";
import { CLIP_PRICE_SEK } from "@/lib/clip-shop.functions";

/** Homepage wording reuses the existing generation and purchase prices. */
export const FILM_PRICE_COPY = `One film costs ${COIN_COST} credits. A finished clip can also be purchased separately for ${CLIP_PRICE_SEK} kr.`;

/** The Creator plan's monthly allowance. This number is written nowhere else. */
export const CREATOR_CREDITS_PER_MONTH = 500;

/** Whole films that allowance covers at the film price the app actually charges. */
export const CREATOR_FILMS_PER_MONTH = Math.floor(CREATOR_CREDITS_PER_MONTH / COIN_COST);

/** The Creator card line — both figures come from the constants above. */
export const CREATOR_PLAN_COPY = `${CREATOR_CREDITS_PER_MONTH} credits / month (${CREATOR_FILMS_PER_MONTH} films)`;

type ShowcaseSubject = {
  pattern: RegExp;
  /** A short editorial title, never a cut-off piece of the prompt. */
  title: string;
  /** A logline: what the film is about, in one line. Never camera language. */
  logline: string;
};

/** Ordered from most to least specific, so a named story wins over a generic one. */
const SHOWCASE_SUBJECTS: ShowcaseSubject[] = [
  {
    pattern: /detective/i,
    title: "The Quiet Investigation",
    logline: "A detective finds a face he was never supposed to see again.",
  },
  {
    pattern: /elin.*archway/i,
    title: "Through the Archway",
    logline: "Elin walks into a fog that belongs to another century.",
  },
  {
    pattern: /julian.*rooftop|rooftop.*julian/i,
    title: "The Hidden Transfer",
    logline: "One tap on a rooftop could make him a different man.",
  },
  {
    pattern: /husband.*kitchen|wife.*husband/i,
    title: "A Familiar Stranger",
    logline: "At breakfast, her husband smiles like a stranger she once loved.",
  },
  {
    pattern: /astrid.*arch|1926/i,
    title: "Another Time Awaits",
    logline: "Astrid follows a lantern into a street that no longer exists.",
  },
  {
    pattern: /stone pillar|younger self|the girl appears|suitcase/i,
    title: "The Waiting Girl",
    logline: "On an empty platform she meets the girl she used to be.",
  },
  {
    pattern: /speaker|dining salon|financial app|banking|wire transfer/i,
    title: "The Quiet Confirmation",
    logline: "Under the tablecloth, a single tap changes who owns the room.",
  },
  {
    pattern: /arthur|eleanor/i,
    title: "A Second First Look",
    logline: "He falls for the woman whose name he cannot remember.",
  },
  {
    pattern: /train|station/i,
    title: "Last Train Home",
    logline: "The last train leaves, and so does the life she knew.",
  },
  {
    pattern: /rooftop/i,
    title: "Above the City",
    logline: "Above the city, two people decide what they cannot take back.",
  },
  {
    pattern: /astronaut|visor/i,
    title: "Beyond the Visor",
    logline: "In his visor, a red world is doing something it shouldn't.",
  },
  {
    pattern: /fisherman|harbou?r/i,
    title: "Before the Tide",
    logline: "He hauls the same rope every dawn, waiting for one boat.",
  },
  {
    pattern: /desert|highway/i,
    title: "The Open Road",
    logline: "She drives west until the road stops being anyone's.",
  },
  {
    pattern: /forest|woods/i,
    title: "Into the Woods",
    logline: "They went in to find the dog. Only one came back.",
  },
  {
    pattern: /ocean|sea|shore/i,
    title: "At the Waterline",
    logline: "The tide brings back something the family buried years ago.",
  },
  {
    pattern: /city|street/i,
    title: "City in Motion",
    logline: "The city keeps a secret in every lit window.",
  },
];

const FALLBACK_TITLES = ["A Fleeting Moment", "Between Two Worlds", "Before Everything Changes"];

const FALLBACK_LOGLINES = [
  "A single moment, and everything after it is different.",
  "Someone is about to learn something that cannot be unlearned.",
  "Two people, one room, and a truth neither will say aloud.",
];

function showcaseSubject(idea: string) {
  return SHOWCASE_SUBJECTS.find((subject) => subject.pattern.test(idea));
}

export function showcaseTitle(idea: string, style: string, index: number) {
  return (
    showcaseSubject(idea)?.title ??
    FALLBACK_TITLES[index % FALLBACK_TITLES.length] ??
    "A Fleeting Moment"
  );
}

/** The line under a showcase title: what the film is about, not how it was shot. */
export function showcaseLogline(idea: string, style: string, index: number) {
  return (
    showcaseSubject(idea)?.logline ??
    FALLBACK_LOGLINES[index % FALLBACK_LOGLINES.length] ??
    "A single moment, and everything after it is different."
  );
}
