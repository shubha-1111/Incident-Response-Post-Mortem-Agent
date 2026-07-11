import { EventEmitter } from 'events';

class IncidentEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
  }
}

export const eventBus = new IncidentEventBus();
