import type { ApplyMemoryDecision } from './types/memory.types.js'

export type MemoryPolicyContext = {
  policyVersion: string
  subjectKey: string
  existingMemory: boolean
}

export const evaluateMemoryPolicy = ({
  policyVersion,
  subjectKey,
  existingMemory,
}: MemoryPolicyContext): ApplyMemoryDecision => {
  if (!subjectKey) {
    return {
      decision: 'reject',
      reason: 'Subject is empty after normalization.',
      policyVersion,
    }
  }

  if (existingMemory) {
    return {
      decision: 'reinforce',
      reason: 'Matching memory already exists.',
      policyVersion,
    }
  }

  return {
    decision: 'create',
    reason: 'No matching memory exists.',
    policyVersion,
  }
}
