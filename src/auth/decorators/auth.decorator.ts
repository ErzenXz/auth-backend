import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '../enums/index';
import { Roles } from './roles.decorator';
import { RolesGuard } from '../guards/roles.security.jwt';
import { AuthGuard } from '@nestjs/passport';

/**
 * A decorator for securing routes with authentication and role-based access control.
 *
 * This function applies the JWT authentication guard and, optionally, role-based
 * access control by utilizing the Roles decorator. If no roles are specified,
 * it only enforces JWT authentication. When roles are provided, both the JWT
 * guard and the RolesGuard are applied to ensure that the user has the necessary
 * permissions to access the route.
 *
 * @param {...Role[]} roles - An optional list of roles that the user must have
 * to access the decorated route. If no roles are provided, only JWT authentication
 * is enforced.
 * @returns {MethodDecorator} A method decorator that applies the necessary guards
 * for authentication and authorization.
 */
export function Auth(...roles: Role[]) {
  if (roles.length === 0) {
    return applyDecorators(UseGuards(AuthGuard('jwt')));
  }

  return applyDecorators(
    Roles(...roles),
    UseGuards(AuthGuard('jwt'), RolesGuard),
  );
}
