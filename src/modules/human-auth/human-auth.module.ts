
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { HumanAuthController } from './human-aut.controller';
import { HumanAuthService } from './human-auth.service';

import { User } from '../user/entities/user.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { HumanJwtGuard } from './guards/human-jwt.guard';

@Module({
  imports: [
    // Conectamos las entidades con la conexión PostgreSQL "data".
    TypeOrmModule.forFeature(
      [User, Tenant, TenantUser],
      'data',
    ),

    // Configuramos JWT utilizando el secreto del archivo .env.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '1d',
        },
      }),
    }),
  ],

  // creando las depencidas con los contraladores Y Lo Servicios 
  controllers: [HumanAuthController],

  providers: [HumanAuthService, HumanJwtGuard],

  exports: [HumanAuthService, JwtModule, HumanJwtGuard],
})
export class HumanAuthModule {}
