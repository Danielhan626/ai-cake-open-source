import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function walkFiles(dir, predicate) {
  const root = new URL(`../${dir}`, import.meta.url).pathname;
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        stack.push(fullPath);
      } else if (predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertHandlerCoverage(wxmlPath) {
  const jsPath = wxmlPath.replace(/\.wxml$/, '.js');
  const wxml = readFileSync(wxmlPath, 'utf8');
  const js = readFileSync(jsPath, 'utf8');
  const handlers = [
    ...wxml.matchAll(/(?:bind|catch)(?:tap|change|input|confirm|submit|getphonenumber|chooseavatar)="([^"]+)"/g),
  ].map((match) => match[1]);
  const uniqueHandlers = [...new Set(handlers)];
  for (const handler of uniqueHandlers) {
    const fnPattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(handler)}\\s*\\(`);
    const propPattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(handler)}\\s*:`);
    assert(
      fnPattern.test(js) || propPattern.test(js),
      `${wxmlPath} references missing handler ${handler} in ${jsPath}`,
    );
  }
}

const designJs = readText('apps/miniprogram/pages/design/design.js');
const designWxml = readText('apps/miniprogram/pages/design/design.wxml');
const resultJs = readText('apps/miniprogram/pages/result/result.js');
const resultWxml = readText('apps/miniprogram/pages/result/result.wxml');
const demandJs = readText('apps/miniprogram/pages/demand/demand.js');
const demandWxml = readText('apps/miniprogram/pages/demand/demand.wxml');
const quotesJs = readText('apps/miniprogram/pages/quotes/quotes.js');
const quotesWxml = readText('apps/miniprogram/pages/quotes/quotes.wxml');
const supportJs = readText('apps/miniprogram/pages/support/support.js');
const supportWxml = readText('apps/miniprogram/pages/support/support.wxml');
const onboardingJs = readText('apps/miniprogram/pages/onboarding/onboarding.js');
const onboardingWxml = readText('apps/miniprogram/pages/onboarding/onboarding.wxml');
const bakersJs = readText('apps/miniprogram/pages/bakers/bakers.js');
const bakersWxml = readText('apps/miniprogram/pages/bakers/bakers.wxml');
const worksWxml = readText('apps/miniprogram/pages/works/works.wxml');

const miniProgramWxmlFiles = walkFiles('apps/miniprogram/pages', (file) => file.endsWith('.wxml'));
for (const wxmlPath of miniProgramWxmlFiles) {
  assertHandlerCoverage(wxmlPath);
}

assert(
  designWxml.includes('generate-action" loading="{{loading}}" disabled="{{loading}}"'),
  'design generate button must prevent repeat submits while loading',
);
assert(designJs.includes('if (this.data.loading) return;'), 'design generate must early-return while loading');

assert(
  resultWxml.includes('<button class="result-tab') && !/<view\s+class="result-tab(?:\s|\{|"')/.test(resultWxml),
  'result page tabs must be real buttons instead of bare views',
);
assert(
  /<button[\s\S]*class="[^"]*recharge-card/.test(resultWxml) && /<button[\s\S]*class="[^"]*switch-row/.test(resultWxml),
  'result page interactive cards and adjustment toggle must be real buttons',
);
assert(
  resultWxml.includes('disabled="{{loading}}" bindtap="publishDemand"'),
  'result demand publish button must disable during submission',
);
assert(resultJs.includes('if (this.data.loading) return;'), 'result write actions must guard against repeated loading clicks');
assert(
  resultJs.includes('if (this.data.publishWorkLoading) return;'),
  'result publish-work action must guard against repeated loading clicks',
);

assert(
  demandWxml.includes('<button class="switch-row') &&
    /disabled="\{\{publishing(?: \|\| !demandForm\.productionNoticeAccepted)?\}\}"/.test(demandWxml) &&
    demandWxml.includes('disabled="{{loading}}"'),
  'demand page adjustment toggle and submit buttons must be real buttons with disabled guards',
);
assert(demandJs.includes('if (this.data.publishing) return;'), 'demand publish action must guard repeat submission');
assert(demandJs.includes('if (this.data.loading) return;'), 'demand quote action must guard repeat submission');

assert(
  quotesWxml.includes('loading="{{loading}}" disabled="{{loading}}" bindtap="pay"'),
  'quotes page pay action must disable while confirming',
);
assert(quotesJs.includes('if (this.data.loading) return;'), 'quotes pay action must guard repeat submission');

assert(
  supportWxml.includes('bindtap="openRefundGuide"') && !supportWxml.includes("{{mode === 'refund' ? '查看退款入口' : '提交售后线索'}}"),
  'support refund CTA must use a dedicated refund-entry handler instead of the generic submit handler',
);
assert(
  supportWxml.includes('loading="{{submitting}}" disabled="{{submitting}}" bindtap="submitTicket"'),
  'support submit CTA must disable while submitting',
);
assert(supportJs.includes('if (this.data.submitting) return;'), 'support submit action must guard repeat submission');
assert(supportJs.includes('openRefundGuide()'), 'support page must expose a dedicated refund-entry handler');

assert(
  onboardingWxml.includes('loading="{{submitting}}" disabled="{{submitting}}" bindtap="submitApplication"'),
  'onboarding submit CTA must disable while submitting',
);
assert(onboardingJs.includes('if (this.data.submitting) return;'), 'onboarding submit must guard repeat submission');

assert(
  bakersWxml.includes('bindtap="openDemand"') && bakersWxml.includes('bindtap="openQuoteDemand"'),
  'baker marketplace must separate 看需求 and 去报价 handlers',
);
assert(bakersJs.includes('openQuoteDemand(event)'), 'baker marketplace must expose a dedicated quote-entry handler');

assert(
  worksWxml.includes('<button class="inspiration-card'),
  'works inspiration task cards must be real buttons for reliable taps',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      gate: 'miniprogram-button-integrity',
      checkedPages: miniProgramWxmlFiles.length,
    },
    null,
    2,
  ),
);
