import { z, ZodError } from 'zod';

import axios from 'axios';

// Cosmpy-related imports (skipping for now)
// this might be a blocker, interacting with the Fetch chain seems to only be through Fetch.ai's fork of Cosmpy
// from cosmpy.aerial.client import LedgerClient
// from cosmpy.aerial.wallet import LocalWallet, PrivateKey
// from cosmpy.crypto.address import Address

// import { ASGIServer } from './ASGIServer';
// import { Dispenser } from './Dispenser';
import {
    AVERAGE_BLOCK_INTERVAL,
    LEDGER_PREFIX,
    MAINNET_PREFIX,
    REGISTRATION_RETRY_INTERVAL_SECONDS,
    REGISTRATION_UPDATE_INTERVAL_SECONDS,
    TESTNET_PREFIX,
    parseAgentverseConfig,
    parseEndpointConfig,
} from './Config';
// import { Context, ContextFactory, ExternalContext, InternalContext } from './Context';
// import { Identity, deriveKeyFromSeed, isUserAddress } from './Crypto';
// import { Sink, Dispatcher } from './Dispatch';
// import { EnvelopeHistory, EnvelopeHistoryEntry } from './Envelope';
// import { MailboxClient } from './Mailbox';
import { ErrorMessage, Model } from './model'; // ErrorMessage will just be a string
// import { InsufficientFundsError, getAlmanacContract, getLedger } from './Network';
// import { Protocol } from './Protocol';
// import {
//     AgentRegistrationPolicy,
//     AgentStatusUpdate,
//     DefaultRegistrationPolicy,
//     updateAgentStatus,
// } from './Registration';
// import { GlobalResolver, Resolver } from './Resolver';
// import { KeyValueStore, getOrCreatePrivateKeys } from './Storage';
import {
    AgentEndpoint,
    AgentInfo,
    AgentMetadata,
    EventCallback,
    IntervalCallback,
    MessageCallback,
    MsgDigest,
    RestGetHandler,
    RestHandler,
    RestHandlerMap,
    RestMethod,
    RestPostHandler,
} from './types';
import { getLogger, Logger, LogLevel, log } from './utils';

type SigningCallback = (data: Uint8Array) => string;

/**
 * Run the provided interval callback function at a specified period.
 *
 * @param {IntervalCallback} func - The interval callback function to run.
 * @param {Logger} logger - The logger instance for logging interval handler activities.
 * @param {ContextFactory} context_factory - The factory function for creating the context.
 * @param {number} period - The time period at which to run the callback function, in seconds.
 * @returns {Promise<void>}
 */
async function runInterval(
  func: IntervalCallback,
  logger: Logger,
  context_factory: ContextFactory,
  period: number
): Promise<void> {
  while (true) {
    try {
      const ctx = context_factory();
      await func(ctx);
    } catch (ex: unknown) {
      if (ex instanceof Error) {
        log(`Exception in interval handler: ${ex.message}`, logger);
      } else {
        log(`Unknown error in interval handler`, logger);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, period * 1000));
  }
}

/**
 * Delay the execution of the provided asynchronous function by the specified number of seconds.
 *
 * @param {() => Promise<void>} coroutine - The coroutine (an asynchronous function) to delay.
 * @param {number} delaySeconds - The delay time in seconds.
 * @returns {Promise<void>}
 */
async function delay(coroutine: () => Promise<void>, delaySeconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  await coroutine();
}

/**
 * Send an error message to the specified destination.
 *
 * @param {Context} ctx - The context for the agent.
 * @param {string} destination - The destination address to send the error message to.
 * @param {ErrorMessage} msg - The error message to send.
 * @returns {Promise<void>} A promise that resolves when the message is sent.
 */
async function sendErrorMessage(
  ctx: Context,
  destination: string,
  msg: ErrorMessage
): Promise<void> {
  await ctx.send(destination, msg);
}

/**
 * Represents an agent in the context of a message.
 *
 * @property {string} name - The name of the agent or a truncated address if no name is provided.
 * @property {string} address - The address of the agent.
 * @property {string} identifier - The agent's address and network prefix.
 */
export class AgentRepresentation {
  private _name?: string;
  private _address: string;
  private signingCallback: SigningCallback;

  /**
   * Initialize the AgentRepresentation instance.
   *
   * @param {string} address - The address of the context.
   * @param {string | undefined} name - The optional name associated with the context.
   * @param {SigningCallback} signingCallback - The callback for signing messages.
   */
  constructor(address: string, name: string | undefined, signingCallback: SigningCallback) {
    this._address = address;
    this._name = name;
    this.signingCallback = signingCallback;
  }

  /**
   * Get the name associated with the context or a truncated address if name is None.
   *
   * @returns {string} The name or truncated address.
   */
  get name(): string {
    return this._name ? this._name : this._address.slice(0, 10);
  }

  /**
   * Get the full address of the agent.
   *
   * @returns {string} The full address of the agent.
   */
  get address(): string {
    return this._address;
  }

  /**
   * Get the identifier of the agent used for communication including the network prefix.
   *
   * @returns {string} The agent's address and network prefix.
   */
  get identifier(): string {
    return `${TESTNET_PREFIX}://${this._address}`;
  }

  /**
   * Sign the provided data with the callback of the agent's identity.
   *
   * @param {Uint8Array} data - The data to sign.
   * @returns {string} The signature of the data.
   */
  signDigest(data: Uint8Array): string {
    return this.signingCallback(data);
  }
}

export class Agent extends Sink {

}
