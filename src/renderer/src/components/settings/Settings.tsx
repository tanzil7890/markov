import { useSettingsStoreModel } from './page/use-settings-store-model'
import { useSettingsInteractionController } from './page/use-settings-interaction-controller'
import { useSettingsPageEffects } from './page/use-settings-page-effects'
import { useSettingsNavigationModel } from './navigation/use-settings-navigation-model'
import { useSettingsTerminalModel } from './page/use-settings-terminal-model'
import { useSettingsRepoScrollEffects } from './navigation/use-settings-repo-scroll-effects'
import { buildSettingsViewModel, useSettingsNavigationActions } from './page/settings-view-model'
import { renderSettingsLoading, renderSettingsPage } from './page/settings-page-renderer'
import type {
  LoadedSettingsStoreModel,
  SettingsPresentation,
  SettingsRenderContext
} from './page/settings-render-context'

function Settings({
  presentation = 'page',
  visible = true
}: {
  presentation?: SettingsPresentation
  /** False while a Settings tab stays open behind another tab or workspace. */
  visible?: boolean
}): React.JSX.Element {
  const model = useSettingsStoreModel()
  const interactions = useSettingsInteractionController(model)
  useSettingsPageEffects(model, interactions, { presentation, visible })
  const navigation = useSettingsNavigationModel(model, interactions)
  const terminal = useSettingsTerminalModel(model, navigation)
  useSettingsRepoScrollEffects(model, interactions, navigation, terminal)
  const actions = useSettingsNavigationActions(model, interactions, navigation)

  if (!model.settings) {
    return renderSettingsLoading(interactions, presentation)
  }

  const view = buildSettingsViewModel(model, navigation)
  const context: SettingsRenderContext = {
    presentation,
    model: model as LoadedSettingsStoreModel,
    interactions,
    navigation,
    terminal,
    actions,
    view
  }
  return renderSettingsPage(context)
}

export default Settings
