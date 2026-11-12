import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { HookManager } from '../../core/hooks';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { MessageService } from '../message/message.service';
import { Agent } from './entities/agent.entity';
import { OpenRouterService, RubyMessage, RubyTool } from './openrouter.service';
import { AgentOperationsService, AgentOperation } from './agent-operations/agent-operations.service';
import { ExternalApiService } from './external-api.service';
import { GroqProviderService } from './groq-provider.service';

interface AgentMenuOption {
  id?: string;
  number?: number;
  label?: string;
  action?: string;
  enabled?: boolean;
}

interface AgentRuntimeConfig {
  enabledOperations?: string[];
  autoReply?: {
    enabled?: boolean;
    replyToGroups?: boolean;
    ignoreFromMe?: boolean;
  };
  behavior?: {
    language?: string;
    tone?: string;
    maxResponseLength?: number;
  };
  menu?: {
    enabled?: boolean;
    options?: AgentMenuOption[];
  };
}

@Injectable()
export class AgentMessageListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentMessageListener.name);
  private hookId?: string;
  private readonly chatQueues = new Map<string, Promise<void>>();

  // Máximo de rondas para evitar ciclos de llamadas a herramientas.
  private readonly maxToolRounds = 3;

  constructor(
    private readonly hooks: HookManager,
    private readonly messages: MessageService,
    private readonly openRouter: OpenRouterService,
    private readonly groq: GroqProviderService,
    private readonly operations: AgentOperationsService,
    private readonly externalApi: ExternalApiService,

    @InjectRepository(Agent, 'data')
    private readonly agents: Repository<Agent>,
  ) {}

  onModuleInit(): void {
    this.hookId = this.hooks.register(
      'ruby-agent',
      'message:received',
      async ctx => {
        const message = ctx.data as IncomingMessage;
        await this.enqueueMessage(ctx.sessionId, message);
        return { continue: true, data: ctx.data };
      },
      50,
    );

    this.logger.log('Listener de Ruby registrado correctamente');
  }

  onModuleDestroy(): void {
    if (this.hookId) {
      this.hooks.unregister(this.hookId);
    }
  }

  private async enqueueMessage(sessionId: string | undefined, message: IncomingMessage): Promise<void> {
    if (!sessionId || !message?.chatId) return;

    const queueId = `${sessionId}:${message.chatId}`;
    const previous = this.chatQueues.get(queueId) ?? Promise.resolve();

    const current = previous
      .catch(() => undefined)
      .then(() => this.handleIncomingMessage(sessionId, message))
      .catch(error => {
        this.logger.error(
          'No fue posible procesar el mensaje de Ruby',
          error instanceof Error ? error.message : String(error),
        );
      });

    this.chatQueues.set(queueId, current);

    void current.then(() => {
      if (this.chatQueues.get(queueId) === current) {
        this.chatQueues.delete(queueId);
      }
    });

    await current;
  }

  private async handleIncomingMessage(sessionId: string, message: IncomingMessage): Promise<void> {
    if (message.fromMe || message.isGroup || message.isStatusBroadcast) return;
    if (message.type !== 'text' || !message.body?.trim()) return;

    const agent = await this.agents.findOne({ where: { sessionId } });
    if (!agent?.enabled) return;

    const config = (agent.config ?? {}) as AgentRuntimeConfig;

    if (config.autoReply?.enabled === false) return;

    if (!['openrouter', 'groq'].includes(agent.provider)) {
      this.logger.warn(`Proveedor no soportado: ${agent.provider}`);
      return;
    }

    const history = await this.messages.getMessages(sessionId, {
      chatId: message.chatId,
      limit: 8,
      inlineMedia: false,
    });

    const orderedHistory = [...history.messages].reverse();

    const conversation: RubyMessage[] = orderedHistory
      .filter(item => item.type === 'text' && item.body?.trim())
      .map(item => ({
        role: item.direction === 'outgoing' ? 'assistant' : 'user',
        content: item.body!,
      }));

    const currentMessageStored = history.messages.some(item => item.waMessageId === message.id);

    if (!currentMessageStored) {
      conversation.push({
        role: 'user',
        content: message.body.trim(),
      });
    }

    const allowedOperations = this.getAllowedOperations(config);
    const tools = this.buildTools(allowedOperations);

    const messages: RubyMessage[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(agent, config, allowedOperations),
      },
      ...conversation,
    ];

    this.logger.log(`Ruby procesando conversación de sesión ${sessionId}`);

    const answer = await this.runAgent(messages, tools, allowedOperations, agent.provider, agent.model);

    if (!answer?.trim()) {
      this.logger.warn('Ruby no obtuvo una respuesta final de texto');
      return;
    }

    await this.messages.sendText(sessionId, {
      chatId: message.chatId,
      text: answer.trim(),
    });

    this.logger.log('Ruby respondió correctamente');
  }

  /**
   * Determina qué operaciones puede utilizar este agente.
   *
   * Si enabledOperations existe en la configuración, tiene prioridad.
   * Para agentes anteriores que aún no tienen esa propiedad,
   * se toman las acciones de las opciones habilitadas del menú.
   */
  private getAllowedOperations(config: AgentRuntimeConfig): AgentOperation[] {
    const configuredIds = Array.isArray(config.enabledOperations)
      ? config.enabledOperations
      : (config.menu?.options ?? [])
          .filter(option => option.enabled !== false)
          .map(option => option.action ?? option.id)
          .filter((id): id is string => Boolean(id));

    const uniqueIds = [...new Set(configuredIds)];

    return uniqueIds
      .map(id => {
        try {
          return this.operations.getEnabledById(id);
        } catch {
          this.logger.warn(`Operación no disponible o deshabilitada: ${id}`);
          return null;
        }
      })
      .filter((operation): operation is AgentOperation => operation !== null);
  }

  /**
   * Convierte las operaciones permitidas al formato de herramientas
   * que entiende OpenRouter.
   */
  private buildTools(operations: AgentOperation[]): RubyTool[] {
    return operations
      .filter(operation => operation.method === 'GET' || operation.method === 'POST')
      .map(operation => {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const [name, parameter] of Object.entries(operation.parameters ?? {})) {
          properties[name] = {
            type: parameter.type === 'number' ? 'number' : 'string',
            description: `Parámetro requerido para ${operation.name}`,
          };

          if (parameter.required) required.push(name);
        }

        return {
          type: 'function',
          function: {
            name: operation.id,
            description: operation.description ?? operation.name,
            parameters: {
              type: 'object',
              properties,
              required,
              additionalProperties: false,
            },
          },
        };
      });
  }

  /**
   * Ejecuta el ciclo IA -> herramienta -> IA.
   */
  private async runAgent(
    messages: RubyMessage[],
    tools: RubyTool[],
    allowedOperations: AgentOperation[],
    provider: string,
    model: string | null,
  ): Promise<string | null> {
    for (let round = 0; round < this.maxToolRounds; round++) {
      const response =
        provider === 'groq'
          ? await this.groq.chat(model, messages, tools.length ? tools : undefined)
          : await this.openRouter.chat(model, messages, tools.length ? tools : undefined);

      const assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) return null;

      // Guardamos la respuesta completa porque puede contener tool_calls.
      messages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls ?? [];

      // Si no hay herramientas pendientes, esta es la respuesta para WhatsApp.
      if (toolCalls.length === 0) {
        return typeof assistantMessage.content === 'string' ? assistantMessage.content : null;
      }

      for (const toolCall of toolCalls) {
        const operation = allowedOperations.find(item => item.id === toolCall.function.name);

        if (!operation) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              error: 'La operación solicitada no está permitida.',
            }),
          });
          continue;
        }

        try {
          const params = this.validateToolArguments(operation, toolCall.function.arguments);

          const result = await this.executeOperation(operation, params);

          // El resultado vuelve a la IA; Ruby redactará la respuesta.
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: true,
              data: result,
            }),
          });
        } catch (error) {
          this.logger.error(
            `Falló la operación ${operation.id}`,
            error instanceof Error ? error.message : String(error),
          );

          // No exponemos detalles internos ni credenciales al modelo.
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              error: 'No fue posible completar la consulta. Puedes pedir al cliente que intente nuevamente.',
            }),
          });
        }
      }
    }

    this.logger.warn('Ruby alcanzó el límite de rondas de herramientas');
    return 'Estoy teniendo dificultades para completar la solicitud. ¿Podrías intentarlo nuevamente?';
  }

  /**
   * Valida los argumentos devueltos por el modelo contra el catálogo.
   */
  private validateToolArguments(operation: AgentOperation, rawArguments: string): Record<string, string> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawArguments);
    } catch {
      throw new Error('Los argumentos de la operación no son JSON válido');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Los argumentos deben ser un objeto');
    }

    const input = parsed as Record<string, unknown>;
    const allowedNames = Object.keys(operation.parameters ?? {});

    // No aceptamos parámetros que no estén declarados en el catálogo.
    for (const name of Object.keys(input)) {
      if (!allowedNames.includes(name)) {
        throw new Error(`Parámetro no permitido: ${name}`);
      }
    }

    const params: Record<string, string> = {};

    for (const [name, definition] of Object.entries(operation.parameters ?? {})) {
      const value = input[name];

      if (value === undefined || value === null || value === '') {
        if (definition.required) {
          throw new Error(`Falta el parámetro requerido: ${name}`);
        }
        continue;
      }

      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error(`Tipo de parámetro inválido: ${name}`);
      }

      params[name] = String(value).trim();
    }

    return params;
  }

  private buildSystemPrompt(agent: Agent, config: AgentRuntimeConfig, allowedOperations: AgentOperation[]): string {
    const basePrompt = agent.systemPrompt?.trim() || 'Eres Ruby, una asistente virtual amable y profesional.';

    const behavior = config.behavior ?? {};

    const context: string[] = [
      '',
      'CONFIGURACIÓN ACTUAL DEL AGENTE:',
      `Nombre: ${agent.name}`,
      `Idioma: ${behavior.language ?? 'es'}`,
      `Tono: ${behavior.tone ?? 'amigable'}`,
      `Longitud máxima orientativa: ${behavior.maxResponseLength ?? 500} caracteres.`,
    ];

    if (config.menu?.enabled !== false) {
      const options = (config.menu?.options ?? [])
        .filter(option => option.enabled !== false)
        .map(option => `${option.number}. ${option.label}`);

      if (options.length) {
        context.push(
          '',
          'OPCIONES CONFIGURADAS:',
          ...options,
          'Interpreta solicitudes expresadas por número o por nombre.',
        );
      }
    }

    context.push(
      '',
      'HERRAMIENTAS DISPONIBLES:',
      ...(allowedOperations.length
        ? allowedOperations.map(operation => `- ${operation.id}: ${operation.description ?? operation.name}`)
        : ['No tienes operaciones habilitadas en este momento.']),
      '',
      'REGLAS PARA UTILIZAR HERRAMIENTAS:',
      '- Decide cuándo una solicitud requiere una operación disponible.',
      '- Si faltan datos obligatorios, solicítalos naturalmente antes de llamar la herramienta.',
      '- No inventes datos ni completes identificaciones por tu cuenta.',
      '- Utiliza exclusivamente las herramientas que recibes.',
      '- No afirmes que una consulta fue realizada hasta recibir un resultado exitoso.',
      '- Si una herramienta falla, informa al cliente con claridad y ofrece reintentar.',
      '- Después de recibir el resultado, explícalo de forma breve y comprensible.',
      '- No muestres argumentos técnicos, rutas, tokens ni detalles internos.',
      '- No solicites datos personales que no sean necesarios para la operación.',
      '- Para pagar_contrato, solicita la cédula, el identificador exacto del contrato y la cantidad de cuotas si no están disponibles en la conversación. La cantidad debe estar entre 1 y 12.',
      '- Nunca inventes contratos, cuotas mensuales ni valores de pago.',
      '- Si el cliente solicita un contrato que no le pertenece, informa que no es posible realizar la operación.',
      '- Si el usuario quiere pagar y proporciona la cédula, debe consultar primero los contratos asociados a esa cédula antes de ejecutar pagar_contrato ',
      '- y el agente debe mostrar los contratos devueltos por la API, sin inventar información. Solo cuando el usuario elija el contrato y las cuotas debe ejecutar pagar_contrato. ',
      'si hay mas de dos contratos  devuelttos por la api y va a pagar_contrato, el agente se los muestra que elija uno de ellos y luego preguntar las cuotas ',
      '- No debe pedir el identificador del contrato antes de consultar.',
      ' antes de ejecutar pagar_contrato, muestrale el valor de la cuota mensual y el valor total a pagar y que confirme si desea continuar con la operación ahi si ya puedes realizar pagar_contrato',
    );

    return `${basePrompt}\n${context.join('\n')}`;
  }

  /**
   * Ejecuta las operaciones del agente.
   * Para pagar_contrato, primero valida el contrato con Pisco
   * y calcula el valor en el servidor.
   */
  private async executeOperation(operation: AgentOperation, params: Record<string, string>): Promise<unknown> {
    // Las demás operaciones conservan su ejecución normal.
    if (operation.id !== 'pagar_contrato') {
      return this.externalApi.execute(
        {
          method: operation.method as 'GET' | 'POST',
          path: operation.path,
          auth: operation.auth === 'pisco' ? 'pisco' : undefined,
          query: operation.query,
        },
        params,
      );
    }

    const cedula = params.cedula?.trim();
    const contrato = params.contrato?.trim();
    const cuotas = Number(params.cuotas);

    if (!cedula || !contrato) {
      throw new Error('Falta la identificación o el contrato');
    }

    if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 12) {
      throw new Error('La cantidad de cuotas debe estar entre 1 y 12');
    }

    // Consultamos nuevamente los contratos directamente en Pisco.
    const consulta = this.operations.getEnabledById('consultar_contrato');

    const contratosResult = await this.externalApi.execute(
      {
        method: 'GET',
        path: consulta.path,
        auth: consulta.auth === 'pisco' ? 'pisco' : undefined,
        query: consulta.query,
      },
      { cedula },
    );

    const contratos = this.extractContracts(contratosResult);

    // El contrato debe aparecer en la respuesta de esta cédula.
    const contratoEncontrado = contratos.find(item => {
      const idContrato = this.getField(item, 'idcontrato');
      return String(idContrato ?? '').trim() === contrato;
    });

    if (!contratoEncontrado) {
      throw new Error('El contrato no pertenece a la identificación indicada');
    }

    // La cuota mensual siempre se obtiene de la respuesta de Pisco.
    const cuotaMensual = Number(this.getField(contratoEncontrado, 'cuota'));

    if (!Number.isFinite(cuotaMensual) || cuotaMensual <= 0) {
      throw new Error('No se pudo obtener una cuota mensual válida');
    }

    const valor = Math.round(cuotaMensual * cuotas);

    // Pisco recibe contrato y valor; nunca recibe cuotas.
    return this.externalApi.execute(
      {
        method: 'POST',
        path: operation.path,
        auth: operation.auth === 'pisco' ? 'pisco' : undefined,
      },
      {},
      {
        contrato,
        valor,
      },
    );
  }

  /**
   * Acepta la respuesta directa de Pisco o una respuesta
   * que contenga el arreglo dentro de data o contratos.
   */
  private extractContracts(result: unknown): Record<string, unknown>[] {
    if (Array.isArray(result)) {
      return result.filter(
        (item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item),
      );
    }

    if (result && typeof result === 'object') {
      const response = result as Record<string, unknown>;

      for (const key of ['data', 'contratos']) {
        if (Array.isArray(response[key])) {
          return (response[key] as unknown[]).filter(
            (item): item is Record<string, unknown> =>
              item !== null && typeof item === 'object' && !Array.isArray(item),
          );
        }
      }
    }

    throw new Error('Pisco no devolvió una lista válida de contratos');
  }

  /**
   * Obtiene un campo sin depender de si viene en mayúsculas
   * o minúsculas.
   */
  private getField(record: Record<string, unknown>, field: string): unknown {
    const entry = Object.entries(record).find(([key]) => key.toLowerCase() === field.toLowerCase());

    return entry?.[1];
  }
}
