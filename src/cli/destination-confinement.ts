import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type DestinationConfinementConflictCode =
  | 'invalid-logical-target'
  | 'lexical-escape'
  | 'repository-root-unavailable'
  | 'repository-root-not-directory'
  | 'linked-ancestor'
  | 'non-directory-ancestor'
  | 'non-ordinary-target'
  | 'native-check-failed'
  | 'real-path-divergence';

export interface ConfinedDestination {
  logicalTarget: string;
  absolutePath: string;
}

export interface DestinationConfinementSuccess {
  state: 'confined';
  repositoryRoot: string;
  destinations: ConfinedDestination[];
}

export interface DestinationConfinementConflict {
  state: 'conflict';
  code: DestinationConfinementConflictCode;
  logicalTarget: string;
  absolutePath: string | null;
  detail: string;
}

export type DestinationConfinementResult =
  | DestinationConfinementSuccess
  | DestinationConfinementConflict;

/** The confinement primitive deliberately receives no mutating filesystem operations. */
export interface DestinationConfinementFileSystem {
  lstat(absolutePath: string): fs.Stats;
  realpath(absolutePath: string): string;
  inspectReparsePoints(absolutePaths: readonly string[]): readonly DestinationReparsePointState[];
}

export type DestinationReparsePointState =
  | 'ordinary'
  | 'reparse-point'
  | 'missing'
  | 'unavailable'
  | 'not-applicable';

