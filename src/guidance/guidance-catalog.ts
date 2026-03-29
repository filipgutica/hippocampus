import fs from 'node:fs'

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
  description:
    'Canonical runtime guidance for when to search memory, when to save memory, and how to keep retrieval narrow and explicit.',
  mimeType: 'text/markdown',
}

export const memoryScopeGuidanceResource: GuidanceResourceDefinition = {
  role: 'supporting-guidance',
  artifact: 'skills/memory-scope-skill.md',
  resourceUri: 'hippocampus://skills/memory-scope',
  title: 'Hippocampus Memory Scope Guidance',
  description:
    'Supporting guidance for choosing repo, user, or org scope when storing durable memories.',
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
