import assert from 'node:assert/strict';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function mockDashScopeFetch(assertRequest) {
  const calls = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    assertRequest({ url, init, body });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        output: {
          choices: [
            {
              message: {
                content: [{ image: 'https://example.com/generated-cake.png' }],
              },
            },
          ],
        },
      }),
      text: async () => '',
    };
  };
  return calls;
}

async function loadAiService() {
  const { AiService } = await import('../apps/api/dist/ai/ai.service.js');
  return new AiService();
}

async function testQwenImage2TextToImageRequestBody() {
  resetEnv();
  process.env.AI_PROVIDER = 'aliyun';
  process.env.ALIYUN_DASHSCOPE_API_KEY = 'test-key';
  process.env.ALIYUN_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com';
  delete process.env.ALIYUN_IMAGE_MODEL;
  process.env.ALIYUN_IMAGE_SIZE = '2048*2048';

  const calls = mockDashScopeFetch(({ url, init, body }) => {
    assert.equal(
      url,
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    );
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    assert.equal(body.model, 'qwen-image-2.0');
    assert.deepEqual(Object.keys(body.input.messages[0].content[0]), ['text']);
    assert.match(body.input.messages[0].content[0].text, /用户想法：草莓花园蛋糕/);
    assert.match(body.input.messages[0].content[0].text, /固定领域：只生成蛋糕/);
    assert.match(body.input.messages[0].content[0].text, /平台不替代蛋糕师判断最终可制作性/);
    assert.match(body.input.messages[0].content[0].text, /制作沟通等级/);
    assert.match(body.input.messages[0].content[0].text, /递进设计步骤：先理解用户想法/);
    assert.match(body.input.messages[0].content[0].text, /主题转译规则：用户想要人物、宠物、足球、毕业、节日、品牌感或抽象情绪时/);
    assert.deepEqual(body.parameters, {
      size: '2048*2048',
      prompt_extend: true,
      watermark: false,
      negative_prompt:
        '低分辨率，低画质，构图混乱，画面过饱和，文字模糊，真实人物脸，品牌商标，版权角色，二维码，联系方式，价格标签，平台水印，截图界面，社交媒体界面，非蛋糕主体，海报，插画感过重，普通玩具模型，不可食用材料，金属刀具成为主体，夸张悬浮结构，巨大不稳定摆件，脏乱桌面，破损蛋糕，发霉食物，血腥恐怖元素，多人入镜，手部遮挡蛋糕，额外多个蛋糕抢主体',
    });
  });

  const result = await (await loadAiService()).generateCake({
    prompt: '草莓花园蛋糕',
    scenario: '生日',
    style: '韩系奶油风',
    color: '粉白',
    size: '6寸',
    budget: '200-399元',
  });

  assert.equal(calls.length, 1);
  assert.equal(result.provider, 'aliyun');
  assert.equal(result.imageUrl, 'https://example.com/generated-cake.png');
  assert.equal(result.promptVersion, 'cake-image-v1.2.0');
}

async function testQwenImageEditMaxRequestBody() {
  resetEnv();
  process.env.AI_PROVIDER = 'aliyun';
  process.env.ALIYUN_DASHSCOPE_API_KEY = 'test-key';
  process.env.ALIYUN_IMAGE_EDIT_MODEL = 'qwen-image-edit-max';
  process.env.ALIYUN_IMAGE_EDIT_SIZE = '1328*1328';

  const calls = mockDashScopeFetch(({ body }) => {
    assert.equal(body.model, 'qwen-image-edit-max');
    assert.deepEqual(body.input.messages[0].content.slice(0, 1), [{ image: 'https://example.com/source-cake.png' }]);
    assert.equal(typeof body.input.messages[0].content[1].text, 'string');
    assert.match(body.input.messages[0].content[1].text, /微调要求：把蝴蝶结改成草莓花环/);
    assert.match(body.input.messages[0].content[1].text, /固定领域：只生成蛋糕/);
    assert.match(body.input.messages[0].content[1].text, /平台不替代蛋糕师判断最终可制作性/);
    assert.match(body.input.messages[0].content[1].text, /递进微调步骤：先识别原图蛋糕的形状/);
    assert.match(body.input.messages[0].content[1].text, /局部优化、风格重塑还是大胆重构/);
    assert.match(body.input.messages[0].content[1].text, /保留原有蛋糕层数、底色、主视觉、已有短文字、摆件大致位置/);
    assert.deepEqual(body.parameters, {
      size: '1328*1328',
      prompt_extend: true,
      watermark: false,
      negative_prompt:
        '低分辨率，低画质，构图混乱，画面过饱和，文字模糊，真实人物脸，品牌商标，版权角色，二维码，联系方式，价格标签，平台水印，截图界面，社交媒体界面，非蛋糕主体，海报，插画感过重，普通玩具模型，不可食用材料，金属刀具成为主体，夸张悬浮结构，巨大不稳定摆件，脏乱桌面，破损蛋糕，发霉食物，血腥恐怖元素，多人入镜，手部遮挡蛋糕，额外多个蛋糕抢主体',
    });
  });

  const result = await (await loadAiService()).refineCake({
    sourceImageUrl: 'https://example.com/source-cake.png',
    prompt: '草莓花园蛋糕',
    refinement: '把蝴蝶结改成草莓花环',
    scenario: '生日',
    style: '韩系奶油风',
    color: '粉白',
    size: '6寸',
    budget: '200-399元',
  });

  assert.equal(calls.length, 1);
  assert.equal(result.provider, 'aliyun');
  assert.equal(result.imageUrl, 'https://example.com/generated-cake.png');
}

async function testQwenImageEditMaxRequiresSourceImage() {
  resetEnv();
  process.env.AI_PROVIDER = 'aliyun';
  process.env.ALIYUN_DASHSCOPE_API_KEY = 'test-key';

  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called without a source image');
  };

  await assert.rejects(
    () =>
      loadAiService().then((service) =>
        service.refineCake({
          sourceImageUrl: '',
          prompt: '芒果慕斯蛋糕',
          refinement: '改成更清爽的绿色',
        }),
      ),
    /sourceImageUrl is required/,
  );
  assert.equal(fetchCalled, false);
}

await testQwenImage2TextToImageRequestBody();
await testQwenImageEditMaxRequestBody();
await testQwenImageEditMaxRequiresSourceImage();

resetEnv();
console.log('Aliyun provider regression passed.');