const WINDOWS_REPARSE_INSPECTION = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$paths = @((ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())))
$states = [System.Collections.Generic.List[string]]::new()
foreach ($candidate in $paths) {
  try {
    $attributes = [System.IO.File]::GetAttributes([string]$candidate)
    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      $states.Add('reparse-point')
    } else {
      $states.Add('ordinary')
    }
  } catch [System.IO.FileNotFoundException] {
    $states.Add('missing')
  } catch [System.IO.DirectoryNotFoundException] {
    $states.Add('missing')
  } catch {
    $states.Add('unavailable')
  }
}
[Console]::Out.Write((ConvertTo-Json -InputObject $states.ToArray() -Compress))
`;

function inspectWindowsReparsePoints(
  absolutePaths: readonly string[],
): readonly DestinationReparsePointState[] {
  if (process.platform !== 'win32') {
    return absolutePaths.map(() => 'not-applicable');
  }
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !path.win32.isAbsolute(systemRoot) || systemRoot.includes('\0')) {
    throw new Error('Cannot locate the trusted Windows system PowerShell executable.');
  }
  const powershell = path.win32.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const result = spawnSync(
    powershell,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_REPARSE_INSPECTION],
    {
      encoding: 'utf8',
      input: JSON.stringify(absolutePaths),
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw result.error ?? new Error('Windows reparse-point inspection failed.');
  }
  const parsed: unknown = JSON.parse(result.stdout.replace(/^\uFEFF/u, ''));
  if (
    !Array.isArray(parsed)
    || parsed.length !== absolutePaths.length
    || parsed.some(value => ![
      'ordinary',
      'reparse-point',
      'missing',
      'unavailable',
    ].includes(String(value)))
  ) {
    throw new Error('Windows reparse-point inspection returned an invalid result.');
  }
  return parsed as DestinationReparsePointState[];
}

const nativeFileSystem: DestinationConfinementFileSystem = {
  lstat: absolutePath => fs.lstatSync(absolutePath),
  realpath: absolutePath => fs.realpathSync.native(absolutePath),
  inspectReparsePoints: inspectWindowsReparsePoints,
};

function conflict(
  code: DestinationConfinementConflictCode,
  logicalTarget: string,
  absolutePath: string | null,
  detail: string,
): DestinationConfinementConflict {
  return { state: 'conflict', code, logicalTarget, absolutePath, detail };
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function sameNativePath(left: string, right: string): boolean {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLocaleLowerCase('en-US') === normalizedRight.toLocaleLowerCase('en-US')
    : normalizedLeft === normalizedRight;
}

function logicalSegments(logicalTarget: string): string[] | DestinationConfinementConflict {
  if (!logicalTarget || logicalTarget.includes('\0') || logicalTarget.includes('\\')) {
    return conflict(
      'invalid-logical-target',
      logicalTarget,
      null,
      `Flow Status destination "${logicalTarget}" must be a non-empty forward-slash logical path.`,
    );
  }
  if (
    path.posix.isAbsolute(logicalTarget)
    || path.win32.isAbsolute(logicalTarget)
    || /^[A-Za-z]:/u.test(logicalTarget)
  ) {
    return conflict(
      'lexical-escape',
      logicalTarget,
      null,
      `Flow Status destination "${logicalTarget}" is not repository-relative.`,
    );
  }
  const segments = logicalTarget.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    return conflict(
      segments.includes('..') ? 'lexical-escape' : 'invalid-logical-target',
      logicalTarget,
      null,
      `Flow Status destination "${logicalTarget}" is not a canonical repository-relative path.`,
    );
  }
  return segments;
}

function inspectRepositoryRoot(
  repositoryRoot: string,
  logicalTarget: string,
  fileSystem: DestinationConfinementFileSystem,
  reparseState: DestinationReparsePointState,
): { lexicalRoot: string; realRoot: string } | DestinationConfinementConflict {
  if (!repositoryRoot.trim() || repositoryRoot.includes('\0')) {
    return conflict(
      'repository-root-unavailable',
      logicalTarget,
      null,
      'The selected repository root is empty or malformed.',
    );
  }
  const lexicalRoot = path.resolve(repositoryRoot);
  let metadata: fs.Stats;
  try {
    metadata = fileSystem.lstat(lexicalRoot);
  } catch {
    return conflict(
      'repository-root-unavailable',
      logicalTarget,
      lexicalRoot,
      `Cannot inspect the selected repository root before checking "${logicalTarget}".`,
    );
  }
  if (reparseState === 'unavailable' || reparseState === 'missing') {
    return conflict(
      'native-check-failed',
      logicalTarget,
      lexicalRoot,
      `The native reparse-point check failed for the repository root while checking "${logicalTarget}".`,
    );
  }
  if (metadata.isSymbolicLink() || reparseState === 'reparse-point') {
    return conflict(
      'linked-ancestor',
      logicalTarget,
      lexicalRoot,
      `Flow Status destination "${logicalTarget}" traverses a linked repository root.`,
    );
  }
  if (!metadata.isDirectory()) {
    return conflict(
      'repository-root-not-directory',
      logicalTarget,
      lexicalRoot,
      `The selected repository root is not an ordinary directory for "${logicalTarget}".`,
    );
  }
  try {
    return { lexicalRoot, realRoot: fileSystem.realpath(lexicalRoot) };
  } catch {
    return conflict(
      'native-check-failed',
      logicalTarget,
      lexicalRoot,
      `The native real-path check failed for the repository root while checking "${logicalTarget}".`,
    );
  }
}

function inspectDestination(
  lexicalRoot: string,
  realRoot: string,
  logicalTarget: string,
  segments: string[],
  fileSystem: DestinationConfinementFileSystem,
  reparseStates: ReadonlyMap<string, DestinationReparsePointState>,
): ConfinedDestination | DestinationConfinementConflict {
  const absolutePath = path.resolve(lexicalRoot, ...segments);
  const relation = path.relative(lexicalRoot, absolutePath);
  if (
    !relation
    || relation === '..'
    || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)
  ) {
    return conflict(
      'lexical-escape',
      logicalTarget,
      absolutePath,
      `Flow Status destination "${logicalTarget}" escapes the selected repository.`,
    );
  }

  let cursor = lexicalRoot;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]!);
    let metadata: fs.Stats;
    try {
      metadata = fileSystem.lstat(cursor);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        // A missing ordinary descendant is installable only below the ancestors already checked.
        return { logicalTarget, absolutePath };
      }
      return conflict(
        'native-check-failed',
        logicalTarget,
        cursor,
        `Cannot inspect ancestor "${cursor}" for Flow Status destination "${logicalTarget}".`,
      );
    }

    const reparseState = reparseStates.get(cursor);
    if (!reparseState || reparseState === 'unavailable' || reparseState === 'missing') {
      return conflict(
        'native-check-failed',
        logicalTarget,
        cursor,
        `The native reparse-point check failed at "${cursor}" for Flow Status destination "${logicalTarget}".`,
      );
    }
    if (metadata.isSymbolicLink() || reparseState === 'reparse-point') {
      return conflict(
        'linked-ancestor',
        logicalTarget,
        cursor,
        `Flow Status destination "${logicalTarget}" traverses linked or reparse-point path "${cursor}".`,
      );
    }
    const isFinal = index === segments.length - 1;
    if (!isFinal && !metadata.isDirectory()) {
      return conflict(
        'non-directory-ancestor',
        logicalTarget,
        cursor,
        `Flow Status destination "${logicalTarget}" traverses non-directory ancestor "${cursor}".`,
      );
    }
    if (isFinal && !metadata.isDirectory() && !metadata.isFile()) {
      return conflict(
        'non-ordinary-target',
        logicalTarget,
        cursor,
        `Flow Status destination "${logicalTarget}" is not an ordinary file or directory.`,
      );
    }

    let realPath: string;
    try {
      realPath = fileSystem.realpath(cursor);
    } catch {
      return conflict(
        'native-check-failed',
        logicalTarget,
        cursor,
        `The native real-path check failed at "${cursor}" for Flow Status destination "${logicalTarget}".`,
      );
    }
    const expectedRealPath = path.join(realRoot, ...segments.slice(0, index + 1));
    if (!sameNativePath(realPath, expectedRealPath)) {
      return conflict(
        'real-path-divergence',
        logicalTarget,
        cursor,
        `Flow Status destination "${logicalTarget}" diverges at native real path "${cursor}".`,
      );
    }
  }
  return { logicalTarget, absolutePath };
}

/**
 * Prove that all logical targets are currently confined beneath an ordinary repository root.
 * This function performs only metadata, reparse-attribute, and native real-path reads and never
 * creates missing paths.
 */
export function confineRepositoryDestinations(
  repositoryRoot: string,
  logicalTargets: readonly string[],
  fileSystem: DestinationConfinementFileSystem = nativeFileSystem,
): DestinationConfinementResult {
  const firstTarget = logicalTargets[0] ?? '<destination-list>';
  if (logicalTargets.length === 0) {
    return conflict(
      'invalid-logical-target',
      firstTarget,
      null,
      'At least one Flow Status destination is required for confinement.',
    );
  }

  const preparedTargets: Array<{ logicalTarget: string; segments: string[] }> = [];
  for (const logicalTarget of logicalTargets) {
    const segments = logicalSegments(logicalTarget);
    if (!Array.isArray(segments)) return segments;
    preparedTargets.push({ logicalTarget, segments });
  }
  if (!repositoryRoot.trim() || repositoryRoot.includes('\0')) {
    return conflict(
      'repository-root-unavailable',
      firstTarget,
      null,
      'The selected repository root is empty or malformed.',
    );
  }
  const lexicalRoot = path.resolve(repositoryRoot);
  const inspectionPaths = [lexicalRoot];
  const inspectionPathSet = new Set(inspectionPaths);
  for (const target of preparedTargets) {
    let cursor = lexicalRoot;
    for (const segment of target.segments) {
      cursor = path.join(cursor, segment);
      if (!inspectionPathSet.has(cursor)) {
        inspectionPathSet.add(cursor);
        inspectionPaths.push(cursor);
      }
    }
  }
  let inspectedReparseStates: readonly DestinationReparsePointState[];
  try {
    inspectedReparseStates = fileSystem.inspectReparsePoints(inspectionPaths);
  } catch {
    return conflict(
      'native-check-failed',
      firstTarget,
      lexicalRoot,
      `The native reparse-point check failed while checking "${firstTarget}".`,
    );
  }
  if (inspectedReparseStates.length !== inspectionPaths.length) {
    return conflict(
      'native-check-failed',
      firstTarget,
      lexicalRoot,
      `The native reparse-point check returned incomplete results while checking "${firstTarget}".`,
    );
  }
  const validReparseStates: readonly DestinationReparsePointState[] = [
    'ordinary',
    'reparse-point',
    'missing',
    'unavailable',
    'not-applicable',
  ];
  if (inspectedReparseStates.some(state => !validReparseStates.includes(state))) {
    return conflict(
      'native-check-failed',
      firstTarget,
      lexicalRoot,
      `The native reparse-point check returned invalid results while checking "${firstTarget}".`,
    );
  }
  const reparseStates = new Map(
    inspectionPaths.map((candidate, index) => [candidate, inspectedReparseStates[index]!] as const),
  );

  const root = inspectRepositoryRoot(
    repositoryRoot,
    firstTarget,
    fileSystem,
    reparseStates.get(lexicalRoot) ?? 'unavailable',
  );
  if ('state' in root) return root;

  const destinations: ConfinedDestination[] = [];
  for (const { logicalTarget, segments } of preparedTargets) {
    const inspected = inspectDestination(
      root.lexicalRoot,
      root.realRoot,
      logicalTarget,
      segments,
      fileSystem,
      reparseStates,
    );
    if ('state' in inspected) return inspected;
    destinations.push(inspected);
  }
  return { state: 'confined', repositoryRoot: root.lexicalRoot, destinations };
}
