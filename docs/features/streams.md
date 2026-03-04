# Squad Streams

> Scale Squad across multiple Codespaces by partitioning work into labeled streams.

## What Are Streams?

A **stream** is a named partition of work within a Squad project. Each stream targets a specific GitHub label (e.g., `team:ui`, `team:backend`) and optionally restricts agents to certain directories. Multiple Squad instances — each running in its own Codespace — can each activate a different stream, enabling parallel work across teams.

## Why Streams?

Squad was originally designed for a single team per repository. As projects grow, a single Codespace becomes a bottleneck:

- **Model rate limits** — One Codespace hitting API limits slows the whole team
- **Context overload** — Ralph picks up all issues, not just the relevant ones
- **Folder conflicts** — Multiple agents editing the same files causes merge pain

Streams solve this by giving each Codespace a scoped view of the project.

## Configuration

### 1. Create `.squad/streams.json`

```json
{
  "streams": [
    {
      "name": "ui-team",
      "labelFilter": "team:ui",
      "folderScope": ["apps/web", "packages/ui"],
      "workflow": "branch-per-issue",
      "description": "Frontend team — React, CSS, components"
    },
    {
      "name": "backend-team",
      "labelFilter": "team:backend",
      "folderScope": ["apps/api", "packages/core"],
      "workflow": "branch-per-issue",
      "description": "Backend team — APIs, database, services"
    },
    {
      "name": "infra-team",
      "labelFilter": "team:infra",
      "folderScope": [".github", "infrastructure"],
      "workflow": "direct",
      "description": "Infrastructure — CI/CD, deployment, monitoring"
    }
  ],
  "defaultWorkflow": "branch-per-issue"
}
```

### 2. Activate a Stream

There are three ways to tell Squad which stream to use:

#### Environment Variable (recommended for Codespaces)

```bash
export SQUAD_TEAM=ui-team
```

Set this in your Codespace's environment or devcontainer.json:

```json
{
  "containerEnv": {
    "SQUAD_TEAM": "ui-team"
  }
}
```

#### .squad-stream File (local activation)

```bash
squad streams activate ui-team
```

This writes a `.squad-stream` file (gitignored) so the setting is local to your machine.

#### Auto-select (single stream)

If `streams.json` contains only one stream, it's automatically selected.

### 3. Resolution Priority

1. `SQUAD_TEAM` env var (highest)
2. `.squad-stream` file
3. Single-stream auto-select
4. No stream (classic single-squad mode)

## Stream Definition Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique stream identifier (kebab-case) |
| `labelFilter` | Yes | GitHub label to filter issues |
| `folderScope` | No | Directories this stream may modify |
| `workflow` | No | `branch-per-issue` (default) or `direct` |
| `description` | No | Human-readable purpose |

## CLI Reference

```bash
# List configured streams
squad streams list

# Show stream activity (branches, PRs)
squad streams status

# Activate a stream locally
squad streams activate <name>
```

## How It Works

### Triage (Ralph)

When a stream is active, Ralph's triage only picks up issues labeled with the stream's `labelFilter`. Unmatched issues are left for other streams or the main squad.

### Workflow Enforcement

- **branch-per-issue** (default): Every issue gets its own branch and PR. Agents never commit directly to main.
- **direct**: Agents may commit directly (useful for infra/ops streams).

### Folder Scope

When `folderScope` is set, agents should only modify files within those directories. This prevents cross-team file conflicts.

## Example: Multi-Codespace Setup

See [Multi-Codespace Scenario](../scenarios/multi-codespace.md) for a complete walkthrough.
