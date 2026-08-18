import type { Metadata } from "next";
import PlanningHome from "@/features/planning/PlanningHome";

export const metadata: Metadata = {
  title: "Planning | AgentifyAI",
  description: "Turn a complete chapter into a comfortable, step-by-step learning roadmap.",
  alternates: { canonical: "/dashboard/planning" },
};

export default PlanningHome;
