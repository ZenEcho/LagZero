import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonStore } from '../../electron/common/store';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('JsonStore', () => {
  let tempDir: string;
  let store: JsonStore<any>;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), 'lagzero-test-' + Date.now());
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('should initialize with default values', async () => {
    store = new JsonStore({
      name: 'test-config',
      cwd: tempDir,
      defaults: { foo: 'bar' }
    });
    
    // Wait for async file operations
    await new Promise(r => setTimeout(r, 100));

    const content = await fs.readJson(path.join(tempDir, 'test-config.json'));
    expect(content).toEqual({ foo: 'bar' });
  });

  it('should save and load data', async () => {
    store = new JsonStore({
      name: 'test-config',
      cwd: tempDir,
      defaults: { foo: 'bar' }
    });
    await new Promise(r => setTimeout(r, 50));

    store.set({ foo: 'baz' });
    
    // Wait for async save
    await new Promise(r => setTimeout(r, 100));

    expect(store.get()).toEqual({ foo: 'baz' });

    const content = await fs.readJson(path.join(tempDir, 'test-config.json'));
    expect(content.foo).toBe('baz');
  });

  it('should create backups on save', async () => {
    store = new JsonStore({
      name: 'test-backup',
      cwd: tempDir,
      defaults: { count: 0 },
      backupCount: 3
    });
    await new Promise(r => setTimeout(r, 50));

    store.set({ count: 1 });
    await new Promise(r => setTimeout(r, 100));
    
    store.set({ count: 2 });
    await new Promise(r => setTimeout(r, 100));
    
    const backupDir = path.join(tempDir, 'backups', 'test-backup');
    expect(await fs.pathExists(backupDir)).toBe(true);
    
    const files = await fs.readdir(backupDir);
    // At least 1 backup should exist (from first save or subsequent saves)
    expect(files.length).toBeGreaterThan(0);
  });
});
