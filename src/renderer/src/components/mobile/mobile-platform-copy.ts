import type { Platform } from './MobileHero'
import { translate } from '@/i18n/i18n'

export type InstallCopy = { ctaLabel: string; url: string }

export const ANDROID_INSTALL_GUIDE_URL = 'https://markov.outhad.com/docs/android-apk'

export function getInstallCopy(platform: Platform): InstallCopy {
  return platform === 'ios'
    ? {
        ctaLabel: translate(
          'auto.components.mobile.mobile.platform.copy.openAppStore',
          'Open App Store'
        ),
        url: 'https://markov.outhad.com/download/ios'
      }
    : {
        ctaLabel: translate(
          'auto.components.mobile.mobile.platform.copy.downloadApk',
          'Download APK'
        ),
        url: 'https://markov.outhad.com/download/android'
      }
}
