/**
 * Stream Resolver — Resolves which stream is active.
 *
 * Resolution order:
 *   1. SQUAD_TEAM env var → look up in streams config
 *   2. .squad-stream file (gitignored) → contains stream name
 *   3. squad.config.ts → streams.active field (via .squad/streams.json)
 *   4. null (no stream — single-squad mode)
 *
 * @module streams/resolver
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { StreamConfig, StreamDefinition, ResolvedStream } from './types.js';

/**
 * Load streams configuration from .squad/streams.json.
 *
 * @param squadRoot - Root directory of the project (where .squad/ lives)
 * @returns Parsed StreamConfig or null if not found / invalid
 */
export function loadStreamsConfig(squadRoot: string): StreamConfig | null {
  const configPath = join(squadRoot, '.squad', 'streams.json');
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as StreamConfig;

    // Basic validation
    if (!parsed.streams || !Array.isArray(parsed.streams)) {
      return null;
    }

    // Ensure defaultWorkflow has a value
    if (!parsed.defaultWorkflow) {
      parsed.defaultWorkflow = 'branch-per-issue';
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Find a stream definition by name in a config.
 */
function findStream(config: StreamConfig, name: string): StreamDefinition | undefined {
  return config.streams.find(s => s.name === name);
}

/**
 * Resolve which stream is active for the current environment.
 *
 * @param squadRoot - Root directory of the project
 * @returns ResolvedStream or null if no stream is active
 */
export function resolveStream(squadRoot: string): ResolvedStream | null {
  const config = loadStreamsConfig(squadRoot);

  // 1. SQUAD_TEAM env var
  const envTeam = process.env.SQUAD_TEAM;
  if (envTeam) {
    if (config) {
      const def = findStream(config, envTeam);
      if (def) {
        return { name: envTeam, definition: def, source: 'env' };
      }
    }
    // Env var set but no matching stream config — synthesize a minimal definition
    return {
      name: envTeam,
      definition: {
        name: envTeam,
        labelFilter: `team:${envTeam}`,
      },
      source: 'env',
    };
  }

  // 2. .squad-stream file
  const streamFilePath = join(squadRoot, '.squad-stream');
  if (existsSync(streamFilePath)) {
    try {
      const streamName = readFileSync(streamFilePath, 'utf-8').trim();
      if (streamName) {
        if (config) {
          const def = findStream(config, streamName);
          if (def) {
            return { name: streamName, definition: def, source: 'file' };
          }
        }
        // File exists but no config — synthesize
        return {
          name: streamName,
          definition: {
            name: streamName,
            labelFilter: `team:${streamName}`,
          },
          source: 'file',
        };
      }
    } catch {
      // Ignore read errors
    }
  }

  // 3. streams.json with an "active" field (convention: first stream if only one)
  if (config && config.streams.length === 1) {
    const def = config.streams[0]!;
    return { name: def.name, definition: def, source: 'config' };
  }

  // 4. No stream detected
  return null;
}

/**
 * Get the GitHub label filter string for a resolved stream.
 *
 * @param stream - The resolved stream
 * @returns Label filter string (e.g., "team:ui")
 */
export function getStreamLabelFilter(stream: ResolvedStream): string {
  return stream.definition.labelFilter;
}
