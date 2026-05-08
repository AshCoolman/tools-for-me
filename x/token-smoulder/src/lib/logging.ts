import type { Event, EventName } from '../adapters/storage/internal-types.js';

export type EventSink = (event: Event) => Promise<void>;

export type LoggerOptions = {
  appendEvent: EventSink;
  jsonStdout?: boolean;
};

export type EmitInput = {
  name: EventName;
  orchestrationName?: string;
  runId?: string;
  payload?: Record<string, unknown>;
};

export class StructuredLogger {
  private readonly appendEvent: EventSink;
  private readonly jsonStdout: boolean;

  constructor(opts: LoggerOptions) {
    this.appendEvent = opts.appendEvent;
    this.jsonStdout = opts.jsonStdout ?? false;
  }

  async emit(input: EmitInput): Promise<Event> {
    const event: Event = {
      name: input.name,
      timestamp: new Date().toISOString(),
      ...(input.orchestrationName !== undefined ? { orchestrationName: input.orchestrationName } : {}),
      ...(input.runId !== undefined ? { runId: input.runId } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    };
    await this.appendEvent(event);
    if (this.jsonStdout) {
      const human = this.format(event);
      process.stderr.write(human + '\n');
    } else {
      const human = this.format(event);
      process.stderr.write(human + '\n');
    }
    return event;
  }

  private format(event: Event): string {
    const orch = event.orchestrationName ? ` ${event.orchestrationName}` : '';
    const run = event.runId ? ` run=${event.runId}` : '';
    return `[${event.timestamp}] ${event.name}${orch}${run}`;
  }
}
