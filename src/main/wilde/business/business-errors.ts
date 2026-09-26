import { ZodError } from 'zod'
import type { BusinessResult } from '../../../shared/wilde/commands'

export function businessFailure(error: unknown): BusinessResult {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return { status: 'rejected', message: 'Invalid business data. Check the file format, required fields and size limits.' }
  }
  const message = error instanceof Error ? error.message : 'Business operation failed.'
  const storageFailure = /SQLITE|constraint|database|disk|UNIQUE|FOREIGN|locked/i.test(message)
  return { status: /^(Record changed|Preview expired)/.test(message) ? 'stale-context' : 'failed',
    message: storageFailure ? 'Business storage could not commit this change. Check disk space, duplicate assignments and relationships; existing records were preserved.' : message }
}
