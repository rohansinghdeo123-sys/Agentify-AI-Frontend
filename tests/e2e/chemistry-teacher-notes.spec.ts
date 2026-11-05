import { expect, test } from "@playwright/test";
import fixtures from "./fixtures/chemistry-teacher-notes.json";
import type { ChapterNotes } from "../../features/study/api";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

const lessons = fixtures as ChapterNotes[];

test("service fixtures cover every remaining Chemistry chapter", () => {
  expect(lessons.map(n=>n.chapter.chapter_number)).toEqual([2,3,4,5,6,7,8,9]);
});

for (const notes of lessons) {
  test(`Chemistry chapter ${notes.chapter.chapter_number} teaches, resumes, revises and grounds Ask AI`, async ({ page }, testInfo) => {
    await installWorkspaceMocks(page);
    let saved = 0;
    let writes = 0;
    let noteRequests = 0;
    const headers = {"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type"};
    await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>{
      if (route.request().method()==="GET") noteRequests++;
      return route.fulfill({headers,json:{...notes,saved_page:saved}});
    });
    await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/**`,route=>{
      if (route.request().method()==="OPTIONS") return route.fulfill({headers});
      const position = route.request().postDataJSON()?.last_position;
      if (position) {
        expect(position.notes_version).toBe(notes.content_version);
        expect(position.notes_topic).toBe(notes.topic_id);
        saved = position.notes_page; writes++;
      }
      return route.fulfill({headers,json:{saved:true}});
    });
    const url = `/dashboard/study/notes/${notes.chapter.slug}?topic=${notes.topic_id}`;
    await page.goto(url);
    await expect(page.getByText("Page 1 of 10",{exact:true})).toBeVisible();
    await expect(page.locator("article h2")).toHaveText(notes.pages![0].title);
    expect(noteRequests).toBe(1);
    const ask = page.getByRole("link",{name:"Ask AI about this page"});
    expect(new URL((await ask.getAttribute("href"))!,"http://localhost").searchParams.get("catalogSource")).toBe(notes.catalog_source);
    await page.getByRole("button",{name:"Next",exact:true}).click();
    await expect.poll(()=>writes).toBeGreaterThan(0);
    await page.goto(url);
    await expect(page.getByText("Page 2 of 10",{exact:true})).toBeVisible();
    await page.goto(`${url}&page=9`);
    const revision = page.getByRole("region",{name:"Check your understanding"});
    await expect(revision.locator("li")).toHaveCount(notes.pages![9].questions!.length);
    await revision.getByText("Check the reasoning",{exact:true}).last().click();
    await expect(revision.locator("details").last()).toHaveAttribute("open","");
    await revision.scrollIntoViewIfNeeded();
    if ([2,6,9].includes(notes.chapter.chapter_number)) {
      await page.screenshot({path:testInfo.outputPath(`chemistry-${notes.chapter.chapter_number}-revision.png`)});
    }
    let learning: Record<string,unknown> = {};
    await page.route(`${WORKSPACE_TEST_BACKEND}/coach/chat/stream`,route=>{
      if (route.request().method()==="OPTIONS") return route.fulfill({headers});
      learning = route.request().postDataJSON().learning_context;
      return route.fulfill({headers,contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"turn_event",event:"answer.completed",answer:"Let’s reason through this page together.",blocks:[]})}\n\ndata: [DONE]\n\n`});
    });
    await page.goto(`${url}&page=2`);
    await page.getByRole("link",{name:"Ask AI about this page"}).click();
    const input = page.getByRole("textbox",{name:"Message your AI tutor"});
    await expect(input).toBeVisible({timeout:45000});
    await input.fill("Explain this page with its example.");
    await page.getByRole("button",{name:"Send message"}).click();
    await expect.poll(()=>learning.notes_content_version).toBe(notes.content_version);
    expect(learning.notes_page_number).toBe(3);
    expect(learning.notes_subtopic_ids).toEqual(notes.pages![2].source_section_ids);
    expect(learning.notes_proficiency).toBe(notes.proficiency);
    expect(learning.notes_explanation_style).toBe(notes.explanation_style);
    expect(learning.selected_chapter_id).toBe(notes.chapter.slug);
    expect(learning.catalog_source).toBe(notes.catalog_source);
  });
}
