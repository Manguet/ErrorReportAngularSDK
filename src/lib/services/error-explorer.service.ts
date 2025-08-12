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
import { BatchManagerService } from './batch-manager.service';
import { CompressionService } from './compression.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Injectable({
  providedIn: 'root'
})
export class ErrorExplorerService {
  private config: Required<Omit<ErrorExplorerConfig, 'userId' | 'userEmail' | 'beforeSend' | 'customData' | 'commitHash' | 'version' | 'allowedDomains'>> & 
    Pick<ErrorExplorerConfig, 'userId' | 'userEmail' | 'beforeSend' | 'customData' | 'commitHash' | 'version' | 'allowedDomains'>;
  private userContext: UserContext = {};
  private breadcrumbManager!: BreadcrumbManager;
  private retryManager!: RetryManagerService;
  private rateLimiter!: RateLimiterService;
  private offlineManager!: OfflineManagerService;
  private securityValidator!: SecurityValidatorService;
  private sdkMonitor!: SDKMonitorService;
  private quotaManager!: QuotaManagerService;
  private batchManager!: BatchManagerService;
  private compressionService!: CompressionService;
  private circuitBreaker!: CircuitBreakerService;
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
      // Batch manager defaults
      enableBatching: true,
      batchSize: 10,
      batchTimeout: 5000,
      maxPayloadSize: 1048576, // 1MB
      // Compression defaults
      enableCompression: true,
      compressionThreshold: 1024, // 1KB
      compressionLevel: 6,
      // Circuit breaker defaults
      enableCircuitBreaker: true,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerTimeout: 30000,
      circuitBreakerResetTimeout: 60000,
      ...config
    };

    this.initializeServices();
    this.initialize();
  }

  private initializeServices(): void {
    // Initialize all services with dependency injection
    this.breadcrumbManager = new BreadcrumbManager();
    this.breadcrumbManager.setMaxBreadcrumbs(this.config.maxBreadcrumbs);
    
    this.retryManager = new RetryManagerService();
    this.retryManager.configure({
      maxRetries: this.config.maxRetries,
      initialDelay: this.config.initialRetryDelay,
      maxDelay: this.config.maxRetryDelay,
    });
    
    this.rateLimiter = new RateLimiterService();
    this.rateLimiter.configure({
      maxRequests: this.config.maxRequestsPerMinute,
      windowMs: 60000,
      duplicateErrorWindow: this.config.duplicateErrorWindow,
    });
    
    this.offlineManager = new OfflineManagerService();
    this.offlineManager.configure(
      this.config.maxOfflineQueueSize,
      this.config.offlineQueueMaxAge
    );
    
    this.securityValidator = new SecurityValidatorService();
    this.securityValidator.configure({
      requireHttps: this.config.requireHttps,
      validateToken: true,
      maxPayloadSize: 1024 * 1024, // 1MB
    });
    
    this.sdkMonitor = new SDKMonitorService();
    
    this.quotaManager = new QuotaManagerService();
    this.quotaManager.configure({
      dailyLimit: 1000,
      monthlyLimit: 10000,
      payloadSizeLimit: 1024 * 1024,
      burstLimit: 50,
      burstWindowMs: 60000,
    });
    
    // Initialize batch manager
    this.batchManager = new BatchManagerService();
    if (this.config.enableBatching) {
      this.batchManager.configure({
        batchSize: this.config.batchSize || 10,
        batchTimeout: this.config.batchTimeout || 5000,
        maxPayloadSize: this.config.maxPayloadSize || 1048576
      });
      // Set up the send function for batch manager
      this.batchManager.setSendFunction((errors) => this.sendBatchDirectly(errors));
    }
    
    // Initialize compression service
    this.compressionService = new CompressionService();
    if (this.config.enableCompression) {
      this.compressionService.configure({
        threshold: this.config.compressionThreshold || 1024,
        level: this.config.compressionLevel || 6
      });
    }
    
    // Initialize circuit breaker service
    this.circuitBreaker = new CircuitBreakerService();
    if (this.config.enableCircuitBreaker) {
      this.circuitBreaker.configure({
        failureThreshold: this.config.circuitBreakerFailureThreshold || 5,
        timeout: this.config.circuitBreakerTimeout || 30000,
        resetTimeout: this.config.circuitBreakerResetTimeout || 60000
      });
    }
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
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
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

      // Use batch manager if enabled, otherwise send directly
      if (this.config.enableBatching) {
        const errorData: ErrorData = this.transformReportToErrorData(report);
        this.batchManager.addToBatch(errorData);
      } else {
        await this.sendReport(report);
      }
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

    // Execute with circuit breaker protection
    const sendWithCircuitBreaker = async () => {
      if (this.config.enableCircuitBreaker) {
        return await this.circuitBreaker.execute(() => 
          this.retryManager.executeWithRetry(() => this.sendReportDirectly(report))
        );
      } else {
        return await this.retryManager.executeWithRetry(() => this.sendReportDirectly(report));
      }
    };

    try {
      await sendWithCircuitBreaker();
      
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

  private transformReportToErrorData(report: ErrorReport): ErrorData {
    return {
      message: report.message,
      exception_class: report.type || 'Error',
      stack_trace: report.stack || '',
      file: this.extractFilename(report.stack) || 'unknown',
      line: this.extractLineNumber(report.stack) || 0,
      project: this.config.projectName,
      environment: report.environment,
      timestamp: new Date().toISOString(),
      commitHash: this.config.commitHash,
      browser: this.getBrowserData(),
      request: this.getRequestData(),
      context: report.context,
      breadcrumbs: report.context.breadcrumbs,
      user: {
        id: this.config.userId,
        email: this.config.userEmail,
        ...this.userContext
      }
    };
  }

  private getBrowserData() {
    if (typeof navigator === 'undefined' || typeof screen === 'undefined') {
      return undefined;
    }
    
    return {
      name: this.getBrowserName(),
      version: this.getBrowserVersion(),
      platform: navigator.platform,
      language: navigator.language,
      cookies_enabled: navigator.cookieEnabled,
      online: navigator.onLine,
      screen: {
        width: screen.width,
        height: screen.height,
        color_depth: screen.colorDepth
      }
    };
  }

  private getRequestData() {
    if (typeof window === 'undefined') {
      return undefined;
    }
    
    return {
      url: window.location.href,
      referrer: document.referrer,
      user_agent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }

  private getBrowserName(): string {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private getBrowserVersion(): string {
    const userAgent = navigator.userAgent;
    const match = userAgent.match(/(?:Chrome|Firefox|Safari|Edge)\/([0-9.]+)/);
    return match ? match[1] : 'Unknown';
  }

  private async sendBatchDirectly(errors: ErrorData[]): Promise<void> {
    if (errors.length === 0) return;

    const requestId = this.sdkMonitor.recordRequestStart();
    
    try {
      // Apply compression if enabled and supported
      let payload: any = errors;
      
      if (this.config.enableCompression && this.compressionService.isSupported()) {
        const shouldCompress = this.compressionService.shouldCompress(errors);
        if (shouldCompress) {
          try {
            const compressedData = await this.compressionService.compress(errors);
            payload = { compressed: true, data: compressedData };
          } catch (compressionError) {
            if (this.config.debug) {
              console.warn('[ErrorExplorer] Compression failed, sending uncompressed:', compressionError);
            }
            // Fall back to uncompressed
            payload = errors;
          }
        }
      }

      // Sanitize payload for security
      const sanitizedPayload = this.securityValidator.sanitizeData(payload);
      const payloadString = JSON.stringify(sanitizedPayload);
      const payloadSize = new Blob([payloadString]).size;

      // Validate payload size
      const sizeValidation = this.securityValidator.validatePayloadSize(payloadString);
      if (!sizeValidation.isValid) {
        this.sdkMonitor.recordRequestFailure(requestId, new Error(sizeValidation.error!));
        throw new Error(`Batch payload validation failed: ${sizeValidation.error}`);
      }

      // Send batch request
      const response = await this.http.post<any>(`${this.config.apiUrl}/batch`, sanitizedPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Error-Reporter': 'angular-sdk',
          'X-SDK-Version': this.config.version || '1.0.0',
          'X-Batch-Size': errors.length.toString(),
          ...(payload.compressed && { 'Content-Encoding': 'gzip' })
        }
      }).toPromise();

      this.sdkMonitor.recordRequestSuccess(requestId, payloadSize);
      
      if (this.config.debug) {
        console.log(`[ErrorExplorer] Batch of ${errors.length} errors sent successfully`);
      }
    } catch (error: any) {
      this.sdkMonitor.recordRequestFailure(requestId, error);
      
      // Handle specific HTTP errors
      if (error.status === 401 || error.status === 403) {
        // Don't retry authentication errors - disable the SDK
        this.config.enabled = false;
        if (this.config.debug) {
          console.error('[ErrorExplorer] Authentication failed - disabling SDK. Check your project token.');
        }
        throw new Error('Authentication failed - SDK disabled');
      }
      if (error.status === 429) {
        throw new Error('Rate limit exceeded by server');
      }
      if (error.status === 413) {
        throw new Error('Batch payload too large');
      }
      
      throw new Error(`Batch HTTP ${error.status || 'unknown'}: ${error.message || 'Request failed'}`);
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

      const response = await this.http.post<any>(`${this.config.apiUrl}/webhook/error/${this.config.projectToken}`, sanitizedPayload, {
        headers: {
          'Content-Type': 'application/json',
        }
      }).toPromise();

      this.sdkMonitor.recordRequestSuccess(requestId, payloadSize);
    } catch (error: any) {
      this.sdkMonitor.recordRequestFailure(requestId, error);
      
      // Handle specific HTTP errors
      if (error.status === 401 || error.status === 403) {
        // Don't retry authentication errors - disable the SDK
        this.config.enabled = false;
        if (this.config.debug) {
          console.error('[ErrorExplorer] Authentication failed - disabling SDK. Check your project token.');
        }
        throw new Error('Authentication failed - SDK disabled');
      }
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

  async flushBatch(): Promise<void> {
    if (this.config.enableBatching) {
      await this.batchManager.flush();
    }
  }

  getBatchStats(): ReturnType<BatchManagerService['getStats']> | null {
    return this.config.enableBatching ? this.batchManager.getStats() : null;
  }

  getCompressionStats(): ReturnType<CompressionService['getStats']> | null {
    return this.config.enableCompression ? this.compressionService.getStats() : null;
  }

  isCompressionSupported(): boolean {
    return this.config.enableCompression && this.compressionService.isSupported();
  }

  resetCompressionStats(): void {
    if (this.config.enableCompression) {
      this.compressionService.resetStats();
    }
  }

  getCircuitBreakerStats(): ReturnType<CircuitBreakerService['getStats']> | null {
    return this.config.enableCircuitBreaker ? this.circuitBreaker.getStats() : null;
  }

  resetCircuitBreaker(): void {
    if (this.config.enableCircuitBreaker) {
      this.circuitBreaker.reset();
    }
  }

  forceCircuitBreakerOpen(): void {
    if (this.config.enableCircuitBreaker) {
      this.circuitBreaker.forceOpen();
    }
  }

  forceCircuitBreakerClose(): void {
    if (this.config.enableCircuitBreaker) {
      this.circuitBreaker.forceClose();
    }
  }

  isCircuitBreakerOpen(): boolean {
    return this.config.enableCircuitBreaker ? this.circuitBreaker.isCircuitOpen() : false;
  }

  getCircuitBreakerState(): string {
    return this.config.enableCircuitBreaker ? this.circuitBreaker.getState() : 'DISABLED';
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