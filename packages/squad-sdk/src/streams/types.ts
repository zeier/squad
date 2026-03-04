/**
 * Stream Types — Type definitions for Squad Streams.
 *
 * Streams enable horizontal scaling by allowing multiple Squad instances
 * (e.g., in different Codespaces) to each handle a scoped subset of work.
 *
 * @module streams/types
 */

/** Definition of a single stream (team partition). */
export interface StreamDefinition {
  /** Stream name, e.g., "ui-team", "backend-team" */
  name: string;
  /** GitHub label to filter issues by, e.g., "team:ui" */
  labelFilter: string;
  /** Optional folder restrictions, e.g., ["apps/web"] */
  folderScope?: string[];
  /** Workflow mode. Default: branch-per-issue */
  workflow?: 'branch-per-issue' | 'direct';
  /** Human-readable description of this stream's purpose */
  description?: string;
}

/** Top-level streams configuration (stored in .squad/streams.json). */
export interface StreamConfig {
  /** All configured streams */
  streams: StreamDefinition[];
  /** Default workflow for streams that don't specify one */
  defaultWorkflow: 'branch-per-issue' | 'direct';
}

/** A resolved stream with provenance information. */
export interface ResolvedStream {
  /** Stream name */
  name: string;
  /** Full stream definition */
  definition: StreamDefinition;
  /** How this stream was resolved */
  source: 'env' | 'file' | 'config';
}
