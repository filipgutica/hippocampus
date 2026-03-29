import fs from 'node:fs'

export const guidanceArtifact = 'skills/memory-scope-skill.md'
export const guidanceResourceUri = 'hippocampus://skills/memory-scope'
export const guidanceTitle = 'Hippocampus Memory Scope Skill'
export const guidanceMimeType = 'text/markdown'

export class GuidanceAssetMissingError extends Error {
  readonly code = 'GUIDANCE_ASSET_MISSING'

  constructor(message: string) {
    super(message)
    this.name = 'GuidanceAssetMissingError'
  }
}

const guidanceAssetUrl = new globalThis.URL('../../skills/memory-scope-skill.md', import.meta.url)

export const readMemoryScopeGuidance = (): string => {
  try {
    return fs.readFileSync(guidanceAssetUrl, 'utf8')
  } catch {
    throw new GuidanceAssetMissingError(
      `Unable to read guidance artifact at ${guidanceAssetUrl.pathname}. Ensure \`skills/memory-scope-skill.md\` is shipped with the package.`,
    )
  }
}
