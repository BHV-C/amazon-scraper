if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error("Set NEXT_PUBLIC_API_URL to the deployed FastAPI backend URL in Vercel project settings.");
}

const nextConfig = {};
export default nextConfig;
