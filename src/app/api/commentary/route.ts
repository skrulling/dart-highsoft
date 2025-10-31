/**
 * Commentary API Route
 * Server-side endpoint for generating commentary using OpenAI GPT-5 nano
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildCommentaryPrompt, buildMatchRecapPrompt } from '@/lib/commentary/promptBuilder';
import { resolvePersona } from '@/lib/commentary/personas';
import type { CommentaryPayload, MatchRecapPayload } from '@/lib/commentary/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type CommentaryRequestBody = (CommentaryPayload | MatchRecapPayload) & {
  personaId?: string;
};

type ResponsesResult = Awaited<ReturnType<typeof openai.responses.create>>;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const rawBody = (await request.json()) as CommentaryRequestBody;
    const { personaId, ...payload } = rawBody;

    const persona = resolvePersona(personaId ?? process.env.COMMENTARY_PERSONA);

    // Determine if this is a match recap or regular turn commentary
    const isMatchRecap = 'type' in payload && payload.type === 'match_end';
    const build = isMatchRecap
      ? buildMatchRecapPrompt(payload as MatchRecapPayload, { persona })
      : buildCommentaryPrompt(payload as CommentaryPayload, { persona });

    if (build.plainLine) {
      return NextResponse.json({
        commentary: build.plainLine,
        usage: {
          note: 'plain-line',
          persona: persona.id,
          model: 'none',
          allowSlang: build.allowSlang,
          humorStyle: build.humorStyle,
        },
      });
    }

    if (!build.prompt) {
      throw new Error('Prompt generation failed');
    }

    const modelConfig = resolveModelConfig(process.env.COMMENTARY_MODEL);

    let commentary: string;
    let tokenUsage: unknown;

    if (modelConfig.kind === 'responses') {
      const completion = await openai.responses.create({
        model: modelConfig.modelId,
        input: [
          { role: 'system', content: persona.systemPrompt },
          { role: 'user', content: build.prompt },
        ],
        temperature: 0.8,
        max_output_tokens: 800,
      });

      const extracted = extractFromResponses(completion);
      if (!extracted) {
        throw new Error('No commentary generated from responses API');
      }
      commentary = extracted;
      tokenUsage = completion.usage;
    } else {
      const completion = await openai.chat.completions.create({
        model: modelConfig.modelId,
        messages: [
          { role: 'system', content: persona.systemPrompt },
          { role: 'user', content: build.prompt },
        ],
        temperature: 0.8,
        max_tokens: 120,
      });

      const message = completion.choices[0]?.message?.content?.trim();
      if (!message) {
        throw new Error('No commentary generated from chat completions');
      }
      commentary = message;
      tokenUsage = completion.usage;
    }

    return NextResponse.json({
      commentary,
      usage: {
        persona: persona.id,
        model: modelConfig.reportedName,
        allowSlang: build.allowSlang,
        humorStyle: build.humorStyle,
        tokens: tokenUsage,
      },
    });
  } catch (error) {
    console.error('Commentary generation failed:', error);

    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        {
          error: 'OpenAI API error',
          details: error.message,
        },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to generate commentary',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

type ModelConfig =
  | { kind: 'responses'; modelId: string; reportedName: string }
  | { kind: 'chat'; modelId: string; reportedName: string };

function resolveModelConfig(requested?: string | null): ModelConfig {
  const candidate = (requested && requested.trim()) || 'gpt-4.1-nano-2025-04-14';
  if (candidate === 'gpt-5-nano') {
    return {
      kind: 'responses',
      modelId: 'gpt-5-nano-2025-08-07',
      reportedName: candidate,
    };
  }

  return {
    kind: 'chat',
    modelId: candidate,
    reportedName: candidate,
  };
}

function extractFromResponses(completion: ResponsesResult): string | undefined {
  const completionAny = completion as unknown as { output_text?: string; output?: unknown };
  const primary = completionAny.output_text?.trim();
  if (primary) {
    return primary;
  }

  const output = (completionAny.output ?? []) as unknown;
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (!item || typeof item !== 'object' || !('content' in item)) {
      continue;
    }

    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue;
      }

      const type = 'type' in part ? (part as { type?: unknown }).type : null;
      const text = 'text' in part ? (part as { text?: unknown }).text : null;

      if (typeof text === 'string' && text.trim()) {
        return text.trim();
      }

      if (type === 'output_text' && typeof text === 'string') {
        return text.trim();
      }
    }
  }

  return undefined;
}
