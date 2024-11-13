import { z, ZodError } from 'zod';

import axios from 'axios';

// Cosmpy-related imports (skipping for now)
// this might be a blocker, interacting with the Fetch chain seems to only be through Fetch.ai's fork of Cosmpy
// from cosmpy.aerial.client import LedgerClient
// from cosmpy.aerial.wallet import LocalWallet, PrivateKey
// from cosmpy.crypto.address import Address

import { ASGIServer } from './ASGI';
import { Dispenser } from './Communication';
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
import { Context, ContextFactory, ExternalContext, InternalContext } from './Context';
import { Identity, deriveKeyFromSeed, isUserAddress } from './crypto';
import { Sink, dispatcher } from './Dispatch';
import { EnvelopeHistory, EnvelopeHistoryEntry } from './Envelope';
import { MailboxClient } from './Mailbox';
import { ErrorMessage, Model } from './model'; // ErrorMessage will just be a string
import { InsufficientFundsError, getAlmanacContract, getLedger } from './Network';
import { Protocol } from './Protocol';
import {
    AgentRegistrationPolicy,
    AgentStatusUpdate,
    DefaultRegistrationPolicy,
    updateAgentStatus,
} from './Registration';
import { GlobalResolver, Resolver } from './Resolver';
import { KeyValueStore, getOrCreatePrivateKeys } from './Storage';
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

/**
 * An agent that interacts within a communication environment.
 *
 * @class Agent
 * @extends Sink
 */
export class Agent extends Sink {
  private _agentverse: string | { [key: string]: string | boolean | null };
  private _almanacApiUrl: string | null = null;
  private _almanacContract: any; // not sure of type
  private _dispatcher = dispatcher
  // private _dispenser = new Dispenser(msgCacheRef=self._messageCache)
  private _enableAgentInspector: boolean;
  private _endpoints: AgentEndpoint[];
  private _identity!: Identity;
  private _intervalHandlers: Array<[Function, number]> = [];
  private _ledger: any; // not sure of type
  private _logger: Logger;
  private _loop: any; // not sure of type
  private _mailboxClient: MailboxClient;
  private _messageCache: EnvelopeHistory = new EnvelopeHistory();
  private _messageQueue: any; // TODO: default value of messageQueue was asyncio.Queue(); not sure what this is right now
  private _metadata!: { [key: string]: any };
  // private _models: { [key: string]: Model } = {}
  private _name: string | null;
  private _onStartup = []
  private _onShutdown = []
  private _port: number;
  // private _protocol: Protocol;
  private _queries: { [key: string]: any } = {} // TODO: values are of type asyncio.Future; not sure what this is right now
  private _registrationPolicy: AgentRegistrationPolicy;
  // private _replies: { [key: string]: { [key: string]: Model }} = {}
  private _resolver: Resolver;
  private _restHandlers: RestHandlerMap = {};
  private _server: ASGIServer;
  private _signedMessageHandlers: { [key: string]: Function } = {};
  private _storage: KeyValueStore;
  private _test: boolean;
  private _unsignedMessageHandlers: { [key: string]: Function } = {};
  private _useMailbox: boolean = false
  private _version: string;
  // private wallet: any; // TODO: set wallet type to Wallet options
  public protocols: { [key: string]: Protocol } = {};

