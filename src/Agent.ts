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
import { Model } from './model'; // ErrorMessage will just be a string
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
import { getLogger } from './utils';

export class Agent extends Sink {

}
