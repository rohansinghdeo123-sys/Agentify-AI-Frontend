import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fixture from "../e2e/fixtures/planned-learning.json";
import PlannedLearningContext from "@/components/study/PlannedLearningContext";
import { normalizeStudyLabContext, normalizeStudyRouteState, normalizeStudyRouteAdvanceResult } from "@/features/planning/contracts";

describe("shared planned learning", () => {
  it("accepts backend contracts before and after assessed completion", () => {
    expect(normalizeStudyRouteState(fixture.route)?.portfolio).toBeDefined();
    expect(normalizeStudyRouteAdvanceResult(fixture.completion)?.route.portfolio).toBeDefined();
    expect(normalizeStudyLabContext(fixture.nextContext)?.current_unit_id).not.toBe(fixture.context.current_unit_id);
  });
  it("renders simple metadata bullets with why, approach, route and progress", () => {
    const context = normalizeStudyLabContext(fixture.context)!;
    const html = renderToStaticMarkup(createElement(PlannedLearningContext, { context }));
    expect(html).toContain("Today you&#x27;ll learn");
    expect(html).toContain(context.key_notes![0]);
    expect(html).toContain(context.step_label);
    expect(html).toContain("Why now:");
    expect(html).toContain("Learning approach:");
    expect(html).toContain("<progress");
    expect(html.match(/<li>/g)?.length).toBe(context.key_notes!.length);
  });
});
