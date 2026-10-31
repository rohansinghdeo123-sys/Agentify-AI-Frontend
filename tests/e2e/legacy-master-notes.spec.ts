import { expect, test } from "@playwright/test";
import notes from "./fixtures/amit-measurement-notes.json";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

test("archived screenshot URL displays Amit's SI notes with normalized powers", async ({ page }) => {
  await installWorkspaceMocks(page);
  const headers={"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type"};
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:notes}));
  const siPage=notes.pages.findIndex(p=>p.subtopic_ids.includes("1.3.3"));
  expect(siPage).toBeGreaterThanOrEqual(0);
  await page.goto(`/dashboard/study/notes/ncert_class_11_chemistry_chapter_1_some_basic_concepts_of_chemistry?topic=unit_ncert_class_11_chemistry_chapter_1_some_basic_concepts_of_chemistry_9a85991e10&page=${siPage}`);
  const article=page.locator("article");
  await expect(article).toContainText("Amit Master Notes");
  await expect(article).toContainText("kilo");
  await expect(article).not.toContainText("National standards are maintained");
  await expect(article).not.toContainText("^");
  expect(await article.locator("sup").allTextContents()).toEqual(expect.arrayContaining(["3","-3","-6","-9"]));
  await expect(page.getByRole("link",{name:"Ask AI about this page"})).toHaveAttribute("href",new RegExp(notes.topic_id));
});
