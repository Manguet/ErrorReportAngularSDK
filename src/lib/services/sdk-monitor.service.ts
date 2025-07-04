import { Injectable } from '@angular/core';
import { SDKMetrics, HealthStatus } from '../types';

interface RequestMetrics {
  id: string;
  startTime: number;
  endTime?: number;
  success?: boolean;
  error?: Error;
  payloadSize?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SDKMonitorService {
  private metrics: SDKMetrics;
  private requests: Map<string, RequestMetrics> = new Map();
  private responseTimes: number[] = [];
  private startTime: number;
  private readonly MAX_RESPONSE_TIMES = 100; // Keep last 100 for average calculation

  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      errorsReported: 0,
      errorsDropped: 0,
      requestsSuccessful: 0,
      requestsFailed: 0,
      averageResponseTime: 0,
      queueSize: 0,
      bytesTransmitted: 0
    };
  }

  recordErrorReported(payloadSize: number): void {
    this.metrics.errorsReported++;
    this.metrics.bytesTransmitted += payloadSize;
  }

  recordErrorDropped(reason: 'rate_limit' | 'quota_exceeded' | 'validation_failed' | 'other'): void {
    this.metrics.errorsDropped++;
  }

  recordRequestStart(): string {
    const id = this.generateRequestId();
    const request: RequestMetrics = {
      id,
      startTime: Date.now()
    };
    
    this.requests.set(id, request);
    return id;
  }

  recordRequestSuccess(requestId: string, payloadSize: number): void {
    const request = this.requests.get(requestId);
    if (!request) return;

    request.endTime = Date.now();
    request.success = true;
    request.payloadSize = payloadSize;

    this.metrics.requestsSuccessful++;
    
    const responseTime = request.endTime - request.startTime;
    this.responseTimes.push(responseTime);
    
    // Keep only the last N response times
    if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
      this.responseTimes.shift();
    }
    
    this.updateAverageResponseTime();
    this.requests.delete(requestId);
  }

  recordRequestFailure(requestId: string, error: Error): void {
    const request = this.requests.get(requestId);
    if (!request) return;

    request.endTime = Date.now();
    request.success = false;
    request.error = error;

    this.metrics.requestsFailed++;

    const responseTime = request.endTime - request.startTime;
    this.responseTimes.push(responseTime);
    
    if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
      this.responseTimes.shift();
    }
    
    this.updateAverageResponseTime();
    this.requests.delete(requestId);
  }

  recordQueueSize(size: number): void {
    this.metrics.queueSize = size;
  }

  getMetrics(): SDKMetrics {
    return { ...this.metrics };
  }

  getHealthStatus(): HealthStatus {
    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check error rate
    const totalRequests = this.metrics.requestsSuccessful + this.metrics.requestsFailed;
    if (totalRequests > 0) {
      const errorRate = this.metrics.requestsFailed / totalRequests;
      if (errorRate > 0.5) {
        status = 'unhealthy';
        issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
      } else if (errorRate > 0.2) {
        status = 'degraded';
        issues.push(`Elevated error rate: ${(errorRate * 100).toFixed(1)}%`);
      }
    }

    // Check average response time
    if (this.metrics.averageResponseTime > 10000) {
      status = 'unhealthy';
      issues.push(`Very slow response time: ${this.metrics.averageResponseTime}ms`);
    } else if (this.metrics.averageResponseTime > 5000) {
      if (status === 'healthy') status = 'degraded';
      issues.push(`Slow response time: ${this.metrics.averageResponseTime}ms`);
    }

    // Check queue size
    if (this.metrics.queueSize > 100) {
      status = 'unhealthy';
      issues.push(`Large queue size: ${this.metrics.queueSize}`);
    } else if (this.metrics.queueSize > 50) {
      if (status === 'healthy') status = 'degraded';
      issues.push(`Queue backing up: ${this.metrics.queueSize}`);
    }

    // Check dropped errors
    if (this.metrics.errorsDropped > 0) {
      const dropRate = this.metrics.errorsDropped / (this.metrics.errorsReported + this.metrics.errorsDropped);
      if (dropRate > 0.3) {
        status = 'unhealthy';
        issues.push(`High drop rate: ${(dropRate * 100).toFixed(1)}%`);
      } else if (dropRate > 0.1) {
        if (status === 'healthy') status = 'degraded';
        issues.push(`Some errors dropped: ${(dropRate * 100).toFixed(1)}%`);
      }
    }

    const uptime = Date.now() - this.startTime;

    return {
      status,
      issues,
      uptime
    };
  }

  exportMetrics(): {
    metrics: SDKMetrics;
    health: HealthStatus;
    activeRequests: number;
    uptime: number;
  } {
    return {
      metrics: this.getMetrics(),
      health: this.getHealthStatus(),
      activeRequests: this.requests.size,
      uptime: Date.now() - this.startTime
    };
  }

  reset(): void {
    this.metrics = {
      errorsReported: 0,
      errorsDropped: 0,
      requestsSuccessful: 0,
      requestsFailed: 0,
      averageResponseTime: 0,
      queueSize: 0,
      bytesTransmitted: 0
    };
    this.requests.clear();
    this.responseTimes = [];
    this.startTime = Date.now();
  }

  private updateAverageResponseTime(): void {
    if (this.responseTimes.length === 0) {
      this.metrics.averageResponseTime = 0;
      return;
    }

    const sum = this.responseTimes.reduce((acc, time) => acc + time, 0);
    this.metrics.averageResponseTime = Math.round(sum / this.responseTimes.length);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Diagnostic methods
  getActiveRequestsCount(): number {
    return this.requests.size;
  }

  getActiveRequests(): RequestMetrics[] {
    return Array.from(this.requests.values());
  }

  getOldestActiveRequest(): RequestMetrics | null {
    const requests = Array.from(this.requests.values());
    if (requests.length === 0) return null;
    
    return requests.reduce((oldest, current) => 
      current.startTime < oldest.startTime ? current : oldest
    );
  }
}