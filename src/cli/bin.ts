#!/usr/bin/env node

import { CLI } from './cli';

const cli = new CLI();
cli.run(process.argv.slice(2)).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
