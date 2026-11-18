import { createContext, useContext, useLayoutEffect } from 'react'

/** What the Create dialog makes: a workspace in a project, or a new project. */
export type CreateDialogKind = 'workspace' | 'project'

/** The shown side's rules for the dialog it sits in; the other side's never apply. */
export type CreateDialogHandlers = {
  onOpenChange: (open: boolean) => void
  onInteractOutside?: (event: Event) => void
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  /** Return true when the side placed focus itself. */
  focusInitial?: (content: HTMLElement) => boolean
  onCloseAutoFocus?: (event: Event) => void
  /** Classes for the dialog box while this side shows. */
  contentClassName?: string
  /** Leaving now would drop work this side started. */
  kindSwitchDisabled?: boolean
}

export type CreateDialogHost = {
  registerHandlers: (handlers: CreateDialogHandlers) => void
}

export const CreateDialogHostContext = createContext<CreateDialogHost | null>(null)

export function useCreateDialogHost(): CreateDialogHost | null {
  return useContext(CreateDialogHostContext)
}

/** Registers on every render so the dialog always calls this side's latest handlers. */
export function useRegisterCreateDialogHandlers(
  host: CreateDialogHost | null,
  handlers: CreateDialogHandlers
): void {
  useLayoutEffect(() => {
    host?.registerHandlers(handlers)
  })
}
