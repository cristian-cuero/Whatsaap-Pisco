// recibe las peticiones de la ruta /human-auth y las redirige al servicio correspondiente

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { Public } from '../auth/decorators/auth.decorators';

import { HumanAuthService } from './human-auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Get, UseGuards } from '@nestjs/common';
import { HumanJwtGuard } from './guards/human-jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type  { HumanJwtPayload } from './guards/human-jwt.guard';
import { CurrentTenant } from './decorators/current-tenant.decorator';
// esta es la ruta
@Controller('auth')
export class HumanAuthController {
  constructor(
    private readonly humanAuthService: HumanAuthService,
  ) {}

  // REGISTRO DEL PRIMER ADMINISTRADOR
  @Public()
  // es post y laque vamos usar para rehistrar
  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
    @Headers('x-bootstrap-secret') bootstrapSecret: string,
  ) {
    return this.humanAuthService.register(
      registerDto,
      bootstrapSecret,
    );
  }

  // INICIO DE SESIÓN
  // post para inicio de sesion 
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.humanAuthService.login(loginDto);
  }

  // Consultar los datos del usuario autenticado.
@Public()
@UseGuards(HumanJwtGuard)
@Get('me')
getProfile(@CurrentUser() user: HumanJwtPayload,
@CurrentTenant() tenatid : string) {
  return {
    message: 'Usuario autenticado correctamente.',
    user: {
      id: user.sub,
      tenatid,
      role: user.role,
    },
  };
}
}
