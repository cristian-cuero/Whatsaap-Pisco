import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Agent } from './entities/agent.entity';
import { AgentRequest } from './entities/agent-request.entity';
import { AgentService } from './agent.service';
import { Session } from '../session/entities/session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Agent, AgentRequest, Session], 'data')],
  exports: [TypeOrmModule, AgentService],
  providers: [AgentService],
})
export class AgentModule {}
