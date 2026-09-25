import { Injectable } from '@nestjs/common';
import { DesignTaskSource } from '../app.types';
import { requiredString } from '../utils';
import { MarketingCalendarContext } from './marketing-calendar';
import { botReviewRoles } from './bot-review-roles';

export interface BotTaskCandidate {
  title: string;
  theme: string;
  prompt: string;
  scenario: string;
  style: string;
  color: string;
  rewardAmount: number;
  validFrom: string;
  validTo: string;
  tags: string[];
  botLine: string;
  marketingNodeId?: string;
  marketingTitle?: string;
}

export interface BotReviewInput {
  workId?: string;
  title?: string;
  prompt?: string;
  imageUrl?: string;
  scenario?: string;
  style?: string;
  color?: string;
  size?: string;
  budget?: string;
}

export interface BotReviewLine {
  botId: string;
  name: string;
  focus: string;
  line: string;
}

export interface BotLlmResult<T> {
  provider: DesignTaskSource;
  fallbackReason?: string;
  items: T[];
}

type BotProvider = 'mock' | 'doubao' | 'deepseek';
type ReviewCopyContext = {
  title: string;
  scenario: string;
  color: string;
  detail: string;
  plaque: string;
  structure: string;
  surface: string;
};

@Injectable()
export class BotLlmService {
  async generateTaskCandidates(marketingContext?: MarketingCalendarContext): Promise<BotLlmResult<BotTaskCandidate>> {
    const provider = this.provider();
    if (provider === 'mock') {
      return { provider: 'mock', items: this.mockTaskCandidates(marketingContext) };
    }

    const readiness = this.providerReadiness(provider);
    if (readiness) {
      return { provider: 'mock', fallbackReason: readiness, items: this.mockTaskCandidates(marketingContext) };
    }

    try {
      const raw = await this.requestJson(provider, [
        {
          role: 'system',
          content:
            '你是如意鲜果蛋糕小程序的创作运营助手。只输出 JSON，不输出解释。任务必须适合蛋糕设计游戏、年轻用户分享和真实蛋糕制作。你了解世界杯、毕业季、开学季、踏青、七夕、双11、圣诞等中国年轻用户常见营销日历。',
        },
        {
          role: 'user',
          content: [
            marketingContext ? marketingContext.promptSummary : '当前营销节点：无明确节点，请使用常驻生日、告白、宠物、鲜果主题。',
            '生成 3 个今日蛋糕设计任务候选，优先贴合当前营销节点。',
            'JSON 格式：{"tasks":[{"title":"","theme":"","prompt":"","scenario":"","style":"","color":"","rewardAmount":66,"validFrom":"2026-06-16","validTo":"2026-06-23","tags":[""],"botLine":"","marketingNodeId":"","marketingTitle":""}]}。',
            'rewardAmount 必须在 20 到 100 之间，代表站内赛事奖励点数；可以表达优胜作品进入官方奖励池审核，但不要承诺自动现金到账，不要品牌商标，不要版权角色。',
          ].join('\n'),
        },
      ]);
      const tasks = this.normalizeTaskCandidates(this.extractArray(raw, 'tasks'));
      return {
        provider,
        items: tasks.length ? tasks : this.mockTaskCandidates(marketingContext),
        fallbackReason: tasks.length ? undefined : 'Bot LLM returned no valid tasks',
      };
    } catch (error) {
      return {
        provider: 'mock',
        fallbackReason: error instanceof Error ? error.message : 'Bot LLM task generation failed',
        items: this.mockTaskCandidates(marketingContext),
      };
    }
  }

