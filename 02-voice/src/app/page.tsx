"use client";

import { useRef, useState } from "react";
import {
  RealtimeAgent,
  RealtimeItem,
  RealtimeSession,
  tool,
  TransportEvent,
} from "@openai/agents/realtime";
import { addToMemory, getSessionToken } from "./server/token";
import z from "zod";

const getWeather = tool({
  name: "getWeather",
  description: "Get the weather in a given location",
  parameters: z.object({
    location: z.string(),
  }),
  execute: async ({ location }) => {
    return `The weather in ${location} is sunny`;
  },
});

const getStockPrice = tool({
  name: "getStockPrice",
  description: "Get the price of a given stock",
  parameters: z.object({
    stock: z.string(),
  }),
  execute: async ({ stock }) => {
    return `The price of ${stock} is $100`;
  },
});

// 先声明主 agent，稍后设置 handoffs
const agent = new RealtimeAgent({
  name: "Voice Agent",
  instructions:
    "You are a voice agent that can answer questions and help with tasks. When users want to switch topics or need help with different areas, you can hand them off to specialists.",
  handoffs: [], // 稍后设置
});

const weatherAgent = new RealtimeAgent({
  name: "Weather Agent",
  instructions:
    "Talk with a New York accent. You are an expert in weather. When users want to ask about other topics like stocks, or want to return to general assistance, hand them back to the main agent.",
  handoffDescription: "This agent is an expert in weather",
  tools: [getWeather],
  handoffs: [agent], // 可以回到主 agent
});

const stockAgent = new RealtimeAgent({
  name: "Stock Agent",
  instructions:
    "You are an expert in stocks. When users want to ask about other topics like weather, or want to return to general assistance, hand them back to the main agent.",
  handoffDescription: "This agent is an expert in stock prices",
  tools: [getStockPrice],
  handoffs: [agent, weatherAgent], // 可以回到主 agent 或切换到天气 agent
});

// 现在设置主 agent 的 handoffs
agent.handoffs = [weatherAgent, stockAgent];

// Function to store chat history to memory
async function storeChatHistoryToMemory(
  history: RealtimeItem[],
  userId: string = "default_user"
) {
  console.log("saving history to memory");
  console.log(history);
  try {
    // Convert RealtimeItem history to mem0ai message format
    const messages = history
      .filter((item) => item.type === "message")
      .map((item) => {
        // Extract content from the content array
        let content = "";
        if (Array.isArray(item.content)) {
          // Handle different content types
          content = item.content
            .map((contentItem) => {
              if (contentItem.type === "input_audio" && contentItem.transcript) {
                return contentItem.transcript;
              } else if (contentItem.type === "audio" && contentItem.transcript) {
                return contentItem.transcript;
              } else if (contentItem.type === "text") {
                return contentItem.text;
              }
              return "";
            })
            .filter(Boolean)
            .join(" ");
        } else if (typeof item.content === "string") {
          content = item.content;
        }
        
        return {
          role: item.role as "user" | "assistant",
          content: content || `[${item.role} message]`,
        };
      })
      .filter((msg) => msg.content.trim().length > 0);
    
    console.log(messages);
    if (messages.length > 0) {
      const result = await addToMemory(messages, userId);
      if (result.success) {
        console.log("Chat history stored to memory successfully");
      } else {
        console.error("Failed to store chat history:", result.error);
      }
    }
  } catch (error) {
    console.error("Error storing chat history to memory:", error);
  }
}

export default function Home() {
  const session = useRef<RealtimeSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<RealtimeItem[]>([]);

  async function onConnect() {
    if (connected) {
      // Store chat history to memory before disconnecting
      await storeChatHistoryToMemory(history);
      setConnected(false);
      session.current?.close();
    } else {
      const token = await getSessionToken();
      session.current = new RealtimeSession(agent, {
        model: "gpt-4o-realtime-preview-2025-06-03",
      });
      session.current.on("transport_event", (event) => {
        // This event provides high-level transport status information.
        console.log("High-level transport event:", event);
      });

      // For more granular tracking of the conversation and agent's activities,
      // you can listen to all events on the transport layer. This gives you
      // a detailed view of everything happening, such as speech-to-text results,
      // audio generation, and agent state changes.
      session.current.transport.on("*", (event: TransportEvent) => {
        console.log(`Detailed event:`, event);
      });

      session.current.on("history_updated", (history) => {
        // This event is best for tracking the user-facing conversation history.
        setHistory(history);
      });
      session.current.on(
        "tool_approval_requested",
        async (_context, _agent, approvalRequest) => {
          prompt("Approve or deny the tool call?");
          session.current?.approve(approvalRequest.approvalItem);
        }
      );
      await session.current.connect({
        apiKey: token,
      });
      setConnected(true);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Voice Agent Demo</h1>
      <button
        onClick={onConnect}
        className="bg-black text-white p-2 rounded-md hover:bg-gray-800 cursor-pointer"
      >
        {connected ? "Disconnect" : "Connect"}
      </button>
      <ul>
        {history
          .filter((item) => item.type === "message")
          .map((item) => (
            <li key={item.itemId}>
              {item.role}: {JSON.stringify(item.content)}
            </li>
          ))}
      </ul>
    </div>
  );
}
