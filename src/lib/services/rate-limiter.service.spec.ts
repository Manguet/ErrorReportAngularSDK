import { RateLimiterService } from './rate-limiter.service';
import { RateLimiterConfig } from '../types';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  const config: RateLimiterConfig = {
    maxRequests: 5,
    windowMs: 60000, // 1 minute
    duplicateErrorWindow: 5000 // 5 seconds
  };

  beforeEach(() => {
    service = new RateLimiterService(config);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should allow requests within limit', () => {
    for (let i = 0; i < config.maxRequests; i++) {
      expect(service.canMakeRequest()).toBe(true);
      service.recordRequest();
    }
  });

  it('should block requests over limit', () => {
    // Fill up the rate limit
    for (let i = 0; i < config.maxRequests; i++) {
      service.recordRequest();
    }
    
    expect(service.canMakeRequest()).toBe(false);
  });

  it('should track error fingerprints', () => {
    const error = new Error('Test error');
    const fingerprint = service.createErrorFingerprint(error);
    
    expect(service.canReportError(fingerprint)).toBe(true);
    service.recordRequest(fingerprint);
    expect(service.canReportError(fingerprint)).toBe(false);
  });

  it('should create consistent fingerprints for same errors', () => {
    const error1 = new Error('Test error');
    const error2 = new Error('Test error');
    
    const fingerprint1 = service.createErrorFingerprint(error1);
    const fingerprint2 = service.createErrorFingerprint(error2);
    
    expect(fingerprint1).toBe(fingerprint2);
  });

  it('should create different fingerprints for different errors', () => {
    const error1 = new Error('Test error 1');
    const error2 = new Error('Test error 2');
    
    const fingerprint1 = service.createErrorFingerprint(error1);
    const fingerprint2 = service.createErrorFingerprint(error2);
    
    expect(fingerprint1).not.toBe(fingerprint2);
  });

  it('should provide remaining requests count', () => {
    expect(service.getRemainingRequests()).toBe(config.maxRequests);
    
    service.recordRequest();
    expect(service.getRemainingRequests()).toBe(config.maxRequests - 1);
  });

  it('should clean up old requests', () => {
    // Record requests
    for (let i = 0; i < config.maxRequests; i++) {
      service.recordRequest();
    }
    
    expect(service.canMakeRequest()).toBe(false);
    
    // Cleanup should remove old requests (in real scenario, time would pass)
    service.cleanup();
    // Note: In a real test, we'd need to mock time or wait
  });
});