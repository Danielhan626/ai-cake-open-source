import { requiredString } from '../utils';
import type { GenerateCakeInput } from './ai.service';

export interface CakePromptTemplateResult {
  version: string;
  profile: string;
  prompt: string;
  negativePrompt: string;
}

const PROMPT_VERSION = 'cake-image-v1.2.0';
const EDIT_PROMPT_VERSION = 'cake-image-edit-v1.2.0';

const CAKE_ONLY_SYSTEM_RULES = [
  '固定领域：只生成蛋糕。无论用户输入什么主题，都必须转译成真实可食用蛋糕设计，不生成海报、插画、普通玩具、摆件、饮品、服装、真人写真或非蛋糕主体。',
  '真实基底：主体必须是完整蛋糕，能看出蛋糕胚、奶油或慕斯抹面、顶部装饰、侧面层次和蛋糕托盘；优先使用圆形、爱心形、方形或高筒圆柱结构。',
  '素材风格：可以参考真实蛋糕店成品照片，也可以有更强的创作表达；背景、角度和画面氛围服务用户想法，不强制白底、居中或固定三分之四视角。',
  '构图规则：蛋糕主体必须清楚可见，默认单个主蛋糕；允许近景、俯拍、侧拍、场景化桌面或作品广场感构图，但不要让非蛋糕元素抢走主体。',
  '常用装饰：鲜果、奶油裱花、巧克力、糖珠、可食用糖牌、翻糖小摆件、蝴蝶结、花朵、祝福插牌、少量手写字；所有装饰必须像可食用或蛋糕店可安全摆放的材料。',
  '年轻化表达：可以可爱、浪漫、节日化、论坛分享感，也可以保留大胆创意；不要把平台理解为最终制作裁判，能否制作取决于蛋糕师的技术、材料、工期、预算和是否接单。',
].join(' ');

const GENERATION_PROGRESSION = [
  '递进设计步骤：先理解用户想法，再确定蛋糕形状和层高，接着确定奶油/慕斯基底和主色，把用户主题转成主视觉装饰，随后添加辅助装饰，最后统一光线、背景、创意表达和制作沟通线索。',
  '主题转译规则：用户想要人物、宠物、足球、毕业、节日、品牌感或抽象情绪时，只能做成蛋糕上的可食用糖牌、手写牌、配色、纹样、果物、奶油造型或简化摆件，不能让画面主体离开蛋糕。',
  '文字规则：允许少量短祝福字、名字或年龄数字，文字必须像奶油、巧克力或糖牌手写；不要生成大段文案，不要出现二维码、电话、价格或平台水印。',
  '制作沟通等级：生成时不要写死可制作或不可制作；只在设计语言上体现常规制作、需要沟通、挑战制作或仅创意展示的倾向，供用户发布需求和蛋糕师报价时继续协商。',
].join(' ');

const EDIT_PROGRESSION = [
  '递进微调步骤：先识别原图蛋糕的形状、主体比例、拍摄角度、主色和核心主题，再根据微调要求决定是局部优化、风格重塑还是大胆重构。',
  '微调边界：用户要求轻微优化时保留主体结构；用户要求换风格或重做时允许重新组织蛋糕形状、配色、装饰和场景，但主体仍必须是蛋糕。',
  '保留规则：保留原有蛋糕层数、底色、主视觉、已有短文字、摆件大致位置、蛋糕托和取景角度；用户没有要求时不要新增真人、手部、额外蛋糕或复杂背景。',
  '质量升级：让奶油质感更细腻，水果和糖牌更清楚，构图更干净，并保留给蛋糕师沟通报价的结构线索；如果原图元素过多，优先整理层次而不是继续堆叠。',
  '平台不替代蛋糕师判断最终可制作性；微调结果只作为创意图或制作沟通参考，最终是否接单、如何改稿和报价由蛋糕师决定。',
].join(' ');

const NEGATIVE_PROMPT = [
  '低分辨率',
  '低画质',
  '构图混乱',
  '画面过饱和',
  '文字模糊',
  '真实人物脸',
  '品牌商标',
  '版权角色',
  '二维码',
  '联系方式',
  '价格标签',
  '平台水印',
  '截图界面',
  '社交媒体界面',
  '非蛋糕主体',
  '海报',
  '插画感过重',
  '普通玩具模型',
  '不可食用材料',
  '金属刀具成为主体',
  '夸张悬浮结构',
  '巨大不稳定摆件',
  '脏乱桌面',
  '破损蛋糕',
  '发霉食物',
  '血腥恐怖元素',
  '多人入镜',
  '手部遮挡蛋糕',
  '额外多个蛋糕抢主体',
].join('，');

