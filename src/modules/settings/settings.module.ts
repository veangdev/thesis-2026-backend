import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SettingsRepository } from './settings.repository';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, SettingsRepository],
})
export class SettingsModule {}
