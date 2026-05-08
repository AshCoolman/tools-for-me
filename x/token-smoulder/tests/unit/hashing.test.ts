import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashContent, hashFile } from '../../src/lib/hashing.js';

describe('hashContent', () => {
  it('returns the same hash for identical content', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'));
  });

  it('returns a different hash for different content', () => {
    expect(hashContent('hello')).not.toBe(hashContent('hello!'));
  });

  it('returns a 64-char hex string', () => {
    expect(hashContent('hello')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashFile', () => {
  it('matches hashContent for the same bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hash-'));
    const p = join(dir, 'a.txt');
    await writeFile(p, 'abc');
    expect(await hashFile(p)).toBe(hashContent('abc'));
  });

  it('differs when file content differs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hash-'));
    const a = join(dir, 'a.txt');
    const b = join(dir, 'b.txt');
    await writeFile(a, 'one');
    await writeFile(b, 'two');
    expect(await hashFile(a)).not.toBe(await hashFile(b));
  });
});
