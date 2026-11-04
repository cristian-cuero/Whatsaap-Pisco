import { Module } from '@nestjs/common';
import { MessageModule } from '../message/message.module';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { SessionModule } from '../session/session.module';
import { HumanAuthModule } from '../human-auth/human-auth.module';

@Module({
  imports: [MessageModule, SessionModule, HumanAuthModule],
  controllers: [GroupController],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupModule {}
