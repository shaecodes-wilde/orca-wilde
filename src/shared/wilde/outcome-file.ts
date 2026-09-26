import { z } from 'zod'
import { outcomeSchema } from './domain'

export const outcomeFileSchema = z
  .object({
    format: z.literal('wilde-outcomes'),
    version: z.literal(1),
    events: z
      .array(
        outcomeSchema.omit({
          type: true,
          id: true,
          revision: true,
          createdAt: true,
          updatedAt: true,
          archivedAt: true,
          receivedAt: true
        })
      )
      .max(10000)
  })
  .strict()
