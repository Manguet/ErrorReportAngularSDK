import { Injectable } from '@angular/core';
import { RateLimiterConfig } from '../types';

interface RequestLog {
  timestamp: number;
  fingerprint?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RateLimiterService {
  private requests: RequestLog[] = [];
  private errorFingerprints: Map<string, number> = new Map();
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  canMakeRequest(): boolean {
    const now = Date.now();
    this.cleanupOldRequests(now);
    
    return this.requests.length < this.config.maxRequests;
  }

  canReportError(fingerprint: string): boolean {
    const now = Date.now();
    const lastReported = this.errorFingerprints.get(fingerprint);
    
    if (!lastReported) {
      return true;
    }
    
    return (now - lastReported) > this.config.duplicateErrorWindow;
  }

  recordRequest(fingerprint?: string): void {
    const now = Date.now();
    this.requests.push({ timestamp: now, fingerprint });
    
    if (fingerprint) {
      this.errorFingerprints.set(fingerprint, now);
    }
  }

  createErrorFingerprint(error: Error, additionalData?: Record<string, any>): string {
    const components = [
      error.constructor.name,
      error.message,
      this.extractFirstStackFrame(error.stack),
      additionalData?.type || 'unknown'
    ];
    
    return components.join('|');
  }

  getRemainingRequests(): number {
    const now = Date.now();
    this.cleanupOldRequests(now);
    return Math.max(0, this.config.maxRequests - this.requests.length);
  }

  getResetTime(): number {
    if (this.requests.length === 0) {
      return Date.now();
    }
    
    const oldestRequest = Math.min(...this.requests.map(r => r.timestamp));
    return oldestRequest + this.config.windowMs;
  }

  cleanup(): void {
    const now = Date.now();
    this.cleanupOldRequests(now);
    this.cleanupOldFingerprints(now);
  }

  private cleanupOldRequests(now: number): void {
    const cutoff = now - this.config.windowMs;
    this.requests = this.requests.filter(req => req.timestamp > cutoff);
  }

  private cleanupOldFingerprints(now: number): void {
    const cutoff = now - this.config.duplicateErrorWindow;
    
    for (const [fingerprint, timestamp] of this.errorFingerprints.entries()) {
      if (timestamp <= cutoff) {
        this.errorFingerprints.delete(fingerprint);
      }
    }
  }

  private extractFirstStackFrame(stack?: string): string {
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    const firstFrame = lines.find(line => line.includes('at ')) || lines[1] || 'unknown';
    
    // Extract just the function name and file, not the full path
    const match = firstFrame.match(/at (.+?) \((.+?):(\d+):\d+\)/) || 
                  firstFrame.match(/at (.+?):(\d+):\d+/);
    
    if (match) {
      const func = match[1]?.split('/').pop() || 'anonymous';
      const file = match[2]?.split('/').pop() || 'unknown';
      return `${func}@${file}:${match[3] || '0'}`;
    }
    
    return 'unknown';
  }
}