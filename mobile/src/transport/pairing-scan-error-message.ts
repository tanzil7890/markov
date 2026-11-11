import type { Translate } from '../i18n/mobile-i18n'

function isMarkovInstallUrl(data: string): boolean {
  try {
    const url = new URL(data.trim())
    const path = url.pathname.replace(/\/$/, '')
    switch (url.origin) {
      case 'https://markov.outhad.com':
        return path === '/download/android' || path === '/download/ios'
      case 'https://github.com':
        return /^\/tanzil7890\/markov\/releases\/download\/mobile-android-v[^/]+\/app-release\.apk$/.test(
          path
        )
      default:
        return false
    }
  } catch {
    return false
  }
}

export function getPairingScanErrorMessage(data: string, t: Translate): string {
  return isMarkovInstallUrl(data)
    ? t(
        'app.pairScan.downloadQrCode',
        "That's the download code. Scan the pairing code in step 2 on your desktop."
      )
    : t('app.pairScan.invalidQrCode', 'Not a valid Markov QR code')
}
