/**
 * Root-relative frontend paths the API links to from notifications.
 *
 * A mirror of the client's `src/constants/routes.ts`, limited to the
 * destinations something on this side actually links to. Kept here rather than
 * inline at each producer so a route rename is one edit, and so it is obvious
 * that these strings are a cross-repo contract.
 */
export const APP_ROUTES = {
  assessments: '/assessments',
  assessmentDetail: (id: string): string => `/assessments/${id}`,
  coaching: '/coaching',
  goals: '/goals',
  journeyStar: '/journey-star',
} as const;
