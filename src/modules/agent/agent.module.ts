import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Agent } from './entities/agent.entity';
import { AgentRequest } from './entities/agent-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Agent, AgentRequest], 'data')],
  exports: [TypeOrmModule],
})
export class AgentModule {}
