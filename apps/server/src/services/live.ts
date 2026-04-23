type ServerWebSocket = {
  send: (message: string) => void;
};

const sockets = new Set<ServerWebSocket>();

export function addAdminSocket(socket: ServerWebSocket) {
  sockets.add(socket);
}

export function removeAdminSocket(socket: ServerWebSocket) {
  sockets.delete(socket);
}

export function broadcastAdminUpdate(kind: string, payload: Record<string, unknown> = {}) {
  const message = JSON.stringify({ type: "admin:update", kind, payload, at: new Date().toISOString() });
  for (const socket of sockets) {
    try {
      socket.send(message);
    } catch {
      sockets.delete(socket);
    }
  }
}
