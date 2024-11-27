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
  };
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
  const headers: Record<string, string> = { "content-type": "application/json" };
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
  };
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
