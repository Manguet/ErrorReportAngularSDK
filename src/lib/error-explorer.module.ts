import { NgModule, ModuleWithProviders, ErrorHandler } from '@angular/core';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ErrorExplorerConfig, ERROR_EXPLORER_CONFIG } from './types';
import { ErrorExplorerService } from './services/error-explorer.service';
import { ErrorExplorerErrorHandler } from './error-handler';
import { ErrorExplorerHttpInterceptor } from './http-interceptor';

@NgModule({
  imports: [HttpClientModule],
  providers: [
    ErrorExplorerService
  ]
})
export class ErrorExplorerModule {
  static forRoot(config: ErrorExplorerConfig): ModuleWithProviders<ErrorExplorerModule> {
    return {
      ngModule: ErrorExplorerModule,
      providers: [
        {
          provide: ERROR_EXPLORER_CONFIG,
          useValue: config
        },
        {
          provide: ErrorHandler,
          useClass: ErrorExplorerErrorHandler
        },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: ErrorExplorerHttpInterceptor,
          multi: true
        }
      ]
    };
  }
}