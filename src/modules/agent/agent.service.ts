import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Agent } from './entities/agent.entity';
import { Session } from '../session/entities/session.entity';

const DEFAULT_SYSTEM_PROMPT = `FORMATO DE RESPUESTAS:

Cuando presentes información de contratos, pagos, beneficiarios o consultas, utiliza exclusivamente el formato Campo: Valor.

Ejemplo correcto:

Contrato: IP000327
Plan: SUPERIOR EMP
Estado: ACTIVO
Cuota mensual: $12.600

REGLAS DE FORMATO:
- Una línea por cada campo.
- No utilices tablas Markdown.
- No utilices columnas, encabezados de tablas ni separadores.
- No agrupes varios datos en un párrafo.
- Conserva los nombres de los campos claros.
- Si existen varios registros, separa cada registro visualmente.
- Nunca inventes valores.

INTERPRETACIÓN DEL CONTEXTO:

- Interpreta cada mensaje del cliente teniendo en cuenta la pregunta que Ruby hizo inmediatamente antes.
- Si Ruby está solicitando una cantidad, un número, una cédula, una fecha o cualquier otro dato, interpreta la respuesta como el dato solicitado.
- No interpretes automáticamente los números como opciones del menú.
- Los números del menú solamente representan opciones cuando Ruby está mostrando el menú y espera que el cliente seleccione una opción.
- Si estás dentro de una operación, continúa esa operación y no regreses al menú sin motivo.
- Si el cliente responde con un dato válido, úsalo para continuar el proceso.
- Si el dato está fuera del rango permitido, explica el error y vuelve a solicitar el dato.
- No vuelvas a preguntar información que el cliente ya proporcionó y que sigue siendo válida.

EJEMPLO DE CONVERSACIÓN:

Ruby: ¿Cuántas cuotas deseas pagar? Puedes elegir entre 1 y 12.

Cliente: 4

Comportamiento correcto:
Ruby debe interpretar 4 como la cantidad de cuotas, calcular el total utilizando el valor de la cuota mensual y continuar con el proceso de confirmación del pago.

Comportamiento incorrecto:
Volver a mostrar el menú, interpretar 4 como una opción del menú o solicitar nuevamente la cantidad de cuotas.
`;
const DEFAULT_AGENT_CONFIG = {
  autoReply: {
    enabled: true,
    replyToGroups: false,
    ignoreFromMe: true,
    cooldownSeconds: 30,
  },

  behavior: {
    language: 'es',
    tone: 'amigable',
    maxResponseLength: 500,
  },

  menu: {
    enabled: true,
    showOnFirstMessage: true,
    showAfterInactivity: true,
    inactivityMinutes: 30,

    welcomeMessage: '¡Hola! 👋 Soy Ruby, tu asistente virtual. ¿Qué trámite deseas realizar?',

    options: [
      {
        id: 'consultar_contrato',
        number: 1,
        label: 'Consultar contrato',
        action: 'consultar_contrato',
        enabled: true,
      },
      {
        id: 'pagar_contrato',
        number: 2,
        label: 'Pagar contrato',
        action: 'pagar_contrato',
        enabled: true,
      },
      {
        id: 'consultar_beneficiarios',
        number: 3,
        label: 'Consultar beneficiarios',
        action: 'consultar_beneficiarios',
        enabled: true,
      },
      {
        id: 'hablar_asesor',
        number: 4,
        label: 'Hablar con un asesor',
        action: 'transferir_asesor',
        enabled: true,
      },
    ],
  },
};

export interface UpdateAgentConfiguration {
  name?: string;
  enabled?: boolean;
  systemPrompt?: string | null;
  config?: Record<string, unknown>;
  provider?: 'groq' | 'openrouter';
}

//Si modificamos únicamente menu.enabled, la función conserva el resto de las propiedades del menú y de la configuración.
type AgentConfigObject = Record<string, unknown>;

function asConfigObject(value: unknown): AgentConfigObject {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as AgentConfigObject;
  }

  return {};
}