  /**
    * Initializes an Agent instance.
    *
    * @param {string | null} name - The name of the agent.
    * @param {number} port - The port on which the agent's server will run.
    * @param {string | null} seed - The seed for generating keys.
    * @param {string | string[] | { [key: string]: any } | null} endpoint - The endpoint configuration.
    * @param {string | { [key: string]: any } | null} agentverse - The agentverse configuration.
    * @param {string | { [key: string]: string } | null} mailbox - The mailbox configuration.
    * @param {Resolver | null} resolve - The resolver to use for agent communication.
    * @param {AgentRegistrationPolicy | null} registrationPolicy - Registration policy for agents.
    * @param {boolean | { [key: string]: string }} enableWalletMessaging - Whether to enable wallet messaging. If '{"chain_id": CHAIN_ID}' is provided, this sets the chain ID for messaging server.
    * @param {number} walletKeyDerivationIndex - Index used for deriving wallet key (default is `0`).
    * @param {number | null} maxResolverEndpoints - Maximum number of endpoints to resolve (optional).
    * @param {string | null} version - Version of the agent (optional).
    * @param {boolean} test - True if the agent will register and transact on the testnet (default is `true`).
    * @param {any | null} loop - Event loop to use (optional).
    * @param {LogLevel} logLevel - Logging level for the agent (default is `INFO`).
    * @param {boolean} enableAgentInspector - Enable REST endpoints for debugging (default is `true`).
    */
  constructor(
    name: string | null = null,
    port: number = 8000,
    seed: string | null = null,
    endpoint: string | string[] | { [key: string]: any } | null = null,
    agentverse: string | { [key: string]: any } | null = null, // TODO: check if we want to make a type AgentverseConfig
    mailbox: string | { [key: string]: string } | null = null,
    resolve: Resolver | null = null,
    registrationPolicy: AgentRegistrationPolicy | null = null,
    enableWalletMessaging: boolean | { [key: string]: string } = false,
    walletKeyDerivationIndex: number = 0,
    maxResolverEndpoints: number | null = null,
    version: string | null = null,
    test: boolean = true,
    loop: any | null = null, // TODO: asyncio.AbstractEventLoop type
    logLevel: LogLevel = LogLevel.INFO, // TODO: look into logging levels. Python's logger takes in int,str, but our logger only takes str (modify utils?)
    enableAgentInspector: boolean = true,
    metadata: { [key: string]: any } | null = null
  ) {
    super();

    this._name = name;
    this._port = port;

    this._loop = loop;

    this.initializeWalletAndIdentity(seed, name, walletKeyDerivationIndex);
    this._logger = getLogger(logLevel, this._name || 'root'); // TODO: we should probably handle null names in utils.py instead

    // configure endpoints and mailbox
    this._endpoints = parseEndpointConfig(endpoint);
    if (mailbox) {
      // agentverse config overrides mailbox config
      // but mailbox is kept for backwards compatibilty
      if (agentverse) {
        log("Ignoring 'mailbox' since 'agentverse' overrides it.", this._logger);
      } else {
        agentverse = mailbox;
      }
    }

    this._agentverse = parseAgentverseConfig(agentverse);
    this._useMailbox = Boolean(this._agentverse.useMailbox);

    if (this._useMailbox) {
      this._mailboxClient = new MailboxClient(this, this._logger);
      // TODO: debug this. the Python version references "self.mailbox" but self.mailbox is never initialized... so the below never hits
      // this._endpoints.push({
      //   url: `${this.mailbox['http_prefix']}://${this.mailbox['base_url']}/v1/submit`,
      //   weight: 1
      // });
    } else {
      this._mailboxClient = undefined;
    }

    this._almanacApiUrl = `${this._agentverse.httpPrefix}://${this._agentverse.baseUrl}/v1/almanac`;
    this._resolver = resolve || new GlobalResolver({
      maxEndpoints: maxResolverEndpoints,
      almanacApiUrl: this._almanacApiUrl
    })

    this._ledger = getLedger(test)
    this._almanacContract = getAlmanacContract(test)
    this._storage = new KeyValueStore(this.address.slice(0, 16));
    this._test = test
    this._version = version || "0.1.0"

    this._registrationPolicy = registrationPolicy || new DefaultRegistrationPolicy({
      identity: this._identity,
      ledger: this._ledger,
      // wallet: this._wallet,
      almanacContract: this._almanacContract,
      test: this._test,
      logger: this._logger,
      almanacApiUrl: this._almanacApiUrl
    });

    this.initializeMetadata(metadata)
    // this.initializeWalletMessaging(enableWalletMessaging) // TODO: create initializeWalletMessaging()

    // initialize the internal agent protocol
    // this._protocol = Protocol({
    //   name: this._name,
    //   version: this._version
    // })

    // register with the dispatcher
    this._dispatcher.register(this.address, this)

    this._server = ASGIServer({
      port: this._port,
      loop: this._loop,
      queries: this._queries,
      logger: this._logger
    })


    this._enableAgentInspector = enableAgentInspector
    if (this._enableAgentInspector) {
      this.registerRestHandlers();
    }
  }

  /**
   * Register REST handlers for the agent inspector.
   */
  private registerRestHandlers(): void {
    // Register handler for /agent_info endpoint
    this.onRestGet("/agent_info", async (_ctx: Context): Promise<AgentInfo> => {
      return {
        agent_address: this.address,
        endpoints: this._endpoints,
        protocols: Object.keys(this.protocols),
      };
    });

    // Register handler for /messages endpoint
    this.onRestGet("/messages", async (_ctx: Context): Promise<EnvelopeHistory> => {
      return this._messageCache;
    });
  }

  /**
   * Placeholder method for registering GET routes.
   */
  private onRestGet(path: string, handler: (ctx: Context) => Promise<any>): void {
    console.log(`Registered GET route for ${path}`);
  }

  private buildContext(): void {

  }

