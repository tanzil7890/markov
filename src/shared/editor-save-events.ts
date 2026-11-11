export const MARKOV_EDITOR_SAVE_DIRTY_FILES_EVENT = 'markov:editor-save-dirty-files'
export const MARKOV_EDITOR_PREPARE_HOT_EXIT_EVENT = 'markov:editor-prepare-hot-exit'

export type EditorSaveDirtyFilesDetail = {
  claim: () => void
  resolve: () => void
  reject: (message: string) => void
}

export type EditorPrepareHotExitDetail = EditorSaveDirtyFilesDetail
