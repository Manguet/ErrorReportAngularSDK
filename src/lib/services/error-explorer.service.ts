import { Injectable, Inject, Optional } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { filter, catchError } from 'rxjs/operators';
import { throwError, EMPTY } from 'rxjs';
import {
  ErrorExplorerConfig,
  ErrorData,
  ErrorReport,
  ErrorContext,
  UserContext,
  Breadcrumb,
  AngularErrorInfo,
  ErrorLevel,
  ERROR_EXPLORER_CONFIG
} from '../types';
import { BreadcrumbManager } from './breadcrumb-manager.service';
import { RetryManagerService } from './retry-manager.service';
import { RateLimiterService } from './rate-limiter.service';
import { OfflineManagerService } from './offline-manager.service';
import { SecurityValidatorService } from './security-validator.service';
import { SDKMonitorService } from './sdk-monitor.service';
import { QuotaManagerService } from './quota-manager.service';

@Injectable({
  providedIn: 'root'
})
export class ErrorExplorerService {
  private config: Required<Omit<ErrorExplorerConfig, 'userId' | 'userEmail' | 'beforeSend' | 'customData' | 'commitHash' | 'version' | 'allowedDomains'>> & 
    Pick<ErrorExplorerConfig, 'userId' | 'userEmail' | 'beforeSend' | 'customData' | 'commitHash' | 'version' | 'allowedDomains'>;
  private userContext: UserContext = {};
  private breadcrumbManager: BreadcrumbManager;
  private retryManager: RetryManagerService;
  private rateLimiter: RateLimiterService;
  private offlineManager: OfflineManagerService;
  private securityValidator: SecurityValidatorService;
  private sdkMonitor: SDKMonitorService;
  private quotaManager: QuotaManagerService;
  private isInitialized: boolean = false;
  private cleanupInterval: number | null = null;

  constructor(
    @Optional() @Inject(ERROR_EXPLORER_CONFIG) config: ErrorExplorerConfig | null,
    private http: HttpClient,
    @Optional() private router: Router
  ) {
    if (!config) {
      throw new Error('ErrorExplorer: Configuration is required. Use ErrorExplorerModule.forRoot(config)');
    }

    this.config = {
      environment: 'production',
      enabled: true,
      debug: false,
      maxBreadcrumbs: 50,
      maxRequestsPerMinute: 10,
      duplicateErrorWindow: 5000,
      maxRetries: 3,
      initialRetryDelay: 1000,
      maxRetryDelay: 30000,
      enableOfflineSupport: true,
      maxOfflineQueueSize: 50,
      offlineQueueMaxAge: 24 * 60 * 60 * 1000,
      requestTimeout: 30000,
      requireHttps: false,
      captureRouteChanges: true,
      captureHttpErrors: true,
      ...config
    };

    this.initializeServices();
    this.initialize();
  }

  private initializeServices(): void {
    // Initialize all services
    this.breadcrumbManager = new BreadcrumbManager(this.config.maxBreadcrumbs);
    
    this.retryManager = new RetryManagerService({
      maxRetries: this.config.maxRetries,
      initialDelay: this.config.initialRetryDelay,
      maxDelay: this.config.maxRetryDelay,
    });
    
    this.rateLimiter = new RateLimiterService({
      maxRequests: this.config.maxRequestsPerMinute,
      windowMs: 60000,
      duplicateErrorWindow: this.config.duplicateErrorWindow,
    });
    
    this.offlineManager = new OfflineManagerService(
      this.config.maxOfflineQueueSize,
      this.config.offlineQueueMaxAge
    );
    
    this.securityValidator = new SecurityValidatorService({
      requireHttps: this.config.requireHttps,
      validateToken: true,
      maxPayloadSize: 1024 * 1024, // 1MB
    });
    
    this.sdkMonitor = new SDKMonitorService();
    
    this.quotaManager = new QuotaManagerService({
      dailyLimit: 1000,
      monthlyLimit: 10000,
      payloadSizeLimit: 1024 * 1024,
      burstLimit: 50,
      burstWindowMs: 60000,
    });
  }

