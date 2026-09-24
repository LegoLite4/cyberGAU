/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    const target = process.env.API_PROXY_TARGET || "http://127.0.0.1:4000";
    return [{ source: "/backend/:path*", destination: `${target}/:path*` }];
  },
};

module.exports = nextConfig;
