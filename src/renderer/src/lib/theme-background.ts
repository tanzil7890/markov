import type { PluginThemeBackground } from '../../../shared/plugins/artifacts/plugin-theme-background'
import { useThemeBackgroundStore } from '@/store/theme-background'
import { syncWindowMaterialWithThemeBackground } from './window-material-runtime'

const SIZE: Record<NonNullable<PluginThemeBackground['size']>, [size: string, repeat: string]> = {
  cover: ['cover', 'no-repeat'],
  contain: ['contain', 'no-repeat'],
  tile: ['auto', 'repeat']
}

const PROPERTIES = [
  '--markov-theme-background-image',
  '--markov-theme-background-size',
  '--markov-theme-background-repeat',
  '--markov-theme-background-position',
  '--markov-theme-background-opacity',
  '--markov-theme-background-surface-opacity'
] as const

/** Paints (or clears) the theme's image as the body's static background layer; see main.css.
 *  `surfaceOpacity` is Background Opacity, which chats over the image paint at too. */
export function applyThemeBackground(
  background: PluginThemeBackground | null | undefined,
  surfaceOpacity = 1,
  root: HTMLElement = document.documentElement
): void {
  if (!background) {
    for (const property of PROPERTIES) {
      root.style.removeProperty(property)
    }
    delete root.dataset.themeBackground
    useThemeBackgroundStore.setState({ active: false })
    syncWindowMaterialWithThemeBackground(false)
    return
  }
  const [size, repeat] = SIZE[background.size ?? 'cover']
  // Why JSON quoting: registration only admits markov-plugin-image URLs, and a quoted CSS string cannot break out.
  root.style.setProperty(
    '--markov-theme-background-image',
    `url(${JSON.stringify(background.url)})`
  )
  root.style.setProperty('--markov-theme-background-size', size)
  root.style.setProperty('--markov-theme-background-repeat', repeat)
  root.style.setProperty('--markov-theme-background-position', background.position ?? 'center')
  root.style.setProperty('--markov-theme-background-opacity', String(background.opacity ?? 1))
  root.style.setProperty('--markov-theme-background-surface-opacity', String(surfaceOpacity))
  root.dataset.themeBackground = ''
  useThemeBackgroundStore.setState({ active: true })
  syncWindowMaterialWithThemeBackground(true)
}
