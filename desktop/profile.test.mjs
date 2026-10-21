import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrateProfile } from './profile.mjs';

test('moves drawing storage to the new profile once, keeping the original and skipping process locks', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'iconic-profile-'));
  try {
    const legacy = Buffer.from('SFRJRkEgU2NoZW1hIEVsZWN0cm9u', 'base64').toString();
    const source = path.join(root, legacy, 'IndexedDB');
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, 'drawing'), 'saved drawing');
    writeFileSync(path.join(root, legacy, 'SingletonLock'), 'old lock');
    const target = path.join(root, 'iconic Electron');
    expect(migrateProfile(root, target, false)).toBe(true);
    expect(readFileSync(path.join(target, 'IndexedDB/drawing'), 'utf8')).toBe('saved drawing');
    expect(existsSync(path.join(target, 'SingletonLock'))).toBe(false);
    expect(existsSync(path.join(source, 'drawing'))).toBe(true);
    writeFileSync(path.join(target, 'IndexedDB/drawing'), 'new drawing');
    expect(migrateProfile(root, target, false)).toBe(false);
    expect(readFileSync(path.join(target, 'IndexedDB/drawing'), 'utf8')).toBe('new drawing');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
