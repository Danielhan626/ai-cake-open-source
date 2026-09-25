const app = getApp();
const { request, toUserMessage, uploadLocalFile } = require('../../utils/api');
const { promptLoginRequired } = require('../../utils/auth');
const { runWithPrivacy } = require('../../utils/privacy');

Page({
  data: {
    order: null,
    typeOptions: ['订单沟通', '成品不符', '配送问题', '食品安全', '退款协商', '其他问题'],
    typeIndex: 0,
    typeText: '订单沟通',
    contact: '',
    description: '',
    evidenceNote: '',
    evidenceImages: [],
    mode: 'support',
    tickets: [],
    submitting: false
  },

  onShow() {
    const pendingSupportDraft = this.consumePendingSupportForAuth();
    const refundDraft = app.globalData.pendingRefundDraft || null;
    const supportForm = pendingSupportDraft && pendingSupportDraft.supportForm ? pendingSupportDraft.supportForm : null;
    const restoredTypeIndex =
      supportForm && typeof supportForm.typeIndex === 'number'
        ? supportForm.typeIndex
        : refundDraft
          ? 4
          : this.data.typeIndex;
    const restoredTypeText =
      supportForm && supportForm.typeText
        ? supportForm.typeText
        : refundDraft
          ? '退款协商'
          : this.data.typeText;
    this.setData({
      order: app.globalData.currentOrder || null,
      tickets: app.globalData.supportTickets || [],
      mode: supportForm && supportForm.mode ? supportForm.mode : refundDraft ? 'refund' : 'support',
      typeIndex: restoredTypeIndex,
      typeText: restoredTypeText,
      contact:
        (supportForm && supportForm.contact) ||
        (refundDraft ? refundDraft.contact || this.data.contact : this.data.contact) ||
        (app.globalData.currentUser && app.globalData.currentUser.phoneNumber) ||
        '',
      description:
        (supportForm && supportForm.description) ||
        (refundDraft ? refundDraft.description || this.data.description : this.data.description),
      evidenceNote:
        (supportForm && supportForm.evidenceNote) ||
        (refundDraft ? refundDraft.evidenceNote || this.data.evidenceNote : this.data.evidenceNote),
      evidenceImages:
        (supportForm && Array.isArray(supportForm.evidenceImages) && supportForm.evidenceImages) ||
        (refundDraft ? refundDraft.evidenceImages || [] : this.data.evidenceImages)
    });
  },

  consumePendingSupportForAuth() {
    if (typeof app.consumePendingAuthDraft !== 'function') return null;
    return app.consumePendingAuthDraft('upload-support-evidence') || app.consumePendingAuthDraft('submit-support-ticket');
  },

  preserveSupportForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function') return;
    app.setPendingAuthDraft(action, {
      supportForm: {
        mode: this.data.mode,
        typeIndex: this.data.typeIndex,
        typeText: this.data.typeText,
        contact: this.data.contact,
        description: this.data.description,
        evidenceNote: this.data.evidenceNote,
        evidenceImages: (this.data.evidenceImages || []).slice(0)
      },
      orderId: this.data.order && this.data.order.id
    });
  },

  appendSupportEvidenceImages(urls) {
    if (!Array.isArray(urls) || !urls.length) return;
    this.setData({ evidenceImages: this.data.evidenceImages.concat(urls).slice(0, 6) });
  },

  onTypeChange(event) {
    const index = Number(event.detail.value);
    this.setData({ typeIndex: index, typeText: this.data.typeOptions[index] });
  },

  onContactInput(event) {
    this.setData({ contact: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ description: event.detail.value });
  },

  onEvidenceInput(event) {
    this.setData({ evidenceNote: event.detail.value });
  },

  chooseEvidenceImages() {
    runWithPrivacy(() => {
      wx.chooseMedia({
        count: 3,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: async (result) => {
          const files = result.tempFiles || [];
          let failedCount = 0;
          for (const file of files) {
            try {
              const record = await uploadLocalFile(file.tempFilePath, {
                userId: app.globalData.userId,
                kind: 'supportEvidence'
              });
              this.appendSupportEvidenceImages([record.url]);
            } catch (error) {
              failedCount += 1;
              if (promptLoginRequired(error, {
                action: 'upload-support-evidence',
                title: '登录后上传凭证'
              })) {
                this.preserveSupportForAuth('upload-support-evidence');
                return;
              }
            }
          }
          if (failedCount) {
            wx.showToast({ title: toUserMessage(new Error('凭证上传失败'), '部分凭证上传失败，请重试'), icon: 'none' });
          }
        }
      });
    }, '请先同意隐私保护指引再上传售后凭证');
  },

  async submitTicket() {
    if (this.data.submitting) return;
    if (this.data.mode === 'refund' || this.data.typeText === '退款协商') {
      this.preserveSupportForAuth('submit-support-ticket');
      this.showFormalRefundGuide();
      return;
    }
    const description = this.data.description.trim();
    const contact = this.data.contact.trim();
    if (!description || !contact) {
      wx.showToast({ title: '请填写问题和联系方式', icon: 'none' });
      return;
    }
    const ticketInput = {
      orderId: this.data.order ? this.data.order.id : '未关联订单',
      userId: app.globalData.userId,
      type: this.data.typeText,
      contact,
      description,
      evidenceNote: this.data.evidenceNote.trim() || (this.data.evidenceImages.length ? this.data.evidenceImages.join('；') : '暂无补充凭证说明')
    };
    this.setData({ submitting: true });
    try {
      const ticket = await request('/public/support-tickets', {
        method: 'POST',
        data: ticketInput
      });
      app.globalData.supportTickets = [ticket].concat(app.globalData.supportTickets || []);
      this.setData({
        tickets: app.globalData.supportTickets,
        description: '',
        evidenceNote: '',
        evidenceImages: [],
        mode: 'support'
      });
      app.globalData.pendingRefundDraft = null;
      wx.showToast({ title: '已提交售后' });
    } catch (error) {
      wx.showModal({
        title: '提交失败',
        content: toUserMessage(error, '售后材料提交失败，请稍后重试。'),
        showCancel: false
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  showFormalRefundGuide() {
    wx.showModal({
      title: '请从订单页申请退款',
      content: '正式退款需要关联订单、金额和支付渠道。这里可以继续提交普通售后线索；退款申请请进入“我的订单”后选择对应订单提交。',
      cancelText: '提交线索',
      confirmText: '去订单',
      success: (result) => {
        if (result.confirm) {
          this.goOrders();
          return;
        }
        this.setData({
          mode: 'support',
          typeIndex: 0,
          typeText: '订单沟通',
        });
      }
    });
  },

  goOrders() {
    app.globalData.accountRole = 'player';
    wx.navigateTo({ url: '/pages/orders/orders' });
  },

  openRefundGuide() {
    this.goOrders();
  }
});
