/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdf-parse pulls in pdfjs; keep it external to avoid bundling issues
    serverComponentsExternalPackages: [
      "pdf-parse",
      "pdfjs-dist",
      "tesseract.js",
      "xlsx",
      "@ffmpeg-installer/ffmpeg",
      "fluent-ffmpeg",
    ],
  },
};

export default nextConfig;
