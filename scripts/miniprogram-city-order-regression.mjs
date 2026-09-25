import { existsSync, readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function exists(path) {
  return existsSync(new URL(`../${path}`, import.meta.url));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const requiredFiles = [
  'apps/miniprogram/utils/city.js',
  'apps/miniprogram/app.js',
  'apps/miniprogram/pages/home/home.js',
  'apps/miniprogram/pages/home/home.wxml',
  'apps/miniprogram/pages/result/result.js',
  'apps/miniprogram/pages/result/result.wxml',
  'apps/miniprogram/pages/demand/demand.js',
  'apps/miniprogram/pages/demand/demand.wxml',
  'apps/miniprogram/pages/bakers/bakers.js',
  'apps/miniprogram/pages/bakers/bakers.wxml',
];

for (const file of requiredFiles) {
  assert(exists(file), `${file} must exist`);
}

const cityUtil = readText('apps/miniprogram/utils/city.js');
const appJson = JSON.parse(readText('apps/miniprogram/app.json'));
const appJs = readText('apps/miniprogram/app.js');
const homeJs = readText('apps/miniprogram/pages/home/home.js');
const homeWxml = readText('apps/miniprogram/pages/home/home.wxml');
const resultJs = readText('apps/miniprogram/pages/result/result.js');
const resultWxml = readText('apps/miniprogram/pages/result/result.wxml');
const demandJs = readText('apps/miniprogram/pages/demand/demand.js');
const demandWxml = readText('apps/miniprogram/pages/demand/demand.wxml');
const bakersJs = readText('apps/miniprogram/pages/bakers/bakers.js');
const bakersWxml = readText('apps/miniprogram/pages/bakers/bakers.wxml');
const packageJson = readText('package.json');

assert(cityUtil.includes('SUPPORTED_CITIES'), 'city util must expose supported cities');
assert(cityUtil.includes('setOrderCity'), 'city util must support changing order city without overwriting phone location city');
assert(appJson.permission?.['scope.userFuzzyLocation']?.desc, 'app.json must declare optional fuzzy location permission');
assert((appJson.requiredPrivateInfos || []).includes('getFuzzyLocation'), 'app.json must declare getFuzzyLocation private interface');
assert(appJs.includes('supportedCities'), 'globalData must expose supportedCities');
assert(appJs.includes('orderCity'), 'globalData must persist orderCity');
assert(appJs.includes('orderDistrict'), 'globalData must persist orderDistrict');
assert(homeJs.includes('wx.getFuzzyLocation'), 'home page must support optional fuzzy auto-location');
assert(homeJs.includes('resolveCityFromLocation'), 'home page must resolve phone coordinates into supported cities');
assert(homeJs.includes('ensureLocatedOnOpen'), 'home page must try optional auto-location on open');
assert(homeJs.includes('locateCurrentCity'), 'home page must expose a manual re-location action');
assert(homeJs.includes('setOrderCity'), 'home order-city picker must use setOrderCity instead of overwriting active phone city');
assert(!/onOrderCityChange[\s\S]*?setActiveCity\(app,\s*city,\s*'用户选择'/.test(homeJs), 'home order-city picker must not overwrite active location city');
assert(homeJs.includes('onOrderCityChange'), 'home page must support manual city selection');
assert(homeWxml.includes('range="{{supportedCities}}"'), 'home page must render a supported-city picker');
assert(homeWxml.includes('重新定位'), 'home page must expose a relaunchable location action');
assert(homeWxml.includes('为朋友定蛋糕'), 'home copy must explain cross-city ordering');
assert(resultJs.includes('cityOptions'), 'result demand form must expose cityOptions');
assert(resultJs.includes('onOrderCityChange'), 'result page must allow changing order city');
assert(resultJs.includes('form.orderCity'), 'result demand creation must use order city from the form');
assert(resultWxml.includes('订单城市'), 'result page must show order city field');
assert(resultWxml.includes('range="{{cityOptions}}"'), 'result page city picker must be wired');
assert(demandJs.includes('cityOptions'), 'same-style demand page must expose cityOptions');
assert(demandJs.includes('form.orderCity'), 'same-style demand creation must use order city from the form');
assert(demandJs.includes('resolveOrderCity'), 'same-style demand page must resolve the active order city before loading bakers');
assert(!demandJs.includes('/bakers?city=${app.globalData.city}'), 'same-style demand page must not load bakers from current city when ordering for another city');
assert(demandJs.includes('city: this.data.demand.city'), 'quote handoff order state must preserve the demand order city');
assert(demandWxml.includes('订单城市'), 'same-style demand page must show order city field');
assert(bakersJs.includes('activeMarketCity'), 'baker square must track active market city');
assert(bakersJs.includes('/bakers?city='), 'baker square must load bakers by selected city');
assert(bakersWxml.includes('{{activeMarketCity}}蛋糕师'), 'baker square copy must reflect selected city');
assert(packageJson.includes('miniprogram:city-order-regression'), 'package scripts must expose city/order regression');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      loop: 'optional-auto-city-cross-city-order',
      checkedFiles: requiredFiles.length,
    },
    null,
    2,
  ),
);
