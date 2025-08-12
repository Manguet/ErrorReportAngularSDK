import { Injectable } from '@angular/core';
import { ErrorReport } from '../types';

interface QueuedReport {
  report: ErrorReport;
  timestamp: number;
  attempts: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineManagerService {
  private queue: QueuedReport[] = [];
  private maxQueueSize: number;
  private maxAge: number;
  private sendReportFunction?: (report: ErrorReport) => Promise<void>;
  private isProcessing = false;

  constructor() {
    this.maxQueueSize = 50;
    this.maxAge = 24 * 60 * 60 * 1000;
    
    // Load queue from localStorage on initialization
    this.loadQueue();
    
    // Set up online/offline event listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.processQueue());
      window.addEventListener('offline', () => this.onOffline());
    }
  }

  configure(maxQueueSize: number, maxAge: number): void {
    this.maxQueueSize = maxQueueSize;
    this.maxAge = maxAge;
  }

  setSendReportFunction(fn: (report: ErrorReport) => Promise<void>): void {
    this.sendReportFunction = fn;
  }

  queueReport(report: ErrorReport): void {
    const queuedReport: QueuedReport = {
      report,
      timestamp: Date.now(),
      attempts: 0
    };

    this.queue.push(queuedReport);
    
    // Enforce queue size limit
    if (this.queue.length > this.maxQueueSize) {
      this.queue.shift(); // Remove oldest
    }
    
    // Clean up old reports
    this.cleanupQueue();
    
    // Save to localStorage
    this.saveQueue();
  }

  async processQueue(): Promise<void> {
    if (!this.sendReportFunction || this.isProcessing || !this.isOnlineNow()) {
      return;
    }

    this.isProcessing = true;
    
    try {
      // Process reports in batches to avoid overwhelming the server
      const batchSize = 5;
      const reportsToProcess = this.queue.splice(0, batchSize);
      
      for (const queuedReport of reportsToProcess) {
        try {
          await this.sendReportFunction(queuedReport.report);
          // Successfully sent, remove from queue (already spliced)
        } catch (error) {
          queuedReport.attempts++;
          
          // If we haven't exceeded max attempts, put it back in queue
          if (queuedReport.attempts < 3) {
            this.queue.unshift(queuedReport);
          }
          // Otherwise, drop the report
        }
      }
      
      this.saveQueue();
      
      // If there are more reports and we're still online, schedule next batch
      if (this.queue.length > 0 && this.isOnlineNow()) {
        setTimeout(() => this.processQueue(), 1000);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  isOnlineNow(): boolean {
    if (typeof navigator === 'undefined') {
      return true; // Assume online in non-browser environments
    }
    return navigator.onLine;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clearQueue(): void {
    this.queue = [];
    this.saveQueue();
  }

  private onOffline(): void {
    // Could add offline-specific logic here
    // Application went offline - queue will be used
  }

  private cleanupQueue(): void {
    const now = Date.now();
    const cutoff = now - this.maxAge;
    
    this.queue = this.queue.filter(item => item.timestamp > cutoff);
  }

  private saveQueue(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      const serializedQueue = JSON.stringify(this.queue);
      localStorage.setItem('error_explorer_queue', serializedQueue);
    } catch (error) {
      console.warn('[OfflineManager] Failed to save queue to localStorage:', error);
    }
  }

  private loadQueue(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      const serializedQueue = localStorage.getItem('error_explorer_queue');
      if (serializedQueue) {
        this.queue = JSON.parse(serializedQueue);
        this.cleanupQueue(); // Remove any stale reports
      }
    } catch (error) {
      console.warn('[OfflineManager] Failed to load queue from localStorage:', error);
      this.queue = [];
    }
  }

  getQueueStats(): { size: number; oldestTimestamp: number; newestTimestamp: number } {
    if (this.queue.length === 0) {
      return { size: 0, oldestTimestamp: 0, newestTimestamp: 0 };
    }
    
    const timestamps = this.queue.map(item => item.timestamp);
    return {
      size: this.queue.length,
      oldestTimestamp: Math.min(...timestamps),
      newestTimestamp: Math.max(...timestamps)
    };
  }
}