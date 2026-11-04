import { expect, test } from "@playwright/test";
import notes from "./fixtures/teacher-measurement-notes.json";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

test("archived screenshot URL displays NCERT teaching SI notes with normalized powers", async ({ page }) => {
  await installWorkspaceMocks(page);
  const headers={"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type"};
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:notes}));
  const siPage=notes.pages.findIndex(p=>p.subtopic_ids.includes("1.3.3"));
  expect(siPage).toBeGreaterThanOrEqual(0);
  await page.goto(`/dashboard/study/notes/ncert_class_11_chemistry_chapter_1_some_basic_concepts_of_chemistry?topic=unit_ncert_class_11_chemistry_chapter_1_some_basic_concepts_of_chemistry_9a85991e10&page=${siPage}`);
  const article=page.locator("article");
  await expect(article).toContainText("NCERT");
  await expect(article).toContainText("kilo");
  await expect(article).not.toContainText("National standards are maintained");
  await expect(article).not.toContainText("^");
  await expect(article).toContainText("10⁻³");
  await expect(article).toContainText("10⁻⁶");
  await expect(article).toContainText("10⁻⁹");
  await expect(page.getByRole("link",{name:"Ask AI about this page"})).toHaveAttribute("href",new RegExp(notes.topic_id));
});
