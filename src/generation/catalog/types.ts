/**
 * The generation catalogue is the single source of truth for what the engine can
 * do. A model entry declares its surface, its media roles (with per-role caps)
 * and ONLY the settings that model actually accepts. Nothing else in the app may
 * hold a second list of models or settings.
 */

export type Surface = "image" | "video";

export type MediaRole = "start" | "end" | "reference" | "video" | "audio";

export type SettingField =
  | { type: "enum"; values: readonly string[]; default: string }
  | { type: "range"; min: number; max: number; default: number; step?: number }
  | { type: "boolean"; default: boolean };

export type ModelPaths = {
  text?: string;
  image?: string;
  firstLast?: string;
  reference?: string;
};

export type ModelEntry = {
  id: string;
  surface: Surface;
  label: string;
  /** Per-role maximum media count. A role that is absent is not accepted at all. */
  roles: Partial<Record<MediaRole, number>>;
  settings: Record<string, SettingField>;
  paths?: ModelPaths;
  /**
   * Escape hatch for a model whose submit shape the shared mapper cannot
   * express. Receives the already validated settings and media, returns the
   * platform body verbatim.
   */
  map?: (input: MapInput) => Record<string, unknown>;
};

export type MediaItem = {
  url: string;
  kind: "image" | "video" | "audio";
};

export type GenerationPlane = {
  model: string;
  prompt: { text: string };
  media: Partial<Record<MediaRole, MediaItem[]>>;
  settings: Record<string, unknown>;
};

export type MapInput = {
  entry: ModelEntry;
  prompt: string;
  media: Partial<Record<MediaRole, MediaItem[]>>;
  settings: Record<string, unknown>;
};
