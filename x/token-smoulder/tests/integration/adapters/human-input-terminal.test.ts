import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}));

import { input as mockedInput } from '@inquirer/prompts';
import { TerminalHumanInput } from '../../../src/adapters/input/terminal.js';
import { InputTimeoutError } from '../../../src/adapters/input/interface.js';

describe('TerminalHumanInput', () => {
  beforeEach(() => {
    (mockedInput as unknown as { mockReset: () => void }).mockReset();
  });

  it('isAvailable reflects stdin TTY', async () => {
    const ch = new TerminalHumanInput({ isTty: true });
    expect(await ch.isAvailable()).toBe(true);
    const ch2 = new TerminalHumanInput({ isTty: false });
    expect(await ch2.isAvailable()).toBe(false);
  });

  it('request returns the inquirer answer', async () => {
    (mockedInput as unknown as { mockResolvedValueOnce: (v: string) => void })
      .mockResolvedValueOnce('hello');
    const ch = new TerminalHumanInput({ isTty: true });
    const answer = await ch.request({
      orchestrationName: 'demo',
      runId: 'r1',
      agentResponse: 'q?',
      timeoutMs: 5_000,
    });
    expect(answer).toBe('hello');
  });

  it('rejects with InputTimeoutError when inquirer takes longer than timeoutMs', async () => {
    (mockedInput as unknown as { mockImplementationOnce: (fn: () => Promise<string>) => void })
      .mockImplementationOnce(() => new Promise<string>(() => undefined));
    const ch = new TerminalHumanInput({ isTty: true });
    await expect(
      ch.request({
        orchestrationName: 'demo',
        runId: 'r1',
        agentResponse: 'q?',
        timeoutMs: 100,
      }),
    ).rejects.toBeInstanceOf(InputTimeoutError);
  });
});
