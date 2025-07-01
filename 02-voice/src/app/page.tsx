"use client";

import { useRef, useState, useEffect } from "react";
import {
  RealtimeAgent,
  RealtimeItem,
  RealtimeSession,
  tool,
  TransportEvent,
} from "@openai/agents-realtime";
import { addToMemory, getSessionToken } from "./server/token";
import z from "zod";
import { runDailyDataParser } from "./server/AIs";
import { EventEmitter } from "events";

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

// 用户数据存储
let collectedUserData: Record<string, string> = {};
let currentQuestionIndex = 0;

const questions = [
  { key: "name", question: "What's your full name?" },
  { key: "age", question: "How old are you?" },
  { key: "email", question: "What's your email address?" },
  { key: "phone", question: "What's your phone number?" },
  { key: "city", question: "What city do you live in?" },
];

// 重置数据收集状态
const resetDataCollection = () => {
  collectedUserData = {};
  currentQuestionIndex = 0;
};

// 数据收集工具
const recordUserData = tool({
  name: "recordUserData",
  description: "Record user data during the interview process",
  parameters: z.object({
    field: z.string().describe("The field name (e.g., 'name', 'age', 'email')"),
    value: z.string().describe("The user's response"),
    isComplete: z.boolean().describe("Whether all data collection is complete"),
  }),
  execute: async ({ field, value, isComplete }) => {
    // 保存数据
    collectedUserData[field] = value;
    console.log(`Recording ${field}: ${value}`);
    console.log("Current collected data:", collectedUserData);

    if (isComplete) {
      // 触发数据传输给 parse agent
      console.log("Data collection complete! Sending to parse agent...");

      // 调用 parse agent
      const structuredData = await sendToParseAgent(collectedUserData);

      return `Data collection completed successfully! Here's what I collected: ${JSON.stringify(
        collectedUserData
      )}. The information has been processed and structured.`;
    }

    // 移动到下一个问题
    currentQuestionIndex++;

    if (currentQuestionIndex < questions.length) {
      const nextQuestion = questions[currentQuestionIndex];
      return `Recorded ${field}. Now, ${nextQuestion.question}`;
    }

    return `Recorded ${field}. Continue with the next question.`;
  },
});

// 获取当前问题的工具
const getCurrentQuestion = tool({
  name: "getCurrentQuestion",
  description: "Get the current question to ask the user",
  parameters: z.object({}),
  execute: async () => {
    if (
      currentQuestionIndex >= questions.length &&
      Object.keys(collectedUserData).length === questions.length
    ) {
      return "All questions have been asked.";
    } else if (Object.keys(collectedUserData).length < questions.length) {
      return ` The user has not answered all questions. Ask: "${questions[currentQuestionIndex].question}"`;
    } else {
      return "All questions have been asked.";
    }
  },
});

const getFinalDailyData = tool({
  name: "getFinalDailyData",
  description:
    "Get the final daily data from the user after all questions are answered",
  parameters: z.object({}),
  execute: async () => {
    console.log("getFinalDailyData called with data:", collectedUserData);

    // 确保有数据
    if (Object.keys(collectedUserData).length === 0) {
      console.error("No collected data found!");
      return "Error: No data has been collected yet.";
    }

    // 调用解析 agent 获取结构化数据
    const parsedData = await runDailyDataParser(
      JSON.stringify(collectedUserData)
    );

    // 现在可以安全地重置数据了
    resetDataCollection();

    return parsedData;
  },
});

// 模拟 parse agent 的处理
async function sendToParseAgent(rawData: Record<string, string>) {
  // 这里应该调用你的 parse agent
  // 现在只是模拟处理
  console.log("Sending to parse agent:", rawData);

  // 模拟结构化输出
  const structuredData = {
    personal_info: {
      full_name: rawData.name,
      age: parseInt(rawData.age) || 0,
      contact: {
        email: rawData.email,
        phone: rawData.phone,
      },
      location: rawData.city,
    },
    collected_at: new Date().toISOString(),
    status: "processed",
  };

  return structuredData;
}

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

// 数据收集 Agent（改进版）
const dataCollectionAgent = new RealtimeAgent({
  name: "Data Collection Agent",
  instructions: `
    You are a friendly data collection agent. Your job is to collect user information through a structured interview.
    
    WORKFLOW:
    1. When you start, say greeting to the user, tell the user that you need to collect daily data for them.
    2. If the user is ready, ask from the first question
    3. Ask the question and wait for the user's response
    4. Use recordUserData to save their answer
    5. If the user is not ready, ask the user if they are ready to start
    6. The recordUserData tool will tell you what to ask next
    7. Continue until all questions are completed
    8. When all questions are completed, call getFinalDailyData tool
    
    QUESTION SEQUENCE (handled automatically by tools):
    1. Full name
    2. Age  
    3. Email address
    4. Phone number
    5. City
    
    IMPORTANT RULES:
    - Ask ONE question at a time
    - Wait for the user's response before proceeding
    - Use recordUserData after each response
    - Be conversational and friendly
    - If a user gives an unclear answer, ask for clarification
    - While calling getFinalDailyData tool, tell user to sit tight and wait for the data to be processed.
    
    START BY:Greeting the user, then ask user if they are ready to start.
  `,
  handoffDescription: "Collects user data through structured questions",
  tools: [recordUserData, getFinalDailyData],
  handoffs: [agent], // 可以回到主 agent
});

// 现在设置主 agent 的 handoffs
agent.handoffs = [weatherAgent, stockAgent, dataCollectionAgent];

export default function Home() {
  const session = useRef<RealtimeSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const [userData, setUserData] = useState<any>(null);

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
      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">
          Try these commands:
        </h3>
        <ul className="text-blue-700 space-y-1">
          <li>• "What's the weather in Tokyo?" (Weather Agent)</li>
          <li>• "What's Apple's stock price?" (Stock Agent)</li>
          <li>
            • "I want to register" or "Collect my information" (Data Collection
            Agent)
          </li>
        </ul>
      </div>
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
      {userData && (
        <div className="mt-4 p-4 bg-gray-100 rounded-lg">
          <h3 className="font-semibold mb-2">Parsed User Data:</h3>
          <pre className="bg-white p-2 rounded overflow-auto">
            {JSON.stringify(userData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}