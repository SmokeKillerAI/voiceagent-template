"use server";

import OpenAI from "openai";

export async function getSessionToken() {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const session = await openai.beta.realtime.sessions.create({
    model: "gpt-4o-mini-realtime-preview",
  });

  return session.client_secret.value;
};
export async function getMem0Token() {
  return process.env.MEM_API_KEY || "";
}

export async function addToMemory(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  userId: string = "default_user"
) {
  try {
    const MemoryClient = (await import("mem0ai")).default;
    const memoryClient = new MemoryClient({
      apiKey: process.env.MEM_API_KEY || "",
    });

    await memoryClient.add(messages, {
      user_id: userId,
      metadata: {
        session_type: "voice_agent",
        timestamp: new Date().toISOString(),
      },
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error storing chat history to memory:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}