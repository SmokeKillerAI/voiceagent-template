"use server"

import { z } from "zod";
import { zodResponseFormat } from 'openai/helpers/zod';
import openai from "./client";

// 定义结构化输出的 schema
const DailyDataSchema = z.object({
  daily_cigarettes: z.number().describe("The number of cigarettes smoked today"),
  daily_sleep: z.number().describe("The number of hours slept last night"),
  daily_feeling: z.string().describe("How the user felt today"),
  daily_reason: z.string().describe("The reason for smoking today"),
});

// 使用类型推断获取 schema 的类型
type DailyData = z.infer<typeof DailyDataSchema>;

export const runDailyDataParser = async(input: string): Promise<DailyData | null> => {
  console.log("Running daily data parser with input:", input);
  
  try {
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a helpful assistant that extracts and structures user data from text. Extract the information and format it according to the schema. Use today's date for the date field." 
        },
        { 
          role: "user", 
          content: `Please extract and structure the following data: ${input}` 
        }
      ],
      response_format: zodResponseFormat(DailyDataSchema, "daily_data"),
      temperature: 0.0, 
    });

    const message = completion.choices[0]?.message;
    
    if (message?.parsed) {
      console.log("Successfully parsed data:", message.parsed);
      return message.parsed;
    } else if (message?.refusal) {
      console.error("Model refused to parse:", message.refusal);
      return null;
    } else {
      console.error("No parsed data in response");
      return null;
    }
  } catch (error) {
    console.error("Error parsing daily data:", error);
    return null;
  }
}
