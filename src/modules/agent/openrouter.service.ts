import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface RubyMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface RubyTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenRouterResponse {
  choices: Array<{
    message: RubyMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

@Injectable()
export class OpenRouterService {
  // eslint-disable-next-line no-restricted-syntax
  private readonly logger = new Logger(OpenRouterService.name);

  /**
   * Envía la conversación de Ruby a OpenRouter.
   * Las herramientas se enviarán en una siguiente etapa.
   */
  async chat(model: string | null, messages: RubyMessage[], tools?: RubyTool[]): Promise<OpenRouterResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const selectedModel = model || process.env.OPENROUTER_MODEL;

    if (!apiKey) {
      throw new ServiceUnavailableException('Falta configurar OPENROUTER_API_KEY');
    }

    if (!selectedModel) {
      throw new ServiceUnavailableException('No hay un modelo configurado para Ruby');
    }

    const payload: Record<string, unknown> = {
      model: selectedModel,
      messages,
      temperature: 0.3,
    };

    if (tools?.length) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Ruby IA - OpenWA',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        this.logger.error(`OpenRouter respondió HTTP ${response.status}: ${errorBody.slice(0, 500)}`);

        throw new Error(`No fue posible obtener respuesta de OpenRouter (${response.status})`);
      }

      const result = (await response.json()) as OpenRouterResponse;

      if (!result.choices?.length) {
        throw new Error('OpenRouter no devolvió una respuesta válida');
      }

      return result;
    } catch (error) {
      this.logger.error('Error al comunicarse con OpenRouter', error instanceof Error ? error.message : String(error));

      throw error;
    }
  }
}
