import { Model } from './model';
import { RestMethod } from './types';

/**
 * Abstract base class for sinks that handle messages.
 */
export abstract class Sink {
  abstract handleMessage(
    sender: string,
    schemaDigest: string,
    message: string,
    session: string
  ): Promise<void>;

  abstract handleRest(
    method: RestMethod,
    endpoint: string,
    message: Model<any> | null
  ): Promise<void>;
}

/**
 * Dispatches incoming messages to internal sinks.
 */
class Dispatcher {
  private _sinks: Map<string, Set<Sink>> = new Map();

  get sinks(): Map<string, Set<Sink>> {
    return this._sinks;
  }

  register(address: string, sink: Sink): void {
    const destinations = this._sinks.get(address) ?? new Set();
    destinations.add(sink);
    this._sinks.set(address, destinations);
  }

  unregister(address: string, sink: Sink): void {
    const destinations = this._sinks.get(address);
    if (!destinations) {
      return;
    }
    destinations.delete(sink);
    if (destinations.size === 0) {
      this._sinks.delete(address);
      return;
    }
    this._sinks.set(address, destinations);
  }

  contains(address: string): boolean {
    return this._sinks.has(address);
  }

  async dispatchMsg(
    sender: string,
    destination: string,
    schemaDigest: string,
    message: string,
    session: string
  ): Promise<void> {
    const handlers = this._sinks.get(destination) || new Set();
    for (const handler of handlers) {
      await handler.handleMessage(sender, schemaDigest, message, session);
    }
  }

  async dispatchRest(
    destination: string,
    method: RestMethod,
    endpoint: string,
    message: Model<any> | null
  ): Promise<Model<any> | void> {
    const handlers = this._sinks.get(destination) || new Set();
    for (const handler of handlers) {
      return await handler.handleRest(method, endpoint, message);
    }
  }
}

export const dispatcher = new Dispatcher();
