import { Injectable } from '@nestjs/common';
import { SettingsRepository } from './settings.repository';
import { NotificationRule } from '../../../generated/prisma/client';

@Injectable()
export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  /**
   * Returns every stored notification rule. Rules that have never been toggled
   * simply aren't present — the client falls back to its built-in defaults.
   */
  getNotificationRules(): Promise<NotificationRule[]> {
    return this.settingsRepository.findNotificationRules();
  }

  setNotificationRule(
    key: string,
    enabled: boolean,
  ): Promise<NotificationRule> {
    return this.settingsRepository.upsertNotificationRule(key, enabled);
  }
}
