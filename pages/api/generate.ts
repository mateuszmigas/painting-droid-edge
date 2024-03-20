import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

const env = {
  STABILITY_AI_API_KEY: process.env.STABILITY_AI_API_KEY,
};

const ratelimit = new Ratelimit({
  redis: kv,
  // 5 requests from the same IP in 10 seconds
  limiter: Ratelimit.slidingWindow(5, "10 s"),
});

export const config = {
  runtime: "edge",
};

export const createRequest = (
  prompt: string,
  size: { width: number; height: number }
) => {
  const body = {
    steps: 10,
    width: size.width,
    height: size.height,
    seed: 0,
    cfg_scale: 5,
    samples: 1,
    text_prompts: [{ text: prompt, weight: 1 }],
  };
  return fetch(
    "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${env.STABILITY_AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    }
  );
};

export default async function handler(request: NextRequest) {
  const ip = request.ip ?? "127.0.0.1";

  //remove
  // if (request.method === "OPTIONS") {
  //   return new Response("", { status: 200 });
  // }

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

  const { prompt, size } = await request.json();
  const response = await createRequest(prompt, size);

  if (response.status === 429) {
    return new Response("Rate limit exceeded. Please try again later.", {
      status: response.status,
      headers,
    });
  }

  if (!response.ok) {
    return new Response("Failed to fetch data from external API.", {
      status: response.status,
      headers,
    });
  }

  return new Response(response.body, {
    status: 200,
    headers,
  });
}

