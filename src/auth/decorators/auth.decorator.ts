import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '../enums/index';
import { Roles } from './roles.decorator';
import { RolesGuard } from '../guards/roles.security.jwt';
import { AuthGuard } from '@nestjs/passport';

export function Auth(...roles: Role[]) {
  if (roles.length === 0) {
    return applyDecorators(UseGuards(AuthGuard('jwt')));
  }

  return applyDecorators(
    Roles(...roles),
    UseGuards(AuthGuard('jwt'), RolesGuard),
  );
}
