import { CosmWasmClient, SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { Coin } from "@cosmjs/amino";

import { Identity } from "./crypto";
import { AgentEndpoint, AgentInfo } from "./types";
import { getLogger, LogLevel, log } from "./utils";
import {
  ALMANAC_CONTRACT_VERSION,
  ALMANAC_REGISTRATION_WAIT,
  AVERAGE_BLOCK_INTERVAL,
  MAINNET_CONTRACT_ALMANAC,
  MAINNET_CONTRACT_NAME_SERVICE,
  REGISTRATION_DENOM,
  REGISTRATION_FEE,
  TESTNET_CONTRACT_ALMANAC,
  TESTNET_CONTRACT_NAME_SERVICE,
  TESTNET_RPC,
  MAINNET_RPC,
  TESTNET_FAUCET,
} from "./Config";

const logger = getLogger(LogLevel.INFO, "network");

// Network configuration
const DEFAULT_QUERY_INTERVAL_SECS = 1;
const DEFAULT_QUERY_TIMEOUT_SECS = 30;

// Initialize clients
let _testnetClient: CosmWasmClient;
let _mainnetClient: CosmWasmClient;
let _faucetApi: FaucetApi | null = null;

export class InsufficientFundsError extends Error {
  constructor(message: string = "Insufficient funds for transaction") {
    super(message);
    this.name = "InsufficientFundsError";
  }
}

export class AlmanacContractRecord implements AgentInfo {
  contract_address!: string;
  sender_address!: string;
  timestamp?: number;
  signature?: string;
  agent_address!: string;
  endpoints!: AgentEndpoint[];
  protocols!: string[];

  constructor(data: Partial<AlmanacContractRecord>) {
    Object.assign(this, data);
  }

  sign(identity: Identity): void {
    this.timestamp = Math.floor(Date.now() / 1000) - ALMANAC_REGISTRATION_WAIT;
    this.signature = identity.signRegistration(
      this.contract_address,
      this.timestamp,
      this.sender_address
    );
  }
}

/**
 * Get the Ledger client.
 * 
 * @param test - Whether to use the testnet or mainnet. Defaults to true.
 * @returns The CosmWasmClient instance.
 */
export async function getLedger(test: boolean = true): Promise<CosmWasmClient> {
  if (test) {
    if (!_testnetClient) {
      _testnetClient = await CosmWasmClient.connect(TESTNET_RPC);
    }
    return _testnetClient;
  }
  
  if (!_mainnetClient) {
    _mainnetClient = await CosmWasmClient.connect(MAINNET_RPC);
  }
  return _mainnetClient;
}

/**
 * Add testnet funds to the provided wallet address.
 * 
 * @param walletAddress - The wallet address to add funds to.
 */
export async function addTestnetFunds(walletAddress: string): Promise<void> {
  if (!_faucetApi) {
    _faucetApi = new FaucetApi(TESTNET_FAUCET);
  }
  await _faucetApi.getWealth(walletAddress);
}

/**
 * Parse the user-provided record configuration.
 * 
 * @param record - The record configuration to parse
 * @returns The parsed record configuration in correct format
 */
export function parseRecordConfig(
  record?: string | string[] | Record<string, { weight?: number }>
): { address: string; weight: number }[] | null {
  if (!record) return null;

  if (typeof record === 'object' && !Array.isArray(record)) {
    return Object.entries(record).map(([address, val]) => ({
      address,
      weight: val.weight || 1
    }));
  }
  
  if (Array.isArray(record)) {
    return record.map(address => ({
      address,
      weight: 1
    }));
  }
  
  return [{
    address: record,
    weight: 1
  }];
}

/**
 * Wait for a transaction to complete on the Ledger.
 * 
 * @param txHash - The hash of the transaction to monitor
 * @param client - The CosmWasmClient to use for polling
 * @param timeoutMs - The maximum time to wait in milliseconds
 * @param pollIntervalMs - The time interval to poll in milliseconds
 * @returns The transaction response
 * @throws Error if the transaction times out
 */
export async function waitForTxToComplete(
  txHash: string,
  client: CosmWasmClient,
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_SECS * 1000,
  pollIntervalMs: number = DEFAULT_QUERY_INTERVAL_SECS * 1000
): Promise<any> {
  const startTime = Date.now();
  
  while (true) {
    try {
      const result = await client.getTx(txHash);
      if (result) return result;
    } catch (error) {
      // Transaction not found yet, continue polling
    }

    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Transaction query timeout");
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
}

/**
 * A class representing the Almanac contract for agent registration.
 * 
 * This class provides methods to interact with the Almanac contract, including
 * checking if an agent is registered, retrieving the expiry height of an agent's
 * registration, and getting the endpoints associated with an agent's registration.
 */
export class AlmanacContract {
  private client: CosmWasmClient;
  private address: string;

  constructor(client: CosmWasmClient, contractAddress: string) {
    this.client = client;
    this.address = contractAddress;
  }

  /**
   * Check if the contract version supported by this version of uAgents matches the
   * deployed version.
   * 
   * @returns True if the contract version is supported, False otherwise
   */
  async checkVersion(): Promise<boolean> {
    try {
      const deployedVersion = await this.getContractVersion();
      if (deployedVersion !== ALMANAC_CONTRACT_VERSION) {
        log(
          `The deployed version of the Almanac Contract is ${deployedVersion} ` +
          `and you are using version ${ALMANAC_CONTRACT_VERSION}. ` +
          "Update uAgents to the latest version to enable contract interactions.",
          logger
        );
        return false;
      }
      return true;
    } catch (error) {
      log("Failed to query contract version. Contract interactions will be disabled.", logger);
      return false;
    }
  }

  /**
   * Execute a query with additional checks and error handling.
   * 
   * @param queryMsg - The query message
   * @returns The query response
   * @throws Error if the contract address is not set or the query fails
   */
  public async queryContract(queryMsg: Record<string, any>): Promise<any> {
    try {
      const response = await this.client.queryContractSmart(this.address, queryMsg);
      if (typeof response !== 'object') {
        throw new Error("Invalid response format");
      }
      return response;
    } catch (error) {
      log(`Query failed: ${error}`, logger);
      throw error;
    }
  }

  /**
   * Get the version of the contract.
   * 
   * @returns The version of the contract
   */
  async getContractVersion(): Promise<string> {
    const queryMsg = { query_contract_state: {} };
    const response = await this.queryContract(queryMsg);
    return response.contract_version;
  }

  /**
   * Check if an agent is registered in the Almanac contract.
   * 
   * @param address - The agent's address
   * @returns True if the agent is registered, False otherwise
   */
  async isRegistered(address: string): Promise<boolean> {
    const queryMsg = { query_records: { agent_address: address } };
    const response = await this.queryContract(queryMsg);
    return Boolean(response.record);
  }

  /**
   * Check if an agent's registration needs to be updated.
   * 
   * @param address - The agent's address
   * @param endpoints - The agent's endpoints
   * @param protocols - The agent's protocols
   * @param minSecondsLeft - The minimum time left before the agent's registration expires
   * @returns True if registration needs update, False otherwise
   */
  async registrationNeedsUpdate(
    address: string,
    endpoints: AgentEndpoint[],
    protocols: string[],
    minSecondsLeft: number
  ): Promise<boolean> {
    const [secondsToExpiry, registeredEndpoints, registeredProtocols] = 
      await this.queryAgentRecord(address);
    
    return (
      !await this.isRegistered(address) ||
      secondsToExpiry < minSecondsLeft ||
      JSON.stringify(endpoints) !== JSON.stringify(registeredEndpoints) ||
      JSON.stringify(protocols) !== JSON.stringify(registeredProtocols)
    );
  }

  /**
   * Get the records associated with an agent's registration.
   * 
   * @param address - The agent's address
   * @returns Tuple of [seconds to expiry, endpoints, protocols]
   */
  async queryAgentRecord(
    address: string
  ): Promise<[number, AgentEndpoint[], string[]]> {
    const queryMsg = { query_records: { agent_address: address } };
    const response = await this.queryContract(queryMsg);

    if (!response.record) {
      const contractState = await this.queryContract({ query_contract_state: {} });
      const expiry = contractState?.state?.expiry_height || 0;
      return [expiry * AVERAGE_BLOCK_INTERVAL, [], []];
    }

    const expiryBlock = response.record[0]?.expiry || 0;
    const currentBlock = response.height || 0;
    const secondsToExpiry = (expiryBlock - currentBlock) * AVERAGE_BLOCK_INTERVAL;

    const endpoints = response.record[0].record.service.endpoints.map(
      (endpoint: any) => ({
        url: endpoint.url,
        weight: endpoint.weight
      })
    );

    const protocols = response.record[0].record.service.protocols;

    return [secondsToExpiry, endpoints, protocols];
  }

  /**
   * Get the approximate seconds to expiry of an agent's registration.
   * 
   * @param address - The agent's address
   * @returns The approximate seconds to expiry
   */
  async getExpiry(address: string): Promise<number> {
    const [secondsToExpiry] = await this.queryAgentRecord(address);
    return secondsToExpiry;
  }

  /**
   * Get the endpoints associated with an agent's registration.
   * 
   * @param address - The agent's address
   * @returns The agent's registered endpoints
   */
  async getEndpoints(address: string): Promise<AgentEndpoint[]> {
    const [, endpoints] = await this.queryAgentRecord(address);
    return endpoints;
  }

  /**
   * Get the protocols associated with an agent's registration.
   * 
   * @param address - The agent's address
   * @returns The agent's registered protocols
   */
  async getProtocols(address: string): Promise<string[]> {
    const [, , protocols] = await this.queryAgentRecord(address);
    return protocols;
  }

  /**
   * Get the registration message for the contract.
   */
  private getRegistrationMsg(
    protocols: string[],
    endpoints: AgentEndpoint[],
    signature: string,
    sequence: number,
    address: string
  ): Record<string, any> {
    return {
      register: {
        record: {
          service: {
            protocols,
            endpoints: endpoints.map(e => ({ url: e.url, weight: e.weight }))
          }
        },
        signature,
        sequence,
        agent_address: address
      }
    };
  }

  /**
   * Register an agent with the Almanac contract.
   * 
   * @param client - The SigningCosmWasmClient instance
   * @param wallet - The agent's wallet
   * @param agentAddress - The agent's address
   * @param protocols - List of protocols
   * @param endpoints - List of endpoints
   * @param signature - The agent's signature
   * @param currentTime - Current timestamp
   */
  async register(
    client: SigningCosmWasmClient,
    wallet: DirectSecp256k1HdWallet,
    agentAddress: string,
    protocols: string[],
    endpoints: AgentEndpoint[],
    signature: string,
    currentTime: number
  ): Promise<void> {
    if (!this.address) {
      throw new Error("Contract address not set");
    }

    const [account] = await wallet.getAccounts();
    if (!account) {
      throw new Error("No account found in wallet");
    }

    const almanacMsg = this.getRegistrationMsg(
      protocols,
      endpoints,
      signature,
      currentTime,
      agentAddress
    );

    const funds: Coin[] = [{
      denom: REGISTRATION_DENOM,
      amount: REGISTRATION_FEE
    }];

    const result = await client.execute(
      account.address,
      this.address,
      almanacMsg,
      "auto",
      "",
      funds
    );

    await waitForTxToComplete(result.transactionHash, this.client);
  }

  /**
   * Register multiple agents with the Almanac contract.
   * 
   * @param client - The SigningCosmWasmClient instance
   * @param wallet - The wallet of the registration sender
   * @param agentRecords - The list of signed agent records to register
   */
  async registerBatch(
    client: SigningCosmWasmClient,
    wallet: DirectSecp256k1HdWallet,
    agentRecords: AlmanacContractRecord[]
  ): Promise<void> {
    if (!this.address) {
      throw new Error("Contract address not set");
    }

    const [account] = await wallet.getAccounts();
    if (!account) {
      throw new Error("No account found in wallet");
    }

    const messages = agentRecords.map(record => {
      if (record.timestamp === undefined) {
        throw new Error("Agent record is missing timestamp");
      }
      if (record.signature === undefined) {
        throw new Error("Agent record is not signed");
      }

      return {
        typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
        value: {
          sender: account.address,
          contract: this.address,
          msg: this.getRegistrationMsg(
            record.protocols,
            record.endpoints,
            record.signature,
            record.timestamp,
            record.agent_address
          ),
          funds: [{
            denom: REGISTRATION_DENOM,
            amount: REGISTRATION_FEE
          }]
        }
      };
    });

    const result = await client.signAndBroadcast(
      account.address,
      messages,
      "auto"
    );

    await waitForTxToComplete(result.transactionHash, this.client);
  }

  /**
   * Get the agent's sequence number for Almanac registration.
   * 
   * @param address - The agent's address
   * @returns The agent's sequence number
   */
  async getSequence(address: string): Promise<number> {
    const queryMsg = { query_sequence: { agent_address: address } };
    const sequence = (await this.queryContract(queryMsg)).sequence;
    return sequence;
  }
}

// Initialize contract instances
let _mainnetAlmanacContract: AlmanacContract | null = null;
let _testnetAlmanacContract: AlmanacContract | null = null;

/**
 * Get the AlmanacContract instance.
 * 
 * @param test - Whether to use the testnet or mainnet. Defaults to true.
 * @returns The AlmanacContract instance if version is supported.
 */
export async function getAlmanacContract(test: boolean = true): Promise<AlmanacContract | null> {
  if (test) {
    if (!_testnetAlmanacContract) {
      const client = await getLedger(true);
      _testnetAlmanacContract = new AlmanacContract(client, TESTNET_CONTRACT_ALMANAC);
    }
    return (await _testnetAlmanacContract.checkVersion()) ? _testnetAlmanacContract : null;
  }

  if (!_mainnetAlmanacContract) {
    const client = await getLedger(false);
    _mainnetAlmanacContract = new AlmanacContract(client, MAINNET_CONTRACT_ALMANAC);
  }
  return (await _mainnetAlmanacContract.checkVersion()) ? _mainnetAlmanacContract : null;
}

/**
 * A class representing the NameService contract for managing domain names and ownership.
 * 
 * This class provides methods to interact with the NameService contract, including
 * checking name availability, checking ownership, querying domain public status,
 * obtaining registration transaction details, and registering a name within a domain.
 */
export class NameServiceContract {
  private client: CosmWasmClient;
  private address: string;

  constructor(client: CosmWasmClient, contractAddress: string) {
    this.client = client;
    this.address = contractAddress;
  }

  /**
   * Execute a query with additional checks and error handling.
   * 
   * @param queryMsg - The query message
   * @returns The query response
   * @throws Error if the contract address is not set or the query fails
   */
  public async queryContract(queryMsg: Record<string, any>): Promise<any> {
    try {
      const response = await this.client.queryContractSmart(this.address, queryMsg);
      if (typeof response !== 'object') {
        throw new Error("Invalid response format");
      }
      return response;
    } catch (error) {
      log(`Query failed: ${error}`, logger);
      throw error;
    }
  }

  /**
   * Check if a name is available within a domain.
   * 
   * @param name - The name to check
   * @param domain - The domain to check within
   * @returns True if the name is available, False otherwise
   */
  async isNameAvailable(name: string, domain: string): Promise<boolean> {
    const queryMsg = { domain_record: { domain: `${name}.${domain}` } };
    return (await this.queryContract(queryMsg)).is_available;
  }

  /**
   * Check if the provided wallet address is the owner of a name within a domain.
   * 
   * @param name - The name to check ownership for
   * @param domain - The domain to check within
   * @param walletAddress - The wallet address to check ownership against
   * @returns True if the wallet address is the owner, False otherwise
   */
  async isOwner(name: string, domain: string, walletAddress: string): Promise<boolean> {
    const queryMsg = {
      permissions: {
        domain: `${name}.${domain}`,
        owner: walletAddress,
      }
    };
    const permission = (await this.queryContract(queryMsg)).permissions;
    return permission === "admin";
  }

  /**
   * Check if a domain is public.
   * 
   * @param domain - The domain to check
   * @returns True if the domain is public, False otherwise
   */
  async isDomainPublic(domain: string): Promise<boolean> {
    const res = (await this.queryContract({
      query_domain_flags: { domain: domain.split(".").pop() }
    }))?.domain_flags;
    
    if (res) {
      return res.web3_flags.is_public;
    }
    return false;
  }

  /**
   * Retrieve the previous records for a given name within a specified domain.
   * 
   * @param name - The name whose records are to be retrieved
   * @param domain - The domain within which the name is registered
   * @returns A list of records associated with the given name
   */
  async getPreviousRecords(name: string, domain: string): Promise<any[]> {
    const queryMsg = { domain_record: { domain: `${name}.${domain}` } };
    const result = await this.queryContract(queryMsg);
    if (result.record !== null) {
      return result.record.records[0].agent_address.records;
    }
    return [];
  }

  /**
   * Get the registration transaction for registering a name within a domain.
   * 
   * @param name - The name to be registered
   * @param walletAddress - The wallet address initiating the registration
   * @param agentRecords - The agent records to register
   * @param domain - The domain in which the name is registered
   * @param test - Whether this is for testnet or mainnet
   * @returns The registration transaction, or null if the name is not available or not owned
   */
  async getRegistrationTx(
    name: string,
    walletAddress: string,
    agentRecords: Array<{ address: string; weight: number }> | string,
    domain: string,
    test: boolean
  ): Promise<any> {
    const contractAddress = test ? TESTNET_CONTRACT_NAME_SERVICE : MAINNET_CONTRACT_NAME_SERVICE;
    const transaction: any = { messages: [] };

    if (await this.isNameAvailable(name, domain)) {
      const pricePerSecond = (await this.queryContract({ contract_state: {} })).price_per_second;
      const amount = BigInt(pricePerSecond.amount) * BigInt(86400);
      const denom = pricePerSecond.denom;

      transaction.messages.push({
        typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
        value: {
          sender: walletAddress,
          contract: contractAddress,
          msg: { register: { domain: `${name}.${domain}` } },
          funds: [{ amount: amount.toString(), denom }]
        }
      });
    } else if (!await this.isOwner(name, domain, walletAddress)) {
      return null;
    }

    transaction.messages.push({
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: {
        sender: walletAddress,
        contract: contractAddress,
        msg: {
          update_record: {
            domain: `${name}.${domain}`,
            agent_records: agentRecords
          }
        }
      }
    });

    return transaction;
  }

  /**
   * Register a name within a domain using the NameService contract.
   * 
   * @param client - The SigningCosmWasmClient instance
   * @param wallet - The wallet of the agent
   * @param agentRecords - The agent records to register
   * @param name - The name to be registered
   * @param domain - The domain in which to register
   * @param overwrite - Whether to overwrite existing records
   */
  async register(
    client: SigningCosmWasmClient,
    wallet: DirectSecp256k1HdWallet,
    agentRecords: string | string[] | Record<string, { weight?: number }>,
    name: string,
    domain: string,
    overwrite: boolean = true
  ): Promise<void> {
    log("Registering name...", logger);
    
    const records = parseRecordConfig(agentRecords);
    if (!records) {
      throw new Error("Invalid record configuration");
    }

    const [account] = await wallet.getAccounts();
    if (!account) {
      throw new Error("No account found in wallet");
    }

    const isTestnet = (await client.getChainId()) === "dorado-1";
    const almanacContract = await getAlmanacContract(isTestnet);

    // Check agent registration in almanac
    for (const record of records) {
      if (!almanacContract || !await almanacContract.isRegistered(record.address)) {
        log(
          `Address ${record.address} needs to be registered in almanac contract ` +
          "to be registered in a domain.",
          logger
        );
        return;
      }
    }

    if (!await this.isDomainPublic(domain)) {
      log(`Domain ${domain} is not public, please select a public domain`, logger);
      return;
    }

    let finalRecords = records;
    if (!overwrite) {
      const previousRecords = await this.getPreviousRecords(name, domain);
      const recordMap = new Map();
      [...previousRecords, ...records].forEach(record => {
        recordMap.set(`${record.address}_${record.weight}`, record);
      });
      finalRecords = Array.from(recordMap.values());
    }

    const transaction = await this.getRegistrationTx(
      name,
      account.address,
      finalRecords,
      domain,
      isTestnet
    );

    if (!transaction) {
      log(`Please select another name, ${name} is owned by another address`, logger);
      return;
    }

    const signingClient = await SigningCosmWasmClient.connectWithSigner(
      isTestnet ? TESTNET_RPC : MAINNET_RPC,
      wallet
    );

    const result = await signingClient.signAndBroadcast(
      account.address,
      transaction.messages,
      "auto"
    );

    await waitForTxToComplete(result.transactionHash, this.client);
    log("Registering name...complete", logger);
  }

  /**
   * Unregister a name within a domain using the NameService contract.
   * 
   * @param name - The name to be unregistered
   * @param domain - The domain in which the name is registered
   * @param wallet - The wallet of the agent
   */
  async unregister(
    name: string,
    domain: string,
    wallet: DirectSecp256k1HdWallet,
    test: boolean = true
  ): Promise<void> {
    log("Unregistering name...", logger);

    if (await this.isNameAvailable(name, domain)) {
      log("Nothing to unregister... (name is not registered)", logger);
      return;
    }

    
    // Create signing client
    const signingClient = await SigningCosmWasmClient.connectWithSigner(
      test ? TESTNET_RPC : MAINNET_RPC,
      wallet
    );
    
    const [account] = await wallet.getAccounts();
    if (!account) {
      throw new Error("No account found in wallet");
    }
    const msg = {
      remove_domain: {
        domain: `${name}.${domain}`,
      }
    };
    
    const result = await signingClient.execute(
      account.address,
      this.address,
      msg,
      "auto"
    );

    await waitForTxToComplete(result.transactionHash, this.client);
    log("Unregistering name...complete", logger);
  }
}

// Initialize contract instances
let _mainnetNameServiceContract: NameServiceContract | null = null;
let _testnetNameServiceContract: NameServiceContract | null = null;

/**
 * Get the NameServiceContract instance.
 * 
 * @param test - Whether to use the testnet or mainnet. Defaults to true.
 * @returns The NameServiceContract instance
 */
export async function getNameServiceContract(test: boolean = true): Promise<NameServiceContract> {
  if (test) {
    if (!_testnetNameServiceContract) {
      const client = await getLedger(true);
      _testnetNameServiceContract = new NameServiceContract(client, TESTNET_CONTRACT_NAME_SERVICE);
    }
    return _testnetNameServiceContract;
  }

  if (!_mainnetNameServiceContract) {
    const client = await getLedger(false);
    _mainnetNameServiceContract = new NameServiceContract(client, MAINNET_CONTRACT_NAME_SERVICE);
  }
  return _mainnetNameServiceContract;
}

interface FaucetStatus {
  txDigest: string | null;
  status: 'pending' | 'processing' | 'complete' | 'failed';
}

export class FaucetApi {
  private readonly faucetUrl: string;
  private static readonly MAX_RETRY_ATTEMPTS = 30;
  private static readonly POLL_INTERVAL_MS = 2000;
  private static readonly FINAL_WAIT_INTERVAL_MS = 5000;

  constructor(faucetUrl: string) {
    this.faucetUrl = faucetUrl;
  }

  async getWealth(address: string): Promise<void> {
    const uid = await this.createFaucetClaim(address);
    if (!uid) throw new Error("Unable to create faucet claim");

    let retryAttempts = FaucetApi.MAX_RETRY_ATTEMPTS;
    while (retryAttempts > 0) {
      const status = await this.checkFaucetClaim(uid);
      if (!status) throw new Error("Failed to check faucet claim status");

      if (status.status === 'complete') break;
      if (status.status === 'failed') throw new Error(`Failed to get wealth for ${address}`);

      await new Promise(resolve => setTimeout(resolve, FaucetApi.POLL_INTERVAL_MS));
      retryAttempts--;
    }

    if (retryAttempts === 0) throw new Error("Faucet claim check timed out");
    await new Promise(resolve => setTimeout(resolve, FaucetApi.FINAL_WAIT_INTERVAL_MS));
  }

  private async createFaucetClaim(address: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.faucetUrl}/api/v3/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.uuid;
    } catch {
      return null;
    }
  }

  private async checkFaucetClaim(uid: string): Promise<FaucetStatus | null> {
    try {
      const response = await fetch(`${this.faucetUrl}/api/v3/claims/${uid}`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        txDigest: data.claim.txStatus?.hash || null,
        status: data.claim.status
      };
    } catch {
      return null;
    }
  }
}
