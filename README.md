# @error-explorer/angular

**Advanced Angular SDK for Error Explorer** - Comprehensive error tracking and monitoring with offline support, rate limiting, security validation, and real-time analytics.

## ✨ Features

- 🚀 **Advanced Error Tracking** - Automatic capture of unhandled errors, HTTP failures, and performance issues
- 🔄 **Offline Support** - Queue errors when offline, sync when back online
- ⚡ **Rate Limiting** - Smart deduplication and request throttling
- 🔒 **Security First** - Built-in data sanitization and validation
- 📊 **Real-time Analytics** - SDK health monitoring and performance metrics
- 🧩 **Angular Native** - Deep Angular integration with route tracking and HTTP interceptors
- 📱 **Responsive Design** - Works seamlessly across all devices and browsers
- 🎯 **Zero Config** - Sensible defaults with extensive customization options

## Installation

```bash
npm install @error-explorer/angular
# or
yarn add @error-explorer/angular
```

## Quick Start

### Module Setup

```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { ErrorExplorerModule } from '@error-explorer/angular';

import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
    ErrorExplorerModule.forRoot({
      projectToken: 'your-project-token',
      apiUrl: 'https://your-domain.com',
      projectName: 'my-angular-app',
      environment: 'production'
    })
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

### Standalone Bootstrap (Angular 14+)

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { ErrorExplorerModule } from '@error-explorer/angular';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(
      HttpClientModule,
      ErrorExplorerModule.forRoot({
        webhookUrl: 'https://your-domain.com/webhook/project-token',
        projectName: 'my-angular-app',
        environment: 'production'
      })
    )
  ]
});
```

### Using in Components

```typescript
import { Component } from '@angular/core';
import { ErrorExplorerService } from '@error-explorer/angular';

@Component({
  selector: 'app-example',
  template: `
    <button (click)="triggerError()">Trigger Error</button>
    <button (click)="captureMessage()">Capture Message</button>
  `
})
export class ExampleComponent {
  constructor(private errorExplorer: ErrorExplorerService) {
    // Set user context
    this.errorExplorer.setUser({
      id: 123,
      email: 'user@example.com',
      username: 'john_doe'
    });
  }

  triggerError() {
    try {
      throw new Error('This is a test error');
    } catch (error) {
      this.errorExplorer.captureException(error as Error, {
        component: 'ExampleComponent',
        action: 'triggerError'
      });
    }
  }

  captureMessage() {
    this.errorExplorer.addBreadcrumb('User clicked capture message', 'user');
    this.errorExplorer.captureMessage('User performed an action', 'info', {
      action: 'captureMessage',
      component: 'ExampleComponent'
    });
  }
}
```

## Configuration

### Required Options

- `projectToken`: Your Error Explorer project token
- `apiUrl`: Your Error Explorer API URL
- `projectName`: Name of your project

### All Configuration Options

