import {
  AGENT_ADDRESS_LENGTH,
  AGENT_PREFIX,
  ALMANAC_API_URL,
  DEFAULT_MAX_ENDPOINTS,
  MAINNET_PREFIX,
  TESTNET_PREFIX
} from './Config';
import { isUserAddress } from './crypto';
import { getAlmanacContract, getNameServiceContract } from './network';
import { getLogger, Logger, LogLevel, log } from './utils';

const logger: Logger = getLogger(LogLevel.WARN, "resolver")

/**
 * Weighted random sample from a list of items without replacement.
 *
 * Ref: Efraimidis, Pavlos S. "Weighted random sampling over data streams."
 *
 * @param {any[]} items - The list of items to sample from.
 * @param {number[] | undefined} [weights=undefined] - Optional list of weights for each item.
 * @param {number} [k=1] - The number of items to sample.
 * @returns {any[]} The sampled items as a list.
 *
 * @example
 * // Uniform sampling without weights
 * const items = ["a", "b", "c", "d"];
 * console.log(weightedRandomSample(items, undefined, 2)); // Example output: ['c', 'a']
 *
 * @example
 * // Weighted sampling
 * const items = ["a", "b", "c", "d"];
 * const weights = [0.1, 0.2, 0.3, 0.4];
 * console.log(weightedRandomSample(items, weights, 2)); // Example output: ['d', 'c']
 */
function weightedRandomSample(
  items: any[], // TODO: perhaps more specificity for type safety? potentially use generic types
  weights: number[] | undefined = undefined,
  k: number = 1
): any[] {
	if (!weights) {
		// uniform sampling without weights
		const shuffled = [...items].sort(() => Math.random() - 0.5);
		return shuffled.slice(0, k);
	}

	const values = weights.map(w => Math.pow(Math.random(), 1 / w));
	// sort indices by weight, select top-k
	const order = values
		.map((value, index) => ({ value, index }))
		.sort((a, b) => b.value - a.value)
		.slice(0, k)
		.map(item => item.index);
	return order.map(index => items[index]);
}

/**
 * Check if the given string is a valid address.
 *
 * @param {string} address - The address to be checked.
 * @returns {boolean} True if the address is valid; False otherwise.
 */
function isValidAddress(address: string): boolean {
	return isUserAddress(address) || (
		address.length === AGENT_ADDRESS_LENGTH && address.startsWith(AGENT_PREFIX)
	);
}

/**
 * Check if the given string is a valid prefix.
 *
 * @param {string} prefix - The prefix to be checked.
 * @returns {boolean} True if the prefix is valid; False otherwise.
 */
function isValidPrefix(prefix: string): boolean {
	const validPrefixes = [TESTNET_PREFIX, MAINNET_PREFIX, ""];
	return validPrefixes.includes(prefix);
}

/**
 * Parse an agent identifier string into prefix, name, and address.
 *
 * @param {string} identifier - The identifier string to be parsed.
 * @returns {[string, string, string]} A tuple containing the prefix, name, and address as strings.
 */
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

/**
 * Query a record from the Almanac contract.
 *
 * @param {string} agentAddress - The address of the agent.
 * @param {string} service - The type of service to query.
 * @param {boolean} test - Whether to use the testnet or mainnet contract.
 * @returns {Promise<any>} The query result as a Promise.
 */
async function queryRecord(agentAddress: string, service: string, test: boolean): Promise<any> {
	const contract = getAlmanacContract(test);

	const queryMsg = {
		query_record: {
			agent_address: agentAddress,
			record_type: service
		}
	};

	const result = await contract.query(queryMsg);
	return result;
}

/**
 * Get the agent address associated with the provided name from the name service contract.
 *
 * @param {string} name - The name to query.
 * @param {boolean} test - Whether to use the testnet or mainnet contract.
 * @returns {Promise<string | null>} The associated agent address if found, otherwise null.
 */
async function getAgentAddress(name: string, test: boolean): Promise<string | null> {
	const queryMsg = {
		domain_record: {
			domain: name,
		},
	};

	const result = await getNameServiceContract(test).query(queryMsg);

	if (result.record !== null) {
		const registeredRecords = result.record.records[0]?.agent_address?.records || [];

		if (registeredRecords.length > 0) {
			const addresses = registeredRecords.map((val: { url: string, address: string }) => val.address);
			const weights = registeredRecords.map((val: { weight: number }) => val.weight);
			const selectedAddressList = weightedRandomSample(addresses, weights);
			return selectedAddressList.length > 0 ? selectedAddressList[0] : null;
		}
	}

	return null;
}

abstract class Resolver {
	abstract resolve(destination: string): Promise<[string | null, string[]]>;
}

class AlmanacContractResolver extends Resolver {
	private _maxEndpoints: number;

	constructor(maxEndpoints?: number) {
		super();
		this._maxEndpoints = maxEndpoints || DEFAULT_MAX_ENDPOINTS;
	}

