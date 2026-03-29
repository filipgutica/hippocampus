import { describe, expect, it } from 'vitest'
import {
  GuidanceAssetMissingError,
  guidanceCatalog,
  memoryScopeGuidanceResource,
  readGuidanceArtifact,
  runtimeMemoryPolicyResource,
} from '../src/guidance/guidance-catalog.js'

describe('guidance artifacts', () => {
  it('loads the shipped runtime policy artifact', () => {
    const guidance = readGuidanceArtifact(runtimeMemoryPolicyResource)

    expect(guidance).toContain('# Hippocampus Runtime Memory Policy')
    expect(guidance).toContain('Use this policy first when deciding whether to retrieve or save memory through Hippocampus.')
    expect(guidance).toContain('Kind-only recall is a `memory-search` pattern')
    expect(guidance).toContain('## Recommended kinds')
    expect(guidance).toContain('canonical absolute path to the repo root')
    expect(guidance).toContain('## Source Types')
    expect(guidance).toContain('## Status')
    expect(guidance).toContain('## Contradiction and supersession')
    expect(runtimeMemoryPolicyResource.artifact).toBe('skills/memory-runtime-policy-skill.md')
    expect(runtimeMemoryPolicyResource.resourceUri).toBe('hippocampus://policy/runtime-memory')
    expect(runtimeMemoryPolicyResource.title).toBe('Hippocampus Runtime Memory Policy')
    expect(runtimeMemoryPolicyResource.description).toContain('Canonical runtime guidance')
    expect(runtimeMemoryPolicyResource.description).toContain('threshold-driven behavior')
    expect(runtimeMemoryPolicyResource.mimeType).toBe('text/markdown')
  })

  it('loads the shipped supporting scope guidance artifact', () => {
    const guidance = readGuidanceArtifact(memoryScopeGuidanceResource)

    expect(guidance).toContain('# Hippocampus Memory Scope Guidance')
    expect(guidance).toContain('Use this supporting guidance after reading the canonical runtime policy')
    expect(guidance).toContain('canonical absolute path to the repo root')
    expect(memoryScopeGuidanceResource.artifact).toBe('skills/memory-scope-skill.md')
    expect(memoryScopeGuidanceResource.resourceUri).toBe('hippocampus://skills/memory-scope')
    expect(memoryScopeGuidanceResource.title).toBe('Hippocampus Memory Scope Guidance')
    expect(memoryScopeGuidanceResource.description).toContain('Supporting guidance for choosing repo, user, or org scope')
    expect(memoryScopeGuidanceResource.description).toContain('canonical repo scope ids')
    expect(memoryScopeGuidanceResource.mimeType).toBe('text/markdown')
  })

  it('exports a shared guidance catalog', () => {
    expect(guidanceCatalog).toEqual([runtimeMemoryPolicyResource, memoryScopeGuidanceResource])
  })

  it('exports the shared guidance error type', () => {
    const error = new GuidanceAssetMissingError('missing')

    expect(error.code).toBe('GUIDANCE_ASSET_MISSING')
  })
})
