import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.token';
import type { AppConfig } from '../../config/env.validation';
import {
  SimulatorApiController,
  SimulatorCheckoutController,
  SimulatorControlController,
} from './simulator.controllers';
import { SimulatorService } from './simulator.service';
import { SIMULATOR_STORE, type SimulatorStore } from './simulator.store';
import { SupabaseSimulatorStore } from './supabase-simulator.store';

/**
 * The built-in Paystack Simulator. Only imported when PAYSTACK_SIMULATOR_ENABLED=true, which
 * the startup checks forbid in production. Its routes are not mounted otherwise.
 */
@Module({
  controllers: [SimulatorApiController, SimulatorCheckoutController, SimulatorControlController],
  providers: [
    { provide: SIMULATOR_STORE, useClass: SupabaseSimulatorStore },
    {
      provide: SimulatorService,
      useFactory: (store: SimulatorStore, config: AppConfig) => new SimulatorService(store, config),
      inject: [SIMULATOR_STORE, APP_CONFIG],
    },
  ],
})
export class PaystackSimulatorModule {}
