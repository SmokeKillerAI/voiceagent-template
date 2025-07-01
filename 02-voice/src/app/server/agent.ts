"use server"

import { z } from "zod";
import { Agent, tool, run } from "@openai/agents"

// 定义结构化输出的 schema
const DailyDataSchema = z.object({
  date: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().regex(/^\d{10}$/),
  address: z.string(),
  city: z.string(),
})

const dailyDataParserAgent = new Agent({
  name: "daily-data-parser",
  instructions: "You are a helpful assistant that parses daily data from a text file to a JSON object, do not adjust the input or add any other text to the output.",
  model: "gpt-4o-mini",
  outputType: DailyDataSchema,
  modelSettings: {
    temperature: 0.0  // 设置温度为 0 以获得更确定的输出
  }
})

export const runDailyDataParserAgent = async(input: string) => {
  console.log("Running daily data parser agent with input:", input);
  const result = await run(dailyDataParserAgent, input);
  return result.finalOutput;
}
