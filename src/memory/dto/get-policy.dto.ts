import type { MemorySourceType, MemoryStatus } from '../types/memory.types.js'

export type PolicyResourcePointer = {
  uri: string
  artifact: string
  title: string
}

export type PolicyResourceEntry = PolicyResourcePointer & {
  role: 'canonical-policy' | 'supporting-guidance'
}

export type PolicyDefinition<TValue extends string> = {
  value: TValue
  description: string
}

export type GetPolicyResult = {
  policyVersion: string
  description: string
  acceptanceRules: string[]
  matchingRules: string[]
  rankingRules: string[]
  sourceTypeDefinitions: PolicyDefinition<MemorySourceType>[]
  statusDefinitions: PolicyDefinition<MemoryStatus>[]
  contradictionRules: string[]
  guidanceArtifact: string
  guidanceResourceUri: string
  canonicalPolicy: PolicyResourcePointer
  supportingGuidance: PolicyResourcePointer[]
  resources: PolicyResourceEntry[]
}
