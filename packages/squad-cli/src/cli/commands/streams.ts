/**
 * CLI command: squad streams
 *
 * Subcommands:
 *   list      — Show configured streams
 *   status    — Show activity per stream (branches, PRs)
 *   activate  — Write .squad-stream file to activate a stream
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadStreamsConfig, resolveStream } from '@bradygaster/squad-sdk';
import type { StreamDefinition } from '@bradygaster/squad-sdk';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

/**
 * Entry point for `squad streams` subcommand.
 */
export async function runStreams(cwd: string, args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === 'list') {
    return listStreams(cwd);
  }
  if (sub === 'status') {
    return showStreamStatus(cwd);
  }
  if (sub === 'activate') {
    const name = args[1];
    if (!name) {
      console.error(`${RED}✗${RESET} Usage: squad streams activate <name>`);
      process.exit(1);
    }
    return activateStream(cwd, name);
  }

  console.error(`${RED}✗${RESET} Unknown streams subcommand: ${sub}`);
  console.log(`\nUsage: squad streams <list|status|activate <name>>`);
  process.exit(1);
}

/**
 * List configured streams.
 */
function listStreams(cwd: string): void {
  const config = loadStreamsConfig(cwd);
  const active = resolveStream(cwd);

  if (!config || config.streams.length === 0) {
    console.log(`\n${DIM}No streams configured.${RESET}`);
    console.log(`${DIM}Create .squad/streams.json to define streams.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}Configured Streams${RESET}\n`);
  console.log(`  Default workflow: ${config.defaultWorkflow}\n`);

  for (const stream of config.streams) {
    const isActive = active?.name === stream.name;
    const marker = isActive ? `${GREEN}● active${RESET}` : `${DIM}○${RESET}`;
    const workflow = stream.workflow ?? config.defaultWorkflow;
    console.log(`  ${marker}  ${BOLD}${stream.name}${RESET}`);
    console.log(`       Label: ${stream.labelFilter}`);
    console.log(`       Workflow: ${workflow}`);
    if (stream.folderScope?.length) {
      console.log(`       Folders: ${stream.folderScope.join(', ')}`);
    }
    if (stream.description) {
      console.log(`       ${DIM}${stream.description}${RESET}`);
    }
    console.log();
  }

  if (active) {
    console.log(`  ${DIM}Active stream resolved via: ${active.source}${RESET}\n`);
  }
}

/**
 * Show activity per stream (branches, PRs via gh CLI).
 */
function showStreamStatus(cwd: string): void {
  const config = loadStreamsConfig(cwd);
  const active = resolveStream(cwd);

  if (!config || config.streams.length === 0) {
    console.log(`\n${DIM}No streams configured.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}Stream Status${RESET}\n`);

  for (const stream of config.streams) {
    const isActive = active?.name === stream.name;
    const marker = isActive ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;
    console.log(`  ${marker} ${BOLD}${stream.name}${RESET} (${stream.labelFilter})`);

    // Try to get PR and branch info via gh CLI
    try {
      const prOutput = execSync(
        `gh pr list --label "${stream.labelFilter}" --json number,title,state --limit 5`,
        { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const prs = JSON.parse(prOutput) as Array<{ number: number; title: string; state: string }>;
      if (prs.length > 0) {
        console.log(`    ${YELLOW}PRs:${RESET}`);
        for (const pr of prs) {
          console.log(`      #${pr.number} ${pr.title} (${pr.state})`);
        }
      } else {
        console.log(`    ${DIM}No open PRs${RESET}`);
      }
    } catch {
      console.log(`    ${DIM}(gh CLI not available — skipping PR lookup)${RESET}`);
    }

    // Try to get branch info
    try {
      const branchOutput = execSync(
        `git branch --list "*${stream.name}*"`,
        { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const branches = branchOutput.trim().split('\n').filter(Boolean);
      if (branches.length > 0) {
        console.log(`    ${YELLOW}Branches:${RESET}`);
        for (const branch of branches) {
          console.log(`      ${branch.trim()}`);
        }
      }
    } catch {
      // Git not available — skip
    }

    console.log();
  }
}

/**
 * Activate a stream by writing .squad-stream file.
 */
function activateStream(cwd: string, name: string): void {
  const config = loadStreamsConfig(cwd);

  // Validate the stream exists in config (warn if not, but still allow)
  if (config) {
    const found = config.streams.find(s => s.name === name);
    if (!found) {
      console.log(`${YELLOW}⚠${RESET} Stream "${name}" not found in .squad/streams.json`);
      console.log(`  Available: ${config.streams.map(s => s.name).join(', ')}`);
      console.log(`  Writing .squad-stream anyway...\n`);
    }
  }

  const streamFilePath = path.join(cwd, '.squad-stream');
  fs.writeFileSync(streamFilePath, name + '\n', 'utf-8');
  console.log(`${GREEN}✓${RESET} Activated stream: ${BOLD}${name}${RESET}`);
  console.log(`  Written to: ${streamFilePath}`);
  console.log(`${DIM}  (This file is gitignored — it's local to your machine/Codespace)${RESET}\n`);
}
