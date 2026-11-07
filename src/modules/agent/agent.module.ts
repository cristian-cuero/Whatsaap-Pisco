import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Agent } from './entities/agent.entity';
import { AgentRequest } from './entities/agent-request.entity';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { Session } from '../session/entities/session.entity';
import { HumanAuthModule } from '../human-auth/human-auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Agent, AgentRequest, Session], 'data'),
    HumanAuthModule,
  ],
  controllers: [AgentController],
  exports: [TypeOrmModule, AgentService],
  providers: [AgentService],
})
export class AgentModule {}
