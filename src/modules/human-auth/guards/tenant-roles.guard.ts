import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { TenantRole } from '../../tenant/entities/tenant-user.entity';
import type { HumanJwtPayload } from './human-jwt.guard';
import { TENANT_ROLES_KEY } from '../decorators/tenant-roles.decorator';

type AuthenticatedRequest = Request & {
  user?: HumanJwtPayload;
};

@Injectable()
export class TenantRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<TenantRole[]>(
      TENANT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Este guard debe usarse siempre junto con @RequireTenantRoles.
    if (!requiredRoles?.length) {
      throw new ForbiddenException('La ruta no tiene roles de empresa configurados.');
    }

    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción dentro de la empresa.',
      );
    }

    return true;
  }
}
