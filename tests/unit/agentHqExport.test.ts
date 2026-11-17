import { describe, expect, it } from "vitest";
import { serializeReportCsv, type Run } from "@/features/agent-hq/api";

describe("Agent HQ CSV report", () => {
  it("exports recorded figures and neutralizes spreadsheet formulas in text fields", () => {
    const run: Run = {
      id:"run-1",kind:"report",topic:" =HYPERLINK(\"https://example.test\")",days:1,participant_ids:["coach"],
      status:"completed",created_at:"2026-11-16T08:00:00Z",updated_at:"2026-11-16T08:00:00Z",
      result:{starts_at:"2026-11-15T08:00:00Z",ends_at:"2026-11-16T08:00:00Z",findings:[
        {agent_id:"coach",name:"Coach",text:"\t+SUM(1,2)",metrics:{recorded:3,completed:2,failed:1,active:0,p95_latency_ms:1199}},
      ]},
    };
    const csv = serializeReportCsv(run);
    expect(csv).toContain(`"' =HYPERLINK(""https://example.test"")"`);
    expect(csv).toContain("\"'\t+SUM(1,2)\"");
    expect(csv).toContain('"3","2","1","0","1199","",""');
    expect(csv).toContain('"2026-11-15T08:00:00Z","2026-11-16T08:00:00Z"');
  });
});
