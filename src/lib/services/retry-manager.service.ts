import { Injectable } from '@angular/core';
import { RetryConfig } from '../types';

@Injectable({
  providedIn: 'root'
})
export class RetryManagerService {
  private config: RetryConfig;

  constructor() {
    this.config = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000
    };
  }

  configure(config: RetryConfig): void {
    this.config = config;
  }

  async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.config.maxRetries - 1) {
          throw lastError;
        }
        
        if (!this.shouldRetry(error as Error, attempt)) {
          throw lastError;
        }
        
        const delay = this.calculateDelay(attempt);
        await this.delay(delay);
      }
    }
    
    throw lastError!;
  }

  private shouldRetry(error: Error, attempt: number): boolean {
    // Don't retry on final attempt
    if (attempt >= this.config.maxRetries - 1) {
      return false;
    }
    
    // Check if it's a retryable error
    if (error.message.includes('Rate limit exceeded by server')) {
      return true;
    }
    
    if (error.message.includes('Request timeout')) {
      return true;
    }
    
    if (error.message.includes('Network error') || error.message.includes('Failed to fetch')) {
      return true;
    }
    
    // Check for HTTP status codes that are retryable
    const httpMatch = error.message.match(/HTTP (\d+):/);
    if (httpMatch) {
      const status = parseInt(httpMatch[1], 10);
      // Don't retry on authentication/authorization errors
      if (status === 401 || status === 403) {
        return false;
      }
      // Retry on server errors (5xx) and some client errors
      return status >= 500 || status === 429 || status === 408;
    }
    
    return false;
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.config.initialDelay * Math.pow(2, attempt);
    const maxDelay = Math.min(exponentialDelay, this.config.maxDelay);
    
    // Add jitter (±25%)
    const jitter = maxDelay * 0.25 * (Math.random() - 0.5);
    
    return Math.max(0, maxDelay + jitter);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}