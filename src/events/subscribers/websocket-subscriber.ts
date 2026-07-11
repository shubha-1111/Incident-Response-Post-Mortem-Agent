import { eventBus } from '../event-bus.js';
import { IncidentEventType } from '../event-types.js';
import { broadcastAnomaly } from '../../api/websocket.js';

export function registerWebsocketSubscriber() {
  // For backwards compatibility and live updates:
  // We hook into all IncidentEventTypes and broadcast them.
  // When the client receives it, it gets unpacked as message.data.event
  
  const eventsToBroadcast = Object.values(IncidentEventType);
  
  for (const eventType of eventsToBroadcast) {
    eventBus.on(eventType, (data) => {
      // Structure the data to match what the websocket handler expects
      broadcastAnomaly({
        event: eventType === IncidentEventType.WORKFLOW_STEP ? 'workflow_progress' : eventType,
        ...data
      });
    });
  }
}
