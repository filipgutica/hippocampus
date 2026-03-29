export type PolicyResourcePointer = {
  uri: string
  artifact: string
  title: string
}

export type PolicyResourceEntry = PolicyResourcePointer & {
  role: 'canonical-policy' | 'supporting-guidance'
}

export type GetPolicyResult = {
  policyVersion: string
  description: string
  acceptanceRules: string[]
  matchingRules: string[]
  rankingRules: string[]
  guidanceArtifact: string
  guidanceResourceUri: string
  canonicalPolicy: PolicyResourcePointer
  supportingGuidance: PolicyResourcePointer[]
  resources: PolicyResourceEntry[]
}
