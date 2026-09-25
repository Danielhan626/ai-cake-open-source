import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { requiredString } from '../utils';
import { buildCakeImageEditPrompt, buildCakeImagePrompt } from './prompt-template';

export interface GenerateCakeInput {
  prompt: string;
  scenario?: string;
  style?: string;
  color?: string;
  size?: string;
  budget?: string;
}

export interface RefineCakeInput extends GenerateCakeInput {
  sourceImageUrl: string;
  refinement?: string;
}

export interface GeneratedCakeImage {
  provider: 'mock' | 'aliyun' | 'volcengine' | 'relay';
  prompt: string;
  promptVersion?: string;
  promptProfile?: string;
  imageUrl: string;
  raw?: unknown;
}

@Injectable()
export class AiService {
  private static readonly ALIYUN_MULTIMODAL_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

  async generateCake(input: GenerateCakeInput): Promise<GeneratedCakeImage> {
    const provider = (process.env.AI_PROVIDER || 'mock') as GeneratedCakeImage['provider'];

    if (provider === 'aliyun') {
      return this.generateWithAliyun(input);
    }

    if (provider === 'volcengine') {
      return this.generateWithVolcengine(input);
    }

    if (provider === 'relay') {
      return this.generateWithRelay(input);
    }

    return this.generateMock(input);
  }

  async refineCake(input: RefineCakeInput): Promise<GeneratedCakeImage> {
    const provider = (process.env.AI_PROVIDER || 'mock') as GeneratedCakeImage['provider'];

    if (provider === 'aliyun') {
      return this.refineWithAliyun(input);
    }

    return this.refineMock(input);
  }

  private async generateWithAliyun(input: GenerateCakeInput): Promise<GeneratedCakeImage> {
    const apiKey = process.env.ALIYUN_DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new BadGatewayException('ALIYUN_DASHSCOPE_API_KEY is required when AI_PROVIDER=aliyun');
    }

    const template = this.toPrompt(input);
    const prompt = template.prompt;
    const model = this.resolveAliyunTextImageModel();
    const raw = await this.requestAliyunImage({
      apiKey,
      model,
      content: [{ text: prompt }],
      negativePrompt: template.negativePrompt,
      size: process.env.ALIYUN_IMAGE_SIZE || '2048*2048',
      failureLabel: 'generation',
    });
    const imageUrl = this.extractAliyunImageUrl(raw);
    if (!imageUrl) {
      throw new BadGatewayException('Aliyun image generation did not return an image URL');
    }

