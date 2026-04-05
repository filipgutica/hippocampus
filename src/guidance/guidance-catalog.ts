import fs from 'node:fs'
import { normalizeWhitespace } from '../common/utils.js'

export type GuidanceRole = 'canonical-policy' | 'supporting-guidance'

export type GuidanceResourceDefinition = {
  role: GuidanceRole
  artifact: string
  resourceUri: string
  title: string
  description: string
  mimeType: 'text/markdown'
}

export const runtimeMemoryPolicyResource: GuidanceResourceDefinition = {
  role: 'canonical-policy',
  artifact: 'skills/memory-runtime-policy-skill.md',
  resourceUri: 'hippocampus://policy/runtime-memory',
  title: 'Hippocampus Runtime Memory Policy',
  description: normalizeWhitespace(`
    Canonical runtime guidance for retrieval, saving,
    scope discipline, lifecycle rules, and
    threshold-driven behavior.
  `),
  mimeType: 'text/markdown',
}

export const memoryScopeGuidanceResource: GuidanceResourceDefinition = {
  role: 'supporting-guidance',
  artifact: 'skills/memory-scope-skill.md',
  resourceUri: 'hippocampus://skills/memory-scope',
  title: 'Hippocampus Memory Scope Guidance',
  description: normalizeWhitespace(`
    Supporting guidance for choosing user or project
    scope and constructing canonical project scope ids.
  `),
  mimeType: 'text/markdown',
}

export const guidanceCatalog = [runtimeMemoryPolicyResource, memoryScopeGuidanceResource] as const

export const supportingGuidanceResources = guidanceCatalog.filter(
  resource => resource.role === 'supporting-guidance',
)

export class GuidanceAssetMissingError extends Error {
  readonly code = 'GUIDANCE_ASSET_MISSING'

  constructor(message: string) {
    super(message)
    this.name = 'GuidanceAssetMissingError'
  }
}

const toGuidanceAssetUrl = (artifact: string) => new globalThis.URL(`../../${artifact}`, import.meta.url)

export const readGuidanceArtifact = ({ artifact, title }: Pick<GuidanceResourceDefinition, 'artifact' | 'title'>): string => {
  const guidanceAssetUrl = toGuidanceAssetUrl(artifact)

  try {
    return fs.readFileSync(guidanceAssetUrl, 'utf8')
  } catch {
    throw new GuidanceAssetMissingError(
      `Unable to read ${title} at ${guidanceAssetUrl.pathname}. Ensure \`${artifact}\` is shipped with the package.`,
    )
  }
}
