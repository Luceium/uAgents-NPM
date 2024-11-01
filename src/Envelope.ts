import { Identity } from './crypto';
import { sha256 } from 'js-sha256';

/**
 * Represents an envelope for message communication between agents.
 */
export class Envelope {
  version: number;
  sender: string;
  target: string;
  session: string;
  schemaDigest: string;
  protocolDigest?: string;
  payload?: string;
  expires?: number;
  nonce?: number;
  signature?: string;

  constructor({
    version,
    sender,
    target,
    session,
    schemaDigest,
    protocolDigest,
    payload,
    expires,
    nonce,
    signature,
  }: {
    version: number;
    sender: string;
    target: string;
    session: string;
    schemaDigest: string;
    protocolDigest?: string;
    payload?: string;
    expires?: number;
    nonce?: number;
    signature?: string;
  }) {
    this.version = version;
    this.sender = sender;
    this.target = target;
    this.session = session;
    this.schemaDigest = schemaDigest;
    this.protocolDigest = protocolDigest;
    this.payload = payload;
    this.expires = expires;
    this.nonce = nonce;
    this.signature = signature;
  }

  /**
   * Encode the payload value and store it in the envelope.
   */
  encodePayload(value: string): void {
    this.payload = Buffer.from(value).toString('base64');
  }

  /**
   * Decode and retrieve the payload value from the envelope.
   */
  decodePayload(): string {
    if (!this.payload) {
      return '';
    }
    return Buffer.from(this.payload, 'base64').toString();
  }

  /**
   * Sign the envelope using the provided signing function.
   */
  sign(identity: Identity): void {
    try {
      this.signature = identity.signB64(this._digest());
    } catch (err) {
      throw new Error(`Failed to sign envelope: ${err}`);
    }
  }

  /**
   * Verify the envelope's signature.
   */
  verify(): boolean {
    if (!this.signature) {
      throw new Error('Envelope signature is missing');
    }
    return Identity.verifyDigest(this.sender, this._digest(), this.signature);
  }

  /**
   * Compute the digest of the envelope's content.
   */
  private _digest(): Buffer {
    const hasher = sha256.create();
    hasher.update(this.sender);
    hasher.update(this.target);
    hasher.update(this.session);
    hasher.update(this.schemaDigest);
    
    if (this.payload) {
      hasher.update(this.payload);
    }
    
    if (this.expires) {
      const expiresBuffer = Buffer.alloc(8);
      expiresBuffer.writeBigUInt64BE(BigInt(this.expires));
      hasher.update(expiresBuffer);
    }
    
    if (this.nonce !== undefined) {
      const nonceBuffer = Buffer.alloc(8);
      nonceBuffer.writeBigUInt64BE(BigInt(this.nonce));
      hasher.update(nonceBuffer);
    }
    
    return Buffer.from(hasher.digest());
  }
}

/**
 * Represents a historical entry of an envelope.
 */
export class EnvelopeHistoryEntry {
  timestamp: number;
  version: number;
  sender: string;
  target: string;
  session: string;
  schemaDigest: string;
  protocolDigest?: string;
  payload?: string;

  constructor({
    timestamp = Math.floor(Date.now() / 1000),
    version,
    sender,
    target,
    session,
    schemaDigest,
    protocolDigest,
    payload,
  }: {
    timestamp?: number;
    version: number;
    sender: string;
    target: string;
    session: string;
    schemaDigest: string;
    protocolDigest?: string;
    payload?: string;
  }) {
    this.timestamp = timestamp;
    this.version = version;
    this.sender = sender;
    this.target = target;
    this.session = session;
    this.schemaDigest = schemaDigest;
    this.protocolDigest = protocolDigest;
    this.payload = payload;
  }

  static fromEnvelope(envelope: Envelope): EnvelopeHistoryEntry {
    return new EnvelopeHistoryEntry({
      version: envelope.version,
      sender: envelope.sender,
      target: envelope.target,
      session: envelope.session,
      schemaDigest: envelope.schemaDigest,
      protocolDigest: envelope.protocolDigest,
      payload: envelope.decodePayload(),
    });
  }
}

/**
 * Manages a history of envelope entries with retention policy.
 */
export class EnvelopeHistory {
  envelopes: EnvelopeHistoryEntry[];

  constructor() {
    this.envelopes = [];
  }

  addEntry(entry: EnvelopeHistoryEntry): void {
    this.envelopes.push(entry);
    this.applyRetentionPolicy();
  }

  /**
   * Remove entries older than 24 hours
   */
  applyRetentionPolicy(): void {
    const cutoffTime = Math.floor(Date.now() / 1000) - 86400;
    this.envelopes = this.envelopes.filter(e => e.timestamp >= cutoffTime);
  }
}