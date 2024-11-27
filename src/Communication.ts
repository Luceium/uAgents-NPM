import { v4 as uuidv4 } from 'uuid';

import { DEFAULT_ENVELOPE_TIMEOUT_SECONDS } from "./Config";
import { Identity, isUserAddress } from "./crypto";
import { dispatcher } from "./Dispatch";
import { Envelope, EnvelopeHistory, EnvelopeHistoryEntry } from "./Envelope";
import { Model } from "./model";
import { GlobalResolver, Resolver } from "./Resolver";
import { DeliveryStatus, MsgStatus } from "./types";
import { getLogger, LogLevel, log } from "./utils";

const logger = getLogger(LogLevel.DEBUG, "dispenser");

class Dispenser {
  private _envelopes: { envelope: Envelope; strings: string[]; future: Promise<any>; flag: boolean; }[];
  private _msgCacheRef: EnvelopeHistory | null;

  constructor(msgCacheRef?: EnvelopeHistory) {
    this._envelopes = [];
    this._msgCacheRef = msgCacheRef || null;
  }

  /**
   * Add an envelope to the dispenser.
   *
   * @param envelope - The envelope to send.
   * @param endpoints - The endpoints to send the envelope to.
   * @param responseFuture - The future to set the response on.
   * @param sync - True if the message is synchronous. Defaults to False.
   */
  addEnvelope(
    envelope: Envelope,
    endpoints: string[],
    responseFuture: Promise<any>,
    sync: boolean = false
  ): void {
    this._envelopes.push({ envelope, strings: endpoints, future: responseFuture, flag: sync });
  }

  /**
   * Executes the dispenser routine.
   */
  async run(): Promise<void> {
    while (true) {
      return
    }
  }
}

async function dispatchLocalMessage(
  sender: string,
  destination: string,
  schemaDigest: string,
  message: string,
  sessionId: string
): Promise<MsgStatus> {
  await dispatcher.dispatchMsg(sender, destination, schemaDigest, message, sessionId);
  return {
    status: DeliveryStatus.DELIVERED,
    detail: "Message dispatched locally",
    destination,
    endpoint: "",
    session: sessionId
  } as MsgStatus;
}

/**
 * Method to send an exchange envelope.
 *
 * @param envelope - The envelope to send.
 * @param endpoints - The endpoints to send the envelope to.
 * @param sync - True if the message is synchronous. Defaults to False.
 * @returns The status of the message delivery.
 */
async function sendExchangeEnvelope(
  envelope: Envelope,
  endpoints: string[],
  sync: boolean = false
): Promise<MsgStatus | Envelope> {
  const headers: {[key: string]: string} = { "content-type": "application/json" };
  if (sync) {
    headers["x-uagents-connection"] = "sync";
  }

  const errors: string[] = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(envelope),
      });

      if (response.ok) {
        if (sync) {
          const env = Envelope.modelValidate(await response.json());
          if (env.signature) {
            let verified = false;
            try {
              verified = env.verify();
            } catch (ex) {
              errors.push(`Received response envelope that failed verification: ${ex}`);
            }
            if (!verified) {
              continue;
            }
          }
          return await dispatchSyncResponseEnvelope(env);
        }
        return {
          status: DeliveryStatus.DELIVERED,
          detail: "Message successfully delivered via HTTP",
          destination: envelope.target,
          endpoint,
          session: envelope.session,
        };
      }
      errors.push(await response.text());
    } catch (ex) {
      errors.push(`Failed to send message: ${ex}`);
    }
  }

  // If here, message delivery to all endpoints failed
  log(`Failed to deliver message to ${envelope.target} @ ${endpoints}: ${errors.join(", ")}`, logger);
  return {
    status: DeliveryStatus.FAILED,
    detail: "Message delivery failed",
    destination: envelope.target,
    endpoint: "",
    session: envelope.session,
  } as MsgStatus;
}

async function dispatchSyncResponseEnvelope(env: Envelope): Promise<MsgStatus | Envelope> {
  // If there are no sinks registered, return the envelope back to the caller
  if (dispatcher.sinks.size === 0) return env;
  
  await dispatcher.dispatchMsg(
    env.sender,
    env.target,
    env.schemaDigest,
    env.decodePayload(),
    env.session
  );
  return {
    status: DeliveryStatus.DELIVERED,
    detail: "Sync message successfully delivered via HTTP",
    destination: env.target,
    endpoint: "",
    session: env.session,
  };
}

/**
 * Sends a message to an agent.
 *
 * @param destination - The destination address to send the message to.
 * @param messageSchemaDigest - The schema digest of the message.
 * @param messageBody - The JSON-formatted message to be sent.
 * @param responseType - The optional type of the response message.
 * @param sender - The optional sender identity or user address.
 * @param resolver - The optional resolver for address-to-endpoint resolution.
 * @param timeout - The timeout for the message response in seconds. Defaults to 30.
 * @param sync - True if the message is synchronous.
 * @returns A promise that resolves to either a Model, JsonStr, MsgStatus, or Envelope.
 */
