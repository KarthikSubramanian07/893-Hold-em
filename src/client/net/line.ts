// A line to a table: what the store needs from a connection, and nothing else.
// Online it is a WebSocket to `/room/<code>`; in practice mode it is the engine
// running in this tab (see `local.ts`). Both speak the same JSON protocol.

export interface Line {
  /** True once the line is up and `send` will be delivered. */
  readonly open: boolean;
  /** Send one raw protocol message (a `ClientMessage` as JSON). */
  send(raw: string): void;
  close(): void;
}

export interface LineHandlers {
  onOpen(): void;
  /** One raw protocol message (a `ServerMessage` as JSON). */
  onMessage(raw: string): void;
  /** The line dropped on its own. Not called after `close()`. */
  onClose(): void;
}

/** A WebSocket to the rooms Worker. */
export function dialSocket(url: string, h: LineHandlers): Line {
  const ws = new WebSocket(url);
  let closed = false;
  ws.onopen = () => h.onOpen();
  ws.onmessage = (e) => h.onMessage(typeof e.data === 'string' ? e.data : '');
  ws.onclose = () => {
    if (!closed) h.onClose();
  };
  return {
    get open() {
      return ws.readyState === WebSocket.OPEN;
    },
    send: (raw) => ws.send(raw),
    close() {
      closed = true;
      ws.close();
    },
  };
}
