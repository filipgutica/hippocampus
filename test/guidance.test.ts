import { describe, expect, it } from 'vitest'
import {
  guidanceArtifact,
  guidanceMimeType,
  guidanceResourceUri,
  guidanceTitle,
  readMemoryScopeGuidance,
} from '../src/guidance/memory-scope-guidance.js'

describe('memory-scope guidance', () => {
  it('loads the shipped markdown artifact', () => {
    const guidance = readMemoryScopeGuidance()

    expect(guidance).toContain('# Hippocampus Memory Scope Skill')
    expect(guidance).toContain('Use this guidance before submitting an observation to Hippocampus.')
    expect(guidanceArtifact).toBe('skills/memory-scope-skill.md')
    expect(guidanceResourceUri).toBe('hippocampus://skills/memory-scope')
    expect(guidanceTitle).toBe('Hippocampus Memory Scope Skill')
    expect(guidanceMimeType).toBe('text/markdown')
  })
})
