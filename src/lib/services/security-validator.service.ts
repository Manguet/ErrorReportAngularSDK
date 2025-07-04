import { Injectable } from '@angular/core';
import { SecurityConfig, ValidationResult } from '../types';

@Injectable({
  providedIn: 'root'
})
export class SecurityValidatorService {
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  validateApiUrl(url: string): ValidationResult {
    if (!url) {
      return { isValid: false, error: 'API URL is required' };
    }

    try {
      const parsedUrl = new URL(url);
      
      if (this.config.requireHttps && parsedUrl.protocol !== 'https:') {
        return { isValid: false, error: 'HTTPS is required in production' };
      }
      
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { isValid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
      }
      
      // Check for localhost/private IPs in production
      if (this.config.requireHttps && this.isPrivateOrLocalhost(parsedUrl.hostname)) {
        return { isValid: false, error: 'Private/localhost URLs not allowed in production' };
      }
      
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Invalid URL format' };
    }
  }

  validateProjectToken(token: string): ValidationResult {
    if (!token) {
      return { isValid: false, error: 'Project token is required' };
    }

    if (typeof token !== 'string') {
      return { isValid: false, error: 'Project token must be a string' };
    }

    if (token.length < 10) {
      return { isValid: false, error: 'Project token is too short' };
    }

    if (token.length > 1000) {
      return { isValid: false, error: 'Project token is too long' };
    }

    // Check for suspicious patterns
    if (this.containsSuspiciousPatterns(token)) {
      return { isValid: false, error: 'Project token contains suspicious patterns' };
    }

    return { isValid: true };
  }

  validatePayloadSize(payload: string): ValidationResult {
    const size = new Blob([payload]).size;
    
    if (size > this.config.maxPayloadSize) {
      return {
        isValid: false,
        error: `Payload size (${size} bytes) exceeds maximum allowed (${this.config.maxPayloadSize} bytes)`
      };
    }
    
    return { isValid: true };
  }

  sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      
      for (const [key, value] of Object.entries(data)) {
        // Skip potentially sensitive keys
        if (this.isSensitiveKey(key)) {
          continue;
        }
        
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeData(value);
      }
      
      return sanitized;
    }

    return String(data);
  }

  private isPrivateOrLocalhost(hostname: string): boolean {
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return true;
    }
    
    // Check for private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./ // Link-local
    ];
    
    return privateRanges.some(range => range.test(hostname));
  }

  private containsSuspiciousPatterns(token: string): boolean {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+=/i,
      /eval\(/i,
      /exec\(/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(token));
  }

  private sanitizeString(str: string): string {
    if (typeof str !== 'string') {
      return String(str);
    }
    
    // Remove potentially dangerous characters
    return str
      .replace(/<script[^>]*>.*?<\/script>/gi, '[script removed]')
      .replace(/javascript:/gi, 'javascript_removed:')
      .replace(/vbscript:/gi, 'vbscript_removed:')
      .replace(/on\w+\s*=/gi, 'event_removed=')
      .slice(0, 10000); // Limit string length
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'passwd',
      'pwd',
      'secret',
      'token',
      'key',
      'api_key',
      'apikey',
      'auth',
      'authorization',
      'cookie',
      'session',
      'csrf',
      'ssn',
      'social_security',
      'credit_card',
      'card_number',
      'cvv',
      'pin'
    ];
    
    const lowerKey = key.toLowerCase();
    return sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
  }

  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}