export const PLANNING_ROUTES = {
  home: "/dashboard/planning",
  active: "/dashboard/planning/active",
} as const;

export type PlanningRoute = (typeof PLANNING_ROUTES)[keyof typeof PLANNING_ROUTES];
