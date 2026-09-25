const config = require('../config/index');

const SUPPORTED_CITIES = [
  { city: '长治', district: '潞州区', latitude: 36.195, longitude: 113.116 },
  { city: '太原', district: '小店区', latitude: 37.8706, longitude: 112.5489 },
  { city: '北京', district: '朝阳区', latitude: 39.9042, longitude: 116.4074 },
  { city: '上海', district: '黄浦区', latitude: 31.2304, longitude: 121.4737 },
  { city: '广州', district: '天河区', latitude: 23.1291, longitude: 113.2644 },
  { city: '深圳', district: '南山区', latitude: 22.5431, longitude: 114.0579 },
  { city: '杭州', district: '西湖区', latitude: 30.2741, longitude: 120.1551 },
  { city: '成都', district: '武侯区', latitude: 30.5728, longitude: 104.0668 },
  { city: '西安', district: '雁塔区', latitude: 34.3416, longitude: 108.9398 },
  { city: '郑州', district: '金水区', latitude: 34.7466, longitude: 113.6254 },
];

function getSupportedCities() {
  return SUPPORTED_CITIES.map((item) => item.city);
}

function getCityProfile(city) {
  return SUPPORTED_CITIES.find((item) => item.city === city) || SUPPORTED_CITIES[0];
}

function resolveCityFromLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return getCityProfile(config.pilotCity);
  }

  return SUPPORTED_CITIES
    .map((item) => {
      const latDelta = lat - item.latitude;
      const lngDelta = lng - item.longitude;
      return {
        item,
        distance: Math.sqrt(latDelta * latDelta + lngDelta * lngDelta),
      };
    })
    .sort((a, b) => a.distance - b.distance)[0].item;
}

function setActiveCity(app, city, source, location) {
  const profile = getCityProfile(city);
  const nextLocation = Object.assign(
    {
      city: profile.city,
      district: profile.district,
      source: source || '用户选择',
      latitude: null,
      longitude: null,
    },
    location || {},
    {
      city: profile.city,
      district: profile.district,
      source: source || (location && location.source) || '用户选择',
    },
  );

  app.globalData.city = profile.city;
  app.globalData.district = profile.district;
  app.globalData.orderCity = profile.city;
  app.globalData.orderDistrict = profile.district;
  app.globalData.location = nextLocation;
  return nextLocation;
}

function setOrderCity(app, city) {
  const profile = getCityProfile(city);
  app.globalData.orderCity = profile.city;
  app.globalData.orderDistrict = profile.district;
  return {
    city: profile.city,
    district: profile.district,
  };
}

module.exports = {
  SUPPORTED_CITIES,
  getSupportedCities,
  getCityProfile,
  resolveCityFromLocation,
  setActiveCity,
  setOrderCity,
};