```typescript
ErrorExplorerModule.forRoot({
  // Required
  projectToken: 'your-project-token',
  apiUrl: 'https://your-domain.com',
  projectName: 'my-angular-app',
  
  // Basic settings
  environment: 'production',              // Default: 'production'
  enabled: true,                          // Default: true
  debug: false,                           // Default: false
  version: '1.0.0',                      // App version
  commitHash: 'abc123',                  // Git commit hash
  
  // User context
  userId: 'user123',                     // Default user ID
  userEmail: 'user@example.com',         // Default user email
  customData: { plan: 'premium' },       // Custom metadata
  
  // Performance & Limits
  maxBreadcrumbs: 50,                    // Default: 50
  maxRequestsPerMinute: 10,              // Default: 10
  duplicateErrorWindow: 5000,            // Default: 5000ms
  
  // Retry configuration
  maxRetries: 3,                         // Default: 3
  initialRetryDelay: 1000,               // Default: 1000ms
  maxRetryDelay: 30000,                  // Default: 30000ms
  
  // Offline support
  enableOfflineSupport: true,            // Default: true
  maxOfflineQueueSize: 50,               // Default: 50
  offlineQueueMaxAge: 86400000,          // Default: 24h
  
  // Security & Network
  requestTimeout: 30000,                 // Default: 30000ms
  requireHttps: false,                   // Default: false
  allowedDomains: ['mydomain.com'],      // Optional: restrict domains
  
  // Angular specific
  captureRouteChanges: true,             // Default: true
  captureHttpErrors: true,               // Default: true
  
  // Data filtering
  beforeSend: (data) => {                // Optional: Filter/modify data
    // Filter sensitive data
    if (data.context?.password) {
      data.context.password = '[FILTERED]';
    }
    return data;
  }
})

### Providing the Commit Hash

To link errors with your source code, you should provide the git commit hash of the current build. You can do this by setting an environment variable during your build process.

**1. Get the commit hash and set it in your environment files:**

You can use a script to get the commit hash and write it to your environment file before building.

```bash
# In your package.json scripts
"scripts": {
  "prebuild": "node -e \"require('fs').writeFileSync('./src/environments/commit.ts', 'export const commit = { hash: \\"' + require('child_process').execSync('git rev-parse HEAD').toString().trim() + '\\" };')\"",
  "build": "npm run prebuild && ng build"
}
```

**2. Import the commit hash and use it in your configuration:**

```typescript
// src/environments/commit.ts (will be generated by the script)
export const commit = { hash: "a1b2c3d..." };
```

```typescript
// app.module.ts
import { commit } from '../environments/commit';

ErrorExplorerModule.forRoot({
  // ... other config
  commitHash: commit.hash,
})
```

## Features

### Automatic Error Handling

The module automatically captures:

- **Unhandled Exceptions**: Global error handler catches all unhandled errors
- **HTTP Errors**: Interceptor captures HTTP 4xx/5xx errors
- **Route Changes**: Navigation events are tracked as breadcrumbs
- **Slow HTTP Requests**: Requests taking longer than 5 seconds

### Manual Error Capture

```typescript
// Capture exceptions (new async API)
try {
  await riskyOperation();
} catch (error) {
  await this.errorExplorer.reportError(error as Error, {
    operation: 'riskyOperation',
    userId: this.currentUserId
  });
}

// Capture messages (enhanced)
await this.errorExplorer.reportMessage('User logged in', 'info', {
  userId: 123,
  timestamp: Date.now(),
  sessionId: 'abc123'
});

// Add breadcrumbs (improved)
this.errorExplorer.addBreadcrumb('User clicked submit', 'user', 'info', {
  formData: this.formValue,
  buttonId: 'submit-btn'
});

// User actions (new)
this.errorExplorer.logUserAction('form_submitted', {
  formType: 'contact',
  validationPassed: true
});

// Navigation tracking (enhanced)
this.errorExplorer.logNavigation('/home', '/profile', {
  trigger: 'menu_click'
});
```

### HTTP Error Monitoring

HTTP errors are automatically captured and include:

```typescript
// The interceptor captures:
// - Request method, URL, headers
// - Response status, headers
// - Request duration
// - Error details

// You can also manually capture HTTP errors
this.http.get('/api/data').subscribe({
  next: (data) => {
    // Success
  },
  error: (error: HttpErrorResponse) => {
    this.errorExplorer.captureHttpError(error, {
      customContext: 'additional data'
    });
  }
});
```

### User Context Management

```typescript
// Set user context globally
this.errorExplorer.setUser({
  id: 123,
  email: 'user@example.com',
  username: 'john_doe',
  subscription: 'premium',
  customData: {
    preferences: {},
    permissions: []
  }
});

// User context is automatically included in all error reports
```

### Breadcrumb Management

```typescript
// Add custom breadcrumbs
this.errorExplorer.addBreadcrumb('User started checkout', 'user');
this.errorExplorer.addBreadcrumb('Payment method selected', 'user', 'info', {
  paymentMethod: 'credit_card'
});

// Access breadcrumb manager directly
const breadcrumbManager = this.errorExplorer.getBreadcrumbManager();
breadcrumbManager.addComponentLifecycle('MyComponent', 'ngOnInit');
breadcrumbManager.addUserInteraction('click', 'submit-button');
```

## 🚀 Advanced Features

### Real-time Analytics & Monitoring

```typescript
export class DashboardComponent {
  constructor(private errorExplorer: ErrorExplorerService) {}

