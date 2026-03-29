export type GetPolicyResult = {
  policyVersion: string
  description: string
  acceptanceRules: string[]
  matchingRules: string[]
  rankingRules: string[]
  guidanceArtifact: string
}
