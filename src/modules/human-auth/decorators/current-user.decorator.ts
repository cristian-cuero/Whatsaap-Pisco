// es como el midleware
import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';
import { HumanJwtPayload } from '../guards/human-jwt.guard';

type AuthenticatedRequest = Request & {
  user?: HumanJwtPayload;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): HumanJwtPayload | undefined => {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
