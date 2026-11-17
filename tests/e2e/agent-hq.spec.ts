import { expect, test } from "@playwright/test";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";
import type { Agent, Run, RunInput, Snapshot } from "../../features/agent-hq/api";

const routePath = "/dashboard/internal/admin/agent-hq";
const recordedAt = "2026-11-16T08:00:00Z";
const metrics = {recorded:3,completed:2,failed:1,active:0,avg_latency_ms:950,
  p50_latency_ms:750,p95_latency_ms:1200,p99_latency_ms:1300,estimated_tokens:80,estimated_cost_usd:null,success_rate:66.67};
const agents: Agent[] = [
  {id:"orchestrator",name:"AI Operations",role:"Operations Lead",team:"Operations",manager_id:null,
    description:"Coordinates registered learning workflows.",capabilities:["Runtime evidence"],status:"available",metrics,last_activity:recordedAt,
    current_task:null,style:"Evidence-led",tools:["Reports"],kind:"registered"},
  {id:"coach",name:"Study Coach",role:"Study Lab Coach",team:"Learning",manager_id:"orchestrator",
    description:"Provides grounded study guidance.",capabilities:["Learning support"],status:"degraded",metrics,last_activity:recordedAt,
    current_task:null,style:"Clear",tools:["Retrieval"],kind:"registered"},
];
const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"GET, POST, PUT, OPTIONS"};

test("executive views use recorded activity and persist requests", async ({page}, testInfo) => {
  const theme = testInfo.project.name === "mobile-chrome" ? "dark" : "light";
  await installWorkspaceMocks(page,theme,{founder:true});
  const activity = {id:"turn-4",agent_id:"coach",operation:"study_turn",status:"failed",created_at:recordedAt,latency_ms:1400,source:"runtime"};
  const snapshot: Snapshot = {
    agents,generated_at:recordedAt,days:1,metrics,activity:[activity],
    recommendations:[{id:"coach-reliability",agent_id:"coach",title:"Review coach failures",summary:"One recorded failure.",
      evidence:["One of three runs failed."],proposed_action:"Review the recorded trace.",status:"pending"}],
    coverage:{sources:["Runtime events"],first_observation:recordedAt,last_observation:recordedAt,latency_sample_size:3,latency_sample_limit:100,unavailable:["Exact billing"],stale:false},
    executives:[{name:"Rohan Singh Deo",role:"Co-CEO"},{name:"Amit",role:"Co-CEO"}],
  };
  const runs: Run[] = [];
  let nextId = 0;
  await page.route(`${WORKSPACE_TEST_BACKEND}/admin/agent-hq/**`, async route => {
    const {pathname,searchParams} = new URL(route.request().url());
    const path = pathname.replace("/admin/agent-hq", "");
    const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({status:204,headers});
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const json = (body: unknown, status = 200) => route.fulfill({status,headers,json:body});
    if (path === "/events") return route.fulfill({status:200,headers,contentType:"text/event-stream",body:"event: update\ndata: {\"version\":\"snapshot-1\"}\n\n"});
    if (path === "/snapshot") return json({...snapshot,days:Number(searchParams.get("days")) || 1});
    if (path === "/runs" && method === "GET") return json({runs,next_cursor:null});
    if (path === "/runs" && method === "POST") {
      const input = route.request().postDataJSON() as RunInput;
      expect(input.request_id).toMatch(/^[\da-f-]{36}$/);
      const created: Run = {
        ...input,id:`fixture-run-${nextId++}`,status:"completed",created_at:recordedAt,finished_at:recordedAt,updated_at:recordedAt,
        result:{summary:"Recorded evidence reviewed."},
        messages:[{id:"message-1",agent_id:"coach",kind:"finding",text:"One of three observed study runs failed.",evidence:["turn-4"],created_at:recordedAt}],
      };
      runs.unshift(created);
      return json(created,202);
    }
    if (path.startsWith("/runs/")) return json(runs.find(run => run.id === path.split("/").pop()));
    if (path === "/schedule") return json({enabled:false,timezone:"Asia/Kolkata",hour:9,minute:0});
    if (path === "/traces/turn-4") return json({activity,related_activity:[activity],handoffs:[],models:[]});
    if (path === "/recommendations/coach-reliability/decision") {
      const {status} = route.request().postDataJSON();
      snapshot.recommendations[0].status = status;
      return json({id:"coach-reliability",status});
    }
    return json({detail:"Unexpected fixture route"},404);
  });

  await page.goto(routePath);
  await expect(page.getByRole("heading", {name:"Workforce Command Center"})).toBeVisible();
  await expect(page.getByText("Review coach failures")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(testInfo.project.use.viewport?.width || 1280);
  await page.screenshot({path:testInfo.outputPath("command-center.png"),fullPage:true});
  await page.getByRole("button",{name:"Accept",exact:true}).click();
  await expect(page.getByText("Accepted",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"View Study Coach, Study Lab Coach"}).click();
  await expect(page.getByRole("heading",{name:"AI Organization",exact:true})).toBeVisible();
  await expect(page.getByText("Rohan Singh Deo")).toBeVisible();
  await expect(page.getByText("Amit",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Ask agent",exact:true}).click();
  await page.getByLabel("Question",{exact:true}).fill("Which study runs failed?");
  await page.getByRole("button",{name:"Send request",exact:true}).click();
  await expect(page.getByText("One of three observed study runs failed.")).toBeVisible();
  await page.getByRole("button",{name:"Executive Reports",exact:true}).click();
  await page.getByLabel("Through date (UTC)").fill("2026-11-15");
  await page.getByRole("button",{name:"Generate report",exact:true}).click();
  await expect(page.getByRole("button",{name:"Export JSON"})).toBeVisible();
  expect(runs[0].ending_on).toBe("2026-11-15");
  await page.getByRole("button",{name:"Performance & Observability",exact:true}).click();
  await page.getByRole("button",{name:"Trace",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Trace detail"})).toBeVisible();
  await page.reload();
  await page.getByRole("button",{name:"Collaboration Hub",exact:true}).click();
  await page.getByRole("button",{name:/Which study runs failed/}).click();
  await expect(page.getByText("One of three observed study runs failed.")).toBeVisible();
});

test("non-founders cannot see the executive workspace", async ({page}) => {
  await installWorkspaceMocks(page);
  await page.route(`${WORKSPACE_TEST_BACKEND}/admin/agent-hq/**`, () => {
    throw new Error("A non-founder must not query executive HQ data");
  });
  await page.goto(routePath);
  await expect(page.getByRole("heading",{name:"Agent HQ is restricted"})).toBeVisible();
});
