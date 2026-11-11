/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Agent } from './entities/agent.entity';
import { AgentRequest } from './entities/agent-request.entity';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { Session } from '../session/entities/session.entity';
import { HumanAuthModule } from '../human-auth/human-auth.module';
import { MessageModule } from '../message/message.module';
import { AgentMessageListener } from './agent-message-listener.service';
import { ExternalApiService } from './external-api.service';
import { AgentOperationsModule } from './agent-operations/agent-operations.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Agent, AgentRequest, Session], 'data'),
    HumanAuthModule,
    MessageModule,
    AgentOperationsModule,
  ],
  controllers: [AgentController],
  exports: [TypeOrmModule, AgentService],
  providers: [AgentService, AgentMessageListener, ExternalApiService],
})
export class AgentModule {}
