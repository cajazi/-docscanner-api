import type { EdgeDetectionService } from './edgeDetectionService';

type EdgeDetectionProcessorOptions = {
  enabled: boolean;
  pollMs: number;
  batchSize: number;
};

export class EdgeDetectionProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;

  constructor(
    private readonly service: EdgeDetectionService,
    private readonly options: EdgeDetectionProcessorOptions,
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

export function createEdgeDetectionProcessor(
  service: EdgeDetectionService,
  options: EdgeDetectionProcessorOptions,
): EdgeDetectionProcessor | null {
  if (!options.enabled) {
    return null;
  }

  return new EdgeDetectionProcessor(service, options);
}

export function shouldEnableEdgeDetectionProcessor(nodeEnv: string, configuredEnabled: boolean) {
  return nodeEnv !== 'test' && configuredEnabled;
}
