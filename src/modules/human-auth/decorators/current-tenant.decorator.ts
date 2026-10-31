
import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

import type { HumanJwtPayload } from '../guards/human-jwt.guard';

import type { Request } from 'express';

type AuthenticatedRequest = Request & {
  user?: HumanJwtPayload;
};

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user?.tenantId;
  },
);
