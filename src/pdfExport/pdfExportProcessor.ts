import type { PdfExportService } from './pdfExportService';

type PdfExportProcessorOptions = {
  enabled: boolean;
  pollMs: number;
  batchSize: number;
};

export class PdfExportProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;

  constructor(
    private readonly service: PdfExportService,
    private readonly options: PdfExportProcessorOptions,
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

export function createPdfExportProcessor(
  service: PdfExportService,
  options: PdfExportProcessorOptions,
): PdfExportProcessor | null {
  if (!options.enabled) {
    return null;
  }

  return new PdfExportProcessor(service, options);
}

export function shouldEnablePdfExportProcessor(nodeEnv: string, configuredEnabled: boolean) {
  return nodeEnv !== 'test' && configuredEnabled;
}
