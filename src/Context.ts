import { Logger, LogLevel, log } from './utils';
import { Model } from './model';
import { KeyValueStore } from './Storage';
import { SigningStargateClient } from "@cosmjs/stargate";
import { v4 as uuidv4 } from 'uuid';
import {
  DeliveryStatus,
  MsgStatus,
  MsgDigest,
} from './types';
import { Envelope } from './Envelope';
import { dispatcher } from './Dispatch';
import {
  ALMANAC_API_URL,
  DEFAULT_ENVELOPE_TIMEOUT_SECONDS,
  DEFAULT_SEARCH_LIMIT
} from './Config';
import { Resolver } from './Resolver';
import { Protocol } from './Protocol';
import { z } from 'zod';
import { Identity } from './crypto';

export interface Dispenser {
  addEnvelope: (
    envelope: Envelope,
    endpoints: string[],
    responseFuture: Promise<any>,
    sync?: boolean
  ) => void;
}

export const ErrorMessage = z.object({
  error: z.string(),
  details: z.string().optional()
}).openapi({ title: "ErrorMessage" });

export type ErrorMessageType = z.infer<typeof ErrorMessage>;

const ERROR_MESSAGE_DIGEST = Model.buildSchemaDigest(ErrorMessage);

// Agent representation interface
export interface AgentRepresentation {
  address: string;
  signDigest: (digest: Buffer) => string;
}

// Add these helper functions at the top of the file
function parseIdentifier(identifier: string): [string, string, string] {
  let prefix = "";
  let name = "";
  let address = "";

  if (identifier.includes("://")) {
    [prefix, identifier] = identifier.split("://", 2) as [string, string];
  }

  if (identifier.includes("/")) {
    [name, identifier] = identifier.split("/", 2) as [string, string];
  }

  if (isValidAddress(identifier)) {
    address = identifier;
  } else {
    name = identifier;
  }

  return [prefix, name, address];
}

// Add isValidAddress helper
function isValidAddress(address: string): boolean {
  // Implement address validation logic
  return true; // Temporary implementation
}

/**
 * Represents the context in which messages are handled and processed.
 */
export abstract class Context {
  /**
   * Get the agent representation associated with the context.
   */
  abstract get agent(): AgentRepresentation; // Need to define AgentRepresentation interface

  /**
   * Get the key-value store associated with the context.
   */
  abstract get storage(): KeyValueStore;

  /**
   * Get the ledger client associated with the context.
   */
  abstract get ledger(): SigningStargateClient;

  /**
   * Get the logger instance associated with the context.
   */
  abstract get logger(): Logger;

  /**
   * Get the session UUID associated with the context.
   */
  abstract get session(): string;

  /**
   * Retrieve a list of agent addresses using a specific protocol digest.
   *
   * @param protocolDigest The protocol digest to search for, starting with "proto:".
   * @param limit The maximum number of agent addresses to return.
   * @param logger Optional logger instance.
   */
  abstract getAgentsByProtocol(
    protocolDigest: string,
    limit?: number,
    logger?: Logger
  ): Promise<string[]>;

  /**
   * Broadcast a message to agents with a specific protocol.
   *
   * @param destinationProtocol The protocol to filter agents by.
   * @param message The message to broadcast.
   * @param limit The maximum number of agents to send the message to.
   * @param timeout The timeout for sending each message.
   */
  abstract broadcast(
    destinationProtocol: string,
    message: Model<any>,
    limit?: number,
    timeout?: number
  ): Promise<MsgStatus[]>;

  /**
   * Send a message to the specified destination.
   *
   * @param destination The destination address to send the message to.
   * @param message The message to be sent.
   * @param sync Whether to send the message synchronously or asynchronously.
   * @param timeout The optional timeout for sending the message, in seconds.
   */
  abstract send(
    destination: string,
    message: Model<any>,
    sync?: boolean,
    timeout?: number
  ): Promise<MsgStatus>;

