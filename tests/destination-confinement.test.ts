import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  confineRepositoryDestinations,
  type DestinationConfinementConflictCode,
  type DestinationConfinementFileSystem,
  type DestinationReparsePointState,
} from '../src/cli/destination-confinement.js';

type Check = (condition: unknown, message: string) => asserts condition;

const MANAGED_TARGETS = [
  '.omp-flow',
  '.claude',
  '.omp-flow/.runtime/flow-status-setup-pending-v2.json',
  '.omp-flow/.gitignore',
  '.omp-flow/.template-hashes.json',
  '.omp-flow/vendor/flow-status/ccstatusline.js',
  '.omp-flow/vendor/flow-status/supervisor.js',
  '.omp-flow/vendor/flow-status/package.json',
  '.omp-flow/.flow-status-supervisor.json',
  '.claude/ccstatusline.json',
  '.omp-flow/.flow-status-ownership.json',
  '.claude/settings.json',
  '.omp-flow/config.json',
] as const;

function expectConflict(
  root: string,
  logicalTarget: string,
  code: DestinationConfinementConflictCode,
  check: Check,
  fileSystem?: DestinationConfinementFileSystem,
): void {
  const result = confineRepositoryDestinations(root, [logicalTarget], fileSystem);
  check(result.state === 'conflict', `${logicalTarget} is refused`);
  check(result.code === code, `${logicalTarget} is refused with ${code}`);
  check(result.logicalTarget === logicalTarget, `${logicalTarget} is identified in the conflict`);
}

