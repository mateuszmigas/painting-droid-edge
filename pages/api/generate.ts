import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";
import { getRandomImage, images } from "pages/images";

const ratelimit = new Ratelimit({
  redis: kv,
  // 5 requests from the same IP in 10 seconds
  limiter: Ratelimit.slidingWindow(5, "10 s"),
});

export const config = {
  runtime: "edge",
};

export default async function handler(request: NextRequest) {
  const ip = request.ip ?? "127.0.0.1";

  if (request.method === "OPTIONS") {
    return new Response("", { status: 200 });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
    });
  }

  const { limit, reset, remaining } = await ratelimit.limit(ip);

  const headers = {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": reset.toString(),
  };

  if (remaining < 1) {
    return new Response("Rate limit exceeded", {
      status: 429,
      headers,
    });
  }

  return new Response(
    JSON.stringify({
      artifacts: [{ base64: getRandomImage() }],
    }),
    {
      status: 200,
      headers,
    }
  );
}

