/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  async redirects() {
    return [
      { source: '/leads', destination: '/kanban', permanent: true },
      { source: '/leads/:path*', destination: '/kanban', permanent: true },
      { source: '/servicos', destination: '/', permanent: true },
      { source: '/servicos/:path*', destination: '/', permanent: true },
      { source: '/projetos', destination: '/', permanent: true },
      { source: '/projetos/:path*', destination: '/', permanent: true },
      { source: '/whatsapp-connect', destination: '/conexoes', permanent: true },
      { source: '/whatsapp-connect/:path*', destination: '/conexoes', permanent: true },
    ];
  },
};
module.exports = nextConfig;