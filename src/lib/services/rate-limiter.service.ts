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

  constructor() {
    this.config = {
      maxRequests: 10,
      windowMs: 60000,
      duplicateErrorWindow: 5000
    };
  }

  configure(config: RateLimiterConfig): void {
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
    // Enhanced fingerprint combining stack trace signature + message
    const stackSignature = this.extractStackSignature(error.stack || '', 3);
    const messageSignature = (error.message || '').substring(0, 100);
    const errorType = error.constructor.name;
    
    // Combine signatures
    const combined = `${stackSignature}|${messageSignature}|${errorType}`;
    
    // Create a simple hash for consistency
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36).substring(0, 32);
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

  /**
   * Extract stack trace signature by taking the first N meaningful frames
   * and normalizing line numbers to avoid over-segmentation
   */
  private extractStackSignature(stackTrace: string, depth: number = 3): string {
    if (!stackTrace) return '';
    
    const lines = stackTrace.split('\n');
    
    // Filter meaningful frames (ignore empty lines and browser internals)
    const meaningfulFrames = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed && 
             trimmed.includes('at ') &&
             !trimmed.includes('chrome-extension://') &&
             !trimmed.includes('webpack://') &&
             !trimmed.includes('node_modules/@angular') &&
             (trimmed.includes('.ts') || trimmed.includes('.js') || trimmed.includes('.component'));
    });
    
    // Take first N frames
    const frames = meaningfulFrames.slice(0, depth);
    
    // Normalize each frame (remove specific line numbers and columns)
    const normalizedFrames = frames.map(frame => {
      return frame.replace(/:\d+:\d+/g, ':XX:XX').replace(/:\d+/g, ':XX');
    });
    
    return normalizedFrames.join('|');
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