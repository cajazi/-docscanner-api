import type { EnhancementService } from './enhancementService';

type EnhancementProcessorOptions = {
  enabled: boolean;
  pollMs: number;
  batchSize: number;
};

export class EnhancementProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;

  constructor(
    private readonly service: EnhancementService,
    private readonly options: EnhancementProcessorOptions,
  ) {}

  start() {
    if (!this.options.enabled || !this.stopped) {
      return;
    }

    this.stopped = false;
    this.schedule(0);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isEnabled() {
    return this.options.enabled;
  }

  private schedule(delayMs: number) {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick() {
    if (this.running) {
      this.schedule(this.options.pollMs);
      return;
    }

    this.running = true;
    try {
      await this.service.processNextPendingJobs(this.options.batchSize);
    } finally {
      this.running = false;
      this.schedule(this.options.pollMs);
    }
  }
}

export function createEnhancementProcessor(
  service: EnhancementService,
  options: EnhancementProcessorOptions,
): EnhancementProcessor | null {
  if (!options.enabled) {
    return null;
  }

  return new EnhancementProcessor(service, options);
}

export function shouldEnableEnhancementProcessor(nodeEnv: string, configuredEnabled: boolean) {
  return nodeEnv !== 'test' && configuredEnabled;
}