function makeDirectoryLink(target: string, link: string): void {
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

function linkedFixture(
  temporaryRoot: string,
  name: string,
  linkedRelative: string,
  targetRelative: string,
): { repository: string; logicalTarget: string } {
  const repository = path.join(temporaryRoot, name);
  const external = path.join(temporaryRoot, `${name}-external`);
  fs.mkdirSync(repository, { recursive: true });
  fs.mkdirSync(external, { recursive: true });
  const linked = path.join(repository, ...linkedRelative.split('/'));
  fs.mkdirSync(path.dirname(linked), { recursive: true });
  makeDirectoryLink(external, linked);
  return { repository, logicalTarget: targetRelative };
}

function readOnlyProbe(
  overrides: Partial<DestinationConfinementFileSystem> = {},
): { fileSystem: DestinationConfinementFileSystem; operations: string[] } {
  const operations: string[] = [];
  return {
    operations,
    fileSystem: {
      lstat(absolutePath) {
        operations.push(`lstat:${absolutePath}`);
        return overrides.lstat?.(absolutePath) ?? fs.lstatSync(absolutePath);
      },
      realpath(absolutePath) {
        operations.push(`realpath:${absolutePath}`);
        return overrides.realpath?.(absolutePath) ?? fs.realpathSync.native(absolutePath);
      },
      inspectReparsePoints(absolutePaths) {
        operations.push(`reparse:${absolutePaths.join('|')}`);
        if (overrides.inspectReparsePoints) {
          return overrides.inspectReparsePoints(absolutePaths);
        }
        return absolutePaths.map((absolutePath): DestinationReparsePointState => {
          try {
            return fs.lstatSync(absolutePath).isSymbolicLink() ? 'reparse-point' : 'ordinary';
          } catch (error) {
            if (
              typeof error === 'object'
              && error !== null
              && 'code' in error
              && error.code === 'ENOENT'
            ) {
              return 'missing';
            }
            return 'unavailable';
          }
        });
      },
    },
  };
}

function isReadOnlyProbeOperation(operation: string): boolean {
  return operation.startsWith('lstat:')
    || operation.startsWith('realpath:')
    || operation.startsWith('reparse:');
}

export function runDestinationConfinementTests(check: Check): void {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-confinement-'));
  try {
    const unicodeRepository = path.join(temporaryRoot, '项目-目录-🚀');
    fs.mkdirSync(path.join(unicodeRepository, '.omp-flow', '.runtime'), { recursive: true });
    fs.mkdirSync(path.join(unicodeRepository, '.claude'), { recursive: true });
    const ordinary = confineRepositoryDestinations(unicodeRepository, MANAGED_TARGETS);
    check(ordinary.state === 'confined', 'Unicode repository and every managed target class are confined');
    check(
      ordinary.destinations.length === MANAGED_TARGETS.length,
      'confinement returns one native destination for every approved logical target',
    );
    check(
      !fs.existsSync(path.join(unicodeRepository, '.omp-flow', 'vendor')),
      'missing ordinary vendor descendants remain installable without being created',
    );

    for (const logicalTarget of [
      '../outside',
      '.omp-flow/../../outside',
      '/absolute',
      'C:/absolute',
      '//server/share/path',
    ]) {
      expectConflict(unicodeRepository, logicalTarget, 'lexical-escape', check);
    }
    expectConflict(unicodeRepository, '.omp-flow\\vendor', 'invalid-logical-target', check);

    const absentRoot = path.join(temporaryRoot, 'absent-root');
    expectConflict(absentRoot, '.omp-flow/config.json', 'repository-root-unavailable', check);
    const fileRoot = path.join(temporaryRoot, 'file-root');
    fs.writeFileSync(fileRoot, 'not a directory', 'utf8');
    expectConflict(fileRoot, '.omp-flow/config.json', 'repository-root-not-directory', check);

    const linkedRootTarget = path.join(temporaryRoot, 'linked-root-target');
    const linkedRoot = path.join(temporaryRoot, 'linked-root');
    fs.mkdirSync(linkedRootTarget);
    makeDirectoryLink(linkedRootTarget, linkedRoot);
    expectConflict(linkedRoot, '.omp-flow/config.json', 'linked-ancestor', check);

    for (const [name, linkedRelative, logicalTarget] of [
      ['omp-root-link', '.omp-flow', '.omp-flow/config.json'],
      ['claude-root-link', '.claude', '.claude/settings.json'],
      ['pending-link', '.omp-flow/.runtime', '.omp-flow/.runtime/flow-status-setup-pending-v2.json'],
      ['vendor-link', '.omp-flow/vendor', '.omp-flow/vendor/flow-status/ccstatusline.js'],
      ['binding-link', '.omp-flow/state', '.omp-flow/state/binding/flow-status.json'],
      ['settings-link', '.claude/profile', '.claude/profile/settings/settings.json'],
    ] as const) {
      const fixture = linkedFixture(temporaryRoot, name, linkedRelative, logicalTarget);
      const probe = readOnlyProbe();
      expectConflict(fixture.repository, fixture.logicalTarget, 'linked-ancestor', check, probe.fileSystem);
      check(
        probe.operations.every(isReadOnlyProbeOperation),
        `${name} rejection performs only instrumented metadata/native-realpath reads`,
      );
      check(!fs.existsSync(path.join(fixture.repository, ...logicalTarget.split('/'))), `${name} rejection writes no target`);
    }

    const insideLinkRepository = path.join(temporaryRoot, 'inside-link');
    const insideLinkTarget = path.join(insideLinkRepository, 'ordinary-inside-target');
    fs.mkdirSync(insideLinkTarget, { recursive: true });
    makeDirectoryLink(insideLinkTarget, path.join(insideLinkRepository, '.omp-flow'));
    expectConflict(
      insideLinkRepository,
      '.omp-flow/config.json',
      'linked-ancestor',
      check,
    );

    const divergentRoot = path.join(temporaryRoot, 'realpath-divergence');
    fs.mkdirSync(path.join(divergentRoot, '.omp-flow'), { recursive: true });
    const divergentAncestor = path.join(divergentRoot, '.omp-flow');
    const divergentProbe = readOnlyProbe({
      realpath(absolutePath) {
        if (absolutePath === divergentAncestor) return path.join(temporaryRoot, 'elsewhere');
        return fs.realpathSync.native(absolutePath);
      },
    });
    expectConflict(
      divergentRoot,
      '.omp-flow/config.json',
      'real-path-divergence',
      check,
      divergentProbe.fileSystem,
    );
    check(
      divergentProbe.operations.every(isReadOnlyProbeOperation),
      'real-path divergence rejection has no filesystem mutation capability',
    );

    const nativeFailureRoot = path.join(temporaryRoot, 'native-failure');
    fs.mkdirSync(path.join(nativeFailureRoot, '.claude'), { recursive: true });
    const failingAncestor = path.join(nativeFailureRoot, '.claude');
    const failingProbe = readOnlyProbe({
      realpath(absolutePath) {
        if (absolutePath === failingAncestor) throw Object.assign(new Error('denied'), { code: 'EACCES' });
        return fs.realpathSync.native(absolutePath);
      },
    });
    expectConflict(
      nativeFailureRoot,
      '.claude/settings.json',
      'native-check-failed',
      check,
      failingProbe.fileSystem,
    );
    check(!fs.existsSync(path.join(nativeFailureRoot, '.claude', 'settings.json')), 'native failure writes no destination');

    const lstatFailureProbe = readOnlyProbe({
      lstat(absolutePath) {
        if (absolutePath === failingAncestor) throw Object.assign(new Error('denied'), { code: 'EACCES' });
        return fs.lstatSync(absolutePath);
      },
    });
    expectConflict(
      nativeFailureRoot,
      '.claude/settings.json',
      'native-check-failed',
      check,
      lstatFailureProbe.fileSystem,
    );
    check(
      lstatFailureProbe.operations.every(isReadOnlyProbeOperation),
      'lstat failure rejection has no filesystem mutation capability',
    );

    const opaqueReparseRoot = path.join(temporaryRoot, 'opaque-reparse-fixture');
    const opaqueReparseAncestor = path.join(opaqueReparseRoot, '.omp-flow');
    const opaqueReparseTarget = path.join(opaqueReparseAncestor, 'config.json');
    fs.mkdirSync(opaqueReparseAncestor, { recursive: true });
    fs.writeFileSync(opaqueReparseTarget, '{}\n', 'utf8');
    for (const [name, reparsePath] of [
      ['repository root', opaqueReparseRoot],
      ['ordinary-looking ancestor', opaqueReparseAncestor],
      ['ordinary-looking final target', opaqueReparseTarget],
    ] as const) {
      check(
        !fs.lstatSync(reparsePath).isSymbolicLink(),
        `${name} faithful reparse seam remains non-symbolic in Node Stats`,
      );
      check(
        fs.realpathSync.native(reparsePath) === reparsePath,
        `${name} faithful reparse seam keeps its native real path unchanged`,
      );
      const probe = readOnlyProbe({
        inspectReparsePoints(absolutePaths) {
          return absolutePaths.map(absolutePath => (
            absolutePath === reparsePath ? 'reparse-point' : 'ordinary'
          ));
        },
      });
      expectConflict(
        opaqueReparseRoot,
        '.omp-flow/config.json',
        'linked-ancestor',
        check,
        probe.fileSystem,
      );
      check(
        probe.operations.every(isReadOnlyProbeOperation),
        `${name} reparse rejection performs only instrumented metadata/native-realpath reads`,
      );
    }

    const unavailableReparseProbe = readOnlyProbe({
      inspectReparsePoints(absolutePaths) {
        return absolutePaths.map(absolutePath => (
          absolutePath === opaqueReparseAncestor ? 'unavailable' : 'ordinary'
        ));
      },
    });
    expectConflict(
      opaqueReparseRoot,
      '.omp-flow/config.json',
      'native-check-failed',
      check,
      unavailableReparseProbe.fileSystem,
    );
    check(
      unavailableReparseProbe.operations.every(isReadOnlyProbeOperation),
      'unavailable native reparse inspection fails closed without filesystem mutation capability',
    );

    const failedReparseProbe = readOnlyProbe({
      inspectReparsePoints() {
        throw Object.assign(new Error('native attribute inspection failed'), { code: 'EIO' });
      },
    });
    expectConflict(
      opaqueReparseRoot,
      '.omp-flow/config.json',
      'native-check-failed',
      check,
      failedReparseProbe.fileSystem,
    );
    check(
      failedReparseProbe.operations.every(isReadOnlyProbeOperation),
      'failed native reparse inspection fails closed without filesystem mutation capability',
    );

    if (process.platform === 'win32') {
      const junction = linkedFixture(
        temporaryRoot,
        'windows-junction',
        '.omp-flow/vendor',
        '.omp-flow/vendor/flow-status/supervisor.js',
      );
      expectConflict(junction.repository, junction.logicalTarget, 'linked-ancestor', check);
      const symbolicRepository = path.join(temporaryRoot, 'windows-symbolic-link');
      const symbolicExternal = path.join(temporaryRoot, 'windows-symbolic-link-external');
      fs.mkdirSync(path.join(symbolicRepository, '.claude'), { recursive: true });
      fs.mkdirSync(symbolicExternal);
      const symbolicLink = path.join(symbolicRepository, '.claude', 'profile');
      try {
        fs.symlinkSync(symbolicExternal, symbolicLink, 'dir');
        expectConflict(
          symbolicRepository,
          '.claude/profile/settings.json',
          'linked-ancestor',
          check,
        );
      } catch (error) {
        if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'EPERM') {
          throw error;
        }
        console.log('destination confinement: Windows symbolic-link fixture skipped (host privilege unavailable)');
      }
    } else {
      console.log('destination confinement: Windows junction/reparse fixture skipped (non-Windows host)');
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let checks = 0;
  runDestinationConfinementTests((condition, message): asserts condition => {
    assert(condition, message);
    checks += 1;
  });
  console.log(`destination confinement tests passed (${checks} checks)`);
}
