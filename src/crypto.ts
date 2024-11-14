import { randomBytes } from 'crypto';
import { ec as EC } from 'elliptic';
import { bech32 } from 'bech32';
import { sha256 } from 'js-sha256';
import { USER_PREFIX } from './Config';

const SHA_LENGTH = 256;
const ec = new EC('secp256k1');

type EncodableValue = string | number | Buffer;

function convertBits(data: Buffer, fromBits: number, toBits: number, pad: boolean = true): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  const maxAcc = (1 << (fromBits + toBits - 1)) - 1;

  for (const value of data) {
    if (value < 0 || (value >> fromBits) !== 0) {
      throw new Error('Invalid value');
    }
    acc = ((acc << fromBits) | value) & maxAcc;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    throw new Error('Invalid padding');
  }

  return ret;
}

function decodeBech32(value: string): [string, Buffer] {
  const decoded = bech32.decode(value);
  const data = Buffer.from(bech32.fromWords(decoded.words));
  return [decoded.prefix, data];
}

function encodeBech32(prefix: string, value: Buffer): string {
  const words = convertBits(value, 8, 5, true);
  return bech32.encode(prefix, words);
}

function generateUserAddress(): string {
  return encodeBech32(USER_PREFIX, randomBytes(32));
}

function isUserAddress(address: string): boolean {
  return address.substring(0, USER_PREFIX.length) === USER_PREFIX;
}

function keyDerivationHash(prefix: string, index: number): Buffer {
  const hasher = sha256.create();
  hasher.update(prefix);
  if (!(0 <= index && index < SHA_LENGTH)) {
    throw new Error('Index out of bounds');
  }
  hasher.update(Buffer.from([index]));
  return Buffer.from(hasher.digest());
}

function seedHash(seed: string): Buffer {
  const hasher = sha256.create();
  hasher.update(seed);
  return Buffer.from(hasher.digest());
}

function deriveKeyFromSeed(seed: string, prefix: string, index: number): Buffer {
  const hasher = sha256.create();
  hasher.update(keyDerivationHash(prefix, index));
  hasher.update(seedHash(seed));
  return Buffer.from(hasher.digest());
}

function encodeLengthPrefixed(value: EncodableValue): Buffer {
  let encoded: Buffer;
  
  if (typeof value === 'string') {
    encoded = Buffer.from(value);
  } else if (typeof value === 'number') {
    encoded = Buffer.alloc(8);
    encoded.writeBigUInt64BE(BigInt(value));
  } else if (Buffer.isBuffer(value)) {
    encoded = value;
  } else {
    throw new Error('Invalid type for encoding');
  }

  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64BE(BigInt(encoded.length));
  
  return Buffer.concat([prefix, encoded]);
}

/**
 * An identity is a cryptographic keypair that can be used to sign messages.
 */
class Identity {
  private readonly keyPair: EC.KeyPair;
  private readonly address: string;
  private readonly pubKey: string;

  /**
   * Create a new identity from a signing key.
   */
  constructor(keyPair: EC.KeyPair) {
    this.keyPair = keyPair;
    
    // Build the address - ensure compressed format matching Python ecdsa
    const pubKeyBytes = Buffer.from(this.keyPair.getPublic().encode('hex', true), 'hex');
    this.address = encodeBech32("agent", pubKeyBytes);
    this.pubKey = pubKeyBytes.toString('hex');
  }

  /**
   * Create a new identity from a seed and index.
   */
  static fromSeed(seed: string, index: number): Identity {
    const key = deriveKeyFromSeed(seed, "agent", index);
    const keyPair = ec.keyFromPrivate(key);
    return new Identity(keyPair);
  }

  /**
   * Generate a random new identity.
   */
  static generate(): Identity {
    const keyPair = ec.genKeyPair();
    return new Identity(keyPair);
  }

