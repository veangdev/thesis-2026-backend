/**
 * The catalogue of notification rules the program can toggle.
 *
 * This lives on the backend, not the frontend, because the backend is what acts
 * on a rule when it decides whether to send a mail. Keeping the labels here too
 * means the Settings screen renders whatever the API declares instead of
 * carrying its own copy that can drift from the rules actually enforced.
 *
 * Only the enabled/disabled *state* is stored (`NotificationRule`); `enabled`
 * below is the fallback used until a coordinator changes it, so adding a rule
 * needs no data migration.
 */
export interface NotificationRuleDefinition {
  key: string;
  label: string;
  description: string;
  /** Applied when no row exists for this key yet. */
  enabled: boolean;
}

export const NOTIFICATION_RULE_CATALOGUE: readonly NotificationRuleDefinition[] =
  [
    {
      key: 'assessment-open',
      label: 'Cycle opened',
      description: 'Notify self-assessors when a new assessment period starts.',
      enabled: true,
    },
    {
      key: 'submission',
      label: 'Self-assessment submitted',
      description: 'Notify the assigned facilitator immediately.',
      enabled: true,
    },
    {
      key: 'review-complete',
      label: 'Review completed',
      description: 'Notify the self-assessor when scores are agreed.',
      enabled: true,
    },
    {
      key: 'weekly-digest',
      label: 'Weekly completion digest',
      description: 'Email coordinators a completion summary every Monday.',
      enabled: false,
    },
  ];

export const NOTIFICATION_RULE_KEYS: readonly string[] =
  NOTIFICATION_RULE_CATALOGUE.map((rule) => rule.key);

export function isKnownRuleKey(key: string): boolean {
  return NOTIFICATION_RULE_KEYS.includes(key);
}
