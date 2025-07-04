import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { ErrorExplorerService } from './error-explorer.service';
import { ERROR_EXPLORER_CONFIG, ErrorExplorerConfig } from '../types';

describe('ErrorExplorerService', () => {
  let service: ErrorExplorerService;
  let httpMock: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockConfig: ErrorExplorerConfig = {
    projectToken: 'test-token',
    apiUrl: 'https://api.test.com',
    projectName: 'test-project',
    environment: 'test',
    enabled: true,
    debug: true
  };

  beforeEach(() => {
    const routerSpyObj = jasmine.createSpyObj('Router', ['navigate'], {
      events: jasmine.createSpyObj('events', ['pipe'])
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ErrorExplorerService,
        { provide: ERROR_EXPLORER_CONFIG, useValue: mockConfig },
        { provide: Router, useValue: routerSpyObj }
      ]
    });

    service = TestBed.inject(ErrorExplorerService);
    httpMock = TestBed.inject(HttpTestingController);
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
  });

  afterEach(() => {
    httpMock.verify();
    service.destroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with config', () => {
    const config = service.getConfig();
    expect(config.projectToken).toBe('test-token');
    expect(config.apiUrl).toBe('https://api.test.com');
    expect(config.projectName).toBe('test-project');
  });

  it('should report error successfully', async () => {
    const testError = new Error('Test error');
    
    // Mock the HTTP request
    const reportPromise = service.reportError(testError);
    
    const req = httpMock.expectOne(`${mockConfig.apiUrl}/webhook`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.message).toBe('Test error');
    expect(req.request.body.angular_sdk).toBe(true);
    
    req.flush({ success: true });
    
    await expectAsync(reportPromise).toBeResolved();
  });

  it('should handle HTTP errors during reporting', async () => {
    const testError = new Error('Test error');
    
    const reportPromise = service.reportError(testError);
    
    const req = httpMock.expectOne(`${mockConfig.apiUrl}/webhook`);
    req.error(new ErrorEvent('Network error'));
    
    // Should not throw - error is queued for offline
    await expectAsync(reportPromise).toBeResolved();
  });

  it('should add breadcrumbs', () => {
    service.addBreadcrumb('Test breadcrumb', 'test', 'info');
    
    const breadcrumbs = service.getBreadcrumbManager().getBreadcrumbs();
    expect(breadcrumbs.length).toBe(1);
    expect(breadcrumbs[0].message).toBe('Test breadcrumb');
    expect(breadcrumbs[0].category).toBe('test');
  });

  it('should set user context', () => {
    service.setUserId('test-user');
    service.setUserEmail('test@example.com');
    
    const config = service.getConfig();
    expect(config.userId).toBe('test-user');
    expect(config.userEmail).toBe('test@example.com');
  });

  it('should provide stats', () => {
    const stats = service.getStats();
    
    expect(stats).toEqual(jasmine.objectContaining({
      queueSize: jasmine.any(Number),
      isOnline: jasmine.any(Boolean),
      rateLimitRemaining: jasmine.any(Number),
      sdkMetrics: jasmine.any(Object),
      quotaUsage: jasmine.any(Object),
      healthStatus: jasmine.any(Object)
    }));
  });

  it('should be disabled when config.enabled is false', () => {
    const disabledConfig = { ...mockConfig, enabled: false };
    
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ErrorExplorerService,
        { provide: ERROR_EXPLORER_CONFIG, useValue: disabledConfig }
      ]
    });

    const disabledService = TestBed.inject(ErrorExplorerService);
    expect(disabledService.isEnabled()).toBe(false);
    
    // Should not make HTTP requests when disabled
    disabledService.reportError(new Error('Test'));
    httpMock.expectNone(`${disabledConfig.apiUrl}/webhook`);
    
    disabledService.destroy();
  });

  it('should validate configuration on initialization', () => {
    const invalidConfig = { ...mockConfig, projectToken: '' };
    
    expect(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ErrorExplorerService,
          { provide: ERROR_EXPLORER_CONFIG, useValue: invalidConfig }
        ]
      });
      TestBed.inject(ErrorExplorerService);
    }).toThrow();
  });
});