    return {
      provider: 'aliyun',
      prompt,
      promptVersion: template.version,
      promptProfile: template.profile,
      imageUrl,
      raw,
    };
  }

  private async refineWithAliyun(input: RefineCakeInput): Promise<GeneratedCakeImage> {
    const apiKey = process.env.ALIYUN_DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new BadGatewayException('ALIYUN_DASHSCOPE_API_KEY is required when AI_PROVIDER=aliyun');
    }

    const sourceImageUrl = requiredString(input.sourceImageUrl);
    if (!sourceImageUrl) {
      throw new BadGatewayException('sourceImageUrl is required for Aliyun image refinement');
    }

    const template = buildCakeImageEditPrompt(input);
    const prompt = template.prompt;
    const raw = await this.requestAliyunImage({
      apiKey,
      model: this.resolveAliyunEditModel(),
      content: [{ image: sourceImageUrl }, { text: prompt }],
      negativePrompt: template.negativePrompt,
      size: process.env.ALIYUN_IMAGE_EDIT_SIZE || process.env.ALIYUN_IMAGE_SIZE || '1328*1328',
      failureLabel: 'refinement',
    });
    const imageUrl = this.extractAliyunImageUrl(raw);
    if (!imageUrl) {
      throw new BadGatewayException('Aliyun image refinement did not return an image URL');
    }

    return {
      provider: 'aliyun',
      prompt,
      promptVersion: template.version,
      promptProfile: template.profile,
      imageUrl,
      raw,
    };
  }

  private async requestAliyunImage(input: {
    apiKey: string;
    model: string;
    content: Array<{ image?: string; text?: string }>;
    negativePrompt: string;
    size?: string;
    failureLabel: string;
  }) {
    const baseUrl = (process.env.ALIYUN_DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}${AiService.ALIYUN_MULTIMODAL_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.buildAliyunImageRequestBody(input.model, input.content, input.negativePrompt, input.size)),
    });

    if (!response.ok) {
      throw new BadGatewayException(`Aliyun image ${input.failureLabel} failed: ${response.status} ${await response.text()}`);
    }

    return response.json() as Promise<unknown>;
  }

  private buildAliyunImageRequestBody(
    model: string,
    content: Array<{ image?: string; text?: string }>,
    negativePrompt: string,
    size?: string,
  ) {
    const resolvedContent = this.limitAliyunImages(content);

    const parameters: Record<string, string | boolean> = {
      prompt_extend: true,
      watermark: false,
      negative_prompt: negativePrompt,
    };

    if (size) {
      parameters.size = size;
    }

    return {
      model,
      input: {
        messages: [
          {
            role: 'user',
            content: resolvedContent,
          },
        ],
      },
      parameters,
    };
  }

  private limitAliyunImages(content: Array<{ image?: string; text?: string }>) {
    const imageCount = content.filter((item) => item.image).length;
    if (imageCount > 3) {
      throw new BadGatewayException('Aliyun image edit supports at most 3 input images');
    }
    return content;
  }

  private resolveAliyunTextImageModel() {
    const legacyModel = process.env.ALIYUN_IMAGE_MODEL;
    if (legacyModel && !this.isAliyunEditModel(legacyModel)) {
      return legacyModel;
    }
    return process.env.ALIYUN_TEXT_IMAGE_MODEL || 'qwen-image-2.0';
  }

  private resolveAliyunEditModel() {
    const legacyModel = process.env.ALIYUN_IMAGE_MODEL;
    if (legacyModel && this.isAliyunEditModel(legacyModel)) {
      return process.env.ALIYUN_IMAGE_EDIT_MODEL || legacyModel;
    }
    return process.env.ALIYUN_IMAGE_EDIT_MODEL || 'qwen-image-edit-max';
  }

  private isAliyunEditModel(model: string) {
    return model.startsWith('qwen-image-edit');
  }

  private extractAliyunImageUrl(raw: unknown) {
    if (!raw || typeof raw !== 'object') {
      return '';
    }

    const output = (raw as { output?: unknown }).output;
    if (!output || typeof output !== 'object') {
      return '';
    }

    const choices = (output as { choices?: unknown }).choices;
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        const message = choice && typeof choice === 'object' ? (choice as { message?: unknown }).message : undefined;
        const content = message && typeof message === 'object' ? (message as { content?: unknown }).content : undefined;
        if (!Array.isArray(content)) {
          continue;
        }

        const image = content.find((item) => item && typeof item === 'object' && typeof (item as { image?: unknown }).image === 'string') as
          | { image: string }
          | undefined;
        if (image?.image) {
          return image.image;
        }
      }
    }

    const images = (output as { images?: unknown }).images;
    if (Array.isArray(images)) {
      const first = images.find((item) => {
        return item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string';
      }) as { url: string } | undefined;
      return first?.url || '';
    }

    return '';
  }

  private async generateWithVolcengine(input: GenerateCakeInput): Promise<GeneratedCakeImage> {
    const apiKey = process.env.VOLCENGINE_ARK_API_KEY;
    if (!apiKey) {
      throw new BadGatewayException('VOLCENGINE_ARK_API_KEY is required when AI_PROVIDER=volcengine');
    }

    const template = this.toPrompt(input);
    const prompt = template.prompt;
    const baseUrl = process.env.VOLCENGINE_ARK_BASE_URL || 'https://ark.cn-beijing.volces.com';
    const model = process.env.VOLCENGINE_IMAGE_MODEL || 'doubao-seedream-3-0-t2i-250415';
    const size = process.env.AI_IMAGE_SIZE || '1024x1024';
    const response = await fetch(`${baseUrl}/api/v3/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      throw new BadGatewayException(`Volcengine image generation failed: ${response.status} ${await response.text()}`);
    }

    const raw = (await response.json()) as {
      data?: Array<{ url?: string }>;
    };
    const imageUrl = raw?.data?.[0]?.url;
    if (!imageUrl) {
      throw new BadGatewayException('Volcengine image generation did not return an image URL');
    }

    return {
      provider: 'volcengine',
      prompt,
      promptVersion: template.version,
      promptProfile: template.profile,
      imageUrl,
      raw,
    };
  }

  private async generateWithRelay(input: GenerateCakeInput): Promise<GeneratedCakeImage> {
    const apiKey = process.env.IMAGE_RELAY_API_KEY;
    const baseUrl = process.env.IMAGE_RELAY_BASE_URL;
    if (!apiKey || !baseUrl) {
      throw new BadGatewayException('IMAGE_RELAY_API_KEY and IMAGE_RELAY_BASE_URL are required when AI_PROVIDER=relay');
    }

    const template = this.toPrompt(input);
    const prompt = template.prompt;
    const model = process.env.IMAGE_RELAY_MODEL || 'gpt-image-1';
    const size = process.env.AI_IMAGE_SIZE || '1024x1024';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/images/generations`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      throw new BadGatewayException(`Image relay generation failed: ${response.status} ${await response.text()}`);
    }

    const raw = (await response.json()) as {
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    const item = raw?.data?.[0];
    const imageUrl = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
    if (!imageUrl) {
      throw new BadGatewayException('Image relay did not return an image URL or base64 image');
    }

    return {
      provider: 'relay',
      prompt,
      promptVersion: template.version,
      promptProfile: template.profile,
      imageUrl,
      raw,
    };
  }

  private generateMock(input: GenerateCakeInput): GeneratedCakeImage {
    const template = this.toPrompt(input);
    return {
      provider: 'mock',
      prompt: template.prompt,
      promptVersion: template.version,
      promptProfile: template.profile,
      imageUrl: this.placeholderSvgDataUrl(input),
    };
  }

  private refineMock(input: RefineCakeInput): GeneratedCakeImage {
    const template = buildCakeImageEditPrompt(input);
    const refinement = requiredString(input.refinement, '继续微调');
    return {
      provider: 'mock',
      prompt: template.prompt,
      promptVersion: template.version,
      promptProfile: template.profile,
      imageUrl: this.placeholderSvgDataUrl({ ...input, prompt: refinement }, '微调升级'),
    };
  }

  private toPrompt(input: GenerateCakeInput) {
    return buildCakeImagePrompt(input);
  }

  private placeholderSvgDataUrl(input: GenerateCakeInput, badge = '如意鲜果蛋糕') {
    const prompt = requiredString(input.prompt, '梦幻生日蛋糕');
    const color = this.pickColor(input.color || prompt);
    const accent = this.pickColor(`${prompt}-accent`);
    const safePrompt = this.escapeXml(prompt).slice(0, 42);
    const style = this.escapeXml(requiredString(input.style, '韩系奶油风'));
    const scenario = this.escapeXml(requiredString(input.scenario, '生日'));

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${color}"/>
      <stop offset="1" stop-color="#fff7f0"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#6a4a3a" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="168" cy="164" r="72" fill="#ffffff" opacity="0.45"/>
  <circle cx="846" cy="214" r="108" fill="${accent}" opacity="0.22"/>
  <circle cx="810" cy="820" r="138" fill="#ffffff" opacity="0.36"/>
  <g filter="url(#shadow)">
    <ellipse cx="512" cy="762" rx="310" ry="74" fill="#d9b99c"/>
    <rect x="262" y="482" width="500" height="270" rx="58" fill="#fffaf6"/>
    <path d="M262 535c82 52 142-46 224 0s137-48 276-1v92H262z" fill="${accent}" opacity="0.66"/>
    <ellipse cx="512" cy="484" rx="250" ry="88" fill="#fffefd"/>
    <ellipse cx="512" cy="468" rx="220" ry="66" fill="#ffe9ee"/>
    <path d="M392 402c24-64 56-96 96-96 35 0 62 18 80 54 18-36 46-54 84-54 44 0 77 32 99 96-82-16-142-2-179 42-39-43-99-57-180-42z" fill="${accent}"/>
    <g fill="#f6c6d8">
      <circle cx="394" cy="562" r="24"/>
      <circle cx="606" cy="552" r="20"/>
      <circle cx="504" cy="640" r="18"/>
      <circle cx="696" cy="650" r="22"/>
      <circle cx="326" cy="660" r="16"/>
    </g>
  </g>
  <text x="512" y="132" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#3b2b24">${badge}</text>
  <text x="512" y="182" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#4a3a32">${safePrompt}</text>
  <text x="512" y="888" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#3b2b24">${scenario} · ${style}</text>
</svg>`.trim();

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  private pickColor(seed: string) {
    const palette = ['#f8c8dc', '#c7e5d6', '#f6db9f', '#b9d6f2', '#f1c0a8', '#d8c7ff'];
    const hash = createHash('sha1').update(seed).digest('hex');
    return palette[Number.parseInt(hash.slice(0, 2), 16) % palette.length];
  }

  private escapeXml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }
}
