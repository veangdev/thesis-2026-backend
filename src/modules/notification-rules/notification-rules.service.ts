import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationRulesRepository } from './notification-rules.repository';
import { NotificationRuleResponseDto } from './dto/notification-rule-response.dto';
import {
  NOTIFICATION_RULE_CATALOGUE,
  isKnownRuleKey,
} from './notification-rules.catalogue';

@Injectable()
export class NotificationRulesService {
  constructor(private readonly rulesRepository: NotificationRulesRepository) {}

  /**
   * The catalogue merged with stored state, always in catalogue order so the
   * Settings list doesn't reshuffle as rules are toggled.
   */
  async findAll(): Promise<NotificationRuleResponseDto[]> {
    const stored = await this.rulesRepository.findAll();
    const enabledByKey = new Map(
      stored.map((rule) => [rule.key, rule.enabled]),
    );
    return NOTIFICATION_RULE_CATALOGUE.map((rule) => ({
      key: rule.key,
      label: rule.label,
      description: rule.description,
      enabled: enabledByKey.get(rule.key) ?? rule.enabled,
    }));
  }

  async update(
    key: string,
    enabled: boolean,
  ): Promise<NotificationRuleResponseDto> {
    const definition = NOTIFICATION_RULE_CATALOGUE.find(
      (rule) => rule.key === key,
    );
    // Reject unknown keys rather than storing them: a typo would otherwise
    // create a row that no rule ever reads, and it would never surface.
    if (!definition) {
      throw new NotFoundException(`Notification rule ${key} not found`);
    }
    const saved = await this.rulesRepository.upsert(key, enabled);
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      enabled: saved.enabled,
    };
  }

  /**
   * Whether a rule is currently on — for the senders. Falls back to the
   * catalogue default when nobody has toggled it, and to `false` for an
   * unrecognised key so a stale caller cannot accidentally send mail.
   */
  async isEnabled(key: string): Promise<boolean> {
    if (!isKnownRuleKey(key)) return false;
    const stored = await this.rulesRepository.findByKey(key);
    if (stored) return stored.enabled;
    return (
      NOTIFICATION_RULE_CATALOGUE.find((rule) => rule.key === key)?.enabled ??
      false
    );
  }
}