  async reviewWork(input: BotReviewInput): Promise<BotLlmResult<BotReviewLine>> {
    const provider = this.reviewProvider();
    if (provider === 'mock') {
      return { provider: 'mock', items: this.mockReviewLines(input) };
    }

    const readiness = this.providerReadiness(provider);
    if (readiness) {
      return { provider: 'mock', fallbackReason: readiness, items: this.mockReviewLines(input) };
    }

    try {
      const raw = await this.requestJson(provider, [
        {
          role: 'system',
          content:
            '你是如意鲜果蛋糕作品广场的多模型创作点评系统。只输出 JSON。每条点评都必须是一句简练的祝福式短评，要描绘蛋糕细节，语气友好，可带一点唯美诗意，但不要空泛、不要分点、不要写第二句。避免医疗、夸大收益、品牌或版权角色。评论只针对蛋糕作品本身、分享氛围和制作沟通，不代表平台审核结论。',
        },
        {
          role: 'user',
          content: [
            `请对这个蛋糕作品生成 ${botReviewRoles.length} 个角色点评，角色固定为：${botReviewRoles.map((role) => role.name).join('、')}，顺序不可改变。`,
            '硬规则 1：一个模型只说一个角度，不能跨角度串场，不要重复别的模型已经说过的角度。',
            '硬规则 2：每条 line 控制在 48 个中文字符以内，只能写一句；必须是送给创作者的一句祝福式点评。',
            '硬规则 3：每句都要点出颜色、装饰、果香、奶油、花束、牌语、层次、插牌或构图中的至少一个具体细节。',
            '硬规则 4：每句都要让观众更懂这只蛋糕哪里好看，并产生“我也想来创作一款”的兴趣，但不要直接承诺收益。',
            'JSON 格式：{"reviews":[{"botId":"deepseek","name":"深度求索","focus":"","line":""}]}。',
            `角色矩阵：${botReviewRoles.map((role) => `${role.name}(${role.focus})，${role.angleRule}；写法：${role.instruction}`).join('；')}`,
            `作品图片：${requiredString(input.imageUrl, '未提供图片 URL，仅基于文字信息点评')}`,
            `标题：${requiredString(input.title, 'AI 蛋糕作品')}`,
            `想法：${requiredString(input.prompt, '定制蛋糕设计')}`,
            `场景：${requiredString(input.scenario, '生日')}`,
            `风格：${requiredString(input.style, '韩系奶油风')}`,
            `颜色：${requiredString(input.color, '粉色')}`,
            `尺寸：${requiredString(input.size, '6寸')}`,
            `预算：${requiredString(input.budget, '200-399元')}`,
          ].join('\n'),
        },
      ]);
      const reviews = this.normalizeReviewLines(this.extractArray(raw, 'reviews'), input);
      return {
        provider,
        items: reviews.length ? reviews : this.mockReviewLines(input),
        fallbackReason: reviews.length ? undefined : 'Bot LLM returned no valid reviews',
      };
    } catch (error) {
      return {
        provider: 'mock',
        fallbackReason: error instanceof Error ? error.message : 'Bot LLM review failed',
        items: this.mockReviewLines(input),
      };
    }
  }

