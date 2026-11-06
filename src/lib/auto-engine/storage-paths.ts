/**
 * Auto Engine — storage path rules, the TypeScript twin of the SQL functions
 * public.auto_engine_is_safe_path and public.auto_engine_is_export_file
 * (migration 0010). Both are checked against the same corpus
 * (tests/fixtures/auto-engine-paths.json), so the server and the database can
 * never disagree about what a safe path is.
 *
 * A safe path is relative, starts with its root folder, has only plain
 * segments (letters, digits, "_", "-", "." — never starting with "."), and
 * contains no "..", so normalising it can never move it out of its folder.
 */

export type StorageRoot = "exports" | "teasers";

const MAX_PATH = 512;
const SEGMENTS = /^(?:\/[A-Za-z0-9_][A-Za-z0-9._-]{0,127})+\/?$/;

export function isSafeStoragePath(path: unknown, root: StorageRoot | string): boolean {
  if (typeof path !== "string") return false;
  if (root !== "exports" && root !== "teasers") return false;
  if (path.length > MAX_PATH || path.includes("..")) return false;
  if (!path.startsWith(root)) return false;
  return SEGMENTS.test(path.slice(root.length));
}

/** A file (not a folder) inside one export's own folder, e.g. exports/<film>/v1/film_9x16.mp4. */
export function isExportFile(path: string | null, prefix: string): boolean {
  if (path === null) return true;
  return (
    isSafeStoragePath(path, "exports") &&
    !path.endsWith("/") &&
    path.startsWith(prefix) &&
    path.length > prefix.length
  );
}

/** A teaser file inside its export's own folder: teasers/<export_id>/… */
export function isTeaserFile(path: string, exportId: string): boolean {
  return (
    isSafeStoragePath(path, "teasers") &&
    !path.endsWith("/") &&
    path.startsWith(`teasers/${exportId}/`)
  );
}
