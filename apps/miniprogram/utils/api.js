const app = getApp();

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBase}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'content-type': 'application/json',
        ...(app.globalData.authToken ? { Authorization: `Bearer ${app.globalData.authToken}` } : {})
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        const message = extractErrorMessage(res.data) || `请求失败（${res.statusCode}）`;
        if (
          res.statusCode === 401 &&
          typeof app.clearAuthSession === 'function' &&
          (app.globalData.authToken || app.globalData.currentUser)
        ) {
          app.clearAuthSession();
        }
        reject(new Error(message));
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络连接失败，请稍后重试'));
      }
    });
  });
}

function extractErrorMessage(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data.message)) return data.message.join('；');
  if (typeof data.message === 'string') return data.message;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.details === 'string') return data.details;
  return '';
}

function toUserMessage(error, fallback = '操作失败，请稍后重试') {
  const message = error && error.message ? error.message : `${error || ''}`;
  if (!message) return fallback;

  if (message.includes('WECHAT_APP_ID') || message.includes('WECHAT_APP_SECRET')) {
    return '微信登录服务暂未完成服务器配置，请联系平台处理；你仍可浏览公开作品和填写需求草稿。';
  }
  if (message.includes('code been used') || message.includes('invalid code')) {
    return '手机号授权已失效或已被使用，请回到账号区重新点击“绑定手机号”再试一次。';
  }
  if (message.includes('WeChat phone login failed')) {
    return '手机号授权暂时没有成功，请回到账号区重新点击“绑定手机号”再试一次。';
  }
  if (
    message.includes('WeChat login failed') ||
    message.includes('WeChat API request failed') ||
    message.includes('system busy') ||
    message.includes('系统繁忙')
  ) {
    return '微信登录暂时没有成功，可能是微信服务繁忙或登录凭证已失效。请重新进入小程序后再试一次。';
  }
  if (message.includes('Session is invalid or expired')) {
    return '登录状态已过期，请重新完成微信登录后继续。';
  }
  if (message.includes('Authorization bearer token')) {
    return '请先完成微信登录后再继续此操作；登录成功后会回到刚才页面。';
  }
  if (message.includes('User not found')) {
    return '当前账号不存在或状态已失效，请重新完成微信登录后继续。';
  }
  if (message.includes('当前账号还没有微信 openId')) {
    return '请先重新完成微信登录，再发起支付。';
  }
  if (
    message.includes('WeChat Pay config incomplete') ||
    message.includes('Mock payment creation is disabled in production')
  ) {
    return '平台支付通道还在配置中，请先确认报价意向，或联系平台处理。';
  }
  if (message.includes('Creation credit recharge is not available yet') || message.includes('Mock creation credit recharge is disabled in production')) {
    return '创作积分充值通道还在配置中，先使用每日签到积分继续微调。';
  }
  if (message.includes('Creation credit balance is not enough')) {
    return '创作积分不足，请先签到领取或充值后再继续生成/微调。';
  }
  if (message.includes('Daily free generation quota is used')) {
    return '今天的免费基础生成已经用完了，有积分会自动继续扣积分生成；请刷新后再试。';
  }
  if (
    message.includes('healthCertificateUrl is required') ||
    message.includes('businessLicenseUrl is required') ||
    message.includes('foodPermitUrl is required') ||
    message.includes('must be an uploaded credential file')
  ) {
    return '请先上传健康证、营业执照和食品经营相关资质图片后再提交入驻资料。';
  }
  if (message.includes('ALIYUN_DASHSCOPE_API_KEY')) {
    return 'AI 生图模型还没有完成服务端配置，请稍后再试或先去作品广场做同款。';
  }
  if (message.includes('Aliyun image generation failed') || message.includes('image generation did not return')) {
    return 'AI 生图服务暂时不可用，可能是模型权限、额度或网络问题，请稍后重试。';
  }
  if (message.includes('refinement') || message.includes('sourceImageUrl')) {
    return 'AI 微调服务暂时不可用，请保留当前作品或稍后重试。';
  }
  if (message.includes('Work not found')) {
    return '作品不存在或还没有通过公开审核，请换一个作品再试。';
  }
  if (message.includes('Demand not found')) {
    return '制作需求不存在或还没有通过审核，请稍后再查看。';
  }
  return message.length > 80 ? fallback : message;
}

function isLoginRequiredError(error) {
  const message = error && error.message ? error.message : `${error || ''}`;
  return (
    message.includes('Authorization bearer token') ||
    message.includes('401') ||
    message.includes('Session is invalid or expired') ||
    message.includes('请先完成微信登录')
  );
}

function isCreationCreditInsufficientError(error) {
  const message = error && error.message ? error.message : `${error || ''}`;
  return message.includes('Creation credit balance is not enough');
}

function uploadLocalFile(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath,
      encoding: 'base64',
      success(fileResult) {
        request('/uploads', {
          method: 'POST',
          data: {
            userId: options.userId || app.globalData.userId,
            kind: options.kind || 'other',
            fileName: options.fileName || filePath.split('/').pop() || 'upload.jpg',
            mimeType: options.mimeType || inferMimeType(filePath),
            contentBase64: fileResult.data
          }
        }).then(resolve).catch(reject);
      },
      fail: reject
    });
  });
}

function inferMimeType(filePath) {
  const lower = `${filePath || ''}`.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function nextWeek() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

module.exports = {
  request,
  uploadLocalFile,
  nextWeek,
  toUserMessage,
  isLoginRequiredError,
  isCreationCreditInsufficientError
};
