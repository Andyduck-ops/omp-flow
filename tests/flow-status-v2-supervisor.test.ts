import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runSupervisedChild } from '../src/cli/flow-status-supervisor.js';

type Check = (condition: unknown, message: string) => asserts condition;

export async function runFlowStatusV2SupervisorTests(check: Check): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-status-supervisor-'));
  try {
    const executable = path.join(root, 'renderer.js');
    const config = path.join(root, 'config.json');
    fs.writeFileSync(
      executable,
      "const fs=require('node:fs');const c=JSON.parse(fs.readFileSync(process.argv.at(-1),'utf8'));"
        + "if(c.mode==='hang')setInterval(()=>{},1000);"
        + "else{const x=[];process.stdin.on('data',b=>x.push(b));process.stdin.on('end',()=>"
        + "process.stdout.write(c.mode==='overflow'?'x'.repeat(1000):Buffer.concat(x)));}\n",
      'utf8',
    );
    const spec = {
      executable,
      configPath: config,
      cwd: root,
      expectedExecutableDigest: createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
    };
    fs.writeFileSync(config, '{"mode":"echo"}\n', 'utf8');
    const echo = runSupervisedChild(spec, Buffer.from('Powerline'));
    check((await echo.presentation).toString() === 'Powerline', 'supervisor forwards one bounded successful frame');
    check((await echo.cleanup).timedOut === false, 'successful renderer completes before the deadline');

    fs.writeFileSync(config, '{"mode":"hang"}\n', 'utf8');
    const hung = runSupervisedChild(spec, Buffer.alloc(0), { timeoutMs: 50 });
    const started = Date.now();
    check((await hung.presentation).byteLength === 0, 'hung renderer resolves semantic empty');
    const receipt = await Promise.race([
      hung.cleanup,
      new Promise<never>((_resolve, reject) => setTimeout(
        () => reject(new Error('supervisor cleanup receipt deadline exceeded')),
        1_000,
      )),
    ]);
    check(
      receipt.timedOut
        && receipt.killRequestedAtUnixMs !== null
        && Date.now() - started < 2_000,
      'timeout owns termination and cleanup without blocking the terminal',
    );

    fs.writeFileSync(config, '{"mode":"overflow"}\n', 'utf8');
    const overflow = runSupervisedChild(spec, Buffer.alloc(0), { maxOutput: 32 });
    check((await overflow.presentation).byteLength === 0, 'oversized renderer output is semantic empty');
    const overflowReceipt = await Promise.race([
      overflow.cleanup,
      new Promise<never>((_resolve, reject) => setTimeout(
        () => reject(new Error('overflow cleanup receipt deadline exceeded')),
        1_000,
      )),
    ]);
    check(overflowReceipt.overflow, 'cleanup receipt records bounded-output overflow');
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 100,
    });
  }
}
