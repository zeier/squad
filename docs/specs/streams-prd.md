# Streams PRD — Product Requirements Document

> Scaling Squad across multiple Codespaces via labeled work streams.

## Problem Statement

Squad was designed for a single agent team per repository. In practice, larger projects hit scaling limits:

1. **Rate limits**: A single Codespace hitting model API rate limits blocks the entire team
2. **Triage overload**: Ralph picks up all open issues, even those outside the current focus area
3. **File contention**: Multiple agents editing the same files causes merge conflicts
4. **Context window saturation**: Large repos exceed practical context limits for a single coordinator

### Validated by Experiment

We tested this with a 3-Codespace setup building a multiplayer Tetris game. Each Codespace ran Squad independently, manually filtering by GitHub labels. The results showed 3x throughput for independent work streams, validating the approach. However, the manual coordination was error-prone and needed to be automated.

## Requirements

### Must Have (P0)

- [ ] **Stream Definition**: Define streams in `.squad/streams.json` with name, label filter, folder scope, and workflow
- [ ] **Stream Resolution**: Automatically detect active stream from env var, file, or config
- [ ] **Label Filtering**: Ralph only triages issues matching the stream's label
- [ ] **Folder Scoping**: Agents restrict modifications to stream's folder scope
- [ ] **CLI Management**: `squad streams list|status|activate` commands
- [ ] **Init Integration**: `squad init` optionally generates streams config
- [ ] **Agent Template**: squad.agent.md includes stream awareness instructions

### Should Have (P1)

- [ ] **Stream Status Dashboard**: Show PR/branch activity per stream
- [ ] **Conflict Detection**: Warn when streams overlap on file paths
- [ ] **Auto-labeling**: Suggest labels for new issues based on file paths

### Could Have (P2)

- [ ] **Meta-coordinator**: A coordinator that orchestrates across streams
- [ ] **Cross-stream dependencies**: Track and resolve inter-stream blockers
- [ ] **Stream metrics**: Throughput, cycle time, merge conflict rate per stream

## Design Decisions

### 1. GitHub Labels as the Partition Key

**Decision**: Use GitHub labels (e.g., `team:ui`) to partition work across streams.

**Rationale**: Labels are a first-class GitHub concept. They're visible in the UI, queryable via API, and already used by Squad for agent assignment. No new infrastructure needed.

**Alternatives considered**:
- Custom metadata in issue body — fragile, not queryable
- Separate repositories — too heavy, loses monorepo benefits
- Branch-based partitioning — branches are for code, not work items

### 2. File-Based Stream Activation

**Decision**: Use `.squad-stream` file (gitignored) for local activation, `SQUAD_TEAM` env var for Codespaces.

**Rationale**: The file is simple and doesn't require environment configuration. The env var is ideal for Codespaces where the environment is defined in `devcontainer.json`. Both are easy to understand and debug.

### 3. Resolution Priority (Env > File > Config)

**Decision**: Env var overrides file, which overrides config auto-select.

**Rationale**: In Codespaces, the env var is the most reliable signal. On local machines, the file is convenient. Config auto-select handles the simple case of a single stream.

### 4. Synthesized Definitions for Unknown Streams

**Decision**: When `SQUAD_TEAM` or `.squad-stream` specifies a stream name not in the config, synthesize a minimal definition with `labelFilter: "team:{name}"`.

**Rationale**: Fail-open is better than fail-closed. Users should be able to set `SQUAD_TEAM=my-team` without needing to update `streams.json` first. The convention of `team:{name}` is predictable and consistent.

## Future Work

### Meta-Coordinator

A "coordinator of coordinators" that:
- Monitors all streams for cross-cutting concerns
- Detects when one stream's work blocks another
- Suggests label assignments for ambiguous issues
- Produces a unified status dashboard

### Cross-Stream Dependencies

Track when a stream needs work from another stream:
- Automated detection via import graphs
- Cross-stream issue linking
- Priority escalation for blocking dependencies

### Stream Templates

Pre-built stream configurations for common architectures:
- **Frontend/Backend** — 2 streams for web apps
- **Monorepo** — 1 stream per package
- **Microservices** — 1 stream per service
- **Feature teams** — dynamic streams per feature area