  getSDKStats() {
    const stats = this.errorExplorer.getStats();
    console.log({
      queueSize: stats.queueSize,
      isOnline: stats.isOnline,
      rateLimitRemaining: stats.rateLimitRemaining,
      sdkMetrics: stats.sdkMetrics,
      quotaUsage: stats.quotaUsage,
      healthStatus: stats.healthStatus
    });
  }

  async flushOfflineQueue() {
    // Manually flush any queued errors
    await this.errorExplorer.flushQueue();
  }

  updateConfiguration() {
    // Dynamic configuration updates
    this.errorExplorer.updateConfig({
      debug: true,
      maxRequestsPerMinute: 20
    });
  }
}
```

### Offline Support & Queue Management

```typescript
// The SDK automatically handles offline scenarios
export class OfflineAwareComponent implements OnInit {
  constructor(private errorExplorer: ErrorExplorerService) {}

  ngOnInit() {
    // Errors reported while offline are automatically queued
    this.errorExplorer.reportError(new Error('Network issue'), {
      context: 'offline_scenario'
    });

    // When back online, queued errors are automatically sent
    window.addEventListener('online', async () => {
      await this.errorExplorer.flushQueue();
      console.log('Offline queue processed');
    });
  }
}
```

### Rate Limiting & Security

```typescript
// The SDK includes intelligent rate limiting and security features
export class SecurityExampleComponent {
  constructor(private errorExplorer: ErrorExplorerService) {}

  demonstrateRateLimiting() {
    // Duplicate errors within 5 seconds are automatically deduplicated
    for (let i = 0; i < 10; i++) {
      this.errorExplorer.reportError(new Error('Same error'));
    }
    // Only the first error will be sent, others are rate-limited

    // Rate limiting prevents spam
    for (let i = 0; i < 100; i++) {
      this.errorExplorer.reportError(new Error(`Error ${i}`));
    }
    // Only 10 requests per minute (default) are allowed
  }

  demonstrateDataSanitization() {
    // Sensitive data is automatically sanitized
    this.errorExplorer.reportError(new Error('Login failed'), {
      username: 'user@example.com',
      password: 'secret123', // This will be filtered out
      apiKey: 'abc123'       // This will be filtered out
    });
  }
}
```

### Quota Management

```typescript
export class QuotaExampleComponent {
  constructor(private errorExplorer: ErrorExplorerService) {}

  checkQuotaUsage() {
    const stats = this.errorExplorer.getStats();
    const quotaUsage = stats.quotaUsage;

    console.log('Daily usage:', {
      used: quotaUsage.daily.used,
      limit: quotaUsage.daily.limit,
      remaining: quotaUsage.daily.limit - quotaUsage.daily.used
    });

    console.log('Monthly usage:', {
      used: quotaUsage.monthly.used,
      limit: quotaUsage.monthly.limit
    });

    console.log('Burst usage:', {
      used: quotaUsage.burst.used,
      limit: quotaUsage.burst.limit
    });
  }
}
```

### Enhanced User Context Management

```typescript
export class UserContextComponent {
  constructor(private errorExplorer: ErrorExplorerService) {}

  setDetailedUserContext() {
    // Enhanced user context with custom data
    this.errorExplorer.setUser({
      id: 'user-123',
      email: 'user@example.com',
      username: 'john_doe',
      subscription: 'premium',
      role: 'admin',
      customData: {
        preferences: { theme: 'dark', language: 'en' },
        permissions: ['read', 'write', 'admin'],
        lastLogin: new Date().toISOString(),
        deviceInfo: {
          type: 'desktop',
          os: 'Windows 10',
          browser: 'Chrome'
        }
      }
    });

    // Individual setters
    this.errorExplorer.setUserId('user-456');
    this.errorExplorer.setUserEmail('newuser@example.com');
    this.errorExplorer.setCustomData({
      experiment: 'A',
      feature_flags: ['new_ui', 'beta_feature']
    });
  }
}
```

## Advanced Usage

### Custom Error Handler

```typescript
import { ErrorHandler, Injectable } from '@angular/core';
import { ErrorExplorerService } from '@error-explorer/angular';

