const configuredBackendUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

if (process.env.VERCEL && !configuredBackendUrl) {
  throw new Error("Set NEXT_PUBLIC_API_URL to the deployed FastAPI backend URL in Vercel project settings.");
}

const backendUrl = configuredBackendUrl
  ? `${/^https?:\/\//i.test(configuredBackendUrl) ? "" : "https://"}${configuredBackendUrl}`.replace(/\/$/, "")
  : "http://localhost:8000";

const nextConfig = {
  async rewrites() {
    return [{
      source: "/backend-api/:path*",
      destination: `${backendUrl}/:path*`,
    }];
  },
};
export default nextConfig;