const PROFILE_COPY: Record<string, string> = {
  'social-game': [
    '目标：生成一张适合年轻用户分享、投票和继续微调的定制蛋糕设计图。',
    '画面要有作品广场的吸引力：第一眼明确、甜感克制、细节可投票讨论，适合用户继续二次微调。',
  ].join(' '),
  production: [
    '目标：生成一张可以交给蛋糕师沟通报价的蛋糕制作参考图。',
    '平台不替代蛋糕师判断最终可制作性；请保留用户创意，同时让结构、装饰、尺寸感和需要沟通的部分更容易被蛋糕师理解。',
    '可以呈现挑战制作或仅创意展示的想法，但不要替市场提前否定，最终由蛋糕师根据技术、材料、工期、预算和配送条件报价或拒单。',
  ].join(' '),
};

export function buildCakeImagePrompt(input: GenerateCakeInput): CakePromptTemplateResult {
  const profile = process.env.AI_PROMPT_PROFILE || 'social-game';
  const prompt = requiredString(input.prompt, '梦幻生日蛋糕');
  const scenario = requiredString(input.scenario, '生日');
  const style = requiredString(input.style, '韩系奶油风');
  const color = requiredString(input.color, '粉色');
  const size = requiredString(input.size, '6寸');
  const budget = requiredString(input.budget, '200-399元');
  const invariant = PROFILE_COPY[profile] || PROFILE_COPY['social-game'];

  return {
    version: PROMPT_VERSION,
    profile,
    prompt: [
      `系统规则版本：${PROMPT_VERSION}`,
      invariant,
      `用户想法：${prompt}`,
      `使用场景：${scenario}`,
      `视觉风格：${style}`,
      `主色系：${color}`,
      `蛋糕尺寸：${size}`,
      `预算区间：${budget}`,
      '平台不替代蛋糕师判断最终可制作性；本图是创意表达和制作沟通参考，不是平台对能否制作的裁决。',
      CAKE_ONLY_SYSTEM_RULES,
      GENERATION_PROGRESSION,
      '输出要求：正方形图片，主体蛋糕清楚，细节精致，优先表达用户想法；画面中不要出现平台水印、价格、二维码、联系电话。',
    ].join('，'),
    negativePrompt: NEGATIVE_PROMPT,
  };
}

export function buildCakeImageEditPrompt(input: GenerateCakeInput & { refinement?: string }): CakePromptTemplateResult {
  const profile = process.env.AI_PROMPT_PROFILE || 'social-game';
  const prompt = requiredString(input.prompt, '梦幻生日蛋糕');
  const refinement = requiredString(input.refinement, '保留主体构思，做一个更精致、更适合发布和沟通报价的版本');
  const scenario = requiredString(input.scenario, '生日');
  const style = requiredString(input.style, '韩系奶油风');
  const color = requiredString(input.color, '粉色');
  const size = requiredString(input.size, '6寸');
  const budget = requiredString(input.budget, '200-399元');
  const invariant = PROFILE_COPY[profile] || PROFILE_COPY['social-game'];

  return {
    version: EDIT_PROMPT_VERSION,
    profile,
    prompt: [
      `系统规则版本：${EDIT_PROMPT_VERSION}`,
      invariant,
      '你会收到一张已有蛋糕设计图，请在保留原图蛋糕主体、可制作结构和视觉连续性的前提下做局部微调。',
      `原始设计想法：${prompt}`,
      `微调要求：${refinement}`,
      `使用场景：${scenario}`,
      `视觉风格：${style}`,
      `主色系：${color}`,
      `蛋糕尺寸：${size}`,
      `预算区间：${budget}`,
      '平台不替代蛋糕师判断最终可制作性；微调图只帮助用户和蛋糕师沟通创意、结构和调整空间。',
      CAKE_ONLY_SYSTEM_RULES,
      EDIT_PROGRESSION,
      '输出要求：正方形图片，主体蛋糕清楚，调整点清晰可见，保留创意和沟通线索；画面中不要出现平台水印、价格、二维码、联系电话。',
    ].join('，'),
    negativePrompt: NEGATIVE_PROMPT,
  };
}
