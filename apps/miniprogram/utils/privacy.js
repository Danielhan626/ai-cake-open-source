function ensurePrivacyAuthorized(callback) {
  if (typeof wx.requirePrivacyAuthorize !== 'function') {
    callback(true);
    return;
  }

  wx.requirePrivacyAuthorize({
    success: () => callback(true),
    fail: () => callback(false)
  });
}

function runWithPrivacy(callback, message) {
  ensurePrivacyAuthorized((authorized) => {
    if (!authorized) {
      wx.showToast({ title: message || '请先同意隐私保护指引', icon: 'none' });
      return;
    }
    callback();
  });
}

module.exports = {
  ensurePrivacyAuthorized,
  runWithPrivacy
};
