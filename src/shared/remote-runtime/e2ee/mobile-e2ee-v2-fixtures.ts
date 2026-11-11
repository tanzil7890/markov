import type { MobileE2EEV2Hello, MobileE2EEV2Ready } from './mobile-e2ee-v2-contract'

function repeatedByteBase64(byte: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(32).fill(byte)))
}

export function createMobileE2EEV2Fixture(): {
  hello: MobileE2EEV2Hello
  ready: MobileE2EEV2Ready
  sharedSecret: Uint8Array
} {
  const context = {
    protocol: 'markov-mobile-e2ee' as const,
    initiator: 'mobile' as const,
    responder: 'desktop' as const,
    transport: 'relay' as const,
    relayHostId: 'AbCdEf0123_-xyZ9'
  }
  return {
    hello: {
      type: 'e2ee_hello',
      v: 2,
      clientPublicKeyB64: repeatedByteBase64(1),
      clientNonceB64: repeatedByteBase64(2),
      capabilities: { framing: [2], payloadKinds: ['text', 'binary'] },
      context
    },
    ready: {
      type: 'e2ee_ready',
      v: 2,
      desktopPublicKeyB64: repeatedByteBase64(3),
      clientNonceB64: repeatedByteBase64(2),
      desktopNonceB64: repeatedByteBase64(4),
      selection: { framing: 2, payloadKinds: ['text', 'binary'] },
      context
    },
    sharedSecret: new Uint8Array(32).fill(5)
  }
}

export const MOBILE_E2EE_V2_VECTOR = {
  transcriptLength: 1353,
  transcriptHashHex: 'a0ddd6f2c1dcd83cc47f460819caeeb1cf02bf9fe1ffb7dd028154f88fc7cdaa',
  mobileToDesktopKeyHex: 'aec13b4f0939abfa6cc599431f12730275e7f2ec9bf5c308166d17555580b0cf',
  desktopToMobileKeyHex: 'dc90422d1896cf51ba61e891a373f087dc39091184fd3ee6fbc95a3152234e4c',
  sessionIdHex: 'c4f040da3bd2166c6f41a2a56cfcb394bdfda90db3a7a0fb2c501d6d12030ab8'
} as const
