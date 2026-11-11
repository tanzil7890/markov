import { z, type RefinementCtx } from 'zod'
import { formatPluginSchemaPath } from './plugin-schema-issues'
import { PLUGIN_ENUM_SINCE_KEY } from './plugin-engine-floor-keys'
import { markovEngineRangeSchema, satisfiesMarkovEngineRange } from './plugin-manifest-engine-range'
import { isPluginJsonObject } from './plugin-json-object'

type Floor = { version: string; path: readonly PropertyKey[] }

function newer(
  current: Floor | null,
  version: unknown,
  path: readonly PropertyKey[]
): Floor | null {
  if (typeof version !== 'string') {
    return current
  }
  return current === null || !satisfiesMarkovEngineRange(current.version, `>=${version}`)
    ? { version, path }
    : current
}

function sinceOf(
  schema: z.core.$ZodType,
  value: unknown,
  path: readonly PropertyKey[],
  floor: Floor | null
) {
  const meta = z.globalRegistry.get(schema)
  let next = newer(floor, meta?.['x-markov-since'], path)
  const enumSince = meta?.[PLUGIN_ENUM_SINCE_KEY]
  if (typeof value === 'string' && isPluginJsonObject(enumSince)) {
    next = newer(next, enumSince[value], path)
  }
  return next
}

/** Newest release among every field and enum value the parsed manifest actually uses. Empty
 *  lists and absent optional fields count as unused. */
function walk(
  schema: z.core.$ZodType,
  value: unknown,
  path: readonly PropertyKey[],
  floor: Floor | null
): Floor | null {
  const current = sinceOf(schema, value, path, floor)
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodCatch
  ) {
    return walk(schema.def.innerType, value, path, current)
  }
  if (schema instanceof z.ZodPipe) {
    return walk(schema.def.in, value, path, current)
  }
  if (schema instanceof z.ZodArray && Array.isArray(value)) {
    return value.reduce<Floor | null>(
      (acc, item, index) => walk(schema.def.element, item, [...path, index], acc),
      current
    )
  }
  if (schema instanceof z.ZodObject && isPluginJsonObject(value)) {
    return Object.entries(schema.def.shape).reduce<Floor | null>((acc, [key, field]) => {
      const child = value[key]
      if (child === undefined || (Array.isArray(child) && child.length === 0)) {
        return acc
      }
      return walk(field, child, [...path, key], acc)
    }, current)
  }
  return current
}

/** The release a manifest must at least declare in engines.markov, and the field that needs it. */
export function pluginEngineFloor(
  schema: z.core.$ZodType,
  manifest: unknown
): { version: string; field: string } | null {
  // Why skip the root: its own since describes the file format, which each field repeats.
  const floor = walk(schema, manifest, [], null)
  return floor ? { version: floor.version, field: formatPluginSchemaPath(floor.path) } : null
}

/** Why enforced: an older Markov reports "requires Markov >=X" only when engines.markov covers every
 *  field the plugin uses, so authors may not under-declare it. */
export function validatePluginEngineFloor(
  schema: z.core.$ZodType,
  manifest: { engines: { markov: string } },
  ctx: RefinementCtx
): void {
  // Why: an unreadable range already has its own issue; a floor message on top is noise.
  if (!markovEngineRangeSchema.safeParse(manifest.engines.markov).success) {
    return
  }
  const floor = pluginEngineFloor(schema, manifest)
  const declared = manifest.engines.markov.slice(2)
  if (floor && !satisfiesMarkovEngineRange(declared, `>=${floor.version}`)) {
    ctx.addIssue({
      code: 'custom',
      path: ['engines', 'markov'],
      message: `must be at least >=${floor.version}, because ${floor.field} needs Markov ${floor.version}`
    })
  }
}
