import { NotificationType } from '../../common/enums';

/**
 * Coarse grouping the Notifications centre filters by.
 *
 * `NotificationType` stays finer-grained because mail templating keys off the
 * exact event; the client only ever needs these four buckets. The mapping lives
 * on the server so the two never drift: the client reads `category` off the
 * response instead of re-deriving it from `type`.
 */
export const NotificationCategory = {
  assessment: 'assessment',
  coaching: 'coaching',
  goal: 'goal',
  system: 'system',
} as const;

export type NotificationCategory =
  (typeof NotificationCategory)[keyof typeof NotificationCategory];

/** Every type maps to exactly one category. */
export const NOTIFICATION_CATEGORY_BY_TYPE: Record<
  NotificationType,
  NotificationCategory
> = {
  [NotificationType.assessment_reminder]: NotificationCategory.assessment,
  [NotificationType.submission]: NotificationCategory.assessment,
  [NotificationType.coaching_reminder]: NotificationCategory.coaching,
  [NotificationType.goal]: NotificationCategory.goal,
  [NotificationType.achievement]: NotificationCategory.system,
  [NotificationType.system]: NotificationCategory.system,
};

/**
 * The types a category covers — the inverse of the map above, derived rather
 * than hand-maintained so adding a `NotificationType` cannot leave the filter
 * silently narrower than the label suggests.
 */
export function typesForCategory(
  category: NotificationCategory,
): NotificationType[] {
  return (
    Object.keys(NOTIFICATION_CATEGORY_BY_TYPE) as NotificationType[]
  ).filter((type) => NOTIFICATION_CATEGORY_BY_TYPE[type] === category);
}
