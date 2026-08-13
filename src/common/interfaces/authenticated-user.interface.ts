import { Gender, Role, StudentClass } from '../enums';

/**
 * The shape of the user object attached to a request after JWT authentication.
 * Never includes the password hash.
 */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  expertiseTags: string[];
  availability: string[];
  isActive: boolean;
  gender: Gender | null;
  studentClass: StudentClass | null;
  studentCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * The user's cohort, resolved from their membership (null if unenrolled).
   * Always present: `UsersService.sanitize` sets both on every path.
   */
  cohortId: string | null;
  cohortName: string | null;
  /**
   * The self-assessor's assigned facilitator, resolved from their active
   * `MentorAssignment` (null when unassigned, or for non-self-assessors).
   * Always present: `UsersService.sanitize` sets both on every path.
   */
  facilitatorId: string | null;
  facilitatorName: string | null;
}
