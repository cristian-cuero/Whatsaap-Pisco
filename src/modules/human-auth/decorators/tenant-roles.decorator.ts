import { SetMetadata } from '@nestjs/common';
import { TenantRole } from '../../tenant/entities/tenant-user.entity';

// Roles autorizados para una ruta protegida con HumanJwtGuard.
export const TENANT_ROLES_KEY = 'tenant_roles';

export const RequireTenantRoles = (...roles: TenantRole[]) =>
  SetMetadata(TENANT_ROLES_KEY, roles);
