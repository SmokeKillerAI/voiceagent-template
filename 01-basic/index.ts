import { Agent, tool, run } from "@openai/agents";
import z from "zod";
import MemoryClient from 'mem0ai';

/**
 * Initialize Memory client with API key from environment variables
 * Requires MEM_API_KEY to be set in environment
 */
function initializeMemoryClient() {
  const apiKey = process.env.MEM_API_KEY;

  if (!apiKey) {
    throw new Error('MEM_API_KEY environment variable is required');
  }

  return new MemoryClient({ apiKey });
}

const memoryClient = initializeMemoryClient();

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

const agent = new Agent({
  name: "My Agent",
  instructions: "You are a helpful assistant.",
  model: "o4-mini",
  tools: [getWeather],
});

const result = await run(agent, "What is the weather in Tokyo?");

console.log(result.finalOutput);
