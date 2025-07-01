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
import { runDailyDataParserAgent } from "./server/agent";
import { EventEmitter } from "events";

// 创建全局事件发射器用于状态通信
const dataEventEmitter = new EventEmitter();
dataEventEmitter.setMaxListeners(50);

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
		const parsedData = await runDailyDataParserAgent(
			JSON.stringify(collectedUserData)
		);

		// 发射解析后的数据事件
		dataEventEmitter.emit("parsedUserData", parsedData);

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
	handoffs: [], // 稍后设置
});

export default function Home() {
	const session = useRef<RealtimeSession | null>(null);
	const [connected, setConnected] = useState(false);
	const [history, setHistory] = useState<RealtimeItem[]>([]);
	const [userData, setUserData] = useState<any>(null); // 改为 any 以接收解析后的结构化数据

	// 监听解析后的用户数据
	useEffect(() => {
		const handleParsedUserData = (parsedData: any) => {
			console.log("Received parsed user data:", parsedData);
			setUserData(parsedData);
		};

		dataEventEmitter.on("parsedUserData", handleParsedUserData);

		// 清理函数
		return () => {
			dataEventEmitter.off("parsedUserData", handleParsedUserData);
		};
	}, []);

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
