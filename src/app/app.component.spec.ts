import {NO_ERRORS_SCHEMA} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {AppComponent} from './app.component';

describe('AppComponent', () => {
  it('renders the router outlet that hosts the screener', () => {
    TestBed.configureTestingModule({declarations: [AppComponent], schemas: [NO_ERRORS_SCHEMA]});
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });
});
