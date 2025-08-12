import { Injectable } from '@angular/core';
import { QuotaConfig, QuotaUsage } from '../types';

interface QuotaState {
  daily: { used: number; resetTime: number };
  monthly: { used: number; resetTime: number };
  burst: { used: number; resetTime: number };
}

@Injectable({
  providedIn: 'root'
})
export class QuotaManagerService {
  private config: QuotaConfig;
  private state: QuotaState;
  private readonly STORAGE_KEY = 'error_explorer_quota';

  constructor() {
    this.config = {
      dailyLimit: 1000,
      monthlyLimit: 10000,
      payloadSizeLimit: 1024 * 1024,
      burstLimit: 50,
      burstWindowMs: 60000
    };
    this.state = this.loadState();
    this.checkAndResetQuotas();
  }

  configure(config: QuotaConfig): void {
    this.config = config;
  }

  canSendError(estimatedSize: number): { allowed: boolean; reason?: string } {
    this.checkAndResetQuotas();

    // Check burst limit
    if (this.state.burst.used >= this.config.burstLimit) {
      return { allowed: false, reason: 'Burst limit exceeded' };
    }

    // Check daily limit
    if (this.state.daily.used >= this.config.dailyLimit) {
      return { allowed: false, reason: 'Daily limit exceeded' };
    }

    // Check monthly limit
    if (this.state.monthly.used >= this.config.monthlyLimit) {
      return { allowed: false, reason: 'Monthly limit exceeded' };
    }

    // Check payload size
    if (estimatedSize > this.config.payloadSizeLimit) {
      return { allowed: false, reason: 'Payload size limit exceeded' };
    }

    return { allowed: true };
  }

  recordErrorSent(payloadSize: number): void {
    this.checkAndResetQuotas();
    
    this.state.daily.used++;
    this.state.monthly.used++;
    this.state.burst.used++;
    
    this.saveState();
  }

  getUsageStats(): QuotaUsage {
    this.checkAndResetQuotas();
    
    return {
      daily: {
        used: this.state.daily.used,
        limit: this.config.dailyLimit,
        resetTime: this.state.daily.resetTime
      },
      monthly: {
        used: this.state.monthly.used,
        limit: this.config.monthlyLimit,
        resetTime: this.state.monthly.resetTime
      },
      burst: {
        used: this.state.burst.used,
        limit: this.config.burstLimit,
        resetTime: this.state.burst.resetTime
      }
    };
  }

  getRemainingQuota(): {
    daily: number;
    monthly: number;
    burst: number;
  } {
    this.checkAndResetQuotas();
    
    return {
      daily: Math.max(0, this.config.dailyLimit - this.state.daily.used),
      monthly: Math.max(0, this.config.monthlyLimit - this.state.monthly.used),
      burst: Math.max(0, this.config.burstLimit - this.state.burst.used)
    };
  }

  getTimeUntilReset(): {
    daily: number;
    monthly: number;
    burst: number;
  } {
    const now = Date.now();
    
    return {
      daily: Math.max(0, this.state.daily.resetTime - now),
      monthly: Math.max(0, this.state.monthly.resetTime - now),
      burst: Math.max(0, this.state.burst.resetTime - now)
    };
  }

  private checkAndResetQuotas(): void {
    const now = Date.now();

    // Check burst quota reset
    if (now >= this.state.burst.resetTime) {
      this.state.burst.used = 0;
      this.state.burst.resetTime = now + this.config.burstWindowMs;
    }

    // Check daily quota reset
    if (now >= this.state.daily.resetTime) {
      this.state.daily.used = 0;
      this.state.daily.resetTime = this.getNextDayReset();
    }

    // Check monthly quota reset
    if (now >= this.state.monthly.resetTime) {
      this.state.monthly.used = 0;
      this.state.monthly.resetTime = this.getNextMonthReset();
    }

    this.saveState();
  }

  private getNextDayReset(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  private getNextMonthReset(): number {
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    nextMonth.setHours(0, 0, 0, 0);
    return nextMonth.getTime();
  }

  private loadState(): QuotaState {
    if (typeof localStorage === 'undefined') {
      return this.createInitialState();
    }

    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        
        // Validate the loaded state
        if (this.isValidState(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('[QuotaManager] Failed to load state from localStorage:', error);
    }

    return this.createInitialState();
  }

  private saveState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn('[QuotaManager] Failed to save state to localStorage:', error);
    }
  }

  private createInitialState(): QuotaState {
    const now = Date.now();
    
    return {
      daily: {
        used: 0,
        resetTime: this.getNextDayReset()
      },
      monthly: {
        used: 0,
        resetTime: this.getNextMonthReset()
      },
      burst: {
        used: 0,
        resetTime: now + this.config.burstWindowMs
      }
    };
  }

  private isValidState(state: any): state is QuotaState {
    return (
      state &&
      typeof state === 'object' &&
      state.daily &&
      typeof state.daily.used === 'number' &&
      typeof state.daily.resetTime === 'number' &&
      state.monthly &&
      typeof state.monthly.used === 'number' &&
      typeof state.monthly.resetTime === 'number' &&
      state.burst &&
      typeof state.burst.used === 'number' &&
      typeof state.burst.resetTime === 'number'
    );
  }

  updateConfig(newConfig: Partial<QuotaConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  resetQuotas(): void {
    this.state = this.createInitialState();
    this.saveState();
  }
}