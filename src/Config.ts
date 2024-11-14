import { AgentEndpoint } from "./types";

export const AGENT_PREFIX = "agent";
export const LEDGER_PREFIX = "fetch";
export const USER_PREFIX = "user";
export const TESTNET_PREFIX = "test-agent";
export const MAINNET_PREFIX = "agent";
export const AGENT_ADDRESS_LENGTH = 65;

export const MAINNET_CONTRACT_ALMANAC = "fetch1mezzhfj7qgveewzwzdk6lz5sae4dunpmmsjr9u7z0tpmdsae8zmquq3y0y";
export const TESTNET_CONTRACT_ALMANAC = "fetch1tjagw8g8nn4cwuw00cf0m5tl4l6wfw9c0ue507fhx9e3yrsck8zs0l3q4w";
export const MAINNET_CONTRACT_NAME_SERVICE = "fetch1479lwv5vy8skute5cycuz727e55spkhxut0valrcm38x9caa2x8q99ef0q";
export const TESTNET_CONTRACT_NAME_SERVICE = "fetch1mxz8kn3l5ksaftx8a9pj9a6prpzk2uhxnqdkwuqvuh37tw80xu6qges77l";
export const REGISTRATION_FEE = "500000000000000000";
export const REGISTRATION_DENOM = "atestfet";
export const REGISTRATION_UPDATE_INTERVAL_SECONDS = 3600;
export const REGISTRATION_RETRY_INTERVAL_SECONDS = 60;
export const AVERAGE_BLOCK_INTERVAL = 6;
export const ALMANAC_CONTRACT_VERSION = "2.0.0";

export const AGENTVERSE_URL = "https://agentverse.ai";
export const ALMANAC_API_URL = `${AGENTVERSE_URL}/v1/almanac`;
export const ALMANAC_API_TIMEOUT_SECONDS = 1.0;
export const ALMANAC_API_MAX_RETRIES = 10;
export const ALMANAC_REGISTRATION_WAIT = 100;
export const MAILBOX_POLL_INTERVAL_SECONDS = 1.0;

export const WALLET_MESSAGING_POLL_INTERVAL_SECONDS = 2.0;

export const RESPONSE_TIME_HINT_SECONDS = 5;
export const DEFAULT_ENVELOPE_TIMEOUT_SECONDS = 30;
export const DEFAULT_MAX_ENDPOINTS = 10;
export const DEFAULT_SEARCH_LIMIT = 100;

export function parseEndpointConfig(endpoint: string | string[] | { [key: string]: any } | null): AgentEndpoint[] {
  let endpoints: AgentEndpoint[] = [];

  if (typeof endpoint === "object" && !Array.isArray(endpoint) && endpoint !== null) {
    endpoints = Object.entries(endpoint).map(([url, val]) => ({
      url,
      weight: val?.weight || 1,
    }));
  } else if (Array.isArray(endpoint)) {
    endpoints = endpoint.map(url => ({ url, weight: 1 }));
  } else if (typeof endpoint === "string") {
    endpoints = [{ url: endpoint, weight: 1 }];
  }

  return endpoints;
}

export function parseAgentverseConfig(config: string | { [key: string]: any } | null = null) {
  let agentMailboxKey: string | null = null;
  let baseUrl = AGENTVERSE_URL;
  let protocol: string | null = null;
  let protocolOverride: string | null = null;

  if (typeof config === "string") {
    if (config.includes("@")) {
      [agentMailboxKey, baseUrl] = config.split("@") as [string, string];
    } else if (config.includes("://")) {
      baseUrl = config;
    } else {
      agentMailboxKey = config;
    }
  } else if (typeof config === "object" && config !== null) {
    agentMailboxKey = config.agent_mailbox_key || null;
    baseUrl = config.base_url || baseUrl;
    protocolOverride = config.protocol || null;
  }

  [protocol, baseUrl] = baseUrl.includes("://") ? baseUrl.split("://") : [null, baseUrl];

  protocol = protocolOverride || protocol || "https";

  return {
    agentMailboxKey,
    baseUrl,
    protocol,
    httpPrefix: protocol === "wss" || protocol === "https" ? "https" : "http",
    useMailbox: agentMailboxKey !== null,
  };
}
