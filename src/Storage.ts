import fs from 'fs';
import path from 'path';

import { Identity } from './crypto';
import { ec as EC } from 'elliptic';

const ec = new EC('secp256k1');

/**
 * Interface for a key-value like storage system.
 */
interface StorageAPI {
  get(key: string): any | null;
  has(key: string): boolean;
  set(key: string, value: any): void;
  remove(key: string): void;
  clear(): void;
}

/**
 * A simple key-value store implementation for data storage.
 *
 * Attributes:
 *   _data ({ [key: string]: any }): The internal data storage dictionary.
 *   _name (string): The name associated with the store.
 *   _path (string): The file path where the store data is stored.
 *
 * Methods:
 *   constructor: Initialize the KeyValueStore instance.
 *   get: Get the value associated with a key from the store.
 *   has: Check if a key exists in the store.
 *   set: Set a value associated with a key in the store.
 *   remove: Remove a key and its associated value from the store.
 *   clear: Clear all data from the store.
 *   _load: Load data from the file into the store.
 *   _save: Save the store data to the file.
 */
class KeyValueStore implements StorageAPI {
  private _data: { [key: string]: any } = {};
  private _name: string;
  private _path: string;

  /**
   * Initialize the KeyValueStore instance.
   *
   * @param name - The name associated with the store.
   * @param cwd - The current working directory. Defaults to null.
   */
  constructor(name: string, cwd: string | null = null) {
    this._name = name || "my";
    const currentDir = cwd || process.cwd();
    this._path = path.join(currentDir, `${this._name}_data.json`);

    if (fs.existsSync(this._path)) {
      this._load();
    }
  }

  /**
   * Get the value associated with a key in the store.
   *
   * @param key - The key whose value to get.
   * @returns The value associated with the key, or null if not found.
   */
  get(key: string): any | null {
    return this._data[key] || null;
  }

  /**
   * Check if the store has a specific key.
   *
   * @param key - The key to check existence for.
   * @returns True if the key exists, false otherwise.
   */
  has(key: string): boolean {
    return key in this._data;
  }

  /**
   * Set a value associated with a key in the store.
   *
   * @param key - The key whose value to set.
   * @param value - The value to associate with the key.
   */
  set(key: string, value: any): void {
    this._data[key] = value;
    this._save();
  }

  /**
   * Remove a key and its associated value from the store.
   *
   * @param key - The key to remove.
   */
  remove(key: string): void {
    if (key in this._data) {
      delete this._data[key];
      this._save();
    }
  }

  /**
   * Clear all data from the store.
   */
  clear(): void {
    this._data = {};
    this._save();
  }

  /**
   * Load data from the file into the store.
   */
  private _load(): void {
    const data = fs.readFileSync(this._path, 'utf-8');
    this._data = JSON.parse(data);
  }

  /**
   * Save the store data to the file.
   */
  private _save(): void {
    // syntax: JSON.stringify(value, replacer, space)
    fs.writeFileSync(this._path, JSON.stringify(this._data, null, 4), 'utf-8');
  }
}

/**
 * Load all private keys from the private keys file.
 *
 * @returns A dictionary containing loaded private keys.
 */
function loadAllKeys(): { [key: string]: any } {
  const privateKeysPath = path.join(process.cwd(), "private_keys.json");
  if (fs.existsSync(privateKeysPath)) {
    const data = fs.readFileSync(privateKeysPath, 'utf-8');
    return JSON.parse(data);
  }
  return {};
}

/**
 * Save private keys to the private keys file.
 *
 * @param name - The name associated with the private keys.
 * @param identityKey - The identity private key.
 * @param walletKey - The wallet private key.
 */
function savePrivateKeys(name: string, identityKey: string, walletKey: string): void {
  const privateKeys = loadAllKeys();
  privateKeys[name] = { identity_key: identityKey, wallet_key: walletKey };

  const privateKeysPath = path.join(process.cwd(), "private_keys.json");
  fs.writeFileSync(privateKeysPath, JSON.stringify(privateKeys, null, 4), 'utf-8');
}

/**
 * Get or create private keys associated with a name.
 *
 * @param name - The name associated with the private keys.
 * @returns A tuple containing the identity key and wallet key.
 */
function getOrCreatePrivateKeys(name: string): [string, string] {
  const keys = loadAllKeys();
  if (name in keys) {
    const privateKeys = keys[name];
    if (privateKeys) {
      return [privateKeys.identity_key, privateKeys.wallet_key];
    }
  }

  const identityKey = Identity.generate().privateKey;
  const walletKey = ec.genKeyPair().getPrivate("hex");

  savePrivateKeys(name, identityKey, walletKey);
  return [identityKey, walletKey];
}

export { KeyValueStore };
