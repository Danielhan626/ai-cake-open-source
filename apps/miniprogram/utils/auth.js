const { isLoginRequiredError } = require('./api');

const defaultLoginMessage = '请先完成微信登录后再继续此操作；登录成功后会自动回到刚才页面。';

function saveLoginReturn(options = {}) {
  const app = getApp();
  if (typeof app.setPendingLoginReturn === 'function') {
    app.setPendingLoginReturn({
      url: options.url,
      action: options.action || '',
      requirePhone: Boolean(options.requirePhone)
    });
    return;
  }
  app.globalData.focusMineAuth = true;
}

function goLogin(options = {}) {
  saveLoginReturn(options);
  wx.switchTab({ url: '/pages/mine/mine' });
}

function ensureCommercialContact(options = {}) {
  const app = getApp();
  if (!app.globalData.currentUser) {
    wx.showModal({
      title: options.loginTitle || '登录并绑定手机号',
      content:
        options.loginContent ||
        '此操作需要先完成微信登录，并绑定手机号用于需求发布、报价确认、配送联系和售后处理。完成后会自动回到刚才页面。',
      showCancel: options.showCancel !== false,
      cancelText: options.cancelText || '稍后',
      confirmText: options.confirmText || '去登录',
      success: (result) => {
        if (result.confirm) {
          goLogin({
            url: options.url,
            action: options.action || '',
            requirePhone: true
          });
        }
      }
    });
    return false;
  }

  if (app.globalData.currentUser.phoneNumber) {
    return true;
  }

  wx.showModal({
    title: options.phoneTitle || '先绑定手机号',
    content:
      options.phoneContent ||
      '此操作需要已绑定的手机号，用于蛋糕师联系、报价确认、配送沟通和售后处理。绑定完成后会自动回到刚才页面。',
    showCancel: options.showCancel !== false,
    cancelText: options.cancelText || '稍后',
    confirmText: options.confirmText || '去绑定',
    success: (result) => {
      if (result.confirm) {
        goLogin({
          url: options.url,
          action: options.action || '',
          requirePhone: true
        });
      }
    }
  });
  return false;
}

function promptLoginRequired(error, options = {}) {
  if (!isLoginRequiredError(error)) return false;

  wx.showModal({
    title: options.title || '登录后继续',
    content: options.content || defaultLoginMessage,
    showCancel: options.showCancel !== false,
    cancelText: options.cancelText || '先浏览',
    confirmText: options.confirmText || '去登录',
    success: (result) => {
      if (result.confirm) {
        if (typeof options.beforeLogin === 'function') {
          options.beforeLogin();
        }
        goLogin(options);
      }
    }
  });
  return true;
}

module.exports = {
  ensureCommercialContact,
  saveLoginReturn,
  goLogin,
  promptLoginRequired
};