  private initialize(): void {
    if (!this.config.enabled) {
      return;
    }

    // Validate configuration
    this.validateConfiguration();

    // Set user context if provided
    if (this.config.userId || this.config.userEmail) {
      this.setUser({
        id: this.config.userId,
        email: this.config.userEmail
      });
    }

    // Set up global error handlers
    this.setupGlobalHandlers();
    
    // Set up router tracking
    this.setupRouterTracking();
    
    // Configure offline manager
    if (this.config.enableOfflineSupport) {
      this.offlineManager.setSendReportFunction((report) => this.sendReportDirectly(report));
    }
    
    // Set up periodic cleanup
    this.cleanupInterval = window.setInterval(() => {
      this.rateLimiter.cleanup();
    }, 60000); // Cleanup every minute
    
    this.isInitialized = true;

    if (this.config.debug) {
      console.log('[ErrorExplorer] Initialized with config:', this.config);
    }
  }

  private setupRouterTracking(): void {
    if (!this.router || !this.config.captureRouteChanges) return;

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.breadcrumbManager.logNavigation('', event.url, {
          urlAfterRedirects: event.urlAfterRedirects
        });
      });
  }

  private setupGlobalHandlers(): void {
    if (typeof window === 'undefined') return;

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      this.reportError(error, { type: 'unhandledRejection' });
    });

    // Handle global errors
    window.addEventListener('error', (event) => {
      if (event.error) {
        this.reportError(event.error, {
          type: 'globalError',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      }
    });

    // Intercept console errors for breadcrumbs
    this.interceptConsole();

    // Intercept HTTP requests for breadcrumbs (if HttpClient is available)
    // This will be handled by the HTTP interceptor
  }

  private interceptConsole(): void {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };

    console.error = (...args) => {
      this.breadcrumbManager.logConsole('error', args.join(' '));
      originalConsole.error.apply(console, args);
    };

    console.warn = (...args) => {
      this.breadcrumbManager.logConsole('warn', args.join(' '));
      originalConsole.warn.apply(console, args);
    };
  }

  // Public API methods
  setUser(user: UserContext): void {
    this.userContext = { ...this.userContext, ...user };
  }

  setUserId(userId: string): void {
    this.config.userId = userId;
    this.userContext.id = userId;
  }

  setUserEmail(email: string): void {
    this.config.userEmail = email;
    this.userContext.email = email;
  }

  setCustomData(data: Record<string, any>): void {
    this.config.customData = { ...this.config.customData, ...data };
  }

  addBreadcrumb(
    message: string,
    category: string = 'custom',
    level: ErrorLevel = 'info',
    data?: Record<string, any>
  ): void {
    this.breadcrumbManager.addBreadcrumb({
      message,
      category,
      level,
      data
    });
  }

  logUserAction(action: string, data?: Record<string, any>): void {
    this.breadcrumbManager.logUserAction(action, data);
  }

  logNavigation(from: string, to: string, data?: Record<string, any>): void {
    this.breadcrumbManager.logNavigation(from, to, data);
  }

  clearBreadcrumbs(): void {
    this.breadcrumbManager.clearBreadcrumbs();
  }

  async reportError(error: Error, additionalData?: Record<string, any>): Promise<void> {
    if (!this.config.enabled || !this.isInitialized) {
      return;
    }

    try {
      // Check rate limiting
      const errorFingerprint = this.rateLimiter.createErrorFingerprint(error, additionalData);
      
      const canMakeRequest = this.rateLimiter.canMakeRequest();
      const canReportError = this.rateLimiter.canReportError(errorFingerprint);
      
      if (!canMakeRequest || !canReportError) {
        this.sdkMonitor.recordErrorDropped('rate_limit');
        if (this.config.debug) {
          console.log('[ErrorExplorer] Rate limited, skipping error report');
        }
        return;
      }

      const errorContext = this.createErrorContext();
      const report: ErrorReport = {
        message: error.message,
        stack: error.stack,
        type: error.constructor.name,
        environment: this.config.environment,
        context: {
          ...errorContext,
          ...additionalData
        },
        projectToken: this.config.projectToken,
      };

      // Estimate payload size
      const estimatedSize = JSON.stringify(report).length;
      
      // Check quota limits
      const quotaCheck = this.quotaManager.canSendError(estimatedSize);
      if (!quotaCheck.allowed) {
        this.sdkMonitor.recordErrorDropped('other');
        if (this.config.debug) {
          console.log('[ErrorExplorer] Quota exceeded:', quotaCheck.reason);
        }
        return;
      }

      if (this.config.debug) {
        console.log('[ErrorExplorer] Reporting error:', report);
      }

      await this.sendReport(report);
      this.quotaManager.recordErrorSent(estimatedSize);
      this.sdkMonitor.recordErrorReported(estimatedSize);
      this.rateLimiter.recordRequest(errorFingerprint);
    } catch (reportingError) {
      this.sdkMonitor.recordErrorDropped('other');
      if (this.config.debug) {
        console.error('[ErrorExplorer] Failed to report error:', reportingError);
      }
    }
  }

  async reportMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'error',
    additionalData?: Record<string, any>
  ): Promise<void> {
    const error = new Error(message);
    error.name = 'CustomMessage';
    
    await this.reportError(error, {
      type: 'CustomMessage',
      level,
      ...additionalData,
    });
  }

  // Legacy methods for backward compatibility
  captureException(error: Error, context?: Record<string, any>): void {
    this.reportError(error, context);
  }

  captureMessage(
    message: string,
    level: ErrorLevel = 'info',
    context?: Record<string, any>
  ): void {
    this.reportMessage(message, level as any, context);
  }

  captureHttpError(error: HttpErrorResponse, context?: Record<string, any>): void {
    const errorMessage = `HTTP ${error.status}: ${error.message}`;
    const errorData = {
      ...context,
      http_status: error.status,
      http_url: error.url,
      http_method: 'unknown',
      response_body: error.error
    };

    this.breadcrumbManager.logHttpRequest(
      'unknown',
      error.url || 'unknown',
      error.status,
      errorData
    );

    this.reportMessage(errorMessage, 'error', errorData);
  }

  private createErrorContext(): ErrorContext {
    return {
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      timestamp: Date.now(),
      userId: this.config.userId,
      userEmail: this.config.userEmail,
      customData: this.config.customData,
      breadcrumbs: this.breadcrumbManager.getBreadcrumbs(),
    };
  }

  private async sendReport(report: ErrorReport): Promise<void> {
    // Check if offline and queue if needed
    if (this.config.enableOfflineSupport && !this.offlineManager.isOnlineNow()) {
      this.offlineManager.queueReport(report);
      if (this.config.debug) {
        console.log('[ErrorExplorer] Offline, queuing report');
      }
      return;
    }

    // Try to send with retry logic
    try {
      await this.retryManager.executeWithRetry(() => this.sendReportDirectly(report));
      
      // Process offline queue if we're back online
      if (this.config.enableOfflineSupport) {
        await this.offlineManager.processQueue();
      }
    } catch (error) {
      // Queue for offline if enabled
      if (this.config.enableOfflineSupport) {
        this.offlineManager.queueReport(report);
        if (this.config.debug) {
          console.log('[ErrorExplorer] Failed to send, queuing for retry');
        }
      } else {
        throw error;
      }
    }
  }

  private async sendReportDirectly(report: ErrorReport): Promise<void> {
    const requestId = this.sdkMonitor.recordRequestStart();
    
    try {
      // Transform report to match Error Explorer webhook format
      const rawPayload = {
        message: report.message,
        exception_class: report.type || 'Error',
        file: this.extractFilename(report.stack) || 'unknown',
        line: this.extractLineNumber(report.stack) || 0,
        project: this.config.projectName,
        stack_trace: report.stack || '',
        environment: report.environment,
        commitHash: this.config.commitHash,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
        url: window.location.href,
        user_id: this.config.userId,
        user_email: this.config.userEmail,
        custom_data: {
          ...report.context.customData,
          breadcrumbs: report.context.breadcrumbs,
          angular_sdk: true,
          sdk_version: this.config.version || '1.0.0'
        }
      };

      // Sanitize payload for security
      const sanitizedPayload = this.securityValidator.sanitizeData(rawPayload);
      const payloadString = JSON.stringify(sanitizedPayload);
      const payloadSize = new Blob([payloadString]).size;

      // Validate payload size
      const sizeValidation = this.securityValidator.validatePayloadSize(payloadString);
      if (!sizeValidation.isValid) {
        this.sdkMonitor.recordRequestFailure(requestId, new Error(sizeValidation.error!));
        throw new Error(`Payload validation failed: ${sizeValidation.error}`);
      }

      const response = await this.http.post<any>(`${this.config.apiUrl}/webhook`, sanitizedPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Error-Reporter': 'angular-sdk',
          'X-SDK-Version': this.config.version || '1.0.0',
        }
      }).toPromise();

      this.sdkMonitor.recordRequestSuccess(requestId, payloadSize);
    } catch (error: any) {
      this.sdkMonitor.recordRequestFailure(requestId, error);
      
      // Handle specific HTTP errors
      if (error.status === 429) {
        throw new Error('Rate limit exceeded by server');
      }
      if (error.status === 413) {
        throw new Error('Payload too large');
      }
      
      throw new Error(`HTTP ${error.status || 'unknown'}: ${error.message || 'Request failed'}`);
    }
  }

  private extractFilename(stack?: string): string | null {
    if (!stack) return null;
    
    const match = stack.match(/at .+? \((.+?):\d+:\d+\)/);
    if (match) {
      return match[1].split('/').pop() || null;
    }
    
    const simpleMatch = stack.match(/(\w+\.tsx?:\d+:\d+)/);
    if (simpleMatch) {
      return simpleMatch[1].split(':')[0];
    }
    
    return null;
  }

  private extractLineNumber(stack?: string): number | null {
    if (!stack) return null;
    
    const match = stack.match(/:(\d+):\d+/);
    return match ? parseInt(match[1], 10) : null;
  }

  // Utility methods
  isEnabled(): boolean {
    return this.config.enabled;
  }

  getStats(): {
    queueSize: number;
    isOnline: boolean;
    rateLimitRemaining: number;
    rateLimitReset: number;
    sdkMetrics: ReturnType<SDKMonitorService['getMetrics']>;
    quotaUsage: ReturnType<QuotaManagerService['getUsageStats']>;
    healthStatus: ReturnType<SDKMonitorService['getHealthStatus']>;
  } {
    const queueSize = this.config.enableOfflineSupport ? this.offlineManager.getQueueSize() : 0;
    this.sdkMonitor.recordQueueSize(queueSize);
    
    return {
      queueSize,
      isOnline: this.offlineManager.isOnlineNow(),
      rateLimitRemaining: this.rateLimiter.getRemainingRequests(),
      rateLimitReset: this.rateLimiter.getResetTime(),
      sdkMetrics: this.sdkMonitor.getMetrics(),
      quotaUsage: this.quotaManager.getUsageStats(),
      healthStatus: this.sdkMonitor.getHealthStatus(),
    };
  }

  async flushQueue(): Promise<void> {
    if (this.config.enableOfflineSupport) {
      await this.offlineManager.processQueue();
    }
  }

  updateConfig(updates: Partial<ErrorExplorerConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Re-validate configuration if critical settings changed
    if (updates.apiUrl || updates.projectToken) {
      this.validateConfiguration();
    }
    
    if (this.config.debug) {
      console.log('[ErrorExplorer] Config updated:', updates);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.config.enableOfflineSupport) {
      this.offlineManager.clearQueue();
    }
    
    // Export final metrics if debug is enabled
    if (this.config.debug) {
      console.log('[ErrorExplorer] Final SDK metrics:', this.sdkMonitor.exportMetrics());
    }
  }

  private validateConfiguration(): void {
    // Validate API URL
    const urlValidation = this.securityValidator.validateApiUrl(this.config.apiUrl);
    if (!urlValidation.isValid) {
      const error = `Invalid API URL: ${urlValidation.error}`;
      if (this.config.debug) {
        console.error('[ErrorExplorer]', error);
      }
      throw new Error(error);
    }

    // Validate project token
    const tokenValidation = this.securityValidator.validateProjectToken(this.config.projectToken);
    if (!tokenValidation.isValid) {
      const error = `Invalid project token: ${tokenValidation.error}`;
      if (this.config.debug) {
        console.error('[ErrorExplorer]', error);
      }
      throw new Error(error);
    }
  }

  // Legacy methods for backward compatibility
  getBreadcrumbManager(): BreadcrumbManager {
    return this.breadcrumbManager;
  }

  getConfig() {
    return { ...this.config };
  }
}