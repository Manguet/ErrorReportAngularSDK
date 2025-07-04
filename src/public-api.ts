/*
 * Public API Surface of @error-explorer/angular
 */

// Main module and service
export * from './lib/error-explorer.module';
export * from './lib/services/error-explorer.service';

// Services
export * from './lib/services/breadcrumb-manager.service';
export * from './lib/services/retry-manager.service';
export * from './lib/services/rate-limiter.service';
export * from './lib/services/offline-manager.service';
export * from './lib/services/security-validator.service';
export * from './lib/services/sdk-monitor.service';
export * from './lib/services/quota-manager.service';

// Error handling
export * from './lib/error-handler';
export * from './lib/http-interceptor';

// Types and interfaces
export * from './lib/types';

// Re-export commonly used types for convenience
export type {
  ErrorExplorerConfig,
  ErrorData,
  ErrorReport,
  ErrorContext,
  UserContext,
  Breadcrumb,
  AngularErrorInfo,
  ErrorLevel,
  SDKMetrics,
  HealthStatus,
  QuotaUsage
} from './lib/types';