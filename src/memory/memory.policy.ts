import type { PolicyDefinition } from './dto/get-policy.dto.js'
import type { ApplyMemoryDecision } from './types/memory.types.js'
import type { MemorySourceType, MemoryStatus } from './types/memory.types.js'

export type MemoryPolicyContext = {
  policyVersion: string
  subjectKey: string
  existingMemory: boolean
}

export const memorySourceTypeDefinitions: PolicyDefinition<MemorySourceType>[] = [
  {
    value: 'explicit_user_statement',
    description: 'A durable fact, preference, or instruction directly stated by the user.',
  },
  {
    value: 'observed_pattern',
    description: 'A durable inference drawn from repeated corrections, approvals, or interaction patterns over time.',
  },
  {
    value: 'tool_observation',
    description: 'A durable fact derived from objective evidence such as repo files, config, docs, or tool output.',
  },
]

export const memoryStatusDefinitions: PolicyDefinition<MemoryStatus>[] = [
  {
    value: 'candidate',
    description: 'A possible durable memory that is not yet eligible for normal retrieval.',
  },
  {
    value: 'active',
    description: 'A durable memory that is eligible for normal retrieval.',
  },
  {
    value: 'suppressed',
    description: 'A memory that should not be used for normal retrieval because it was contradicted or deemed unreliable.',
  },
  {
    value: 'archived',
    description: 'A historical memory that is no longer current enough for normal retrieval.',
  },
  {
    value: 'deleted',
    description: 'A memory removed from normal use through an explicit operator workflow.',
  },
]

const sourceTypeStrength: Record<MemorySourceType, number> = {
  observed_pattern: 1,
  tool_observation: 2,
  explicit_user_statement: 3,
}

export const MEMORY_POLICY_VERSION = '3'
export const REINFORCEMENT_CAP = 5
export const CANDIDATE_PROMOTION_THRESHOLD = 3
export const ACTIVE_ARCHIVE_STALE_AFTER_DAYS = 90
export const CANDIDATE_ARCHIVE_STALE_AFTER_DAYS = 90
export const AUTO_ARCHIVE_SWEEP_COOLDOWN_HOURS = 24
export const AUTO_ARCHIVE_SWEEP_LIMIT = 50

export const getInitialMemoryStatus = (sourceType: MemorySourceType): MemoryStatus =>
  sourceType === 'observed_pattern' ? 'candidate' : 'active'

export const isLiveMemoryStatus = (status: MemoryStatus): boolean => status === 'candidate' || status === 'active'

export const isRetrievableMemoryStatus = (status: MemoryStatus): boolean => status === 'active'

export const capReinforcementValue = (value: number): number => Math.min(value, REINFORCEMENT_CAP)

export const pickStrongerSourceType = (
  current: MemorySourceType,
  incoming: MemorySourceType,
): MemorySourceType => (sourceTypeStrength[incoming] > sourceTypeStrength[current] ? incoming : current)

export const resolveReinforcedStatus = ({
  currentStatus,
  nextReinforcementCount,
  nextSourceType,
}: {
  currentStatus: MemoryStatus
  nextReinforcementCount: number
  nextSourceType: MemorySourceType
}): MemoryStatus => {
  if (currentStatus !== 'candidate') {
    return currentStatus
  }

  if (getInitialMemoryStatus(nextSourceType) === 'active') {
    return 'active'
  }

  return nextReinforcementCount >= CANDIDATE_PROMOTION_THRESHOLD ? 'active' : 'candidate'
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
