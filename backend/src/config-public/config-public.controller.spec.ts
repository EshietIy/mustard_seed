import { ConfigPublicController } from './config-public.controller';
import type { AppConfig } from '../config/env.validation';

function controller(simulator: boolean) {
  return new ConfigPublicController({
    PAYSTACK_SIMULATOR_ENABLED: simulator,
    GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
  } as AppConfig);
}

describe('ConfigPublicController', () => {
  it('reports simulated payments when the simulator is enabled', () => {
    expect(controller(true).get()).toEqual({
      paymentMode: 'simulated',
      googleClientId: 'id.apps.googleusercontent.com',
    });
  });

  it('reports live payments when the simulator is disabled', () => {
    expect(controller(false).get()).toMatchObject({ paymentMode: 'live' });
  });
});
