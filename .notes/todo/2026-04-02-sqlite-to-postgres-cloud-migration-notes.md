---
title: "SQLite to Postgres Cloud Migration Notes"
status: "todo"
created: "2026-04-02"
started: null
completed: null
tags: ["storage", "postgres", "cloud"]
---

# SQLite to Postgres Cloud Migration Notes

## Planning Seed

Explore a likely cloud migration path for Hippocampus without forcing a redesign later.

Initial direction:

- Keep the current application and service boundaries storage-agnostic.
- Treat the memory service as the stable contract and swap persistence implementations behind repositories.
- Move the cloud version to Postgres first before considering any dedicated search system.
- Keep full-text and semantic search as derived projections, not the source of truth.

Postgres is the preferred first cloud store because it can hold source-of-truth memory rows, event history, and embeddings in one operational system while leaving room for `pgvector` and `tsvector` before adding a separate search cluster.

Suggested shape to revisit during planning:

- `memories` as the main source-of-truth table.
- `memory_embeddings` as a separate table keyed by memory ID.
- `memory_events` as an append-only audit/history table.
- `tenant_id` added early so the schema can scale across many users and agents.
- Search and ranking implemented through indexes and projections, not by loading all rows into application memory.

Scale notes to preserve:

- A single logical `memories` table can still work at large row counts if queries are consistently scoped and indexed.
- The main risks are hot indexes, write amplification, and search fan-out, not the table count itself.
- Partitioning and replicas can be added later if the workload demands it.

Migration principle:

- Avoid making SQLite-specific behavior part of the public contract.
- Preserve repository interfaces so the backing store can change from SQLite to Postgres with minimal service-layer churn.
- Add OpenSearch only if Postgres-native search becomes insufficient at scale.

## Approved Plan

Not started.

## Work Log

No work logged yet.

## Completion Summary

Not completed.
