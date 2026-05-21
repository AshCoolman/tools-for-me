#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildInitCommand } from './commands/init.js';
import { buildDoctorCommand } from './commands/doctor.js';
import { buildPrintCommand } from './commands/print.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = resolve(__dirname, '..', 'src', 'templates');

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string; description: string };

const program = new Command();

program
  .name('cslice')
  .description(pkg.description)
  .version(pkg.version);

buildInitCommand(program, TEMPLATES_ROOT);
buildDoctorCommand(program);
buildPrintCommand(program, TEMPLATES_ROOT);

program.parse(process.argv);
