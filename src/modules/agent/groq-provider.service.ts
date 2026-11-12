import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { OpenRouterResponse, RubyMessage, RubyTool } from './openrouter.service';

@Injectable()
export class GroqProviderService {
  private readonly logger = new Logger(GroqProviderService.name);

  async chat(model: string | null, messages: RubyMessage[], tools?: RubyTool[]): Promise<OpenRouterResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    const selectedModel = model || process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

    if (!apiKey) {
      throw new ServiceUnavailableException('Falta configurar GROQ_API_KEY');
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
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        this.logger.error(`Groq respondió HTTP ${response.status}: ${errorBody.slice(0, 500)}`);

        throw new Error(`No fue posible obtener respuesta de Groq (${response.status})`);
      }

      const result = (await response.json()) as OpenRouterResponse;

      if (!result.choices?.length) {
        throw new Error('Groq no devolvió una respuesta válida');
      }

      return result;
    } catch (error) {
      this.logger.error('Error al comunicarse con Groq', error instanceof Error ? error.message : String(error));

      throw error;
    }
  }
}
