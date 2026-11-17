import type { Metadata } from "next";
import AgentHq from "@/features/agent-hq/AgentHq";

export const metadata: Metadata = {
  title: "Agent HQ | AgentifyAI",
  robots: { index: false, follow: false },
};

export default function AgentHqPage() {
  return <AgentHq />;
}