  /**
   * Create a new identity from a private key.
   */
  static fromString(privateKeyHex: string): Identity {
    const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
    return new Identity(keyPair);
  }

  /**
   * Property to access the private key of the identity.
   */
  get privateKey(): string {
    return this.keyPair.getPrivate('hex');
  }

  /**
   * Property to access the address of the identity.
   */
  get getAddress(): string {
    return this.address;
  }

  get getPubKey(): string {
    return this.pubKey;
  }

  /**
   * Sign the provided data.
   */
  sign(data: Buffer): string {
    const signature = this.keyPair.sign(data);
    // Use canonical signature format to match Python's sigencode_string_canonize
    const canonicalSig = this.getCanonicalSignature(signature);
    return encodeBech32('sig', canonicalSig);
  }

  signB64(data: Buffer): string {
    const signature = this.keyPair.sign(data);
    const canonicalSig = this.getCanonicalSignature(signature);
    return canonicalSig.toString('base64');
  }

  /**
   * Sign the provided digest.
   */
  signDigest(digest: Buffer): string {
    const signature = this.keyPair.sign(digest);
    const canonicalSig = this.getCanonicalSignature(signature);
    return encodeBech32('sig', canonicalSig);
  }

  /**
   * Sign the registration data for the Almanac contract.
   */
  signRegistration(
    contractAddress: string,
    sequence: number,
    walletAddress: string
  ): string {
    const hasher = sha256.create();
    hasher.update(encodeLengthPrefixed(contractAddress));
    hasher.update(encodeLengthPrefixed(this.address));
    hasher.update(encodeLengthPrefixed(sequence));
    hasher.update(encodeLengthPrefixed(walletAddress));
    return this.signDigest(Buffer.from(hasher.digest()));
  }

  signArbitrary(data: Buffer): [string, string] {
    // Create the sign doc
    const signDoc = {
      chain_id: '',
      account_number: '0',
      sequence: '0',
      fee: {
        gas: '0',
        amount: [],
      },
      msgs: [
        {
          type: 'sign/MsgSignData',
          value: {
            signer: this.address,
            data: data.toString('base64'),
          },
        },
      ],
      memo: '',
    };

    const rawSignDoc = Buffer.from(
      JSON.stringify(signDoc, Object.keys(signDoc).sort(), 0)
    );
    const signature = this.signB64(rawSignDoc);
    const encSignDoc = rawSignDoc.toString('base64');

    return [encSignDoc, signature];
  }

  /**
   * Verify that the signature is correct for the provided signer address and digest.
   */
  static verifyDigest(address: string, digest: Buffer, signature: string): boolean {
    try {
      const [pkPrefix, pkData] = decodeBech32(address);
      const [sigPrefix, sigData] = decodeBech32(signature);

      if (pkPrefix !== 'agent') {
        throw new Error('Unable to decode agent address');
      }

      if (sigPrefix !== 'sig') {
        throw new Error('Unable to decode signature');
      }

      const key = ec.keyFromPublic(pkData);
      return key.verify(digest, sigData);
    } catch (error) {
      return false;
    }
  }

  private getCanonicalSignature(signature: EC.Signature): Buffer {
    const r = signature.r;
    const s = signature.s;
    const secp256k1N = ec.curve.n!;
    const secp256k1halfN = secp256k1N.shrn(1);

    // Ensure s is the lower of s and -s (modulo N) as per BIP 62
    let canonicalS = s;
    if (s.gt(secp256k1halfN)) {
      canonicalS = secp256k1N.sub(s);
    }

    // Convert to Buffer maintaining 32-byte length for each value
    const rBuf = Buffer.from(r.toArray('be', 32));
    const sBuf = Buffer.from(canonicalS.toArray('be', 32));

    return Buffer.concat([rBuf, sBuf]);
  }
}

export {
  Identity,
  deriveKeyFromSeed,
  isUserAddress,
  generateUserAddress,
  encodeLengthPrefixed
};