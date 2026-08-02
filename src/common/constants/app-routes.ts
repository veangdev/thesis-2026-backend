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
  /**
   * One self-assessor's detail panel, already open on `panel`. Staff have no
   * `/goals` or `/journey-star` of their own, so notifications aimed at a
   * facilitator have to deep-link here rather than at the student-only routes.
   */
  studentDetail: (id: string, panel?: 'journey' | 'goals'): string =>
    `/students?studentId=${id}${panel ? `&panel=${panel}` : ''}`,
} as const;