  /**
   * Send a message to the specified destination where the message body and
   * message schema digest are sent separately.
   *
   * @param destination The destination address to send the message to.
   * @param messageSchemaDigest The schema digest of the message to be sent.
   * @param messageBody The JSON-encoded message body to be sent.
   * @param sync Whether to send the message synchronously or asynchronously.
   * @param timeout The optional timeout for sending the message, in seconds.
   * @param protocolDigest The protocol digest of the message to be sent.
   * @param queries The dictionary of queries to resolve.
   */
  abstract sendRaw(
    destination: string,
    messageSchemaDigest: string,
    messageBody: string,
    sync?: boolean,
    timeout?: number,
    protocolDigest?: string,
    queries?: Map<string, Promise<any>>
  ): Promise<MsgStatus>;

  /**
   * Send a message to the wallet of the specified destination.
   *
   * @param destination The destination address to send the message to.
   * @param text The text of the message to be sent.
   * @param msgType The type of the message to be sent.
   */
  abstract sendWalletMessage(
    destination: string,
    text: string,
    msgType?: number
  ): Promise<void>;
}

/**
 * Represents the internal context for proactive behaviour.
 */
export class InternalContext extends Context {
  protected _agent: AgentRepresentation;
  protected _storage: KeyValueStore;
  protected _ledger: SigningStargateClient;
  protected _resolver: Resolver;
  protected _dispenser: Dispenser; // Need to define Dispenser interface
  protected _logger?: Logger;
  protected _session: string;
  protected _intervalMessages?: Set<string>;
  protected _walletMessagingClient?: any; // TODO: Define proper type
  protected _outboundMessages: Map<string, [string, string]> = new Map();

  constructor(
    agent: AgentRepresentation,
    storage: KeyValueStore,
    ledger: SigningStargateClient,
    resolver: Resolver,
    dispenser: Dispenser,
    session?: string,
    intervalMessages?: Set<string>,
    walletMessagingClient?: any,
    logger?: Logger,
  ) {
    super();
    this._agent = agent;
    this._storage = storage;
    this._ledger = ledger;
    this._resolver = resolver;
    this._dispenser = dispenser;
    this._logger = logger;
    this._session = session || uuidv4();
    this._intervalMessages = intervalMessages;
    this._walletMessagingClient = walletMessagingClient;
  }

  get agent(): AgentRepresentation {
    return this._agent;
  }

  get storage(): KeyValueStore {
    return this._storage;
  }

  get ledger(): SigningStargateClient {
    return this._ledger;
  }

  get logger(): Logger {
    // Provide a default logger if none exists
    if (!this._logger) {
      this._logger = {
        logLevel: LogLevel.INFO,
        name: "internal"
      };
    }
    return this._logger;
  }

  get session(): string {
    return this._session;
  }

  get outboundMessages(): Map<string, [string, string]> {
    return this._outboundMessages;
  }

  /**
   * @deprecated Please use `ctx.agent.address` instead.
   */
  get address(): string {
    return this.agent.address;
  }

