// Secure postMessage bridge between the editor host and the preview iframe.
// Both sides validate the namespace AND the expected origin before acting.

import { EDITOR_BRIDGE_NAMESPACE, type BridgeCommand, type BridgeMessage } from "./types";

export function isBridgeMessage(data: unknown): data is BridgeMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as { __ns?: unknown; command?: unknown };
  return (
    m.__ns === EDITOR_BRIDGE_NAMESPACE &&
    !!m.command &&
    typeof (m.command as { type?: unknown }).type === "string"
  );
}

export function sendBridgeCommand(target: Window, origin: string, command: BridgeCommand) {
  const msg: BridgeMessage = { __ns: EDITOR_BRIDGE_NAMESPACE, command };
  target.postMessage(msg, origin);
}

export interface BridgeListenerOptions {
  /** Allowed origin for incoming messages. Use the editor's own origin in dev. */
  allowedOrigin: string;
  onCommand: (command: BridgeCommand, source: MessageEventSource | null) => void;
}

export function attachBridgeListener({
  allowedOrigin,
  onCommand,
}: BridgeListenerOptions): () => void {
  function handler(event: MessageEvent) {
    // Hard origin gate — never accept messages from a foreign origin.
    if (event.origin !== allowedOrigin) return;
    if (!isBridgeMessage(event.data)) return;
    onCommand(event.data.command, event.source);
  }
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
