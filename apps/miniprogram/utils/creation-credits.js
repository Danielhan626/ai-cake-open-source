const app = getApp();
const { request } = require('./api');

function applyCreationCreditSummary(summary) {
  if (!summary) return summary;
  if (summary.wallet) {
    app.globalData.creationCreditBalance = summary.wallet.creationCreditBalance || 0;
    app.globalData.roseBalance = summary.wallet.roseBalance || app.globalData.roseBalance || 0;
    app.globalData.userScore = summary.wallet.score || app.globalData.userScore || 0;
    app.globalData.rewardWallet = {
      pending: summary.wallet.rewardPending || 0,
      approved: summary.wallet.rewardApproved || 0
    };
  }
  app.globalData.creationCreditSummary = summary;
  app.globalData.creationRechargeProducts = summary.products || [];
  app.globalData.creationGenerationCost = summary.generationCost || 5;
  app.globalData.creationRefineCost = summary.refineCost || 5;
  app.globalData.dailyFreeGenerationRemaining = summary.dailyFreeGenerationRemaining || 0;
  return summary;
}

async function refreshCreationCreditSummary() {
  const summary = await request('/creation-credits/summary');
  return applyCreationCreditSummary(summary);
}

async function rechargeCreationCredits(productId) {
  const order = await request('/creation-credits/recharge-orders', {
    method: 'POST',
    data: { productId }
  });

  if (order.provider === 'wechat') {
    await requestWechatPayment(order);
    const synced = await request(`/creation-credits/recharge-orders/${order.id}/sync`, {
      method: 'POST'
    });
    await refreshCreationCreditSummary();
    return synced;
  }

  if (order.provider === 'mock') {
    const paid = await request(`/creation-credits/recharge-orders/${order.id}/mock-paid`, {
      method: 'PATCH'
    });
    await refreshCreationCreditSummary();
    return paid;
  }

  return order;
}

function requestWechatPayment(order) {
  return new Promise((resolve, reject) => {
    if (!order || !order.payParams) {
      reject(new Error('支付参数缺失，请稍后重试'));
      return;
    }
    if (typeof wx.requestPayment !== 'function') {
      reject(new Error('当前环境暂不支持微信支付，请在手机微信中重试'));
      return;
    }
    wx.requestPayment({
      timeStamp: order.payParams.timeStamp,
      nonceStr: order.payParams.nonceStr,
      package: order.payParams.package,
      signType: order.payParams.signType || 'RSA',
      paySign: order.payParams.paySign,
      success: resolve,
      fail: (error) => {
        if (error && (error.errMsg || '').includes('cancel')) {
          reject(new Error('你已取消支付，可稍后再充值。'));
          return;
        }
        reject(error || new Error('微信支付未完成'));
      }
    });
  });
}

module.exports = {
  applyCreationCreditSummary,
  refreshCreationCreditSummary,
  rechargeCreationCredits
};
