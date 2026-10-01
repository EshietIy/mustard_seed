import { ConfigPublicController } from './config-public.controller';
import type { AppConfig } from '../config/env.validation';

function controller(simulator: boolean) {
  return new ConfigPublicController({ PAYSTACK_SIMULATOR_ENABLED: simulator } as AppConfig);
}

describe('ConfigPublicController', () => {
  it('reports simulated payments when the simulator is enabled', () => {
    expect(controller(true).get()).toEqual({ paymentMode: 'simulated' });
  });

  it('reports live payments when the simulator is disabled', () => {
    expect(controller(false).get()).toEqual({ paymentMode: 'live' });
  });
});
