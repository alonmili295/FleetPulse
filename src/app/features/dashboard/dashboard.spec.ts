import { TestBed } from '@angular/core/testing';

import { DashboardComponent } from './dashboard';

describe('DashboardComponent (P0 shell)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
    }).compileComponents();
  });

  it('renders the FleetPulse title and subtitle', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.dashboard__title')?.textContent).toContain('FleetPulse');
    expect(el.querySelector('.dashboard__subtitle')?.textContent).toContain(
      'Real-Time Fleet Management Dashboard',
    );
  });

  it('renders the five planned placeholder sections', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.placeholder-card');

    expect(cards.length).toBe(5);
  });
});
