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
  canonicalPolicy: PolicyResourcePointer
  supportingGuidance: PolicyResourcePointer[]
  resources: PolicyResourceEntry[]
}
