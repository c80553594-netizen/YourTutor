import {
  type ReverseEngineeringAnalysis,
  ReverseEngineeringAnalysisSchema,
} from '../domain/types.js';
import { generalExamPromptPack } from '../packs/general-exam/index.js';
import { type PromptPack } from '../packs/types.js';
import {
  type ChatMessage,
  type MessageContentPart,
  ProviderError,
  type TokenUsage,
  type TutorProvider,
} from '../providers/types.js';

export interface ReverseEngineerImageInput {
  mimeType: string;
  dataBase64?: string;
  url?: string;
}

export interface ReverseEngineerInput {
  examText: string;
  examType?: string;
  images?: ReverseEngineerImageInput[];
  provider: TutorProvider;
  model?: string;
  pack?: PromptPack;
  signal?: AbortSignal;
  maxRepairAttempts?: number;
}

export interface ReverseEngineerOutput {
  analysis: ReverseEngineeringAnalysis;
  attempts: number;
  usage?: TokenUsage;
}

/**
 * Stage 1 Service: Reverse-engineers raw exam items (text and/or photos) into
 * structured 4-dimensional pedagogical analysis:
 * 1) Weighted knowledge points
 * 2) Prerequisite dependency tree (foundation -> core -> synthesis)
 * 3) Exam traps & hidden conditions
 * 4) Exam-grader scoring rubric
 */
export class ReverseEngineerService {
  private readonly defaultPack: PromptPack;

  constructor(defaultPack: PromptPack = generalExamPromptPack) {
    this.defaultPack = defaultPack;
  }

  async analyze(input: ReverseEngineerInput): Promise<ReverseEngineerOutput> {
    const trimmedText = input.examText.trim();
    const hasImages = Boolean(input.images && input.images.length > 0);

    if (!trimmedText && !hasImages) {
      throw new ProviderError({
        code: 'INVALID_RESPONSE',
        message: 'Either examText or at least one exam image must be provided.',
      });
    }

    if (hasImages && !input.provider.capabilities.supportsVision) {
      throw new ProviderError({
        code: 'UNSUPPORTED_CAPABILITY',
        message: `Provider '${input.provider.name}' does not support vision inputs. Switch to a vision-capable API or Companion Bridge.`,
      });
    }

    const pack = input.pack ?? this.defaultPack;
    const { systemPrompt, userPrompt } = pack.buildReverseEngineerPrompt({
      examText: trimmedText || '（请完整识别图片中的考题内容并进行 4 维考点反推）',
      examType: input.examType,
      hasImages,
    });

    const userContent: string | MessageContentPart[] = hasImages
      ? [
          { type: 'text', text: userPrompt },
          ...(input.images ?? []).map((img): MessageContentPart => ({
            type: 'image',
            mimeType: img.mimeType,
            dataBase64: img.dataBase64,
            url: img.url,
          })),
        ]
      : userPrompt;

    const messages: ChatMessage[] = [{ role: 'user', content: userContent }];

    const result = await input.provider.generateStructured({
      systemPrompt,
      messages,
      model: input.model,
      schema: ReverseEngineeringAnalysisSchema,
      schemaName: 'ReverseEngineeringAnalysis',
      schemaDescription:
        '4-dimensional exam reverse-engineering result with knowledgePoints, prerequisiteChain, examTraps, and scoringRubric',
      signal: input.signal,
      maxRepairAttempts: input.maxRepairAttempts ?? 2,
    });

    // Normalize prerequisite dependency references to prevent dangling IDs
    const validIds = new Set(result.data.prerequisiteChain.map((node) => node.id));
    const normalizedAnalysis: ReverseEngineeringAnalysis = {
      ...result.data,
      prerequisiteChain: result.data.prerequisiteChain.map((node) => ({
        ...node,
        dependsOn: node.dependsOn.filter((depId) => depId !== node.id && validIds.has(depId)),
      })),
    };

    return {
      analysis: normalizedAnalysis,
      attempts: result.attempts,
      usage: result.usage,
    };
  }
}
