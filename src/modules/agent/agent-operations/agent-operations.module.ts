import { Module } from '@nestjs/common';
import { AgentOperationsService } from './agent-operations.service';

@Module({
  providers: [AgentOperationsService],
  exports: [AgentOperationsService],
})
export class AgentOperationsModule {}
