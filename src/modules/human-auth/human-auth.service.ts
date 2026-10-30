/// encargado De Mnajear la Logic ade Creacion

import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { User } from '../user/entities/user.entity';
import { Tenant, TenantStatus } from '../tenant/entities/tenant.entity';
import {
  TenantUser,
  TenantRole,
} from '../tenant/entities/tenant-user.entity';

@Injectable()
export class HumanAuthService {
  constructor(
    @InjectDataSource('data')
    private readonly dataSource: DataSource,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // REGISTRO DEL PRIMER ADMINISTRADOR
  async register(dto: RegisterDto, bootstrapSecret: string) {
    const expectedSecret = this.configService.get<string>(
      'AUTH_BOOTSTRAP_SECRET',
    );

    // Verificamos que el secreto exista en el servidor.
    if (!expectedSecret) {
      throw new InternalServerErrorException(
        'El registro inicial no está configurado.',
      );
    }

    // Evitamos que cualquiera pueda crear el primer administrador.
    if (!bootstrapSecret || bootstrapSecret !== expectedSecret) {
      throw new UnauthorizedException('No autorizado para registrarse.');
    }

    const email = dto.email.trim().toLowerCase();

    // bcrypt trabaja con un máximo de 72 bytes.
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new ConflictException(
        'La contraseña supera el máximo permitido por el sistema.',
      );
    }

    // Hash de la contraseña: nunca guardamos la contraseña original.
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Creamos todo dentro de una transacción.
    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const tenantRepository = manager.getRepository(Tenant);
      const tenantUserRepository = manager.getRepository(TenantUser);

      // Solo permitimos crear el primer administrador.
      const totalUsers = await userRepository.count();

      if (totalUsers > 0) {
        throw new UnauthorizedException(
          'El registro inicial ya fue realizado.',
        );
      }

      // Comprobamos que el correo no exista.
      const existingUser = await userRepository.findOne({
        where: { email },
      });

      if (existingUser) {
        throw new ConflictException('Este correo ya está registrado.');
      }

      // Creamos el usuario.
      const user = userRepository.create({
        name: dto.name.trim(),
        email,
        passwordHash,
        isActive: true,
        lastLoginAt: null,
      });

      const savedUser = await userRepository.save(user);

      // Generamos un slug único para la empresa.
      const baseSlug =
        dto.companyName
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 80) || 'empresa';

      const slug = `${baseSlug}-${randomUUID().slice(0, 8)}`;

      // Creamos la empresa (tenant).
      const tenant = tenantRepository.create({
        name: dto.companyName.trim(),
        slug,
        status: TenantStatus.ACTIVE,
      });

      const savedTenant = await tenantRepository.save(tenant);

      // Relacionamos al usuario con su empresa como propietario.
      const membership = tenantUserRepository.create({
        userId: savedUser.id,
        tenantId: savedTenant.id,
        role: TenantRole.OWNER,
      });

      await tenantUserRepository.save(membership);

      // No devolvemos passwordHash.
      return {
        message: 'Administrador registrado correctamente.',
        user: {
          id: savedUser.id,
          name: savedUser.name,
          email: savedUser.email,
        },
        tenant: {
          id: savedTenant.id,
          name: savedTenant.name,
          slug: savedTenant.slug,
        },
        role: TenantRole.OWNER,
      };
    });
  }

  // INICIO DE SESIÓN
  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const userRepository = this.dataSource.getRepository(User);
    const tenantUserRepository = this.dataSource.getRepository(TenantUser);

    // Buscamos al usuario por su correo.
    const user = await userRepository.findOne({
      where: { email },
    });

    // Mensaje genérico para no revelar si el correo existe.
    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    // Comprobamos si la cuenta está habilitada.
    if (!user.isActive) {
      throw new UnauthorizedException('La cuenta está deshabilitada.');
    }

    // Comparamos la contraseña recibida con el hash almacenado.
    const passwordIsValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    // Buscamos las empresas a las que pertenece el usuario.
    const memberships = await tenantUserRepository.find({
      where: { userId: user.id },
      relations: { tenant: true },
    });

    // Por ahora seleccionamos la primera empresa activa.
    const membership = memberships.find(
      (item) => item.tenant?.status === TenantStatus.ACTIVE,
    );

    if (!membership) {
      throw new UnauthorizedException(
        'El usuario no tiene una empresa activa.',
      );
    }

    // Actualizamos la fecha del último inicio de sesión.
    user.lastLoginAt = new Date();
    await userRepository.save(user);

    // Generamos el JWT con la identidad y el contexto de empresa.
    const payload = {
      sub: user.id,
      tenantId: membership.tenantId,
      role: membership.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      message: 'Inicio de sesión exitoso.',
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
      },
      role: membership.role,
    };
  }
}
