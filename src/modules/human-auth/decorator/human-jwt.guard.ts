// Es El JWT  por Asi Decirlo 
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { TenantRole } from '../../tenant/entities/tenant-user.entity';

// Información que esperamos encontrar dentro del JWT.
export interface HumanJwtPayload {
  sub: string;
  tenantId: string;
  role: TenantRole;
}

type AuthenticatedRequest = Request & {
  user?: HumanJwtPayload;
};

@Injectable()
export class HumanJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Extraemos el token del encabezado Authorization.
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
      throw new UnauthorizedException(
        'Debes enviar un token Bearer válido.',
      );
    }

    try {
      // Verificamos firma y expiración del JWT.
      const payload =
        await this.jwtService.verifyAsync<HumanJwtPayload>(match[1]);

      // Comprobamos que tenga los datos necesarios.
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.tenantId !== 'string' ||
        !Object.values(TenantRole).includes(payload.role)
      ) {
        throw new UnauthorizedException('El token no contiene datos válidos.');
      }

      // Guardamos los datos del usuario para usarlos en el controlador.
      request.user = payload;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        'El token es inválido o ha expirado.',
      );
    }
  }
}
