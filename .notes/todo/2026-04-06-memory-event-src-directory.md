---
title: "Move memory-event into its own src directory"
status: "todo"
created: "2026-04-06"
started: null
completed: null
tags: ["memory-event", "src", "structure"]
---

# Move memory-event into its own src directory

## Planning Seed

Memory-event is its own table and should have its own directory within `src/`.

Context and constraints:

- Keep the change focused on source organization for memory-event.
- Preserve existing behavior while moving the relevant code into a clearer directory boundary.
- Verify import paths, tests, and any persistence or service references after the move.

Unresolved planning questions:

- Which current files define or operate on memory-event behavior?
- Should the new directory include only persistence code, or also service and type definitions that are specific to memory-event?

## Approved Plan

Not started.

## Work Log

No work logged yet.

## Completion Summary

Not completed.