  async getAgentsByProtocol(
    protocolDigest: string,
    limit: number = DEFAULT_SEARCH_LIMIT,
    logger?: Logger
  ): Promise<string[]> {
    if (!protocolDigest.startsWith('proto:')) {
      log(`Invalid protocol digest: ${protocolDigest}`, logger);
      return [];
    }

    const almanacApiUrl = (this._resolver as any)._almanacApiResolver?._almanacApiUrl || ALMANAC_API_URL;

    try {
      const response = await fetch(`${almanacApiUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: protocolDigest.slice(6) }),
        signal: AbortSignal.timeout(DEFAULT_ENVELOPE_TIMEOUT_SECONDS * 1000),
      });

      if (response.ok) {
        const data = await response.json();
        const agents = data
          .filter((agent: any) => agent.status === 'active')
          .map((agent: any) => agent.address);
        return agents.slice(0, limit);
      }
    } catch (error) {
      log(`Failed to query Almanac API: ${error}`, logger);
    }

    return [];
  }

  async broadcast(
    destinationProtocol: string,
    message: Model<any>,
    limit: number = DEFAULT_SEARCH_LIMIT,
    timeout: number = DEFAULT_ENVELOPE_TIMEOUT_SECONDS
  ): Promise<MsgStatus[]> {
    const agents = await this.getAgentsByProtocol(destinationProtocol, limit, this.logger);

    if (!agents.length) {
      log(
        `No active agents found for: ${destinationProtocol}`,
        this.logger
      );
      return [];
    }

    // Remove self from broadcast list if present
    const filteredAgents = agents.filter(addr => addr !== this.agent.address);

    // Send messages in parallel
    const promises = filteredAgents.map(address =>
      this.send(address, message, false, timeout)
    );

    const results = await Promise.all(promises);
    log(`Sent ${results.length} messages`, this.logger);

    return results;
  }

  /**
   * Check if the message is a valid interval message.
   */
  protected _isValidIntervalMessage(schemaDigest: string): boolean {
    if (this._intervalMessages) {
      return this._intervalMessages.has(schemaDigest);
    }
    return true;
  }

  /**
   * This is the pro-active send method which is used in on_event and
   * on_interval methods. In these methods, interval messages are set but
   * we don't have access properties that are only necessary in re-active
   * contexts, like 'replies', 'message_received', or 'protocol'.
   */
  async send(
    destination: string,
    message: Model<any>,
    sync: boolean = false,
    timeout: number = DEFAULT_ENVELOPE_TIMEOUT_SECONDS
  ): Promise<MsgStatus> {
    const schemaDigest = Model.buildSchemaDigest(message);
    const messageBody = JSON.stringify(message.dump({}));

    if (!this._isValidIntervalMessage(schemaDigest)) {
      log(`Invalid interval message: ${message}`, this.logger);
      return {
        status: DeliveryStatus.FAILED,
        detail: "Invalid interval message",
        destination,
        endpoint: "",
        session: this._session
      };
    }

    return this.sendRaw(
      destination,
      schemaDigest,
      messageBody,
      sync,
      timeout
    );
  }

  /**
   * Send a message to the specified destination where the message body and
   * message schema digest are sent separately.
   */
  async sendRaw(
    destination: string,
    messageSchemaDigest: string,
    messageBody: string,
    sync: boolean = false,
    timeout: number = DEFAULT_ENVELOPE_TIMEOUT_SECONDS,
    protocolDigest?: string,
    queries?: Map<string, Promise<any>>
  ): Promise<MsgStatus> {
    // Extract address from destination agent identifier if present
    const [, , parsedAddress] = parseIdentifier(destination);

    if (parsedAddress) {
      // Handle local dispatch of messages
      if (dispatcher.contains(parsedAddress)) {
        await dispatcher.dispatchMsg(
          this.agent.address,
          parsedAddress,
          messageSchemaDigest,
          messageBody,
          this._session
        );
        return {
          status: DeliveryStatus.DELIVERED,
          detail: "Message dispatched locally",
          destination: parsedAddress,
          endpoint: "",
          session: this._session
        };
      }

      // Handle sync dispatch of messages
      if (queries?.has(parsedAddress)) {
        const query = queries.get(parsedAddress)!;
        queries.delete(parsedAddress);
        await query;
        return {
          status: DeliveryStatus.DELIVERED,
          detail: "Sync message resolved",
          destination: parsedAddress,
          endpoint: "",
          session: this._session
        };
      }

      this._outboundMessages.set(parsedAddress, [messageBody, messageSchemaDigest]);
    }

    // Resolve destination using the resolver
    const [destinationAddress, endpoints] = await this._resolver.resolve(destination);

    if (!endpoints.length || !destinationAddress) {
      log("Unable to resolve destination endpoint", this.logger);
      return {
        status: DeliveryStatus.FAILED,
        detail: "Unable to resolve destination endpoint",
        destination,
        endpoint: "",
        session: this._session
      };
    }

    // Calculate when the envelope expires
    const expires = Math.floor(Date.now() / 1000) + timeout;

    // Handle external dispatch of messages
    const env = new Envelope({
      version: 1,
      sender: this.agent.address,
      target: destinationAddress,
      session: this._session,
      schemaDigest: messageSchemaDigest,
      protocolDigest,
      expires
    });

    env.encodePayload(messageBody);
    env.sign({ signDigest: this.agent.signDigest } as Identity);

    // Create awaitable future for MsgStatus and sync response
    const responseFuture = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error("Timeout")), timeout * 1000);
    });

    this._queueEnvelope(env, endpoints, responseFuture, sync);

    try {
      const result = await responseFuture;
      if (result instanceof Envelope) {
        return {
          status: DeliveryStatus.DELIVERED,
          detail: "Sync response received",
          destination,
          endpoint: endpoints[0] || "",
          session: this._session
        };
      }
      return result as MsgStatus;
    } catch (error) {
      log("Timeout waiting for dispense response", this.logger);
      return {
        status: DeliveryStatus.FAILED,
        detail: "Timeout waiting for response",
        destination,
        endpoint: "",
        session: this._session
      };
    }
  }

  /**
   * Queue an envelope for processing.
   */
  protected _queueEnvelope(
    envelope: Envelope,
    endpoints: string[],
    responseFuture: Promise<any>,
    sync: boolean = false
  ): void {
    this._dispenser.addEnvelope(envelope, endpoints, responseFuture, sync);
  }

  /**
   * Send a message to the wallet of the specified destination.
   */
  async sendWalletMessage(
    destination: string,
    text: string,
    msgType: number = 1
  ): Promise<void> {
    if (this._walletMessagingClient) {
      await this._walletMessagingClient.send(destination, text, msgType);
    } else {
      log("Cannot send wallet message: no client available", this.logger);
    }
  }
}

/**
 * Represents the reactive context in which messages are handled and processed.
 */
export class ExternalContext extends InternalContext {
  private _queries: Map<string, Promise<any>>;
  private _replies?: Map<string, Map<string, typeof Model>>;
  private _messageReceived: MsgDigest;
  private _protocol: [string, Protocol | null];

  constructor(
    messageReceived: MsgDigest,
    agent: AgentRepresentation,
    storage: KeyValueStore,
    ledger: SigningStargateClient,
    resolver: Resolver,
    dispenser: Dispenser,
    queries?: Map<string, Promise<any>>,
    replies?: Map<string, Map<string, typeof Model>>,
    protocol?: [string, Protocol],
    session?: string,
    intervalMessages?: Set<string>,
    walletMessagingClient?: any,
    logger?: Logger,
  ) {
    super(
      agent,
      storage,
      ledger,
      resolver,
      dispenser,
      session,
      intervalMessages,
      walletMessagingClient,
      logger
    );
    this._queries = queries || new Map();
    this._replies = replies;
    this._messageReceived = messageReceived;
    this._protocol = protocol || ["", null];
  }

  /**
   * Check if the message type is a valid reply to the message received.
   */
  private _isValidReply(messageSchemaDigest: string): boolean {
    if (messageSchemaDigest === ERROR_MESSAGE_DIGEST) {
      return true;
    }

    if (!this._messageReceived) {
      throw new Error("No message received");
    }

    if (!this._replies) {
      return true;
    }

    const received = this._messageReceived;
    const allowedReplies = this._replies.get(received.schema_digest);
    if (allowedReplies) {
      return allowedReplies.has(messageSchemaDigest);
    }
    return false;
  }

  /**
   * Send a message to the specified destination.
   * This is the re-active send method - at this point we have received a message
   * and have built a context. Replies, message_received, and protocol are set.
   */
  async send(
    destination: string,
    message: Model<any>,
    sync: boolean = false,
    timeout: number = DEFAULT_ENVELOPE_TIMEOUT_SECONDS
  ): Promise<MsgStatus> {
    const schemaDigest = Model.buildSchemaDigest(message);

    if (!this._isValidReply(schemaDigest)) {
      log(
        `Outgoing message '${message.constructor.name}' is not a valid reply to received message: ${this._messageReceived.schema_digest}`,
        this.logger
      );
      return {
        status: DeliveryStatus.FAILED,
        detail: "Invalid reply",
        destination,
        endpoint: "",
        session: this._session
      };
    }

    return this.sendRaw(
      destination,
      schemaDigest,
      JSON.stringify(message.dump({})),
      sync,
      timeout,
      this._protocol[0],
      this._queries
    );
  }
}

// Export both context types
export type ContextType = InternalContext | ExternalContext;
