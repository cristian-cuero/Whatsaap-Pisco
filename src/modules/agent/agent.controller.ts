import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Public,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AgentService } from './agent.service';
import { UpdateAgentConfigurationDto, UpdateAgentMenuOptionDto } from './dto';
import { CurrentTenant } from '../human-auth/decorators/current-tenant.decorator';
import { RequireTenantRoles } from '../human-auth/decorators/tenant-roles.decorator';
import { HumanJwtGuard } from '../human-auth/guards/human-jwt.guard';
import { TenantRolesGuard } from '../human-auth/guards/tenant-roles.guard';
import { TenantRole } from '../tenant/entities/tenant-user.entity';
import { Agent } from './entities/agent.entity';

@ApiTags('agent')
@Controller('sessions/tenant/:sessionId/agent')
@Public()
@UseGuards(HumanJwtGuard, TenantRolesGuard)
@ApiParam({ name: 'sessionId', description: 'ID de la sesión de WhatsApp' })
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  @RequireTenantRoles(TenantRole.OWNER, TenantRole.ADMIN, TenantRole.AGENT)
  @ApiOperation({ summary: 'Consultar la configuración de Ruby para una sesión del tenant' })
  @ApiResponse({ status: 200, description: 'Configuración del agente' })
  async getConfiguration(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentTenant() tenantId: string,
  ): Promise<Agent> {
    return this.agentService.getConfiguration(sessionId, tenantId);
  }

  @Patch()
  @RequireTenantRoles(TenantRole.OWNER, TenantRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar la configuración general de Ruby' })
  @ApiResponse({ status: 200, description: 'Configuración actualizada' })
  async updateConfiguration(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateAgentConfigurationDto,
  ): Promise<Agent> {
    return this.agentService.updateConfiguration(sessionId, tenantId, dto);
  }

  @Patch('menu/options/:optionId')
  @RequireTenantRoles(TenantRole.OWNER, TenantRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar una opción individual del menú de Ruby' })
  @ApiParam({ name: 'optionId', description: 'Identificador interno de la opción' })
  @ApiResponse({ status: 200, description: 'Opción actualizada' })
  async updateMenuOption(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('optionId') optionId: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateAgentMenuOptionDto,
  ): Promise<Agent> {
    return this.agentService.updateMenuOption(sessionId, tenantId, optionId, dto);
  }
}
