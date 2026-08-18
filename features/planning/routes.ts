import type { PlanningScope } from "./contracts";

export const PLANNING_ROUTES = {
  home: "/dashboard/planning",
  new: "/dashboard/planning/new",
  active: "/dashboard/planning/active",
  checkpoint: "/dashboard/planning/checkpoint",
  review: "/dashboard/planning/review",
  history: "/dashboard/planning/history",
} as const;

export type PlanningRoute = (typeof PLANNING_ROUTES)[keyof typeof PLANNING_ROUTES];

export function planningBuilderHref(scope?: Partial<PlanningScope> | null) {
  if (!scope?.chapter) return PLANNING_ROUTES.new;
  const params = new URLSearchParams();
  params.set("chapter", scope.chapter);
  return `${PLANNING_ROUTES.new}?${params.toString()}`;
}
