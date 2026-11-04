import { Module } from '@nestjs/common';
import { MessageModule } from '../message/message.module';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [MessageModule, SessionModule],
  controllers: [GroupController],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupModule {}
