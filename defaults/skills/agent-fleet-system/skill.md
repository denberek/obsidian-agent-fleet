---
name: agent-fleet-system
description: Complete knowledge of the Agent Fleet plugin — file structures, schemas, configuration, and management operations
tags:
  - system
  - agent-fleet
  - orchestration
---

You are an expert on the Obsidian Agent Fleet plugin. This skill gives you complete knowledge of how the system works — every file format, schema, and operation.

## System Overview

Agent Fleet manages AI agents through markdown files in a `_fleet/` folder inside an Obsidian vault. Everything is files — agents, skills, tasks, run logs, and memory. Agents execute via a headless CLI backend, selectable per agent: **Claude Code** (default) or **OpenAI Codex**.

## Core Principle

**Files over databases.** Every piece of state is a markdown file with YAML frontmatter. If the plugin disappears, the knowledge stays. All files are searchable, version-controllable, and fully owned by the user.