function mergeAgentConfig(current: AgentConfigObject, changes: AgentConfigObject): AgentConfigObject {
  const merged = {
    ...current,
    ...changes,
  };

  // Conservamos las propiedades internas de cada sección.
  for (const section of ['autoReply', 'behavior', 'menu']) {
    if (changes[section] !== undefined) {
      merged[section] = {
        ...asConfigObject(current[section]),
        ...asConfigObject(changes[section]),
      };
    }
  }

  return merged;
}

@Injectable()
export class AgentService {
  constructor(
    @InjectRepository(Agent, 'data')
    private readonly agentRepository: Repository<Agent>,

    @InjectRepository(Session, 'data')
    private readonly sessionRepository: Repository<Session>,
  ) {}

  /**
   * Verifica que la sesión pertenezca al tenant.
   */
  private async validateSessionOwnership(sessionId: string, tenantId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,
        tenantId,
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }
  }

  /**
   * Obtiene el agente de una sesión.
   * Si no existe, crea uno con configuración predeterminada.
   */
  async getOrCreateForSession(sessionId: string, tenantId: string): Promise<Agent> {
    await this.validateSessionOwnership(sessionId, tenantId);

    const existingAgent = await this.agentRepository.findOne({
      where: { sessionId },
    });

    if (existingAgent) {
      return existingAgent;
    }

    const agent = this.agentRepository.create({
      sessionId,
      name: 'Ruby IA',
      enabled: true,
      provider: 'groq',
      model: null,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      config: DEFAULT_AGENT_CONFIG,
    });

    return this.agentRepository.save(agent);
  }

  /**
   * Consulta la configuración del agente.
   */
  async getConfiguration(sessionId: string, tenantId: string): Promise<Agent> {
    return this.getOrCreateForSession(sessionId, tenantId);
  }

  /**
   * Actualiza la configuración del agente. Reciviendi Todo
   */
  async updateConfiguration(sessionId: string, tenantId: string, changes: UpdateAgentConfiguration): Promise<Agent> {
    const agent = await this.getOrCreateForSession(sessionId, tenantId);

    if (changes.name !== undefined) {
      agent.name = changes.name;
    }

    if (changes.enabled !== undefined) {
      agent.enabled = changes.enabled;
    }

    if (changes.systemPrompt !== undefined) {
      agent.systemPrompt = changes.systemPrompt;
    }

    if (changes.config !== undefined) {
      agent.config = mergeAgentConfig(agent.config ?? {}, changes.config);
    }

    if (changes.provider !== undefined) {
      agent.provider = changes.provider;
    }

    return this.agentRepository.save(agent);
  }

  // actualiza una opción del menú del agente, conservando el resto de la configuración.
  async updateMenuOption(
    sessionId: string,
    tenantId: string,
    optionId: string,
    changes: {
      label?: string;
      enabled?: boolean;
      number?: number;
    },
  ): Promise<Agent> {
    const agent = await this.getOrCreateForSession(sessionId, tenantId);

    const config = asConfigObject(agent.config);
    const menu = asConfigObject(config.menu);

    const options = Array.isArray(menu.options) ? menu.options : [];

    const optionIndex = options.findIndex(option => asConfigObject(option).id === optionId);

    if (optionIndex === -1) {
      throw new NotFoundException('Opción del menú no encontrada');
    }

    if (changes.number !== undefined) {
      if (!Number.isInteger(changes.number) || changes.number < 1) {
        throw new BadRequestException('El número de la opción debe ser un entero positivo');
      }

      const numberAlreadyUsed = options.some(
        (option, index) => index !== optionIndex && asConfigObject(option).number === changes.number,
      );

      if (numberAlreadyUsed) {
        throw new BadRequestException('Ese número ya está asignado a otra opción');
      }
    }

    const updatedOptions = [...options];

    updatedOptions[optionIndex] = {
      ...asConfigObject(updatedOptions[optionIndex]),
      ...changes,
    };

    agent.config = {
      ...config,
      menu: {
        ...menu,
        options: updatedOptions,
      },
    };

    return this.agentRepository.save(agent);
  }
}