  private initializeWalletAndIdentity(seed: string | null, name: string | null, walletKeyDerivationIndex: number = 0): void {
    if (seed == null) {
      // TODO: generate local wallet
      this._identity = Identity.generate()
    } else {
      this._identity = Identity.fromSeed(seed, 0)
      // TODO: set local wallet
    }

    if (name == null) {
      this._name = this.address.slice(0, 16);
    }
  }

  private initializeWalletMessaging(): void {
    // TODO
  }

  private initializeMetadata(metadata: { [key: string]: any } | null): { [key: string]: any } {
    if (!metadata) {
      return {};
    }

    try {
      // TODO: modify this after model class is finished
      // const model = AgentMetadata.validate(metadata);
      // const validatedMetadata = model.modelDump({ excludeUnset: true });
      // return validatedMetadata;
      return {}
    } catch (e) {
      throw e;
    }
  }

  /**
    * Get the name of the agent.
    *
    * @returns {string} The name of the agent.
    */
  get name(): string {
    return this._name || this.address.slice(0, 16);
  }

  /**
    * Get the address of the agent used for communication.
    *
    * @returns {string} The agent's address.
    */
  get address(): string {
    return this._identity.getAddress;
  }

  /**
    * Get the Agent Identifier, including network prefix and address.
    *
    * @returns {string} The agent's identifier.
    */
  get identifier(): string {
    const prefix = this._test ? TESTNET_PREFIX : MAINNET_PREFIX;
    return `${prefix}://${this._identity.getAddress}`;
  }

  /**
   * Get the wallet of the agent.
   *
   * @returns {LocalWallet} The agent's wallet.
   */
  // get wallet(): LocalWallet {
  //   return this._wallet;
  // }

  /**
   * Get the ledger client used by the agent.
   *
   * @returns {LedgerClient} The agent's ledger client.
   */
  // get ledger(): LedgerClient {
  //   return this._ledger;
  // }

  /**
    * Get the key-value store used by the agent for data storage.
    *
    * @returns {KeyValueStore} The key-value store instance.
    */
  get storage(): KeyValueStore {
    return this._storage;
  }

  /**
    * Get the mailbox configuration of the agent.
    *
    * Returns:
    * Agentverse overrides it but mailbox is kept for backwards compatibility.
    *
    * @returns {string | {[key:string]:string|boolean|null}} The mailbox configuration.
    */
  get mailbox(): string | { [key: string]: string | boolean | null } {
    return this._agentverse;
  }

  /**
  * Get the mailbox client used by the agent for mailbox communication.
  *
  * @returns {MailboxClient | undefined} The mailbox client instance or `undefined`.
  */
  get mailboxClient(): MailboxClient | null {
    return this._mailboxClient;
  }

  /**
   * Get the agentverse configuration of the agent.
   *
   * @returns {string | { [key: string]: string | boolean | null }} The agentverse configuration.
   */
  get agentverse(): string | { [key: string]: string | boolean | null } {
    return this._agentverse;
  }

  /**
   * Get the balance of the agent.
   *
   * @returns {number} The agent's bank balance.
   */
  // get balance(): number {
  //   return this.ledger.queryBankBalance(new Address(this.wallet.address()));
  // }

  /**
   * Get basic information about the agent.
   *
   * @returns {AgentInfo} The agent's address, endpoints, protocols, and metadata.
   */
  get info(): AgentInfo {
    return {
      agent_address: this.address,
      endpoints: this._endpoints,
      protocols: Object.keys(this.protocols)
    }
  }

  /**
   * Get metadata associated with the agent.
   *
   * @returns {{ [key: string]: any }} Metadata associated with the agent.
   */
  get metadata(): { [key: string]: any } {
    return this._metadata;
  }

  /**
   * Set a new mailbox configuration for the agent.
   * Agentverse overrides it but it's kept for backwards compatibility.
   *
   * @param {string | { [key: string]: string }} config - New mailbox configuration.
   */
  set mailbox(config: string | { [key: string]: string | boolean | null }) {
    this._agentverse = parseAgentverseConfig(config);
  }

  /**
   * Set a new agentverse configuration for the agent.
   *
   * @param {string | { [key: string]: string }} config - New AgentVerse configuration.
   */
  set agentverse(config: string | { [key: string]: string | boolean | null }) {
    this._agentverse = parseAgentverseConfig(config);
  }

  async handleMessage(sender: string, schemaDigest: string, message: string, session: string): Promise<void> {
    // TODO: verify parameter types
    await this._messageQueue.put([schemaDigest, sender, message, session]);
  }

  async handleRest(method: RestMethod, endpoint: string, message: Model<any> | null): Promise<void> {
      // TODO: implement handleRest()
  }
}
