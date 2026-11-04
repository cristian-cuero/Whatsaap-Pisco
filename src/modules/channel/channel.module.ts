import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { SessionModule } from '../session/session.module';
import { HumanAuthModule } from '../human-auth/human-auth.module';

@Module({
  imports: [SessionModule, HumanAuthModule],
  controllers: [ChannelController],
  providers: [ChannelService],
})
export class ChannelModule {}
