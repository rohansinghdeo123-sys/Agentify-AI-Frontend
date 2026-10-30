import { expect, test } from "@playwright/test";
import fixture from "./fixtures/planned-learning.json";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

test.beforeAll(async ({ request }) => { await request.get("/dashboard/study/session/warm-notes?fresh=1",{timeout:120000}); await request.get("/dashboard/study/notes/some_basic_concepts_of_chemistry?topic=warm",{timeout:120000}); });
for (const theme of ["light", "dark"] as const) {
test(`Themed ${theme} notes preserve the Planning and Ask AI flow`,async({page}, testInfo)=>{
 await installWorkspaceMocks(page,theme);
 const topic=fixture.context.current_unit_id;
 let saved=0;
 const headers={"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type"};
 const notes={chapter:{slug:"some_basic_concepts_of_chemistry",name:"Some Basic Concepts of Chemistry",class_level:"Class 11",subject:"Chemistry",chapter_number:1},topic_id:topic,topic_title:"Chemistry and the Nature of Matter",estimated_minutes:{min:30,max:35},proficiency:"new_to_it",concepts:[],pages:[{id:"a",title:"Matter",text:"Matter has mass and occupies space. H₂O, CO₂, H₂SO₄ and Ca(OH)₂."},{id:"b",title:"States of Matter",text:"Solids have a definite shape and volume."}]};
 await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/**`,route=>{
  if(route.request().method()==="OPTIONS")return route.fulfill({headers});
  if(route.request().url().includes("heartbeat"))saved=route.request().postDataJSON().last_position.notes_page ?? saved;
  return route.fulfill({headers,json:fixture.route});
 });
 await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:{...notes,saved_page:saved}}));
 await page.route(`${WORKSPACE_TEST_BACKEND}/coach/study-lab/context/**`,route=>route.fulfill({headers,json:fixture.context}));
 await page.goto("/dashboard/planning/active");
 await page.getByRole("button",{name:/Start today/}).click();
 await expect(page).toHaveURL(/\/study\/notes\//,{timeout:45000});
 await expect(page.getByText("30–35 min · Topic duration")).toBeVisible();
 await expect(page.getByText("Page 1 of 2")).toBeVisible();
 await expect(page.locator("article")).toContainText("H2O, CO2, H2SO4 and Ca(OH)");
 await expect(page.locator("article li")).toHaveCount(2);
 await page.screenshot({path:testInfo.outputPath("themed-notes.png")});
 await page.getByRole("button",{name:"Next",exact:true}).click();
 await expect(page.getByText("Page 2 of 2")).toBeVisible();
 await expect.poll(()=>saved).toBe(1);
 await page.reload();await expect(page.getByText("Page 2 of 2")).toBeVisible();
 let grounding="";
 await page.route(`${WORKSPACE_TEST_BACKEND}/coach/chat/stream`,route=>{
  if(route.request().method()==="OPTIONS")return route.fulfill({headers});
  grounding=route.request().postDataJSON().grounding_context_prompt;
  return route.fulfill({headers,contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"turn_event",event:"answer.completed",answer:"Solids retain their shape.",blocks:[]})}\n\ndata: [DONE]\n\n`});
 });
 await page.getByRole("link",{name:"Ask AI about this page"}).click();
 const input=page.getByRole("textbox",{name:"Message your AI tutor"});await expect(input).toBeVisible({timeout:45000});
 await input.fill("Explain this page simply.");await page.getByRole("button",{name:"Send message"}).click();
 await expect.poll(()=>grounding).toContain("Solids have a definite shape and volume.");
 expect(grounding).toContain("Page: 2");expect(grounding).toContain("new_to_it");
 await page.getByRole("link",{name:"Return to notes page"}).click();
 await expect(page.getByText("Page 2 of 2")).toBeVisible();
});

}
