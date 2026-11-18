const EAGER_SECTION_IDS = new Set(['general'])

export function deriveNeededSectionIds(args: {
  navSectionIds: string[]
  mountedSectionIds: Set<string>
  activeSectionId: string | null
  pendingSectionId: string | null
  /** Sections shown together with the active one. */
  companionSectionIds: readonly string[]
}): Set<string> {
  const next = new Set(args.mountedSectionIds)
  for (const sectionId of args.navSectionIds) {
    if (EAGER_SECTION_IDS.has(sectionId)) {
      next.add(sectionId)
    }
  }
  if (args.activeSectionId) {
    next.add(args.activeSectionId)
  }
  for (const sectionId of args.companionSectionIds) {
    next.add(sectionId)
  }
  if (args.pendingSectionId) {
    next.add(args.pendingSectionId)
  }
  return next
}

export function getInitialMountedSectionIds(): Set<string> {
  return new Set(EAGER_SECTION_IDS)
}
