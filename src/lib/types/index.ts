export interface ErrorExplorerConfig {
  projectToken: string;
  apiUrl: string;
  projectName: string;
  environment?: string;
  enabled?: boolean;
  userId?: string;
  userEmail?: string;
  customData?: Record<string, any>;
  debug?: boolean;
  maxBreadcrumbs?: number;
  commitHash?: string;
  version?: string;
  
  // Rate limiting
  maxRequestsPerMinute?: number;
  duplicateErrorWindow?: number;
  
  // Retry configuration
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  
  // Offline support
  enableOfflineSupport?: boolean;
  maxOfflineQueueSize?: number;
  offlineQueueMaxAge?: number;
  
  // Security and network
  requestTimeout?: number;
  allowedDomains?: string[];
  requireHttps?: boolean;
  
  // Angular specific
  captureRouteChanges?: boolean;
  captureHttpErrors?: boolean;
  beforeSend?: (data: ErrorData) => ErrorData | null;
}

export interface ErrorData {
  message: string;
  exception_class: string;
  stack_trace: string;
  file: string;
  line: number;
  project: string;
  environment: string;
  timestamp: string;
  commitHash?: string;
  browser?: BrowserData;
  request?: RequestData;
  context?: ErrorContext;
  breadcrumbs?: Breadcrumb[];
  user?: UserContext;
}

export interface ErrorContext {
  url: string;
  userAgent: string;
  timestamp: number;
  userId?: string;
  userEmail?: string;
  customData?: Record<string, any>;
  breadcrumbs?: Breadcrumb[];
  type?: string;
  componentName?: string;
  lifecycle?: string;
  route?: string;
  httpUrl?: string;
  httpMethod?: string;
  httpStatus?: number;
}

export interface RequestData {
  url?: string;
  referrer?: string;
  user_agent?: string;
  viewport?: {
    width: number;
    height: number;
  };
  method?: string;
  headers?: Record<string, string>;
}

export interface BrowserData {
  name: string;
  version: string;
  platform: string;
  language: string;
  cookies_enabled: boolean;
  online: boolean;
  screen: {
    width: number;
    height: number;
    color_depth: number;
  };
}

export interface UserContext {
  id?: string;
  email?: string;
  username?: string;
  ip?: string;
  [key: string]: any;
}

export interface Breadcrumb {
  message: string;
  category: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  timestamp: number;
  data?: Record<string, any>;
}

export interface AngularErrorInfo {
  componentName?: string;
  lifecycle?: string;
  route?: string;
  httpUrl?: string;
  httpMethod?: string;
  httpStatus?: number;
  componentStack?: string;
}

export interface ErrorReport {
  message: string;
  stack?: string;
  type: string;
  file?: string;
  line?: number;
  column?: number;
  environment: string;
  context: ErrorContext;
  projectToken: string;
}

// Rate Limiter interfaces
export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  duplicateErrorWindow: number;
}

// Retry Manager interfaces
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
}

// Security Validator interfaces
export interface SecurityConfig {
  requireHttps: boolean;
  validateToken: boolean;
  maxPayloadSize: number;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Quota Manager interfaces
export interface QuotaConfig {
  dailyLimit: number;
  monthlyLimit: number;
  payloadSizeLimit: number;
  burstLimit: number;
  burstWindowMs: number;
}

export interface QuotaUsage {
  daily: { used: number; limit: number; resetTime: number };
  monthly: { used: number; limit: number; resetTime: number };
  burst: { used: number; limit: number; resetTime: number };
}

// SDK Monitor interfaces
export interface SDKMetrics {
  errorsReported: number;
  errorsDropped: number;
  requestsSuccessful: number;
  requestsFailed: number;
  averageResponseTime: number;
  queueSize: number;
  bytesTransmitted: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  uptime: number;
}

export type ErrorLevel = 'debug' | 'info' | 'warning' | 'error';

export const ERROR_EXPLORER_CONFIG = 'ERROR_EXPLORER_CONFIG';