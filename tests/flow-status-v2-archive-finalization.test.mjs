import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const taskId = '07-30-omp-flow-tui-control';
const archiveMonth = '2026-07';
const activeBundle = `.omp-flow/tasks/${taskId}`;
const archivedBundle = `.omp-flow/tasks/archive/${archiveMonth}/${taskId}`;
const requestedMode = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'auto';

assert(
  ['auto', 'simulate', 'post-move'].includes(requestedMode),
  `unsupported mode: ${requestedMode}`,
);

const exists = relative => fs.existsSync(path.join(repositoryRoot, ...relative.split('/')));
const activeExists = exists(activeBundle);
const archivedExists = exists(archivedBundle);
const mode = requestedMode === 'auto'
  ? archivedExists && !activeExists ? 'post-move' : 'simulate'
  : requestedMode;

if (mode === 'simulate') {
  assert(activeExists, `active Bundle is missing: ${activeBundle}`);
  assert(!archivedExists, `archive destination already exists: ${archivedBundle}`);
} else {
  assert(!activeExists, `active Bundle still exists after archive: ${activeBundle}`);
  assert(archivedExists, `archived Bundle is missing: ${archivedBundle}`);
}

const physicalBundle = mode === 'simulate' ? activeBundle : archivedBundle;
const physicalBundlePath = path.join(repositoryRoot, ...physicalBundle.split('/'));

function walkMarkdown(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(candidate));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(candidate);
  }
  return files;
}

function withoutCode(markdown) {
  let fenced = false;
  let marker = '';
  return markdown.split(/\r?\n/).map(line => {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (!fenced) {
        fenced = true;
        marker = fence[1][0];
      } else if (fence[1][0] === marker) {
        fenced = false;
      }
      return '';
    }
    return fenced ? '' : line.replace(/`+[^`]*`+/g, '');
  }).join('\n');
}

function withoutFencedCode(markdown) {
  let fenced = false;
  let marker = '';
  return markdown.split(/\r?\n/).map(line => {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (!fenced) {
        fenced = true;
        marker = fence[1][0];
      } else if (fence[1][0] === marker) {
        fenced = false;
      }
      return '';
    }
    return fenced ? '' : line;
  }).join('\n');
}

function linkDestinations(markdown) {
  const destinations = [];
  const source = withoutCode(markdown);
  const pattern = /!?\[[^\]]*]\(([^)]+)\)/g;
  for (const match of source.matchAll(pattern)) {
    const raw = match[1].trim();
    const destination = raw.startsWith('<')
      ? raw.slice(1, raw.indexOf('>'))
      : raw.split(/\s+(?=["'])/)[0];
    destinations.push(destination.replace(/\\([()])/g, '$1'));
  }
  return destinations;
}

function repositoryRootMarkdownReferences(markdown) {
  return [...withoutFencedCode(markdown)
    .matchAll(/`(\.omp-flow\/wiki\/[^`\r\n#?]+?\.md)(?:#([^`\s]+))?`/g)]
    .map(match => {
      let target;
      let fragment;
      try {
        target = decodeURIComponent(match[1]);
        fragment = match[2] ? decodeURIComponent(match[2]) : '';
      } catch {
        assert.fail(`invalid URL encoding in repository-root reference: ${match[0]}`);
      }
      const normalized = path.posix.normalize(target);
      assert(
        normalized.startsWith('.omp-flow/wiki/') && !normalized.includes('/../'),
        `repository-root Wiki reference escapes its boundary: ${match[0]}`,
      );
      return { target: normalized, fragment, source: match[0] };
    });
}

function resolveTarget(sourceRelative, destination) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith('//')) return null;
  const hashAt = destination.indexOf('#');
  const pathPart = hashAt === -1 ? destination : destination.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : decodeURIComponent(destination.slice(hashAt + 1));
  const queryless = pathPart.split('?')[0];
  let decoded;
  try {
    decoded = decodeURIComponent(queryless);
  } catch {
    assert.fail(`invalid URL encoding in ${sourceRelative}: ${destination}`);
  }
  const target = decoded
    ? path.posix.normalize(path.posix.join(path.posix.dirname(sourceRelative), decoded))
    : sourceRelative;
  assert(
    target !== '..' && !target.startsWith('../') && !path.posix.isAbsolute(target),
    `link escapes repository in ${sourceRelative}: ${destination}`,
  );
  return { target, fragment };
}

function physicalTarget(logicalTarget) {
  if (logicalTarget === archivedBundle || logicalTarget.startsWith(`${archivedBundle}/`)) {
    const suffix = logicalTarget.slice(archivedBundle.length).replace(/^\//, '');
    return path.join(physicalBundlePath, ...suffix.split('/').filter(Boolean));
  }
  return path.join(repositoryRoot, ...logicalTarget.split('/'));
}

function headingAnchors(markdown) {
  const anchors = new Set();
  const occurrences = new Map();
  for (const explicit of markdown.matchAll(/<(?:a|[^>]+\s) *(?:id|name)=["']([^"']+)["'][^>]*>/gi)) {
    anchors.add(explicit[1]);
  }
  for (const line of withoutFencedCode(markdown).split(/\r?\n/)) {
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;
    const plain = heading[1]
      .replace(/!\[([^\]]*)]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~`]/g, '')
      .toLowerCase()
      .trim();
    const base = plain
      .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = occurrences.get(base) ?? 0;
    occurrences.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function validateHeadingFragment(targetPath, fragment, source, failures) {
  assert(fs.statSync(targetPath).isFile(), `anchor target is not a file: ${source}`);
  const anchors = headingAnchors(fs.readFileSync(targetPath, 'utf8'));
  if (!anchors.has(fragment)) failures.push(`${source}: #${fragment}`);
}

