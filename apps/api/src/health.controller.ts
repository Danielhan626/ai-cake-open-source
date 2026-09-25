import { Controller, Get } from '@nestjs/common';
import { requiredString } from './utils';
import { listWechatPayConfigProblems } from './payments/wechat-pay.utils';

@Controller()
export class HealthController {
  private runtimeSignals() {
    const paymentProvider = requiredString(process.env.PAY_PROVIDER, 'mock');
    const wechatLoginConfigured = Boolean(
      requiredString(process.env.WECHAT_APP_ID) && requiredString(process.env.WECHAT_APP_SECRET),
    );
    const wechatPayConfigured = paymentProvider === 'wechat' ? listWechatPayConfigProblems().length === 0 : false;
    return {
      wechatLoginConfigured,
      paymentProvider,
      wechatPayConfigured,
      locationMode: process.env.LOCATION_MODE || 'optional_auto_city',
    };
  }

  private releaseInfo() {
    return {
      releaseId: process.env.APP_RELEASE_ID || '',
      appEnv: process.env.APP_ENV || process.env.NODE_ENV || 'development',
    };
  }

  @Get()
  root() {
    return {
      name: 'ruyi-fruit-cake-api',
      status: 'ok',
      city: '长治',
      ...this.releaseInfo(),
      ...this.runtimeSignals(),
    };
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      ...this.releaseInfo(),
      ...this.runtimeSignals(),
    };
  }
}
