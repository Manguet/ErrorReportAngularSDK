import { ErrorHandler, Injectable } from '@angular/core';
import { ErrorExplorerService } from './services/error-explorer.service';

@Injectable()
export class ErrorExplorerErrorHandler implements ErrorHandler {
  constructor(private errorExplorer: ErrorExplorerService) {}

  handleError(error: any): void {
    try {
      if (error instanceof Error) {
        this.errorExplorer.reportError(error, {
          handled_by: 'ErrorHandler',
          error_type: 'angular_error',
          source: 'global_error_handler'
        });
      } else {
        this.errorExplorer.reportMessage(
          `Non-Error thrown: ${String(error)}`,
          'error',
          {
            handled_by: 'ErrorHandler',
            error_type: 'non_error_thrown',
            original_error: error,
            source: 'global_error_handler'
          }
        );
      }
    } catch (captureError) {
      console.error('ErrorExplorer: Failed to capture error in ErrorHandler:', captureError);
    }

    // Continue with default error handling
    console.error('Angular Error:', error);
  }
}