let checkedLinks = 0;
let repositoryExternalLinks = 0;
let checkedAnchors = 0;
const brokenTargets = [];
const brokenAnchors = [];
for (const file of walkMarkdown(physicalBundlePath)) {
  const insideBundle = path.relative(physicalBundlePath, file).split(path.sep).join('/');
  const logicalSource = `${archivedBundle}/${insideBundle}`;
  const markdown = fs.readFileSync(file, 'utf8');
  for (const destination of linkDestinations(markdown)) {
    const resolved = resolveTarget(logicalSource, destination);
    if (!resolved) continue;
    checkedLinks += 1;
    if (!(resolved.target === archivedBundle || resolved.target.startsWith(`${archivedBundle}/`))) {
      repositoryExternalLinks += 1;
    }
    const targetPath = physicalTarget(resolved.target);
    if (!fs.existsSync(targetPath)) {
      brokenTargets.push(`${logicalSource}: ${destination}`);
      continue;
    }
    if (resolved.fragment) {
      validateHeadingFragment(
        targetPath,
        resolved.fragment,
        `${logicalSource}: ${destination}`,
        brokenAnchors,
      );
      checkedAnchors += 1;
    }
  }
  for (const repositoryReference of repositoryRootMarkdownReferences(markdown)) {
    repositoryExternalLinks += 1;
    const targetPath = path.join(repositoryRoot, ...repositoryReference.target.split('/'));
    if (!fs.existsSync(targetPath)) {
      brokenTargets.push(`${logicalSource}: ${repositoryReference.source}`);
      continue;
    }
    if (repositoryReference.fragment) {
      validateHeadingFragment(
        targetPath,
        repositoryReference.fragment,
        `${logicalSource}: ${repositoryReference.source}`,
        brokenAnchors,
      );
      checkedAnchors += 1;
    }
  }
}

const adversaryReference = repositoryRootMarkdownReferences(
  '`.omp-flow/wiki/architecture/harness-flow-statusline.md#missing%2Darchive%2Danchor`',
);
assert.deepEqual(
  adversaryReference.map(reference => reference.fragment),
  ['missing-archive-anchor'],
  'repository-root code-form fragment is not preserved and URL-decoded',
);
const adversaryFailures = [];
validateHeadingFragment(
  path.join(repositoryRoot, '.omp-flow', 'wiki', 'architecture', 'harness-flow-statusline.md'),
  adversaryReference[0].fragment,
  'missing-fragment adversary',
  adversaryFailures,
);
assert.deepEqual(
  adversaryFailures,
  ['missing-fragment adversary: #missing-archive-anchor'],
  'missing repository-root code-form fragment did not fail validation',
);