@Injectable()
export class CustomErrorHandler implements ErrorHandler {
  constructor(private errorExplorer: ErrorExplorerService) {}

  handleError(error: any): void {
    // Add custom logic
    console.error('Custom error handling:', error);
    
    // Capture with Error Explorer
    if (error instanceof Error) {
      this.errorExplorer.captureException(error, {
        handled_by: 'CustomErrorHandler',
        custom_data: 'additional context'
      });
    }
  }
}

// In your module
@NgModule({
  providers: [
    {
      provide: ErrorHandler,
      useClass: CustomErrorHandler
    }
  ]
})
export class AppModule { }
```

### Performance Monitoring

```typescript
@Component({
  // ...
})
export class PerformanceComponent implements OnInit, OnDestroy {
  private startTime = Date.now();

  constructor(private errorExplorer: ErrorExplorerService) {}

  ngOnInit() {
    this.errorExplorer.addBreadcrumb('Component initialized', 'angular.lifecycle');
  }

  ngOnDestroy() {
    const duration = Date.now() - this.startTime;
    
    if (duration > 5000) {
      this.errorExplorer.captureMessage(
        'Slow component lifecycle',
        'warning',
        {
          component: 'PerformanceComponent',
          duration,
          lifecycle: 'ngOnDestroy'
        }
      );
    }
  }

  onSlowOperation() {
    const start = Date.now();
    
    // Perform operation
    this.heavyComputation();
    
    const duration = Date.now() - start;
    this.errorExplorer.addBreadcrumb(
      `Heavy computation completed in ${duration}ms`,
      'performance',
      duration > 1000 ? 'warning' : 'info'
    );
  }
}
```

### Environment-specific Configuration

```typescript
// environment.ts
export const environment = {
  production: false,
  errorExplorer: {
    webhookUrl: 'http://localhost:8000/webhook/dev-token',
    projectName: 'my-app-dev',
    environment: 'development',
    enabled: true,
    captureConsoleErrors: true
  }
};

// environment.prod.ts
export const environment = {
  production: true,
  errorExplorer: {
    webhookUrl: 'https://your-domain.com/webhook/prod-token',
    projectName: 'my-app',
    environment: 'production',
    enabled: true,
    captureConsoleErrors: false
  }
};

// app.module.ts
@NgModule({
  imports: [
    ErrorExplorerModule.forRoot(environment.errorExplorer)
  ]
})
export class AppModule { }
```

### Route-specific Error Handling

```typescript
import { Router, NavigationError } from '@angular/router';

