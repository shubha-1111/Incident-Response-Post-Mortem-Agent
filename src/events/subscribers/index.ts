import { registerSqliteSubscriber } from './sqlite-subscriber.js';
import { registerTimelineSubscriber } from './timeline-subscriber.js';
import { registerWebsocketSubscriber } from './websocket-subscriber.js';

export function registerEventSubscribers() {
  registerSqliteSubscriber();
  registerTimelineSubscriber();
  registerWebsocketSubscriber();
  console.log('[Events] Event Bus subscribers initialized.');
}
