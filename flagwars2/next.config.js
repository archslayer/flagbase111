/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  reactStrictMode: true,
  // Chrome extension'ları için allowedDevOrigins ayarı
  allowedDevOrigins: ['chrome-extension://onhogfjeacnfoofkfgppdlbmlmnplgbn'],
  // Walletconnect ve Metamask SDK'nın Node-only/React-Native parçalarını no-op et
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
};
module.exports = nextConfig;
