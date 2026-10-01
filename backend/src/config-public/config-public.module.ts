import { Module } from '@nestjs/common';
import { ConfigPublicController } from './config-public.controller';

@Module({ controllers: [ConfigPublicController] })
export class ConfigPublicModule {}
