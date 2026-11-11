import Svg, { Path } from 'react-native-svg'
import {
  MARKOV_MARK_HEIGHT,
  MARKOV_MARK_PATH,
  MARKOV_MARK_VIEW_BOX,
  MARKOV_MARK_WIDTH
} from '../../../src/shared/markov-mark'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'

type Props = {
  size?: number
  color?: string
}

export function MarkovLogo({ size = 24, color = colors.textPrimary }: Props) {
  useMobileColorScheme()
  const width = (size * MARKOV_MARK_WIDTH) / MARKOV_MARK_HEIGHT
  return (
    <Svg width={width} height={size} viewBox={MARKOV_MARK_VIEW_BOX}>
      <Path fill={color} d={MARKOV_MARK_PATH} />
    </Svg>
  )
}
