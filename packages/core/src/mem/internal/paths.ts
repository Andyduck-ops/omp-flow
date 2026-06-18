/**
 * Default home-based session roots for the persisted-session adapters.
 *
 * `HOME` is captured once at module load — consumers that need to point the
 * adapters at a fake home (tests) must mock `node:os` before importing any
 * mem module.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const HOME = os.homedir();
export const CLAUDE_PROJECTS = path.join(HOME, ".claude", "projects");
export const CODEX_SESSIONS = path.join(HOME, ".codex", "sessions");

function expandHome(p: string): string {
  if (p === "~") return HOME;
  if (p.startsWith(`~${path.sep}`)) return path.join(HOME, p.slice(2));
  if (p.startsWith("~/")) return path.join(HOME, p.slice(2));
  return p;
}

export const PI_AGENT_DIR = expandHome(
  process.env.PI_CODING_AGENT_DIR ?? path.join(HOME, ".pi", "agent"),
);
export const PI_SESSIONS = expandHome(
  process.env.PI_CODING_AGENT_SESSION_DIR ??
    path.join(PI_AGENT_DIR, "sessions"),
);

function readPiSettingsSessionDir(): string | undefined {
  const settingsFile = path.join(PI_AGENT_DIR, "settings.json");
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const sessionDir = (raw as { sessionDir?: unknown }).sessionDir;
    return typeof sessionDir === "string" && sessionDir.trim()
      ? expandHome(sessionDir)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Claude sanitizes a cwd into its on-disk project dir name by replacing
 * every `/` and `_` with `-`. */
export function claudeProjectDirFromCwd(cwd: string): string {
  return path.join(CLAUDE_PROJECTS, cwd.replace(/[/_]/g, "-"));
}

/** Pi encodes a cwd as `--<resolved-cwd-with-separators-as-dashes>--`. */
export function piProjectDirFromCwd(cwd: string): string {
  const resolvedCwd = path.resolve(cwd);
  const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return path.join(path.join(PI_AGENT_DIR, "sessions"), safePath);
}

/** Discover Pi session roots visible from the current process. */
export function piSessionRoots(): string[] {
  const roots = [path.join(PI_AGENT_DIR, "sessions"), PI_SESSIONS];
  const settingsSessionDir = readPiSettingsSessionDir();
  if (settingsSessionDir) roots.push(settingsSessionDir);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const root of roots) {
    const normalized = path.resolve(root);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(root);
  }
  return out;
}

/** Lazy stack-based recursive file walk — yields every file path under
 * `root`. Missing roots and unreadable directories are skipped silently. */
export function* walkDir(root: string): Generator<string> {
  if (!fs.existsSync(root)) return;
  const stack: string[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) yield p;
    }
  }
}
