import { expect, test } from "@playwright/test";
import notes from "./fixtures/teacher-opening-notes.json";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

test("ten teaching pages retain session scope, versioned resume and final revision", async ({ page },testInfo) => {
  await installWorkspaceMocks(page);
  let saved=0;
  let writes=0;
  const headers={"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type"};
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:{...notes,saved_page:saved}}));
  await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/**`,route=>{
    if(route.request().method()==="OPTIONS") return route.fulfill({headers});
    const position=route.request().postDataJSON()?.last_position;
    if(position){
      expect(position.notes_version).toBe("ncert_teacher_v1");
      saved=position.notes_page; writes++;
    }
    return route.fulfill({headers,json:{saved:true}});
  });
  const url=`/dashboard/study/notes/some_basic_concepts_of_chemistry?topic=${notes.topic_id}`;
  await page.goto(url);
  await expect(page.getByText("Page 1 of 10",{exact:true})).toBeVisible();
  await expect(page.getByText(/For today’s 10-minute study portion/)).toBeVisible();
  await expect(page.locator("article")).toContainText(notes.pages[0].blocks[0].text);
  await page.screenshot({path:testInfo.outputPath("teaching-page-one.png")});
  await page.getByRole("button",{name:"Next",exact:true}).click();
  await expect(page.getByText("Page 2 of 10",{exact:true})).toBeVisible();
  await expect.poll(()=>writes).toBeGreaterThan(0);
  await page.goto(url);
  await expect(page.getByText("Page 2 of 10",{exact:true})).toBeVisible();
  await page.goto(`${url}&page=9`);
  await expect(page.getByText("Page 10 of 10",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Next",exact:true})).toBeDisabled();
  const revision=page.getByRole("region",{name:"Check your understanding"});
  await expect(revision.locator("li")).toHaveCount(5);
  await revision.getByText("Check the reasoning",{exact:true}).first().click();
  await expect(revision.locator("details").first()).toContainText(notes.pages[9].questions![0].answer);
  await page.screenshot({path:testInfo.outputPath("teaching-revision.png")});
  let learning: Record<string,unknown>={};
  let grounding="";
  await page.route(`${WORKSPACE_TEST_BACKEND}/coach/chat/stream`,route=>{
    if(route.request().method()==="OPTIONS") return route.fulfill({headers});
    const payload=route.request().postDataJSON();
    learning=payload.learning_context;
    grounding=payload.grounding_context_prompt;
    return route.fulfill({headers,contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"turn_event",event:"answer.completed",answer:"Let’s connect the observation to its explanation.",blocks:[]})}\n\ndata: [DONE]\n\n`});
  });
  await page.goto(`${url}&page=1`);
  await page.getByRole("link",{name:"Ask AI about this page"}).click();
  const input=page.getByRole("textbox",{name:"Message your AI tutor"});
  await expect(input).toBeVisible({timeout:45000});
  await input.fill("Explain this page simply.");
  await page.getByRole("button",{name:"Send message"}).click();
  await expect.poll(()=>learning.notes_content_version).toBe("ncert_teacher_v1");
  expect(learning.notes_page_number).toBe(2);
  expect(learning.notes_subtopic_ids).toEqual(notes.pages[1].source_section_ids);
  expect(grounding).toContain("Configured full-topic time: 30–35 min");
  expect(grounding).toContain("10 min");
});
