// Mirror main's SETUP_REMEDY_MESSAGES through the catalog.
import { translate } from '@/i18n/i18n'
import type { SshHostServerSetupRemedy } from '../../../shared/ssh-host-server-setup-remedy'

export function sshHostSetupRemedyText(remedy: SshHostServerSetupRemedy): string {
  switch (remedy) {
    case 'retry':
      return translate(
        'auto.components.settings.sshHostServer.setupRetry',
        'Markov couldn’t start its server on this host. Try connecting again.'
      )
    case 'free-host-space':
      return translate(
        'auto.components.settings.sshHostServer.setupFreeHostSpace',
        'This host doesn’t have enough free disk space for Markov to keep a backup of its server data while starting it. Free up space on the host, then connect again.'
      )
    case 'stop-unmanaged-runtime':
      return translate(
        'auto.components.settings.sshHostServer.setupStopUnmanagedRuntime',
        'A Markov server this app didn’t start still appears to be using this host’s Markov data. Stop it on the host, then connect again. This host’s Details, in Settings > SSH Hosts, names its process.'
      )
    case 'see-details':
      return translate(
        'auto.components.settings.sshHostServer.setupSeeDetails',
        'Markov couldn’t start its server on this host. The cause is in this host’s Details, in Settings > SSH Hosts.'
      )
  }
}