assert.deepEqual(brokenTargets, [], `broken Markdown targets:\n${brokenTargets.join('\n')}`);
assert.deepEqual(brokenAnchors, [], `broken heading anchors:\n${brokenAnchors.join('\n')}`);
assert(checkedLinks > 500, `unexpectedly small Bundle link audit: ${checkedLinks}`);
assert(repositoryExternalLinks > 0, 'repository-external Markdown targets were not audited');
assert(checkedAnchors > 0, 'heading anchors were not audited');

const wikiPages = [
  '.omp-flow/wiki/architecture/harness-flow-statusline.md',
  '.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md',
];
for (const wikiPage of wikiPages) {
  const markdown = fs.readFileSync(path.join(repositoryRoot, ...wikiPage.split('/')), 'utf8');
  const targets = linkDestinations(markdown)
    .map(destination => resolveTarget(wikiPage, destination))
    .filter(Boolean)
    .map(link => link.target);
  assert.equal(
    targets.filter(target => target === `${activeBundle}/index.md`).length,
    0,
    `${wikiPage} retains an active-task backlink`,
  );
  assert.equal(
    targets.filter(target => target === `${archivedBundle}/index.md`).length,
    1,
    `${wikiPage} must contain exactly one archived Bundle backlink`,
  );
  assert(
    fs.existsSync(physicalTarget(`${archivedBundle}/index.md`)),
    `${wikiPage} archived backlink does not resolve in ${mode} mode`,
  );
}

const requiredText = new Map([
  ['README.md', [
    '### Flow Status 状态栏',
    '@omp-flow/ccstatusline@2.2.27-flowstatus.2',
    'root-task',
    'nativeActivity',
  ]],
  ['.omp-flow/wiki/architecture/harness-flow-statusline.md', [
    '# Harness-native Flow Status line',
    'sole Root Flow publisher',
  ]],
  ['.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md', [
    '# Observe the task people mean',
    '# Count meaningful iterations',
  ]],
]);
for (const [relative, needles] of requiredText) {
  const content = fs.readFileSync(path.join(repositoryRoot, ...relative.split('/')), 'utf8');
  for (const needle of needles) assert(content.includes(needle), `${relative} is missing: ${needle}`);
}

function bundleFile(relative) {
  const candidate = path.join(physicalBundlePath, ...relative.split('/'));
  assert(fs.existsSync(candidate), `required Bundle evidence is missing: ${relative}`);
  return fs.readFileSync(candidate, 'utf8');
}

const completion = bundleFile('completion.md');
assert(completion.includes('# Harness-native Flow Status completion'), 'completion title is missing');
assert(
  completion.includes(`.omp-flow/tasks/archive/${archiveMonth}/${taskId}`),
  'completion does not name the exact archive destination',
);
if (mode === 'post-move') {
  assert(/Status:\s*\*\*COMPLETE/.test(completion), 'post-move completion is not COMPLETE');
  assert(!completion.includes('REOPENED'), 'post-move completion still says REOPENED');
}

const handoff = bundleFile('work/handoffs/flow-status-v2-repair-2.md');
assert(handoff.includes('Status: `DONE`'), 'latest product repair handoff is not DONE');
assert(handoff.includes('22fe32aff8984361bbdfc1a795c2d66b'), 'latest handoff correlation is missing');

const review = bundleFile('review/flow-status-v2-implementation-3.md');
assert(review.includes('Verdict: **ACCEPTED**'), 'latest product Review is not accepted');
assert(
  review.includes('../work/handoffs/flow-status-v2-repair-2.md'),
  'latest accepted Review is not linked to the latest product repair handoff',
);

const archiveHandoff = bundleFile('work/handoffs/flow-status-v2-archive-finalization.md');
assert(archiveHandoff.includes('Status: `DONE`'), 'archive-finalization handoff is not DONE');
assert(
  archiveHandoff.includes('operation: `d76ca52ea0d246b399190458f278ef95`'),
  'archive-finalization handoff operation correlation is missing',
);
assert(
  archiveHandoff.includes('actor: `executor-flowstatus-v2-archive-finalization`'),
  'archive-finalization handoff actor correlation is missing',
);

