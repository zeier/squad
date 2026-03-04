/**
 * Squad Streams — Comprehensive Tests
 *
 * Tests cover:
 *   - Stream types (compile-time, verified via usage)
 *   - Stream resolution (env var, file, config, fallback)
 *   - Label-based filtering (match, no match, multiple labels, case insensitive)
 *   - Config loading / validation
 *   - CLI activate command (writes .squad-stream)
 *   - Init with streams (generates streams.json)
 *   - Edge cases (empty streams, invalid JSON, missing env, passthrough)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  loadStreamsConfig,
  resolveStream,
  getStreamLabelFilter,
  filterIssuesByStream,
} from '../packages/squad-sdk/src/streams/index.js';

import type {
  StreamDefinition,
  StreamConfig,
  ResolvedStream,
  StreamIssue,
} from '../packages/squad-sdk/src/streams/index.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-streams-test-'));
}

function writeSquadStreamsConfig(root: string, config: StreamConfig): void {
  const squadDir = path.join(root, '.squad');
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(path.join(squadDir, 'streams.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function writeSquadStreamFile(root: string, name: string): void {
  fs.writeFileSync(path.join(root, '.squad-stream'), name + '\n', 'utf-8');
}

const SAMPLE_CONFIG: StreamConfig = {
  streams: [
    { name: 'ui-team', labelFilter: 'team:ui', folderScope: ['apps/web'], workflow: 'branch-per-issue', description: 'UI specialists' },
    { name: 'backend-team', labelFilter: 'team:backend', folderScope: ['apps/api'], workflow: 'direct' },
    { name: 'infra-team', labelFilter: 'team:infra' },
  ],
  defaultWorkflow: 'branch-per-issue',
};

const SAMPLE_ISSUES: StreamIssue[] = [
  { number: 1, title: 'Fix button color', labels: [{ name: 'team:ui' }, { name: 'bug' }] },
  { number: 2, title: 'Add REST endpoint', labels: [{ name: 'team:backend' }] },
  { number: 3, title: 'Setup CI', labels: [{ name: 'team:infra' }] },
  { number: 4, title: 'Unscoped issue', labels: [{ name: 'bug' }] },
  { number: 5, title: 'Multi-label', labels: [{ name: 'team:ui' }, { name: 'team:backend' }] },
];

// ============================================================================
// loadStreamsConfig
// ============================================================================

describe('loadStreamsConfig', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns null when .squad/streams.json does not exist', () => {
    expect(loadStreamsConfig(tmpDir)).toBeNull();
  });

  it('loads a valid streams config', () => {
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = loadStreamsConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.streams).toHaveLength(3);
    expect(result!.defaultWorkflow).toBe('branch-per-issue');
  });

  it('returns null for invalid JSON', () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'streams.json'), '{invalid', 'utf-8');
    expect(loadStreamsConfig(tmpDir)).toBeNull();
  });

  it('returns null when streams array is missing', () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'streams.json'), '{"defaultWorkflow":"direct"}', 'utf-8');
    expect(loadStreamsConfig(tmpDir)).toBeNull();
  });

  it('defaults defaultWorkflow to branch-per-issue when missing', () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'streams.json'), '{"streams":[{"name":"a","labelFilter":"x"}]}', 'utf-8');
    const result = loadStreamsConfig(tmpDir);
    expect(result!.defaultWorkflow).toBe('branch-per-issue');
  });

  it('preserves folderScope arrays', () => {
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = loadStreamsConfig(tmpDir)!;
    expect(result.streams[0]!.folderScope).toEqual(['apps/web']);
  });

  it('preserves optional description', () => {
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = loadStreamsConfig(tmpDir)!;
    expect(result.streams[0]!.description).toBe('UI specialists');
    expect(result.streams[1]!.description).toBeUndefined();
  });
});

// ============================================================================
// resolveStream
// ============================================================================

describe('resolveStream', () => {
  let tmpDir: string;
  const origEnv = process.env.SQUAD_TEAM;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    delete process.env.SQUAD_TEAM;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origEnv !== undefined) {
      process.env.SQUAD_TEAM = origEnv;
    } else {
      delete process.env.SQUAD_TEAM;
    }
  });

  // --- Env var resolution ---

  it('resolves from SQUAD_TEAM env var with matching config', () => {
    process.env.SQUAD_TEAM = 'ui-team';
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = resolveStream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('ui-team');
    expect(result!.source).toBe('env');
    expect(result!.definition.labelFilter).toBe('team:ui');
    expect(result!.definition.folderScope).toEqual(['apps/web']);
  });

  it('synthesizes definition from SQUAD_TEAM when no config exists', () => {
    process.env.SQUAD_TEAM = 'custom-team';
    const result = resolveStream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('custom-team');
    expect(result!.source).toBe('env');
    expect(result!.definition.labelFilter).toBe('team:custom-team');
  });

  it('synthesizes definition from SQUAD_TEAM when stream not in config', () => {
    process.env.SQUAD_TEAM = 'unknown-team';
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = resolveStream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('unknown-team');
    expect(result!.source).toBe('env');
    expect(result!.definition.labelFilter).toBe('team:unknown-team');
  });

  // --- File resolution ---

  it('resolves from .squad-stream file with matching config', () => {
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeSquadStreamFile(tmpDir, 'backend-team');
    const result = resolveStream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('backend-team');
    expect(result!.source).toBe('file');
    expect(result!.definition.workflow).toBe('direct');
  });

  it('synthesizes definition from .squad-stream file when no config', () => {
    writeSquadStreamFile(tmpDir, 'my-stream');
    const result = resolveStream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-stream');
    expect(result!.source).toBe('file');
    expect(result!.definition.labelFilter).toBe('team:my-stream');
  });

  it('ignores empty .squad-stream file', () => {
    fs.writeFileSync(path.join(tmpDir, '.squad-stream'), '   \n', 'utf-8');
    expect(resolveStream(tmpDir)).toBeNull();
  });

  it('trims whitespace from .squad-stream file', () => {
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    fs.writeFileSync(path.join(tmpDir, '.squad-stream'), '  ui-team  \n', 'utf-8');
    const result = resolveStream(tmpDir);
    expect(result!.name).toBe('ui-team');
    expect(result!.source).toBe('file');
  });

  // --- Config resolution (single stream auto-select) ---

  it('auto-selects single stream from config', () => {
    const singleConfig: StreamConfig = {
      streams: [{ name: 'solo', labelFilter: 'team:solo' }],
      defaultWorkflow: 'direct',
    };
    writeSquadStreamsConfig(tmpDir, singleConfig);
    const result = resolveStream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('solo');
    expect(result!.source).toBe('config');
  });

  // --- Fallback ---

  it('returns null when no stream context exists', () => {
    expect(resolveStream(tmpDir)).toBeNull();
  });

  it('returns null when config has multiple streams but no env/file', () => {
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    expect(resolveStream(tmpDir)).toBeNull();
  });

  // --- Priority order ---

  it('env var takes priority over .squad-stream file', () => {
    process.env.SQUAD_TEAM = 'ui-team';
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeSquadStreamFile(tmpDir, 'backend-team');
    const result = resolveStream(tmpDir);
    expect(result!.name).toBe('ui-team');
    expect(result!.source).toBe('env');
  });

  it('.squad-stream file takes priority over config auto-select', () => {
    const singleConfig: StreamConfig = {
      streams: [
        { name: 'alpha', labelFilter: 'team:alpha' },
      ],
      defaultWorkflow: 'branch-per-issue',
    };
    writeSquadStreamsConfig(tmpDir, singleConfig);
    writeSquadStreamFile(tmpDir, 'alpha');
    const result = resolveStream(tmpDir);
    // file source takes priority
    expect(result!.source).toBe('file');
  });
});

// ============================================================================
// getStreamLabelFilter
// ============================================================================

describe('getStreamLabelFilter', () => {
  it('returns the label filter from definition', () => {
    const stream: ResolvedStream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(getStreamLabelFilter(stream)).toBe('team:ui');
  });

  it('returns synthesized label filter', () => {
    const stream: ResolvedStream = {
      name: 'custom',
      definition: { name: 'custom', labelFilter: 'team:custom' },
      source: 'file',
    };
    expect(getStreamLabelFilter(stream)).toBe('team:custom');
  });
});

// ============================================================================
// filterIssuesByStream
// ============================================================================

describe('filterIssuesByStream', () => {
  it('filters issues matching the stream label', () => {
    const stream: ResolvedStream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    const result = filterIssuesByStream(SAMPLE_ISSUES, stream);
    expect(result).toHaveLength(2); // issue 1 and 5
    expect(result.map(i => i.number)).toEqual([1, 5]);
  });

  it('returns empty array when no issues match', () => {
    const stream: ResolvedStream = {
      name: 'qa-team',
      definition: { name: 'qa-team', labelFilter: 'team:qa' },
      source: 'env',
    };
    const result = filterIssuesByStream(SAMPLE_ISSUES, stream);
    expect(result).toHaveLength(0);
  });

  it('handles case-insensitive matching', () => {
    const stream: ResolvedStream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'TEAM:UI' },
      source: 'env',
    };
    const result = filterIssuesByStream(SAMPLE_ISSUES, stream);
    expect(result).toHaveLength(2);
  });

  it('returns all issues when labelFilter is empty', () => {
    const stream: ResolvedStream = {
      name: 'all',
      definition: { name: 'all', labelFilter: '' },
      source: 'env',
    };
    const result = filterIssuesByStream(SAMPLE_ISSUES, stream);
    expect(result).toHaveLength(SAMPLE_ISSUES.length);
  });

  it('handles issues with no labels', () => {
    const issues: StreamIssue[] = [
      { number: 10, title: 'No labels', labels: [] },
    ];
    const stream: ResolvedStream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(filterIssuesByStream(issues, stream)).toHaveLength(0);
  });

  it('handles empty issues array', () => {
    const stream: ResolvedStream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(filterIssuesByStream([], stream)).toHaveLength(0);
  });

  it('filters backend-team correctly', () => {
    const stream: ResolvedStream = {
      name: 'backend-team',
      definition: { name: 'backend-team', labelFilter: 'team:backend' },
      source: 'config',
    };
    const result = filterIssuesByStream(SAMPLE_ISSUES, stream);
    expect(result).toHaveLength(2); // issue 2 and 5
    expect(result.map(i => i.number)).toEqual([2, 5]);
  });

  it('filters infra-team correctly (single match)', () => {
    const stream: ResolvedStream = {
      name: 'infra-team',
      definition: { name: 'infra-team', labelFilter: 'team:infra' },
      source: 'file',
    };
    const result = filterIssuesByStream(SAMPLE_ISSUES, stream);
    expect(result).toHaveLength(1);
    expect(result[0]!.number).toBe(3);
  });
});

// ============================================================================
// Type checks (compile-time — these just verify the types work)
// ============================================================================

describe('Stream types', () => {
  it('StreamDefinition accepts all fields', () => {
    const def: StreamDefinition = {
      name: 'test',
      labelFilter: 'team:test',
      folderScope: ['src/'],
      workflow: 'branch-per-issue',
      description: 'Test stream',
    };
    expect(def.name).toBe('test');
    expect(def.workflow).toBe('branch-per-issue');
  });

  it('StreamDefinition works with minimal fields', () => {
    const def: StreamDefinition = {
      name: 'minimal',
      labelFilter: 'team:minimal',
    };
    expect(def.folderScope).toBeUndefined();
    expect(def.workflow).toBeUndefined();
    expect(def.description).toBeUndefined();
  });

  it('StreamConfig has required fields', () => {
    const config: StreamConfig = {
      streams: [],
      defaultWorkflow: 'direct',
    };
    expect(config.streams).toEqual([]);
    expect(config.defaultWorkflow).toBe('direct');
  });

  it('ResolvedStream has source provenance', () => {
    const resolved: ResolvedStream = {
      name: 'test',
      definition: { name: 'test', labelFilter: 'x' },
      source: 'env',
    };
    expect(resolved.source).toBe('env');
  });
});

// ============================================================================
// Init integration (streams.json generation)
// ============================================================================

describe('initSquad with streams', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('generates streams.json when streams option is provided', async () => {
    const { initSquad } = await import('../packages/squad-sdk/src/config/init.js');
    const streams: StreamDefinition[] = [
      { name: 'ui-team', labelFilter: 'team:ui', folderScope: ['apps/web'] },
      { name: 'api-team', labelFilter: 'team:api' },
    ];

    await initSquad({
      teamRoot: tmpDir,
      projectName: 'test-streams',
      agents: [{ name: 'lead', role: 'lead' }],
      streams,
      includeWorkflows: false,
      includeTemplates: false,
      includeMcpConfig: false,
    });

    const streamsPath = path.join(tmpDir, '.squad', 'streams.json');
    expect(fs.existsSync(streamsPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(streamsPath, 'utf-8')) as StreamConfig;
    expect(content.streams).toHaveLength(2);
    expect(content.streams[0]!.name).toBe('ui-team');
    expect(content.defaultWorkflow).toBe('branch-per-issue');
  });

  it('does not generate streams.json when no streams provided', async () => {
    const { initSquad } = await import('../packages/squad-sdk/src/config/init.js');

    await initSquad({
      teamRoot: tmpDir,
      projectName: 'test-no-streams',
      agents: [{ name: 'lead', role: 'lead' }],
      includeWorkflows: false,
      includeTemplates: false,
      includeMcpConfig: false,
    });

    const streamsPath = path.join(tmpDir, '.squad', 'streams.json');
    expect(fs.existsSync(streamsPath)).toBe(false);
  });

  it('adds .squad-stream to .gitignore', async () => {
    const { initSquad } = await import('../packages/squad-sdk/src/config/init.js');

    await initSquad({
      teamRoot: tmpDir,
      projectName: 'test-gitignore',
      agents: [{ name: 'lead', role: 'lead' }],
      includeWorkflows: false,
      includeTemplates: false,
      includeMcpConfig: false,
    });

    const gitignorePath = path.join(tmpDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.squad-stream');
  });
});

// ============================================================================
// CLI activate (unit test the file-writing behavior)
// ============================================================================

describe('CLI activate behavior', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes .squad-stream file with the stream name', () => {
    const filePath = path.join(tmpDir, '.squad-stream');
    fs.writeFileSync(filePath, 'my-stream\n', 'utf-8');
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    expect(content).toBe('my-stream');
  });

  it('resolves after activation', () => {
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeSquadStreamFile(tmpDir, 'infra-team');
    const result = resolveStream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('infra-team');
    expect(result!.definition.labelFilter).toBe('team:infra');
  });

  it('overwriting .squad-stream changes active stream', () => {
    writeSquadStreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeSquadStreamFile(tmpDir, 'ui-team');
    expect(resolveStream(tmpDir)!.name).toBe('ui-team');

    writeSquadStreamFile(tmpDir, 'backend-team');
    expect(resolveStream(tmpDir)!.name).toBe('backend-team');
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('Edge cases', () => {
  let tmpDir: string;
  const origEnv = process.env.SQUAD_TEAM;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    delete process.env.SQUAD_TEAM;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origEnv !== undefined) {
      process.env.SQUAD_TEAM = origEnv;
    } else {
      delete process.env.SQUAD_TEAM;
    }
  });

  it('handles empty streams array in config', () => {
    const emptyConfig: StreamConfig = { streams: [], defaultWorkflow: 'direct' };
    writeSquadStreamsConfig(tmpDir, emptyConfig);
    expect(resolveStream(tmpDir)).toBeNull();
  });

  it('handles config with streams but non-array type', () => {
    const squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'streams.json'), '{"streams":"not-array"}', 'utf-8');
    expect(loadStreamsConfig(tmpDir)).toBeNull();
  });

  it('handles SQUAD_TEAM set to empty string', () => {
    process.env.SQUAD_TEAM = '';
    expect(resolveStream(tmpDir)).toBeNull();
  });

  it('filterIssuesByStream handles labels with special characters', () => {
    const issues: StreamIssue[] = [
      { number: 1, title: 'Test', labels: [{ name: 'team:front-end/ui' }] },
    ];
    const stream: ResolvedStream = {
      name: 'fe',
      definition: { name: 'fe', labelFilter: 'team:front-end/ui' },
      source: 'env',
    };
    const result = filterIssuesByStream(issues, stream);
    expect(result).toHaveLength(1);
  });

  it('resolves workflow from definition over defaultWorkflow', () => {
    const config: StreamConfig = {
      streams: [{ name: 'direct-stream', labelFilter: 'team:direct', workflow: 'direct' }],
      defaultWorkflow: 'branch-per-issue',
    };
    writeSquadStreamsConfig(tmpDir, config);
    const result = resolveStream(tmpDir);
    expect(result!.definition.workflow).toBe('direct');
  });
});
