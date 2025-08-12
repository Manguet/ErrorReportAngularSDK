import { Injectable } from '@angular/core';
import { BatchConfig, BatchStats, ErrorData } from '../types';

@Injectable({
  providedIn: 'root'
})
export class BatchManagerService {
  private config: BatchConfig;
  private currentBatch: ErrorData[] = [];
  private batchTimeout?: number;
  private stats: BatchStats = {
    currentSize: 0,
    totalBatches: 0,
    totalErrors: 0,
    averageBatchSize: 0
  };
  private sendFunction?: (errors: ErrorData[]) => Promise<void>;

  constructor() {
    this.config = {
      batchSize: 10,
      batchTimeout: 5000,
      maxPayloadSize: 1048576 // 1MB
    };
  }

  configure(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setSendFunction(sendFn: (errors: ErrorData[]) => Promise<void>): void {
    this.sendFunction = sendFn;
  }

  addToBatch(error: ErrorData): void {
    this.currentBatch.push(error);
    this.stats.currentSize = this.currentBatch.length;
    this.stats.totalErrors++;

    // Check if we should send the batch
    if (this.shouldSendBatch()) {
      this.sendBatch();
    } else if (!this.batchTimeout) {
      // Start timeout for partial batch
      this.startBatchTimeout();
    }
  }

  flush(): Promise<void> {
    if (this.currentBatch.length > 0) {
      return this.sendBatch();
    }
    return Promise.resolve();
  }

  getStats(): BatchStats {
    return { ...this.stats };
  }

  private shouldSendBatch(): boolean {
    if (this.currentBatch.length >= this.config.batchSize) {
      return true;
    }

    // Check payload size
    const payloadSize = this.calculatePayloadSize();
    return payloadSize >= this.config.maxPayloadSize;
  }

  private calculatePayloadSize(): number {
    try {
      return new TextEncoder().encode(JSON.stringify(this.currentBatch)).length;
    } catch {
      // Fallback estimation
      return JSON.stringify(this.currentBatch).length * 2;
    }
  }

  private startBatchTimeout(): void {
    this.batchTimeout = window.setTimeout(() => {
      if (this.currentBatch.length > 0) {
        this.sendBatch();
      }
    }, this.config.batchTimeout);
  }

  private clearBatchTimeout(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = undefined;
    }
  }

  private async sendBatch(): Promise<void> {
    if (this.currentBatch.length === 0) {
      return;
    }

    const batch = [...this.currentBatch];
    this.currentBatch = [];
    this.stats.currentSize = 0;
    this.clearBatchTimeout();

    try {
      if (this.sendFunction) {
        await this.sendFunction(batch);
        
        // Update stats on successful send
        this.stats.totalBatches++;
        this.stats.lastSentAt = Date.now();
        this.updateAverageBatchSize(batch.length);
      }
    } catch (error) {
      // On failure, we could implement retry logic or queuing
      // Batch send failed - error will be handled by retry manager
      throw error;
    }
  }

  private updateAverageBatchSize(batchSize: number): void {
    const totalErrors = this.stats.totalErrors;
    const totalBatches = this.stats.totalBatches;
    
    if (totalBatches > 0) {
      this.stats.averageBatchSize = totalErrors / totalBatches;
    }
  }

  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}