const archiveReview = bundleFile('review/flow-status-v2-archive-finalization.md');
for (const evidence of [
  'review operation: `cf267086c2f9432c9896c47d104a5315`',
  'reviewer actor: `reviewer-flowstatus-v2-archive-finalization`',
  'completed predecessor: `d76ca52ea0d246b399190458f278ef95`',
  'predecessor actor: `executor-flowstatus-v2-archive-finalization`',
  '../work/handoffs/flow-status-v2-archive-finalization.md',
]) {
  assert(archiveReview.includes(evidence), `archive-finalization Review is missing: ${evidence}`);
}

const repairHandoffRelative = 'work/handoffs/flow-status-v2-archive-finalization-repair.md';
const repairReviewRelative = 'review/flow-status-v2-archive-finalization-repair.md';
const repairHandoffPath = path.join(physicalBundlePath, ...repairHandoffRelative.split('/'));
const repairReviewPath = path.join(physicalBundlePath, ...repairReviewRelative.split('/'));

if (mode === 'post-move') {
  assert(fs.existsSync(repairHandoffPath), `final repair handoff is missing: ${repairHandoffRelative}`);
  assert(fs.existsSync(repairReviewPath), `final repair Review is missing: ${repairReviewRelative}`);
}

if (fs.existsSync(repairHandoffPath)) {
  const repairHandoff = fs.readFileSync(repairHandoffPath, 'utf8');
  for (const evidence of [
    'Status: `DONE`',
    'operation: `9e57c649320249e6947acf55ac64b9de`',
    'actor: `executor-flowstatus-v2-archive-finalization-repair`',
    'predecessor review: `cf267086c2f9432c9896c47d104a5315`',
    '../../review/flow-status-v2-archive-finalization.md',
  ]) {
    assert(repairHandoff.includes(evidence), `final repair handoff is missing: ${evidence}`);
  }
}

if (fs.existsSync(repairReviewPath)) {
  const repairReview = fs.readFileSync(repairReviewPath, 'utf8');
  const reviewerActor = repairReview.match(/reviewer actor:\s*`([^`]+)`/)?.[1];
  assert(reviewerActor, 'final repair Review has no reviewer actor');
  assert.notEqual(
    reviewerActor,
    'executor-flowstatus-v2-archive-finalization-repair',
    'final repair Review actor is not independent',
  );
  for (const evidence of [
    'completed predecessor: `9e57c649320249e6947acf55ac64b9de`',
    'predecessor actor: `executor-flowstatus-v2-archive-finalization-repair`',
    '../work/handoffs/flow-status-v2-archive-finalization-repair.md',
  ]) {
    assert(repairReview.includes(evidence), `final repair Review is missing: ${evidence}`);
  }
  assert(
    /review operation:\s*`[0-9a-f]{32}`/.test(repairReview),
    'final repair Review has no usable operation correlation',
  );
  assert(
    /Verdict:\s*\*\*(?:ACCEPTED|CHANGES_REQUESTED)\*\*/.test(repairReview),
    'final repair Review has no usable verdict',
  );
  if (mode === 'post-move') {
    assert(
      repairReview.includes('Verdict: **ACCEPTED**'),
      'post-move final repair Review is not ACCEPTED',
    );
  }
}

for (const fixture of [
  'tests/fixtures/flow-status/claude-task-events-v2.1.220.json',
  'tests/fixtures/flow-status/oh-my-pi-task-events-v17.2.1.json',
]) {
  assert(exists(fixture), `stable fixture is missing: ${fixture}`);
}
const copiedFixtureDirectory = path.join(physicalBundlePath, 'reference', 'fixtures');
if (fs.existsSync(copiedFixtureDirectory)) {
  const copiedPayloads = fs.readdirSync(copiedFixtureDirectory, { recursive: true })
    .filter(entry => String(entry).endsWith('.json'));
  assert.deepEqual(copiedPayloads, [], 'Bundle still contains copied JSON fixture payloads');
}

console.log(
  `PASS: archive ${mode}; ${checkedLinks} Markdown links, `
    + `${repositoryExternalLinks} repository-external targets, ${checkedAnchors} anchors, `
    + 'missing-fragment adversary',
);
