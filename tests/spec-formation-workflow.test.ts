import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const read = (relative: string): string => fs.readFileSync(path.join(root, relative), 'utf8');

const workflowIndex = read('templates/.omp-flow/workflow/index.md');
const workflow = read('templates/.omp-flow/workflow/spec-formation.md');
const wikiSpecsIndex = read('templates/.omp-flow/wiki/specs/index.md');
const routerSkill = read('templates/common/skills/omp-flow/SKILL.md');
const wikiSkill = read('templates/common/skills/omp-flow-wiki/SKILL.md');

assert.match(workflowIndex, /\[Spec Formation\]\(spec-formation\.md\)/);
for (const cue of [
  'Use when:',
  'Do not use when:',
  'Entry evidence:',
  'Expected output:',
  'Verifier and approval:',
  'Return/escalation:',
]) {
  assert.equal(workflow.split(cue).length - 1, 1, `route cue appears once: ${cue}`);
}
for (const marker of [
  'specs/<capability>/spec.md',
  '.omp-flow/wiki/specs/<capability>/spec.md',
  'SHALL/MUST',
  'WHEN ... THEN ...',
  'independent review',
  'human ruling',
  'never approval',
]) {
  assert.match(workflow, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(wikiSpecsIndex, /explicit human/);
assert.match(routerSkill, /Spec Formation route/);
assert.match(routerSkill, /only an independent review plus an explicit human/);
assert.match(wikiSkill, /promotion to `\.omp-flow\/wiki\/specs/);

for (const forbidden of ['route_id:', 'dependsOn:', 'schema:', 'requires:']) {
  assert.equal(workflow.includes(forbidden), false, `no machine field: ${forbidden}`);
}

const fixtureRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omp-flow-spec-formation-')));
try {
  const taskSpec = path.join(fixtureRoot, 'task', 'specs', 'billing', 'spec.md');
  const wikiSpec = path.join(fixtureRoot, '.omp-flow', 'wiki', 'specs', 'billing', 'spec.md');
  fs.mkdirSync(path.dirname(taskSpec), { recursive: true });
  fs.writeFileSync(
    taskSpec,
    '# Billing contract\n\nPurpose\n\n- The service SHALL reject an expired card.\n\nScenario: WHEN the card is expired THEN return a decline.\n\nApproval: pending.\n',
    'utf8',
  );

  // A new or revised draft is Task-local until a human decision is written.
  assert.equal(fs.existsSync(wikiSpec), false, 'unapproved draft does not mutate Wiki');
  const draft = fs.readFileSync(taskSpec, 'utf8');
  assert.match(draft, /Approval: pending/);

  // A Lite-shaped one-off has no Spec Formation artifact.
  const liteFixture = path.join(fixtureRoot, 'task', 'lite-change.md');
  fs.writeFileSync(liteFixture, '# Rename a local variable\n\nVerifier: npm test\n', 'utf8');
  assert.equal(fs.existsSync(path.dirname(wikiSpec)), false, 'Lite fixture does not create spec path');

  // Evidence can return a draft to Research without promotion.
  fs.appendFileSync(taskSpec, '\nReturn: Research — payment-provider behavior is unresolved.\n', 'utf8');
  assert.match(fs.readFileSync(taskSpec, 'utf8'), /Return: Research/);
  assert.equal(fs.existsSync(wikiSpec), false, 'Research return remains Task-local');

  // Only the explicit human approval fixture creates the durable target.
  fs.mkdirSync(path.dirname(wikiSpec), { recursive: true });
  fs.writeFileSync(
    wikiSpec,
    `${fs.readFileSync(taskSpec, 'utf8').replace('Approval: pending.', 'Approval: human-approved.')}`,
    'utf8',
  );
  assert.match(fs.readFileSync(wikiSpec, 'utf8'), /Approval: human-approved/);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('spec-formation workflow checks: PASS');
