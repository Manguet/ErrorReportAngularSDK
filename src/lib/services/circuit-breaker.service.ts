import { Injectable } from '@angular/core';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface CircuitBreakerStats {
  state: string;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  nextRetryTime: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class CircuitBreakerService {
  private config: CircuitBreakerConfig = {
    failureThreshold: 5,
    timeout: 30000,
    resetTimeout: 60000
  };

  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private nextRetryTime: number | null = null;

  configure(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.isCallAllowed()) {
      throw new Error('Circuit breaker is OPEN - calls are not allowed');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  isCallAllowed(): boolean {
    const now = Date.now();

    if (this.state === CircuitState.CLOSED) {
      return true;
    } else if (this.state === CircuitState.OPEN) {
      // Check if we should transition to HALF_OPEN
      if (this.nextRetryTime && now >= this.nextRetryTime) {
        this.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false;
    } else if (this.state === CircuitState.HALF_OPEN) {
      return true;
    }

    return false;
  }

  private onSuccess(): void {
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Reset circuit breaker on successful call from HALF_OPEN
      this.reset();
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Go back to OPEN state on failure from HALF_OPEN
      this.tripCircuit();
    } else if (this.failureCount >= this.config.failureThreshold) {
      // Trip circuit if failure threshold is reached
      this.tripCircuit();
    }
  }

  private tripCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = Date.now() + this.config.timeout;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextRetryTime = null;
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime: this.nextRetryTime
    };
  }

  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = Date.now() + this.config.timeout;
  }

  forceClose(): void {
    this.reset();
  }

  isCircuitOpen(): boolean {
    return this.state === CircuitState.OPEN && !this.isCallAllowed();
  }

  getTimeUntilRetry(): number {
    if (this.state === CircuitState.OPEN && this.nextRetryTime) {
      return Math.max(0, this.nextRetryTime - Date.now());
    }
    return 0;
  }

  getFailureRate(): number {
    const totalCalls = this.successCount + this.failureCount;
    return totalCalls > 0 ? this.failureCount / totalCalls : 0;
  }
}