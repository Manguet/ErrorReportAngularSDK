import { Injectable } from '@angular/core';
import { Breadcrumb } from '../types';

@Injectable({
  providedIn: 'root'
})
export class BreadcrumbManager {
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs: number;

  constructor(maxBreadcrumbs: number = 50) {
    this.maxBreadcrumbs = maxBreadcrumbs;
  }

  addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
    const fullBreadcrumb: Breadcrumb = {
      ...breadcrumb,
      timestamp: Date.now()
    };

    this.breadcrumbs.push(fullBreadcrumb);

    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  getBreadcrumbs(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  clear(): void {
    this.breadcrumbs = [];
  }

  // New methods to match React SDK
  logHttpRequest(method: string, url: string, status: number, data?: Record<string, any>): void {
    this.addBreadcrumb({
      message: `${method} ${url} → ${status}`,
      category: 'http',
      level: status >= 400 ? 'error' : 'info',
      data: {
        method,
        url,
        status,
        ...data
      }
    });
  }

  logNavigation(from: string, to: string, data?: Record<string, any>): void {
    this.addBreadcrumb({
      message: `Navigation: ${from} → ${to}`,
      category: 'navigation',
      level: 'info',
      data: {
        from,
        to,
        ...data
      }
    });
  }

  logUserAction(action: string, data?: Record<string, any>): void {
    this.addBreadcrumb({
      message: `User: ${action}`,
      category: 'user',
      level: 'info',
      data
    });
  }

  logConsole(level: 'error' | 'warn' | 'info' | 'debug', message: string): void {
    this.addBreadcrumb({
      message,
      category: 'console',
      level: level === 'warn' ? 'warning' : level,
      data: { originalLevel: level }
    });
  }

  clearBreadcrumbs(): void {
    this.clear();
  }

  addHttpRequest(
    method: string, 
    url: string, 
    statusCode?: number,
    duration?: number
  ): void {
    this.addBreadcrumb({
      message: `${method} ${url}${statusCode ? ` → ${statusCode}` : ''}${duration ? ` (${duration}ms)` : ''}`,
      category: 'http',
      level: statusCode && statusCode >= 400 ? 'error' : 'info',
      data: {
        method,
        url,
        status_code: statusCode,
        duration
      }
    });
  }

  addNavigation(from: string, to: string): void {
    this.addBreadcrumb({
      message: `Navigation: ${from} → ${to}`,
      category: 'navigation',
      level: 'info',
      data: {
        from,
        to
      }
    });
  }

  addUserInteraction(event: string, target: string, data?: Record<string, any>): void {
    this.addBreadcrumb({
      message: `User ${event} on ${target}`,
      category: 'user',
      level: 'info',
      data: {
        event,
        target,
        ...data
      }
    });
  }

  addComponentLifecycle(componentName: string, lifecycle: string): void {
    this.addBreadcrumb({
      message: `${componentName}: ${lifecycle}`,
      category: 'angular.lifecycle',
      level: 'debug',
      data: {
        component: componentName,
        lifecycle
      }
    });
  }

  addAngularEvent(componentName: string, eventName: string, data?: any): void {
    this.addBreadcrumb({
      message: `${componentName} emitted ${eventName}`,
      category: 'angular.event',
      level: 'info',
      data: {
        component: componentName,
        event: eventName,
        event_data: data
      }
    });
  }

  addConsoleLog(level: string, message: string, data?: any): void {
    this.addBreadcrumb({
      message,
      category: 'console',
      level: level as any,
      data: data ? { data } : undefined
    });
  }

  addCustom(message: string, data?: Record<string, any>): void {
    this.addBreadcrumb({
      message,
      category: 'custom',
      level: 'info',
      data
    });
  }
}