async function sendMessageRaw(
  destination: string,
  messageSchemaDigest: string,
  messageBody: string,
  responseType?: any,
  sender?: Identity | string,
  resolver?: Resolver,
  timeout: number = DEFAULT_ENVELOPE_TIMEOUT_SECONDS,
  sync: boolean = false
): Promise<any> {
  let senderAddress: string | undefined;
  if (typeof sender === 'string' && isUserAddress(sender)) {
    senderAddress = sender;
  }
  if (!sender) {
    sender = Identity.generate();
  }
  if (sender instanceof Identity) {
    senderAddress = sender.getAddress;
  }
  if (!senderAddress) {
    throw new Error("Invalid sender address");
  }

  if (!resolver) resolver = new GlobalResolver();

  const [destinationAddress, endpoints] = await resolver.resolve(destination);
  if (!endpoints || !destinationAddress) {
    return {
      status: DeliveryStatus.FAILED,
      detail: "Failed to resolve destination address",
      destination,
      endpoint: "",
      session: undefined,
    } as MsgStatus;
  }

  const env = new Envelope({
    version: 1,
    sender: senderAddress,
    target: destinationAddress,
    session: uuidv4(),
    schemaDigest: messageSchemaDigest,
    expires: Math.floor(Date.now() / 1000) + timeout,
  });
  env.encodePayload(messageBody);
  if (!isUserAddress(senderAddress) && sender instanceof Identity) {
    env.sign(sender);
  }

  const response = await sendExchangeEnvelope(
    env,
    endpoints,
    sync,
  );
  if (response instanceof Envelope) {
    if (!env.signature) {
      return response;
    }
    const jsonMessage = response.decodePayload();
    if (responseType) {
      return responseType.modelValidateJson(jsonMessage);
    }
    return jsonMessage;
  }
  return response;
}

/**
 * Standalone function to send a message to an agent.
 *
 * @param destination - The destination address to send the message to.
 * @param message - The message to be sent.
 * @param responseType - The optional type of the response message.
 * @param sender - The optional sender identity or user address.
 * @param resolver - The optional resolver for address-to-endpoint resolution.
 * @param timeout - The timeout for the message response in seconds. Defaults to 30.
 * @param sync - True if the message is synchronous.
 * @returns A promise that resolves to either a Model, JsonStr, MsgStatus, or Envelope.
 */
async function sendMessage(
  destination: string,
  message: Model<any>,
  responseType?: any,
  sender?: Identity | string,
  resolver?: Resolver,
  timeout: number = DEFAULT_ENVELOPE_TIMEOUT_SECONDS,
  sync: boolean = false
): Promise<any> {

  return await sendMessageRaw(
    destination,
    Model.buildSchemaDigest(message),
    message.dumpJson(message),
    responseType,
    sender,
    resolver,
    timeout,
    sync
  );
}

/**
 * Sends a synchronous message to an agent.
 *
 * @param destination - The destination address to send the message to.
 * @param message - The message to be sent, encapsulated in a Model instance.
 * @param responseType - The optional type of the response message.
 * @param sender - The optional sender identity or user address.
 * @param resolver - The optional resolver for address-to-endpoint resolution.
 * @param timeout - The timeout for the message response in seconds. Defaults to 30.
 * @returns A promise that resolves to either a Model, MsgStatus, or Envelope.
 */
async function sendSyncMessage(
  destination: string,
  message: Model<any>,
  responseType?: any,
  sender?: Identity | string,
  resolver?: Resolver,
  timeout: number = DEFAULT_ENVELOPE_TIMEOUT_SECONDS
): Promise<Model<any> | MsgStatus | Envelope> {
  return await sendMessage(
    destination,
    message,
    responseType,
    sender,
    resolver,
    timeout,
    true
  );
}

/**
 * Encloses a response message within an envelope.
 *
 * @param message - The response message to enclose, encapsulated in a Model instance.
 * @param sender - The sender's address.
 * @param session - The session identifier.
 * @param target - The target address. Defaults to an empty string.
 * @returns The JSON representation of the response envelope.
 */
function encloseResponse(
  message: Model<any>,
  sender: string,
  session: string,
  target: string = ""
): string {
  return encloseResponseRaw(
    message.dumpJson(message),
    Model.buildSchemaDigest(message),
    sender,
    session,
    target
  );
}

/**
 * Encloses a raw response message within an envelope.
 *
 * @param jsonMessage - The JSON-formatted response message to enclose.
 * @param schemaDigest - The schema digest of the message.
 * @param sender - The sender's address.
 * @param session - The session identifier.
 * @param target - The target address. Defaults to an empty string.
 * @returns The JSON representation of the response envelope.
 */
function encloseResponseRaw(
  jsonMessage: string,
  schemaDigest: string,
  sender: string,
  session: string,
  target: string = ""
): string {
  const responseEnv = new Envelope({
    version: 1,
    sender: sender,
    target: target,
    session: session,
    schemaDigest: schemaDigest,
  });

  responseEnv.encodePayload(jsonMessage);
  return JSON.stringify(responseEnv, null, 0); // Envelope doesn't have a toJSON method...
}

export {
  sendMessage,
  sendSyncMessage,
  encloseResponse,
  encloseResponseRaw
};
