import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
  HttpResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ErrorExplorerService } from './services/error-explorer.service';

@Injectable()
export class ErrorExplorerHttpInterceptor implements HttpInterceptor {
  constructor(private errorExplorer: ErrorExplorerService) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    const startTime = Date.now();

    return next.handle(request).pipe(
      tap((event: HttpEvent<any>) => {
        if (event instanceof HttpResponse) {
          const duration = Date.now() - startTime;
          
          // Add response breadcrumb
          this.errorExplorer.getBreadcrumbManager().logHttpRequest(
            request.method,
            request.url,
            event.status,
            {
              duration,
              response_size: this.getResponseSize(event)
            }
          );
          
          // Capture slow requests as warnings
          if (duration > 5000) {
            this.errorExplorer.reportMessage(
              `Slow HTTP request: ${request.method} ${request.url}`,
              'warning',
              {
                method: request.method,
                url: request.url,
                duration,
                status: event.status,
                source: 'http_interceptor'
              }
            );
          }
        }
      }),
      catchError((error: HttpErrorResponse) => {
        const duration = Date.now() - startTime;
        
        // Add error breadcrumb
        this.errorExplorer.getBreadcrumbManager().logHttpRequest(
          request.method,
          request.url,
          error.status,
          {
            duration,
            error: error.message
          }
        );
        
        // Capture HTTP errors
        if (this.shouldCaptureHttpError(error)) {
          this.errorExplorer.captureHttpError(error, {
            method: request.method,
            url: request.url,
            duration,
            request_headers: this.sanitizeHeaders(request.headers),
            response_headers: this.sanitizeHeaders(error.headers),
            source: 'http_interceptor'
          });
        }
        
        return throwError(() => error);
      })
    );
  }

  private shouldCaptureHttpError(error: HttpErrorResponse): boolean {
    // Skip capturing 4xx client errors by default (except 401, 403, 404)
    if (error.status >= 400 && error.status < 500) {
      return [401, 403, 404].includes(error.status);
    }
    
    // Capture all 5xx server errors
    return error.status >= 500;
  }

  private getResponseSize(event: HttpResponse<any>): number {
    try {
      if (event.body) {
        return JSON.stringify(event.body).length;
      }
    } catch (error) {
      // Ignore size calculation errors
    }
    return 0;
  }

  private sanitizeHeaders(headers: any): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token', 'x-csrf-token'];
    
    if (headers && headers.keys) {
      headers.keys().forEach((key: string) => {
        const lowerKey = key.toLowerCase();
        if (sensitiveHeaders.includes(lowerKey)) {
          sanitized[key] = '[FILTERED]';
        } else {
          sanitized[key] = headers.get(key);
        }
      });
    }
    
    return sanitized;
  }
}