	async resolve(destination: string): Promise<[string | null, string[]]> {
		const [prefix, , address] = parseIdentifier(destination);
		const isTestnet = prefix !== MAINNET_PREFIX;
		const result = await queryRecord(address, "service", isTestnet);
		if (result) {
			const record = result.record || {};
			const endpointList = record.service?.endpoints || [];

			if (endpointList.length > 0) {
				const endpoints = endpointList.map((val: { url: string }) => val.url);
				const weights = endpointList.map((val: { weight: number }) => val.weight);
				return [
					address,
					weightedRandomSample(endpoints, weights, Math.min(this._maxEndpoints, endpoints.length))
				];
			}
		}

		return [null, []];
	}
}

class AlmanacApiResolver extends Resolver {
	private _maxEndpoints: number;
	private _almanacApiUrl: string;
	private _almanacContractResolver: AlmanacContractResolver;

	constructor(maxEndpoints?: number, almanacApiUrl?: string) {
		super();
		this._maxEndpoints = maxEndpoints || DEFAULT_MAX_ENDPOINTS;
		this._almanacApiUrl = almanacApiUrl || ALMANAC_API_URL;
		this._almanacContractResolver = new AlmanacContractResolver(this._maxEndpoints);
	}

	private async _apiResolve(destination: string): Promise<[string | null, string[]]> {
		try {
			const [, , address] = parseIdentifier(destination);
			const response = await fetch(`${this._almanacApiUrl}/agents/${address}`);

			if (response.status !== 200) {
				if (response.status !== 404) {
					log(`Failed to resolve agent ${address} from ${this._almanacApiUrl}, resolving via Almanac contract...`, logger);
				}
				return [null, []];
			}

			const agent = await response.json();

			const expiryStr = agent.expiry;
			if (!expiryStr) {
				return [null, []];
			}

			const expiry = new Date(expiryStr); // TODO: chekc if expiryStr gets parsed correctly with Date()
			const currentTime = new Date();
			const endpointList = agent.endpoints || [];

			if (endpointList.length > 0 && expiry > currentTime) {
				const endpoints = endpointList.map((val: { url: string }) => val.url);
				const weights = endpointList.map((val: { weight: number }) => val.weight);
				return [
          address,
          weightedRandomSample(endpoints, weights, Math.min(this._maxEndpoints, endpoints.length))
        ];
			}
		} catch (e) {
			log(`Error in AlmanacApiResolver when resolving ${destination}: ${e}`, logger);
		}

		return [null, []];
	}

	async resolve(destination: string): Promise<[string | null, string[]]> {
		const [address, endpoints] = await this._apiResolve(destination);
		return address !== null
      ? [address, endpoints]
      : await this._almanacContractResolver.resolve(destination);
	}
}

class NameServiceResolver extends Resolver {
	private _maxEndpoints: number;
	private _almanacApiResolver: AlmanacApiResolver;

	constructor(maxEndpoints?: number) {
		super();
		this._maxEndpoints = maxEndpoints || DEFAULT_MAX_ENDPOINTS;
		this._almanacApiResolver = new AlmanacApiResolver(this._maxEndpoints);
	}

	async resolve(destination: string): Promise<[string | null, string[]]> {
		const [prefix, name] = parseIdentifier(destination);
		const useTestnet = prefix !== MAINNET_PREFIX;
		const address = await getAgentAddress(name, useTestnet);
		return address !== null ? await this._almanacApiResolver.resolve(address) : [null, []];
	}
}

class GlobalResolver extends Resolver {
	private _maxEndpoints: number;
	private _almanacApiResolver: AlmanacApiResolver;
	private _nameServiceResolver: NameServiceResolver;

	constructor(maxEndpoints?: number, almanacApiUrl?: string) {
		super();
		this._maxEndpoints = maxEndpoints || DEFAULT_MAX_ENDPOINTS;
		this._almanacApiResolver = new AlmanacApiResolver(this._maxEndpoints, almanacApiUrl);
		this._nameServiceResolver = new NameServiceResolver(this._maxEndpoints);
	}

	async resolve(destination: string): Promise<[string | null, string[]]> {
		const [prefix, , address] = parseIdentifier(destination);

		if (isValidPrefix(prefix)) {
			const resolver = address ? this._almanacApiResolver : this._nameServiceResolver;
			return await resolver.resolve(destination);
		}

		return [null, []];
	}
}

class RulesBasedResolver extends Resolver {
	private _rules: Record<string, string[]>;
	private _maxEndpoints: number;

	constructor(rules: Record<string, string[]>, maxEndpoints?: number) {
		super();
		this._rules = rules;
		this._maxEndpoints = maxEndpoints || DEFAULT_MAX_ENDPOINTS;
	}

	async resolve(destination: string): Promise<[string | null, string[]]> {
		let endpoints = this._rules[destination];
		if (typeof endpoints === 'string') {
			endpoints = [endpoints];
		} else if (!endpoints) {
			endpoints = [];
		}
		if (endpoints.length > this._maxEndpoints) {
			endpoints = endpoints.slice(0, this._maxEndpoints);
		}
		return [destination, endpoints];
	}
}

export {
  AlmanacContractResolver,
  AlmanacApiResolver,
  NameServiceResolver,
  GlobalResolver,
  RulesBasedResolver
}
