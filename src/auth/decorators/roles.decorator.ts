import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/index';

export const ROLES_KEY = 'roles';

/**
 * A decorator for setting role-based access control metadata on route handlers.
 *
 * This function allows the specification of one or more roles that are required
 * to access a particular route. It utilizes the SetMetadata function to store
 * the roles under a predefined key (ROLES_KEY), which can then be used by guards
 * to enforce access control based on user roles.
 *
 * @param {...Role[]} roles - A variable number of role identifiers that define
 * the access permissions required for the decorated route.
 * @returns {MethodDecorator} A method decorator that applies the role metadata
 * to the target route handler.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
