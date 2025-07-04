import { TestBed } from '@angular/core/testing';
import { ErrorExplorerErrorHandler } from './error-handler';
import { ErrorExplorerService } from './services/error-explorer.service';

describe('ErrorExplorerErrorHandler', () => {
  let errorHandler: ErrorExplorerErrorHandler;
  let mockErrorExplorer: jasmine.SpyObj<ErrorExplorerService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('ErrorExplorerService', ['reportError', 'reportMessage']);

    TestBed.configureTestingModule({
      providers: [
        ErrorExplorerErrorHandler,
        { provide: ErrorExplorerService, useValue: spy }
      ]
    });

    errorHandler = TestBed.inject(ErrorExplorerErrorHandler);
    mockErrorExplorer = TestBed.inject(ErrorExplorerService) as jasmine.SpyObj<ErrorExplorerService>;
  });

  it('should be created', () => {
    expect(errorHandler).toBeTruthy();
  });

  it('should handle Error objects', () => {
    const testError = new Error('Test error');
    spyOn(console, 'error');

    errorHandler.handleError(testError);

    expect(mockErrorExplorer.reportError).toHaveBeenCalledWith(
      testError,
      jasmine.objectContaining({
        handled_by: 'ErrorHandler',
        error_type: 'angular_error',
        source: 'global_error_handler'
      })
    );
    expect(console.error).toHaveBeenCalledWith('Angular Error:', testError);
  });

  it('should handle non-Error objects', () => {
    const nonError = 'String error';
    spyOn(console, 'error');

    errorHandler.handleError(nonError);

    expect(mockErrorExplorer.reportMessage).toHaveBeenCalledWith(
      'Non-Error thrown: String error',
      'error',
      jasmine.objectContaining({
        handled_by: 'ErrorHandler',
        error_type: 'non_error_thrown',
        original_error: nonError,
        source: 'global_error_handler'
      })
    );
    expect(console.error).toHaveBeenCalledWith('Angular Error:', nonError);
  });

  it('should handle errors gracefully when reporting fails', () => {
    const testError = new Error('Test error');
    mockErrorExplorer.reportError.and.throwError('Reporting failed');
    spyOn(console, 'error');

    expect(() => errorHandler.handleError(testError)).not.toThrow();
    expect(console.error).toHaveBeenCalledWith('ErrorExplorer: Failed to capture error in ErrorHandler:', jasmine.any(Error));
    expect(console.error).toHaveBeenCalledWith('Angular Error:', testError);
  });
});