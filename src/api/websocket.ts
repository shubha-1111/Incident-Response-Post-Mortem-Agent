import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

const activeSockets = new Set<WebSocket>();

export function getActiveSocketCount(): number {
  return activeSockets.size;
}

/**
 * Sets up a WebSocket server on top of the active HTTP server instance.
 */
export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server });

  console.log('📡 WebSocket Server initialized alongside Express API Gateway');

  wss.on('connection', (ws: WebSocket) => {
    console.log('🔌 Client connected to WebSocket telemetry stream');
    (ws as any).isAlive = true;
    activeSockets.add(ws);

    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    ws.on('message', (message: any) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (err) {
        // Suppress parsing errors for unstructured messages
      }
    });

    ws.on('close', () => {
      activeSockets.delete(ws);
      console.log('🔌 Client disconnected from WebSocket telemetry stream');
    });

    ws.on('error', (err: any) => {
      console.error('[WebSocket] Socket error:', err.message);
      activeSockets.delete(ws);
    });

    // Send immediate initial connection confirmation
    ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  });

  // Heartbeat check: Ping clients every 30 seconds to prevent cloud load balancer idle terminations
  const interval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      if ((ws as any).isAlive === false) {
        console.warn('[WebSocket] Client heartbeat lost, terminating connection');
        return ws.terminate();
      }
      (ws as any).isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
}

/**
 * Broadcasts system event notifications and anomalies to all active WebSocket clients.
 */
export function broadcastAnomaly(anomalyEvent: any) {
  const payload = JSON.stringify({
    type: 'anomaly',
    data: anomalyEvent,
    timestamp: Date.now()
  });
  for (const ws of activeSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
