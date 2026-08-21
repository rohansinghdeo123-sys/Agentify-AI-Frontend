import type { Metadata } from "next";
import PlanningHome from "@/features/planning/PlanningHome";

export const metadata: Metadata = {
  title: "Planning | AgentifyAI",
  description: "Choose a class, subject, and chapter to see a short, prioritised focus brief.",
  alternates: { canonical: "/dashboard/planning" },
};

export default PlanningHome;
