#!/usr/bin/env node

import { CLI } from './cli';

const cli = new CLI();
cli.run(process.argv.slice(2));
