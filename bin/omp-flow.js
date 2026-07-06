#!/usr/bin/env node

import { runCLI } from '../dist/cli/index.js';

runCLI(process.argv).catch((err) => {
  console.error('[omp-flow Error]', err.message || err);
  process.exit(1);
});
