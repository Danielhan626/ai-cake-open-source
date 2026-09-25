const app = getApp();
const { request, uploadLocalFile } = require('../../utils/api');
const { ensureCommercialContact, promptLoginRequired } = require('../../utils/auth');
const { runWithPrivacy } = require('../../utils/privacy');

const credentialFields = [
  { urlField: 'healthCertUrl', statusField: 'healthCert', label: '健康证' },
  { urlField: 'businessLicenseUrl', statusField: 'businessLicense', label: '营业执照' },
  { urlField: 'foodPermitUrl', statusField: 'foodPermit', label: '食品经营相关资质' }
];

Page({
  data: {
    form: {
      shopName: '',
      ownerName: '',
      phone: '',
      city: '长治',
      district: '潞州区',
      serviceRange: '',
      address: '',
      specialties: '',
      healthCert: '',
      businessLicense: '',
      foodPermit: '',
      healthCertUrl: '',
      businessLicenseUrl: '',
      foodPermitUrl: ''
    },
    submitted: false,
    uploading: '',
    submitting: false,
    pendingOnboardingAction: '',
    submissionStatusLabel: '',
    submissionHint: ''
  },

  onShow() {
    if (app.globalData.onboardingApplication) {
      const saved = app.globalData.onboardingApplication;
      this.setData({
        form: saved,
        submitted: true,
        submissionStatusLabel: saved.status === '待平台审核' ? '待平台审核' : '待重新提交',
        submissionHint:
          saved.status === '待平台审核'
            ? '资料已提交，平台审核通过后才会开放报价权限。'
            : '资料只保存在当前设备，平台暂未收到。请检查网络或登录状态后重新提交。'
      });
      return;
    }
    const pendingDraft = this.consumePendingOnboardingForAuth();
    if (pendingDraft && pendingDraft.form) {
      this.setData({
        form: Object.assign({}, this.data.form, pendingDraft.form),
        pendingOnboardingAction: pendingDraft.action || ''
      }, () => {
        this.resumePendingOnboardingAction();
      });
      return;
    }
    this.setData({
      'form.city': app.globalData.orderCity || app.globalData.city || this.data.form.city,
      'form.district': app.globalData.orderDistrict || app.globalData.district || this.data.form.district
    });
  },

  consumePendingOnboardingForAuth() {
    if (typeof app.consumePendingAuthDraft !== 'function') return null;
    const submitDraft = app.consumePendingAuthDraft('submit-baker-application');
    if (submitDraft) {
      return Object.assign({}, submitDraft, { action: 'submit-baker-application' });
    }
    const uploadDraft = app.consumePendingAuthDraft('upload-baker-credential');
    if (uploadDraft) {
      return Object.assign({}, uploadDraft, { action: 'upload-baker-credential' });
    }
    return null;
  },

  preserveOnboardingForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function') return;
    app.setPendingAuthDraft(action, {
      form: Object.assign({}, this.data.form)
    });
  },

  resumePendingOnboardingAction() {
    if (this.data.pendingOnboardingAction === 'upload-baker-credential') {
      this.setData({ pendingOnboardingAction: '' });
      wx.showModal({
        title: '账号已确认',
        content: '请重新选择要上传的资质图片；平台会把文件归到当前登录账号下。',
        showCancel: false
      });
      return;
    }
    if (this.data.pendingOnboardingAction !== 'submit-baker-application') return;
    this.setData({ pendingOnboardingAction: '' });
    setTimeout(() => {
      this.submitApplication();
    }, 180);
  },

  ensureOnboardingAccountReady(action) {
    if (app.globalData.currentUser && app.globalData.currentUser.phoneNumber) return true;
    this.preserveOnboardingForAuth(action);
    return ensureCommercialContact({
      url: '/pages/onboarding/onboarding',
      action,
      loginTitle: '登录并绑定手机号后入驻',
      loginContent: '师傅入驻资料会进入平台审核，请先确认微信账号并绑定手机号，方便审核和订单联系。',
      phoneTitle: '先绑定手机号再提交入驻',
      phoneContent: '入驻审核、报价和履约都需要可联系的账号手机号。绑定完成后会自动回到当前入驻资料。'
    });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  chooseCredential(event) {
    if (this.data.uploading) return;
    const field = event.currentTarget.dataset.field;
    if (!this.ensureOnboardingAccountReady('upload-baker-credential')) return;
    const kindMap = {
      healthCertUrl: 'healthCertificate',
      businessLicenseUrl: 'businessLicense',
      foodPermitUrl: 'foodPermit'
    };
    runWithPrivacy(() => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: async (result) => {
          const file = result.tempFiles && result.tempFiles[0];
          if (!file || !file.tempFilePath) return;
          this.setData({ uploading: field });
          try {
            const upload = await uploadLocalFile(file.tempFilePath, {
              userId: (app.globalData.currentUser && app.globalData.currentUser.id) || app.globalData.userId,
              kind: kindMap[field] || 'other',
              fileName: `${field}.jpg`,
              mimeType: file.type || 'image/jpeg'
            });
            const descriptor = credentialFields.find((item) => item.urlField === field);
            this.setData({
              [`form.${field}`]: upload.url,
              ...(descriptor ? { [`form.${descriptor.statusField}`]: '已上传，待平台审核' } : {})
            });
            wx.showToast({ title: '已上传' });
          } catch (error) {
            if (promptLoginRequired(error, {
              action: 'upload-baker-credential',
              title: '登录后上传资质'
            })) {
              this.preserveOnboardingForAuth('upload-baker-credential');
              return;
            }
            wx.showToast({ title: error.message || '上传失败', icon: 'none' });
          } finally {
            this.setData({ uploading: '' });
          }
        }
      });
    }, '请先同意隐私保护指引再上传资质');
  },

  async submitApplication() {
    if (this.data.submitting) return;
    const form = this.data.form;
    if (!this.ensureOnboardingAccountReady('submit-baker-application')) return;
    if (!form.shopName || !form.ownerName || !form.phone || !form.address) {
      wx.showToast({ title: '请补全店铺和联系方式', icon: 'none' });
      return;
    }
    const missingCredentials = this.missingCredentialLabels(form);
    if (missingCredentials.length) {
      wx.showModal({
        title: '先上传资质图片',
        content: `请上传${missingCredentials.join('、')}后再提交入驻资料；只填写文字或编号不能进入平台审核。`,
        showCancel: false
      });
      return;
    }
    const payload = {
      userId: (app.globalData.currentUser && app.globalData.currentUser.id) || app.globalData.userId,
      name: form.shopName,
      city: form.city,
      district: form.district,
      deliveryRadiusKm: Number((form.serviceRange.match(/\d+/) || ['8'])[0]),
      specialties: form.specialties.split('、').filter(Boolean),
      startingPrice: 199,
      contact: form.phone,
      bio: `${form.shopName}，负责人：${form.ownerName}，地址：${form.address}`,
      portfolio: [],
      healthCertificateUrl: form.healthCertUrl,
      businessLicenseUrl: form.businessLicenseUrl,
      foodPermitUrl: form.foodPermitUrl
    };
    let savedBaker = null;
    this.setData({ submitting: true });
    try {
      savedBaker = await request('/bakers', {
        method: 'POST',
        data: payload
      });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'submit-baker-application',
        title: '登录后提交入驻资料'
      })) {
        this.preserveOnboardingForAuth('submit-baker-application');
        this.setData({ submitting: false });
        return;
      }
      wx.showToast({ title: '已保存为草稿', icon: 'none' });
    }
    app.globalData.onboardingApplication = Object.assign({}, form, { status: savedBaker ? '待平台审核' : '待重新提交' });
    app.globalData.bakerProfile = Object.assign({}, app.globalData.bakerProfile || {}, {
      userId: savedBaker ? savedBaker.userId : app.globalData.bakerProfile.userId,
      name: form.shopName,
      city: form.city,
      district: form.district,
      verifyStatus: savedBaker ? '待平台审核' : '待重新提交',
      serviceRange: form.serviceRange,
      startingPrice: savedBaker ? savedBaker.startingPrice : app.globalData.bakerProfile.startingPrice || 0,
      healthCertStatus: savedBaker ? '已提交' : '待重新提交',
      licenseStatus: savedBaker ? '已提交' : '待重新提交',
      foodPermitStatus: savedBaker ? '已提交' : '待重新提交',
      deliveryMethods: app.globalData.bakerProfile.deliveryMethods || '待设置',
      specialties: form.specialties.split('、').filter(Boolean)
    });
    if (savedBaker) {
      app.globalData.bakerId = savedBaker.id;
    }
    this.setData({
      submitted: true,
      submissionStatusLabel: savedBaker ? '待平台审核' : '待重新提交',
      submissionHint: savedBaker
        ? '资料已提交，平台审核通过后才会开放报价权限。'
        : '资料只保存在当前设备，平台暂未收到。请检查网络或登录状态后重新提交。'
    });
    if (savedBaker) {
      wx.showToast({ title: '已提交入驻' });
    }
    this.setData({ submitting: false });
  },

  missingCredentialLabels(form) {
    return credentialFields
      .filter((item) => !form[item.urlField])
      .map((item) => item.label);
  },

  showUploadTip() {
    wx.showModal({
      title: '资质上传说明',
      content: '入驻审核必须上传健康证、营业执照和食品经营相关资质图片；只填写文字或编号不会进入平台审核。正式上线前建议换对象存储、加隐私脱敏和资质过期提醒。',
      showCancel: false
    });
  }
});
