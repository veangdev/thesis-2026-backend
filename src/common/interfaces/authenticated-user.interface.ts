import { Role } from '../enums';

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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
