/**
 * Anything the room can talk to: a real WebSocket, or the in-process bot.
 * Messages are raw JSON strings on purpose: everything travels in exactly the
 * wire format, so the network conditioner can delay or drop "packets"
 * without caring what is inside, and the bot is served the same bytes as a
 * browser.
 */
export interface Peer {
  send(raw: string): void;
  close(code: number, reason: string): void;
}

/** WebSocket close codes we use (4000–4999 is the application range). */
export const CloseCode = {
  /** Mom rebooted the Wi-Fi: the client should reconnect with its token. */
  wifiReset: 4001,
  /** A newer connection took over this seat. */
  replaced: 4002,
  /** Silent for too long; probably a dead connection. */
  timeout: 4003,
  /** Unrecoverable protocol error. */
  protocol: 4004,
} as const;
