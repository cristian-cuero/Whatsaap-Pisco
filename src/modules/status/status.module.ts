import { Module } from '@nestjs/common';
import { MessageModule } from '../message/message.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { StatusStoreModule } from '../status-store/status-store.module';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [MessageModule, StatusStoreModule, SessionModule],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
