---
title: "Episodic Markdown Memory Notes"
status: "todo"
created: "2026-04-02"
started: null
completed: null
tags: ["memory", "markdown", "episodic"]
---

# Episodic Markdown Memory Notes

## Planning Seed

Explore a future-work path for an Obsidian-style Markdown layer for episodic memory.

Initial direction:

- Keep the current memory types as-is: `procedural`, `episodic`, `semantic`, `preference`, and `decision`.
- Treat the Markdown layer as a representation of `episodic` memory, not a new memory type.
- Use Markdown files for durable, human-readable summaries of resolved threads, troubleshooting sessions, and other notable incidents.
- Keep the current database as the index and retrieval layer, with pointers to the Markdown artifacts.

The Markdown layer should store concise summaries, symptoms, root cause, resolution, important decisions, follow-up actions, related links, and optional tags. The database should store a stable memory ID, memory type, file pointer, retrieval metadata, and optional derived ranking/search fields.

Retrieval should support questions like "Do you remember that time we debugged this issue?" by finding the relevant episode through metadata and ranking, then loading the Markdown note for the full summary.

Design notes to preserve during planning:

- Do not save every thread; only capture episodes worth revisiting later.
- Keep episode notes separate from procedural policy so retrieval stays clear.
- Prefer one clean summary per resolved topic rather than a transcript dump.
- Use `semantic` or `decision` memories only when the episode contains a reusable lesson or an explicit durable choice.

Open planning questions:

- Whether notes should live in a fixed local directory or under a project-scoped path.
- Whether the file pointer should be a plain path, a URI, or an internal artifact reference.
- Whether episode notes should be written automatically after resolution or only when the agent decides the event is important.

## Approved Plan

Not started.

## Work Log

No work logged yet.

## Completion Summary

Not completed.