@Component({
  // ...
})
export class AppComponent {
  constructor(
    private router: Router,
    private errorExplorer: ErrorExplorerService
  ) {
    // Handle navigation errors
    this.router.events.subscribe(event => {
      if (event instanceof NavigationError) {
        this.errorExplorer.captureException(
          new Error(`Navigation failed: ${event.error}`),
          {
            url: event.url,
            navigation_error: true
          }
        );
      }
    });
  }
}
```

## 📚 API Reference

### ErrorExplorerService

#### Core Methods

- `reportError(error: Error, additionalData?: Record<string, any>): Promise<void>` - Report an error (new async API)
- `reportMessage(message: string, level?: 'info' | 'warning' | 'error', additionalData?: Record<string, any>): Promise<void>` - Report a message
- `addBreadcrumb(message: string, category?: string, level?: ErrorLevel, data?: Record<string, any>): void` - Add breadcrumb
- `logUserAction(action: string, data?: Record<string, any>): void` - Log user action
- `logNavigation(from: string, to: string, data?: Record<string, any>): void` - Log navigation

#### User Context Methods

- `setUser(user: UserContext): void` - Set complete user context
- `setUserId(userId: string): void` - Set user ID
- `setUserEmail(email: string): void` - Set user email
- `setCustomData(data: Record<string, any>): void` - Set custom metadata

#### Utility Methods

- `clearBreadcrumbs(): void` - Clear all breadcrumbs
- `isEnabled(): boolean` - Check if SDK is enabled
- `getStats()` - Get SDK statistics and health metrics
- `flushQueue(): Promise<void>` - Flush offline queue
- `updateConfig(updates: Partial<ErrorExplorerConfig>): void` - Update configuration
- `destroy(): void` - Clean up SDK resources

#### Legacy Methods (Backward Compatible)

- `captureException(error: Error, context?: Record<string, any>): void` - Capture an exception
- `captureMessage(message: string, level?: ErrorLevel, context?: Record<string, any>): void` - Capture a message
- `captureHttpError(error: HttpErrorResponse, context?: Record<string, any>): void` - Capture HTTP error
- `getBreadcrumbManager(): BreadcrumbManager` - Get breadcrumb manager
- `getConfig()` - Get current configuration

### BreadcrumbManager

#### New Methods

- `logHttpRequest(method: string, url: string, status: number, data?: Record<string, any>): void` - Log HTTP request
- `logNavigation(from: string, to: string, data?: Record<string, any>): void` - Log navigation
- `logUserAction(action: string, data?: Record<string, any>): void` - Log user action
- `logConsole(level: 'error' | 'warn' | 'info' | 'debug', message: string): void` - Log console message
- `clearBreadcrumbs(): void` - Clear all breadcrumbs

#### Legacy Methods

- `addHttpRequest(method: string, url: string, statusCode?: number, duration?: number): void`
- `addNavigation(from: string, to: string): void`
- `addUserInteraction(event: string, target: string, data?: Record<string, any>): void`
- `addComponentLifecycle(componentName: string, lifecycle: string): void`
- `addConsoleLog(level: string, message: string, data?: any): void`
- `addCustom(message: string, data?: Record<string, any>): void`

### Statistics Interface

```typescript
interface SDKStats {
  queueSize: number;
  isOnline: boolean;
  rateLimitRemaining: number;
  rateLimitReset: number;
  sdkMetrics: SDKMetrics;
  quotaUsage: QuotaUsage;
  healthStatus: HealthStatus;
}

interface SDKMetrics {
  errorsReported: number;
  errorsDropped: number;
  requestsSuccessful: number;
  requestsFailed: number;
  averageResponseTime: number;
  queueSize: number;
  bytesTransmitted: number;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  uptime: number;
}
```

## 🔄 Migration Guide (v1 to v2)

### Breaking Changes

1. **Configuration Format** - `webhookUrl` replaced with `projectToken` + `apiUrl`
2. **New Async API** - `reportError()` and `reportMessage()` are now async
3. **Enhanced Types** - More comprehensive TypeScript interfaces

### Configuration Migration

```typescript
// v1 Configuration
ErrorExplorerModule.forRoot({
  webhookUrl: 'https://your-domain.com/webhook/project-token',
  projectName: 'my-app'
})

// v2 Configuration  
ErrorExplorerModule.forRoot({
  projectToken: 'project-token',
  apiUrl: 'https://your-domain.com',
  projectName: 'my-app'
})
```

### API Migration

```typescript
// v1 - Synchronous
this.errorExplorer.captureException(error);

// v2 - Asynchronous (recommended)
await this.errorExplorer.reportError(error);

// Legacy API still works for backward compatibility
this.errorExplorer.captureException(error); // Still supported
```

### New Features Available

- ✅ Offline error queuing
- ✅ Intelligent rate limiting
- ✅ Security validation
- ✅ Real-time SDK monitoring
- ✅ Enhanced breadcrumbs
- ✅ Quota management
- ✅ Performance metrics

## 🛠️ Development

### Building the SDK

```bash
npm install
npm run build
```

### Running Tests

```bash
npm test
npm run test:coverage
```

### Type Checking

```bash
npm run typecheck
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions included.

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+
- Modern mobile browsers

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 [Documentation](https://docs.error-explorer.com)
- 🐛 [Report Issues](https://github.com/error-explorer/error-explorer/issues)
- 💬 [Community Forum](https://community.error-explorer.com)
- 📧 [Email Support](mailto:support@error-explorer.com)