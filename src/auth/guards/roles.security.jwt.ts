import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/index';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard for enforcing role-based access control in route handlers.
 *
 * This class implements the CanActivate interface to determine whether a user has
 * the required roles to access a specific route. It retrieves the required roles
 * from the route metadata using the Reflector and checks if the authenticated user
 * possesses any of the required roles. If no roles are specified, access is granted.
 *
 * @param {Reflector} reflector - The Reflector instance used to access metadata
 * associated with route handlers and classes.
 * @returns {boolean} Returns true if the user has the required role(s) or if no roles are specified;
 * otherwise, returns false.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      return false;
    }

    return requiredRoles.some((role) => role === user.role);
  }
}
