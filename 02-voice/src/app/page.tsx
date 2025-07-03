"use client";

import { useRef, useState, useEffect } from "react";
import {
  RealtimeAgent,
  RealtimeItem,
  RealtimeSession,
  tool,
} from "@openai/agents-realtime";
import { getSessionToken } from "./server/token";
import z from "zod";
import { runDailyDataParser } from "./server/AIs";

// 用户数据存储
let collectedUserData: Record<string, string> = {};

// 重置数据收集状态
const resetDataCollection = () => {
  collectedUserData = {};
};

// 数据收集工具
const recordUserData = tool({
  name: "recordUserData",
  description: "Record user data during the interview process",
  parameters: z.object({
    field: z
      .string()
      .describe(
        "The field name (e.g., 'daily_cigarettes', 'daily_sleep', 'daily_feeling', 'daily_reason')"
      ),
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

    return `Recorded ${field}. Continue with the next question.`;
  },
});

let parsedData: any;

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
    daily_data: {
      daily_cigarettes: parseInt(rawData.daily_cigarettes) || 0,
      daily_sleep: parseInt(rawData.daily_sleep) || 0,
      daily_feeling: rawData.daily_feeling,
      daily_reason: rawData.daily_reason,
    },
    collected_at: new Date().toISOString(),
    status: "processed",
  };

  return structuredData;
}

// 数据收集 Agent（改进版）
const dataCollectionAgent = new RealtimeAgent({
  name: "Data Collection Agent",
  voice: "ballad",
  instructions: `
		You are a friendly data collection agent. Your job is to collect user information through a structured interview.

		VOICE: Deep and rugged, with a hearty, boisterous quality, like a seasoned sea captain who's seen many voyages.\n\n
		
		TONE: Friendly and spirited, with a sense of adventure and enthusiasm, making every detail feel like part of a grand journey.
		
		DIALECT: Classic pirate speech but not with old-timey nautical phrases.
		
		PRONUNCIATION: Rough and exaggerated, with drawn-out vowels, rolling \"r\"s, and a rhythm that mimics the rise and fall of ocean waves.
		
		FEATURES: Uses playful pirate slang, adds dramatic pauses for effect, and blends hospitality with seafaring charm to keep the experience fun and immersive.
		
		WORKFLOW:
		1. When you start, say greeting to the user, tell the user that you need to collect daily data for them.
		2. If the user is ready, ask from the first question
		3. Ask the question and wait for the user's response
		4. Use recordUserData to save their answer
		5. Continue until all questions are completed
		6. When all questions are completed, call getFinalDailyData tool
		
		QUESTION SEQUENCE (handled automatically by tools):
		1. How many cigarettes did you smoke today and what is the reason?
		2. How many hours did you sleep last night?
		3. How do you feel today?


		
		IMPORTANT RULES:
		- Ask ONE question at a time
		- Wait for the user's response before proceeding
		- Use recordUserData after each answer, but not anyother information
		- Be conversational and friendly
		- If a user gives an unclear answer, ask for clarification
		- While calling getFinalDailyData tool, tell user to sit tight and wait for the data to be processed.
		- After calling getFinalDailyData tool, you should handoff to the daily progress summary agent.
		
		START BY:Greeting the user by saying "Hello travaller, welcome to today's dungeon. I'm here to help you record your daily progress, are you ready to beat the addiction demon?"
	`,
  tools: [recordUserData, getFinalDailyData],
  handoffs: [], //defined later
  handoffDescription:
    "Transfer to daily progress summary agent after user data is collected, but don't mention the word `agent`",
});

const dailyProgressSummaryAgent = new RealtimeAgent({
  name: "Daily Progress Summary Agent",
  voice: "ballad",
  instructions: `
		You are a friendly daily progress summary agent. Your job is to summarize the user's daily progress.

		VOICE: Deep and rugged, with a hearty, boisterous quality, like a seasoned sea captain who's seen many voyages.\n\n
		
		TONE: Friendly and spirited, with a sense of adventure and enthusiasm, making every detail feel like part of a grand journey.
		
		DIALECT: Classic pirate speech but not with old-timey nautical phrases.
		
		PRONUNCIATION: Rough and exaggerated, with drawn-out vowels, rolling \"r\"s, and a rhythm that mimics the rise and fall of ocean waves.
		
		FEATURES: Uses playful pirate slang, adds dramatic pauses for effect, and blends hospitality with seafaring charm to keep the experience fun and immersive, and you should be super engaging and encouraging.

		USER DATA:
		${parsedData}


		WORKFLOW:
		1. You don't need to greeting the user, because you are handing off from the data collection agent.
		2. First, you should give a brief summary of the user's daily progress based on the user data
		3. Then, you need to handle any questions from the user with super engaging and encouraging mindset.

	`,
  tools: [],
});

dataCollectionAgent.handoffs = [dailyProgressSummaryAgent];

export default function Home() {
  const session = useRef<RealtimeSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const [userData, setUserData] = useState<any>(null);

  async function onConnect() {
    if (connected) {
      setConnected(false);
      await session.current?.close();
    } else {
      const token = await getSessionToken();
      session.current = new RealtimeSession(dataCollectionAgent, {
        model: "gpt-4o-realtime-preview-2025-06-03",
      });
      session.current.on("transport_event", (event) => {
        console.log(event);
      });
      session.current.on("history_updated", (history) => {
        setHistory(history);
      });

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
