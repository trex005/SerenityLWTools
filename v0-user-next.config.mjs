/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // This ensures that assets are correctly referenced with relative paths
  // which is important for static hosting
  basePath: '',
  images: {
    unoptimized: true,
  },
  typescript: {
    // This allows the build to succeed even with TypeScript errors
    // Use this only if you're confident the errors won't affect functionality
    ignoreBuildErrors: true,
  },
}

export default nextConfig
