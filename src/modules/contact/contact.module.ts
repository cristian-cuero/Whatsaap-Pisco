import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { SessionModule } from '../session/session.module';
import { HumanAuthModule } from '../human-auth/human-auth.module';

@Module({
  imports: [SessionModule, HumanAuthModule],
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService],
})
export class ContactModule {}
