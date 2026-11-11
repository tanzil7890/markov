import { z } from 'zod'

/** The previous markovd on this data root died on this boot without releasing its instance lock. */
export const MarkovdUnexpectedExitSchema = z.object({
  pid: z.number().int().positive(),
  version: z.string().max(255),
  /** When the exited run took the lock. */
  acquiredAt: z.iso.datetime({ offset: true })
})

export type MarkovdUnexpectedExit = z.infer<typeof MarkovdUnexpectedExitSchema>
