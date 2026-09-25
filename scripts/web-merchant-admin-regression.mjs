import { readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const appTsx = readText('apps/web-preview/src/App.tsx');
const apiTs = readText('apps/web-preview/src/api.ts');
const typesTs = readText('apps/web-preview/src/types.ts');
const stylesCss = readText('apps/web-preview/src/styles.css');
const packageJson = readText('package.json');
const viteConfig = readText('apps/web-preview/vite.config.ts');

assert(typesTs.includes('export interface MerchantWorkbench'), 'web types must define MerchantWorkbench');
assert(typesTs.includes('export interface RefundRequest'), 'web types must define RefundRequest');
assert(apiTs.includes('merchantWorkbench'), 'web api must load merchant workbench');
assert(apiTs.includes('/admin/merchant-workbench'), 'web api must call GET /admin/merchant-workbench');
assert(apiTs.includes('createMerchantQuote'), 'web api must create merchant quotes');
assert(apiTs.includes('/admin/merchant-quotes'), 'web api must call POST /admin/merchant-quotes');
assert(apiTs.includes('updateRefundMediation'), 'web api must update refund negotiation notes');
assert(apiTs.includes('/admin/refunds/'), 'web api must call admin refund mediation endpoint');
assert(appTsx.includes('merchantWorkbench, setMerchantWorkbench'), 'admin dashboard must keep merchant workbench state');
assert(appTsx.includes("AdminSectionKey"), 'admin dashboard must define top-level admin sections');
assert(appTsx.includes("AdminPageKey"), 'admin dashboard must define secondary admin pages');
assert(appTsx.includes('adminSections'), 'admin dashboard must define hierarchical section navigation');
assert(appTsx.includes('currentSection, setCurrentSection'), 'admin dashboard must keep current top-level section state');
assert(appTsx.includes('currentPage, setCurrentPage'), 'admin dashboard must keep current secondary page state');
assert(appTsx.includes('admin-layout'), 'admin dashboard must render a two-level layout shell');
assert(appTsx.includes('admin-sidebar'), 'admin dashboard must render primary navigation');
assert(appTsx.includes('admin-subnav'), 'admin dashboard must render secondary page navigation');
assert(appTsx.includes('renderAdminPage'), 'admin dashboard must route content by secondary page');
assert(appTsx.includes('商家管理'), 'admin dashboard must have a merchant-management top-level section');
assert(appTsx.includes('商家资质审核'), 'admin dashboard must expose merchant qualification review as its own secondary page');
assert(appTsx.includes('待报价需求'), 'admin dashboard must render pending quote demand entry');
assert(appTsx.includes('提交报价'), 'admin dashboard must expose merchant quote action');
assert(appTsx.includes('订单履约'), 'admin dashboard must keep fulfillment entry');
assert(appTsx.includes('售后退款协商'), 'admin dashboard must render refund negotiation entry');
assert(appTsx.includes('记录协商'), 'admin dashboard must expose refund mediation action');
assert(appTsx.includes('healthCertificateUrl'), 'merchant qualification page must show health certificate');
assert(appTsx.includes('businessLicenseUrl'), 'merchant qualification page must show business license');
assert(appTsx.includes('foodPermitUrl'), 'merchant qualification page must show food permit');
assert(typesTs.includes('credentialFiles?: CredentialFile[]'), 'web baker type must keep resolved credential file metadata');
assert(apiTs.includes('openAdminUpload'), 'web api must expose protected admin upload opening');
assert(apiTs.includes('/admin/uploads/'), 'web api must call admin upload content endpoint');
assert(apiTs.includes('resolveApiBase'), 'web api must resolve API base dynamically');
assert(apiTs.includes("return origin;"), 'web api must use same-origin API base outside local dev');
assert(appTsx.includes('presentBakerCredentialFiles'), 'merchant qualification page must resolve credential file entries');
assert(appTsx.includes('查看材料'), 'merchant qualification page must expose credential preview action');
assert(stylesCss.includes('.credential-file-list'), 'web styles must include merchant credential list');
assert(viteConfig.includes("base: command === 'build' ? '/ops/' : '/'"), 'web build must target /ops/ base path for deployed admin UI');
assert(appTsx.includes('资质通过'), 'merchant qualification page must approve merchant credentials');
assert(appTsx.includes('资质需补充'), 'merchant qualification page must reject or request supplement for credentials');
assert(!appTsx.includes('健康证：已提交 · 营业执照：已提交'), 'web preview must not hard-code credential submission status');
assert(appTsx.includes("selectedBaker.reviewStatus === 'approved'"), 'web preview baker card must show platform review state');
assert(stylesCss.includes('.merchant-admin-list'), 'web styles must include merchant admin list');
assert(stylesCss.includes('.admin-layout'), 'web styles must include hierarchical admin layout');
assert(stylesCss.includes('.admin-sidebar'), 'web styles must include admin sidebar');
assert(stylesCss.includes('.admin-subnav'), 'web styles must include secondary admin navigation');
assert(stylesCss.includes('.admin-content'), 'web styles must include admin content area');
assert(packageJson.includes('web:merchant-admin-regression'), 'package scripts must expose web merchant admin regression');
assert(packageJson.includes('api:merchant-admin-regression'), 'package scripts must expose api merchant admin regression');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'merchant-admin',
    },
    null,
    2,
  ),
);
