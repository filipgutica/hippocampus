import { checkbox, confirm, input, select } from '@inquirer/prompts'
import type { CliIO } from './commands/shared.js'

export type InteractiveChoice<Value extends string> = {
  value: Value
  name: string
  description?: string
}

type PromptContext = {
  input: NodeJS.ReadableStream
  output: NodeJS.WritableStream
}

const resolvePromptContext = (io: CliIO): PromptContext => ({
  input: io.stdin ?? process.stdin,
  output: io.stdout,
})

export const isInteractiveIo = ({ io, json = false }: { io: CliIO; json?: boolean }): boolean => {
  if (json) {
    return false
  }

  const inputStream = io.stdin ?? process.stdin
  const outputStream = io.stdout

  return ('isTTY' in inputStream && inputStream.isTTY === true) && ('isTTY' in outputStream && outputStream.isTTY === true)
}

export const promptSelect = async <Value extends string>({
  io,
  message,
  choices,
}: {
  io: CliIO
  message: string
  choices: InteractiveChoice<Value>[]
}): Promise<Value> =>
  select(
    {
      message,
      choices,
    },
    resolvePromptContext(io),
  )

export const promptCheckbox = async <Value extends string>({
  io,
  message,
  choices,
}: {
  io: CliIO
  message: string
  choices: InteractiveChoice<Value>[]
}): Promise<Value[]> =>
  checkbox(
    {
      message,
      choices,
      required: true,
    },
    resolvePromptContext(io),
  )

export const promptInput = async ({
  io,
  message,
  validate,
}: {
  io: CliIO
  message: string
  // eslint-disable-next-line no-unused-vars
  validate?: (_value: string) => true | string
}): Promise<string> =>
  input(
    {
      message,
      validate,
    },
    resolvePromptContext(io),
  )

export const promptConfirm = async ({
  io,
  message,
  defaultValue = false,
}: {
  io: CliIO
  message: string
  defaultValue?: boolean
}): Promise<boolean> =>
  confirm(
    {
      message,
      default: defaultValue,
    },
    resolvePromptContext(io),
  )
