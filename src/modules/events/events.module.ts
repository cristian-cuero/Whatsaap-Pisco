import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventsGateway } from './events.gateway';
import { AuthModule } from '../auth/auth.module';
import { HumanAuthModule } from '../human-auth/human-auth.module';
import { Session } from '../session/entities/session.entity';

@Global()
@Module({
  imports: [AuthModule, HumanAuthModule, TypeOrmModule.forFeature([Session], 'data')],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