  private async requestJson(provider: Exclude<BotProvider, 'mock'>, messages: Array<{ role: string; content: string }>) {
    const baseUrl = this.baseUrl(provider);
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.BOT_LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model(provider),
        messages,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(this.timeoutMs()),
    });

    if (!response.ok) {
      throw new Error(`Bot LLM ${provider} failed: ${response.status} ${await response.text()}`);
    }

    const raw = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = raw.choices?.[0]?.message?.content || '';
    return this.parseJson(content);
  }

  private parseJson(content: string) {
    const trimmed = requiredString(content);
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse(fenced ? fenced[1] : trimmed) as Record<string, unknown>;
  }

  private extractArray(raw: unknown, key: string) {
    if (!raw || typeof raw !== 'object') return [];
    const value = (raw as Record<string, unknown>)[key];
    return Array.isArray(value) ? value : [];
  }

  private normalizeTaskCandidates(items: unknown[]): BotTaskCandidate[] {
    return items
      .map((item, index) => {
        const value = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return {
          title: requiredString(value.title, `今日蛋糕任务 ${index + 1}`),
          theme: requiredString(value.theme, '年轻用户送礼与分享'),
          prompt: requiredString(value.prompt, '设计一款适合分享和真实制作的鲜果奶油蛋糕'),
          scenario: requiredString(value.scenario, '生日'),
          style: requiredString(value.style, '清新水果'),
          color: requiredString(value.color, '白绿'),
          rewardAmount: this.clampReward(value.rewardAmount),
          validFrom: requiredString(value.validFrom, this.todayKey()),
          validTo: requiredString(value.validTo, this.nextDateKey(7)),
          tags: this.normalizeTags(value.tags),
          botLine: requiredString(value.botLine, '深度求索：愿主题和果香都被一眼看见，也方便蛋糕师稳稳还原。'),
          marketingNodeId: requiredString(value.marketingNodeId, ''),
          marketingTitle: requiredString(value.marketingTitle, ''),
        };
      })
      .filter((item) => item.title && item.prompt);
  }

  private normalizeReviewLines(items: unknown[], input: BotReviewInput): BotReviewLine[] {
    const fallback = this.mockReviewLines(input);
    return fallback.map((base, index) => {
      const role = botReviewRoles[index];
      const value = items[index] && typeof items[index] === 'object' ? (items[index] as Record<string, unknown>) : {};
      const line = requiredString(value.line, base.line);
      return {
        botId: base.botId,
        name: base.name,
        focus: base.focus,
        line: this.isAcceptableReviewLine(line, role) ? line : base.line,
      };
    });
  }

  private normalizeTags(value: unknown) {
    if (!Array.isArray(value)) return ['AI任务', '蛋糕设计'];
    return value.map((item) => requiredString(item)).filter(Boolean).slice(0, 4);
  }

  private clampReward(value: unknown) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 66;
    return Math.min(Math.max(Math.round(amount), 20), 100);
  }

  private provider(): BotProvider {
    const provider = requiredString(process.env.BOT_LLM_PROVIDER, 'mock').toLowerCase();
    return provider === 'doubao' || provider === 'deepseek' ? provider : 'mock';
  }

  private reviewProvider(): BotProvider {
    const provider = requiredString(process.env.BOT_REVIEW_PROVIDER, process.env.BOT_LLM_PROVIDER || 'mock').toLowerCase();
    return provider === 'doubao' || provider === 'deepseek' ? provider : 'mock';
  }

  private providerReadiness(provider: Exclude<BotProvider, 'mock'>) {
    if (!process.env.BOT_LLM_API_KEY) {
      return `BOT_LLM_API_KEY is required when BOT_LLM_PROVIDER=${provider}`;
    }
    return '';
  }

  private baseUrl(provider: Exclude<BotProvider, 'mock'>) {
    if (process.env.BOT_LLM_BASE_URL) {
      return process.env.BOT_LLM_BASE_URL;
    }
    if (provider === 'deepseek') {
      return 'https://api.deepseek.com';
    }
    return 'https://ark.cn-beijing.volces.com/api/v3';
  }

  private model(provider: Exclude<BotProvider, 'mock'>) {
    if (process.env.BOT_LLM_MODEL) {
      return process.env.BOT_LLM_MODEL;
    }
    return provider === 'deepseek' ? 'deepseek-chat' : 'doubao-seed-1-6-250615';
  }

  private timeoutMs() {
    const value = Number(process.env.BOT_LLM_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : 12000;
  }

  private mockTaskCandidates(marketingContext?: MarketingCalendarContext): BotTaskCandidate[] {
    const node = marketingContext?.activeNodes[0] || marketingContext?.evergreenNodes[0];
    return [
      {
        title: node ? node.title : '毕业花束蛋糕',
        theme: node ? node.title : '毕业季祝福',
        prompt: node ? `${node.promptHint}，设计成适合发布和投票的蛋糕任务` : '给毕业朋友的花束蛋糕，清爽高级，有祝福牌，适合拍毕业照',
        scenario: node ? node.scenario : '毕业',
        style: node ? node.style : '自然花艺',
        color: node ? node.color : '白绿',
        rewardAmount: 88,
        validFrom: this.todayKey(),
        validTo: this.nextDateKey(7),
        tags: node ? node.tags : ['毕业季', '花束', '祝福'],
        botLine: `深度求索：愿${node ? node.title : '毕业季'}的花果与祝福一起落在奶油上，让主题一眼就被看见。`,
        marketingNodeId: node ? node.id : '',
        marketingTitle: node ? node.title : '',
      },
      {
        title: '世界杯观赛派对',
        theme: '世界杯朋友聚会',
        prompt: '世界杯观赛派对蛋糕，足球元素，绿色草坪感，适合朋友聚会分享',
        scenario: '聚会',
        style: '运动派对',
        color: '绿色',
        rewardAmount: 96,
        validFrom: this.todayKey(),
        validTo: this.nextDateKey(7),
        tags: ['世界杯', '观赛', '派对'],
        botLine: '豆包：愿草坪绿与果粒亮光一起欢呼，把观赛的热闹轻轻放进奶油里。',
      },
      {
        title: '鲜果治愈生日',
        theme: '鲜果生日',
        prompt: '鲜果奶油生日蛋糕，水果饱满，干净治愈，适合朋友聚会',
        scenario: '生日',
        style: '清新水果',
        color: '白绿',
        rewardAmount: 42,
        validFrom: this.todayKey(),
        validTo: this.nextDateKey(7),
        tags: ['鲜果', '生日', '可制作'],
        botLine: '腾讯混元：愿这圈鲜果与轻奶油被稳稳还原，让长治的生日祝福落地成真。',
      },
    ];
  }

  private mockReviewLines(input: BotReviewInput): BotReviewLine[] {
    const ctx = this.reviewCopyContext(input);
    return botReviewRoles.map((role) => ({
      botId: role.id,
      name: role.name,
      focus: role.focus,
      line: this.buildMockReviewLine(role.id, ctx),
    }));
  }

  private reviewCopyContext(input: BotReviewInput): ReviewCopyContext {
    const title = requiredString(input.title, '这款蛋糕');
    const prompt = requiredString(input.prompt, '');
    const scenario = requiredString(input.scenario, '送礼');
    const style = requiredString(input.style, '');
    const color = requiredString(input.color, '主色');
    const text = `${title} ${prompt} ${scenario} ${style}`;
    return {
      title,
      scenario,
      color,
      detail: this.pickReviewDetail(text),
      plaque: /祝福|牌|字/.test(text) ? '祝福牌' : '短句牌',
      structure: this.pickReviewStructure(text),
      surface: /足球|草坪|观赛/.test(text) ? '草坪面' : /花束|花艺|玫瑰/.test(text) ? '花束面' : '奶油面',
    };
  }

  private pickReviewDetail(text: string) {
    const detailMatchers: Array<{ pattern: RegExp; detail: string }> = [
      { pattern: /足球|草坪|观赛/, detail: '足球插牌' },
      { pattern: /花束|花艺|花朵|玫瑰/, detail: '花束裱花' },
      { pattern: /蝴蝶结/, detail: '蝴蝶结摆件' },
      { pattern: /皇冠/, detail: '皇冠插牌' },
      { pattern: /珍珠|糖珠/, detail: '糖珠亮点' },
      { pattern: /云朵/, detail: '云朵奶油纹' },
      { pattern: /星星|银河|流星/, detail: '星点糖珠' },
      { pattern: /心形|爱心/, detail: '心形裱花' },
      { pattern: /草莓|蓝莓|芒果|葡萄|鲜果|水果|果香/, detail: '鲜果围边' },
      { pattern: /祝福|牌|字/, detail: '祝福牌' },
    ];
    return detailMatchers.find((item) => item.pattern.test(text))?.detail || '奶油花边';
  }

  private pickReviewStructure(text: string) {
    const structureMatchers: Array<{ pattern: RegExp; value: string }> = [
      { pattern: /双层|双层蛋糕/, value: '双层结构' },
      { pattern: /蝴蝶结/, value: '中心摆件' },
      { pattern: /花束|花艺|玫瑰/, value: '上层花束构图' },
      { pattern: /足球|草坪|观赛/, value: '顶部主题构图' },
      { pattern: /鲜果|水果|草莓|蓝莓|芒果/, value: '围边果层' },
    ];
    return structureMatchers.find((item) => item.pattern.test(text))?.value || '奶油构图';
  }

  private buildMockReviewLine(botId: string, ctx: ReviewCopyContext) {
    if (botId === 'deepseek') {
      return `愿${ctx.color}奶油托住${ctx.detail}，让${ctx.scenario}主题一眼读懂，也让人想来创作。`;
    }
    if (botId === 'qwen') {
      return `愿${ctx.plaque}和${ctx.detail}把祝福写得刚好，让人看见字意，也想写自己的蛋糕。`;
    }
    if (botId === 'doubao') {
      return `愿${ctx.color}主色和${ctx.detail}先抓住目光，让观众想投票，也想跟着参加一题。`;
    }
    if (botId === 'wenxin') {
      return `愿${ctx.surface}层次映着${ctx.detail}轻轻发亮，让人看懂氛围，也想试着画一款。`;
    }
    if (botId === 'hunyuan') {
      return `愿${ctx.structure}里的${ctx.detail}和奶油围边都被清楚保留，让师傅一看就懂，也让人想试着做一款。`;
    }
    return `愿${ctx.detail}在${ctx.color}主色里再提亮半分，让下一稿更有记忆点，也更想画一款。`;
  }

  private isAcceptableReviewLine(line: string, role?: (typeof botReviewRoles)[number]) {
    const trimmed = requiredString(line, '');
    if (!trimmed) return false;
    if (trimmed.length > 52) return false;
    if (!/[愿祝]/.test(trimmed)) return false;
    if (!/(奶油|果|花|祝福|蛋糕|果香|主色|摆件|层次|奶香|糖珠|裱花|插牌|花束|纹)/.test(trimmed)) return false;
    if (!/(想来|想试|想画|想跟着|想做一款|想参加|想参赛|想写自己的蛋糕)/.test(trimmed)) return false;
    if (role && !role.focusSignals.some((signal) => trimmed.includes(signal))) return false;
    if (/(ChatGPT|GPT|OpenAI|Claude|ComfyUI)/i.test(trimmed)) return false;
    return trimmed.split(/[。！？\n]/).filter(Boolean).length <= 1;
  }

  private todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  private nextDateKey(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }
}
