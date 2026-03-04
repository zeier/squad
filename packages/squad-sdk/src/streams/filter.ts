/**
 * Stream-Aware Issue Filtering
 *
 * Filters GitHub issues to only those matching a stream's labelFilter.
 * Used by Ralph during triage to scope work to the active stream.
 *
 * @module streams/filter
 */

import type { ResolvedStream } from './types.js';

/** Minimal issue shape for filtering. */
export interface StreamIssue {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
}

/**
 * Filter issues to only those matching the stream's label filter.
 *
 * Matching is case-insensitive. If the stream has no labelFilter,
 * all issues are returned (passthrough).
 *
 * @param issues - Array of issues to filter
 * @param stream - The resolved stream to filter by
 * @returns Filtered array of issues matching the stream's label
 */
export function filterIssuesByStream(
  issues: StreamIssue[],
  stream: ResolvedStream,
): StreamIssue[] {
  const filter = stream.definition.labelFilter;
  if (!filter) {
    return issues;
  }

  const normalizedFilter = filter.toLowerCase();
  return issues.filter(issue =>
    issue.labels.some(label => label.name.toLowerCase() === normalizedFilter),
  );
}
