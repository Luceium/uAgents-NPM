import fs from 'fs';
import path from 'path';
import { KeyValueStore } from '../src/Storage';

describe('KeyValueStore', () => {
  const name = 'test';
  const filename = path.join(process.cwd(), `${name}_data.json`);
  const key = 'key';
  const value = 'value';

  // clean up the test KeyValueStore file after each test. Mirrors tearDown() in uAgents Python
  afterEach(() => {
    if (fs.existsSync(filename)) {
      fs.unlinkSync(filename);
    }
  });

  test('should not create file yet', () => {
    const storage = new KeyValueStore(name);
    
    expect(fs.existsSync(filename)).toBe(false);
  });

  test('should create file after setting a value', () => {
    const storage = new KeyValueStore(name);

    storage.set(key, value);
    expect(fs.existsSync(filename)).toBe(true);
  });

  test('should set and get a value', () => {
    const storage = new KeyValueStore(name);
    const store = { [key]: value };

    storage.set(key, value);
    expect(fs.existsSync(filename)).toBe(true);
    expect(storage.get(key)).toBe(value);

    const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    expect(data).toEqual(store);
  });

  test('should update a value', () => {
    const storage = new KeyValueStore(name);
    const newValue = 'new_value';

    storage.set(key, newValue);
    expect(storage.get(key)).toBe(newValue);
  });

  test('should remove a key', () => {
    const storage = new KeyValueStore(name);

    storage.remove(key);
    expect(storage.get(key)).toBeNull();
  });
});
