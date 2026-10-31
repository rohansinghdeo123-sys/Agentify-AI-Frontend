import { expect, test } from "@playwright/test";
import fixture from "./fixtures/planned-learning.json";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

test.beforeAll(async ({ request }) => { await request.get("/dashboard/study/session/warm-notes?fresh=1",{timeout:120000}); await request.get("/dashboard/study/notes/some_basic_concepts_of_chemistry?topic=warm",{timeout:120000}); });
for (const theme of ["light", "dark"] as const) {
test(`Themed ${theme} notes preserve the Planning and Ask AI flow`,async({page}, testInfo)=>{
 await installWorkspaceMocks(page,theme);
 const topic=fixture.context.current_unit_id;
 let saved=0;
 let noteRequests=0;
 const headers={"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type"};
 const notes={active_unit_id:topic,chapter:{slug:"some_basic_concepts_of_chemistry",name:"Some Basic Concepts of Chemistry",class_level:"Class 11",subject:"Chemistry",chapter_number:1},topic_id:topic,topic_title:"Chemistry and the Nature of Matter",estimated_minutes:{min:30,max:35},proficiency:"new_to_it",concepts:[],pages:[{id:"a",title:"Matter",source:"Amit Master Notes",source_pages:[1],teaching_format:"concept",text:"Matter has mass and occupies space. H₂O, CO₂, H₂SO₄ and Ca(OH)₂."},{id:"b",title:"States of Matter",text:"Solids have a definite shape and volume."}]};
 notes.pages[0].text += " " + Array(18).fill("Particles are continuously moving.").join(" ");
 await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/**`,route=>{
  if(route.request().method()==="OPTIONS")return route.fulfill({headers});
  if(route.request().url().includes("heartbeat"))saved=route.request().postDataJSON().last_position.notes_page ?? saved;
  return route.fulfill({headers,json:fixture.route});
 });
 await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>{noteRequests++; return route.fulfill({headers,json:{...notes,saved_page:saved}});});
 await page.route(`${WORKSPACE_TEST_BACKEND}/coach/study-lab/context/**`,route=>route.fulfill({headers,json:fixture.context}));
 await page.goto("/dashboard/planning/active");
 await page.getByRole("button",{name:/Start today/}).click();
 await expect(page).toHaveURL(/\/study\/notes\//,{timeout:45000});
 await expect(page.getByText("30–35 min · Topic duration")).toBeVisible();
 await expect(page.getByText("Page 1 of 2")).toBeVisible();
 await expect(page.locator("article")).toContainText("Amit Master Notes");
 await expect(page.locator("article")).toContainText("H2O, CO2, H2SO4 and Ca(OH)");
 await expect(page.locator("article li")).toHaveCount(20);
 const scroller = page.getByRole("main", {name:"Study notes"});
 await expect(scroller).toHaveCSS("overflow-y", "auto");
 expect(await scroller.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(500);
 // Real user input must move the viewport; programmatic element scrolling
 // previously hid the overflow bug in tests that only clicked controls.
 await page.mouse.move(200, 350);
 if (testInfo.project.use.isMobile) {
   const cdp = await page.context().newCDPSession(page);
   const swipe = async (from: number, to: number) => {
     await cdp.send("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[{x:200,y:from}]});
     for (let step=1; step<=12; step++) {
       await cdp.send("Input.dispatchTouchEvent", {type:"touchMove",touchPoints:[{x:200,y:from+(to-from)*step/12}]});
     }
     await cdp.send("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]});
   };
   await swipe(650,200);
   await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
   // Keyboard Home also cancels momentum and establishes a stable top position.
   await scroller.focus(); await page.keyboard.press("Home");
   await cdp.detach();
 } else {
   await page.mouse.wheel(0, 600);
   await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
   await page.mouse.wheel(0, -600);
 }
 await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeLessThan(5);
 await scroller.focus(); await page.keyboard.press("End");
 await expect.poll(()=>scroller.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(5);
 await expect(page.getByRole("link",{name:"Continue to learning and quick check"})).toBeInViewport();
 await page.keyboard.press("Home");
 await expect.poll(()=>scroller.evaluate(el=>el.scrollTop)).toBeLessThan(5);
 await page.screenshot({path:testInfo.outputPath("themed-notes.png")});
 await page.getByRole("button",{name:"Next",exact:true}).click();
 await expect(page.getByText("Page 2 of 2")).toBeVisible();
 await expect.poll(()=>saved).toBe(1);
 expect(noteRequests).toBe(1);
 await page.reload();await expect(page.getByText("Page 2 of 2")).toBeVisible();
 let grounding="";
 await page.route(`${WORKSPACE_TEST_BACKEND}/coach/chat/stream`,route=>{
  if(route.request().method()==="OPTIONS")return route.fulfill({headers});
  grounding=route.request().postDataJSON().grounding_context_prompt;
  return route.fulfill({headers,contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"turn_event",event:"answer.completed",answer:"Solids retain their shape.",blocks:[]})}\n\ndata: [DONE]\n\n`});
 });
 await page.getByRole("link",{name:"Ask AI about this page"}).click();
 const input=page.getByRole("textbox",{name:"Message your AI tutor"});await expect(input).toBeVisible({timeout:45000});
 await expect(page.locator("#main-content")).toHaveCSS("overflow-y","hidden");
 await input.fill("Explain this page simply.");await page.getByRole("button",{name:"Send message"}).click();
 await expect.poll(()=>grounding).toContain("Solids have a definite shape and volume.");
 expect(grounding).toContain("Page: 2");expect(grounding).toContain("new_to_it");
 await page.getByRole("link",{name:"Return to notes page"}).click();
 await expect(page.getByText("Page 2 of 2")).toBeVisible();
});

}
