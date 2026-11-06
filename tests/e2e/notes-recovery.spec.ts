import { expect, test } from "@playwright/test";
import opening from "./fixtures/teacher-opening-notes.json";
import measurement from "./fixtures/teacher-measurement-notes.json";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

const headers = {"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type"};
const url = `/dashboard/study/notes/${opening.chapter.slug}?topic=${opening.topic_id}`;

for (const failure of ["404", "null", "empty", "blank page", "503"] as const) {
  test(`notes recover from ${failure} without a misleading blank reader`, async ({page})=>{
    await installWorkspaceMocks(page);
    let recovered = false;
    const requests: string[] = [];
    await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>{
      if (route.request().method()==="OPTIONS") return route.fulfill({headers});
      requests.push(new URL(route.request().url()).searchParams.get("topic_id") || "");
      if (recovered) return route.fulfill({headers,json:opening});
      if (failure==="404" || failure==="503") return route.fulfill({headers,status:Number(failure),json:{detail:"Notes unavailable"}});
      if (failure==="null") return route.fulfill({headers,contentType:"application/json",body:"null"});
      if (failure==="empty") return route.fulfill({headers,json:{...opening,pages:[],concepts:[]}});
      return route.fulfill({headers,json:{...opening,pages:opening.pages.map((p,i)=>i===2 ? {...p,text:"",blocks:[]} : p)}});
    });
    await page.goto(url);
    const recovery = page.getByRole("main",{name:"Study notes"}).getByRole("alert");
    await expect(recovery).toBeVisible();
    await expect(page.getByRole("heading",{name:"Notes could not open"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Notes could not open"}).locator("..")).toContainText("Some Basic Concepts Of Chemistry");
    await expect(page.getByText("No verified notes are mapped to this topic yet.",{exact:true})).toHaveCount(0);
    await expect(page.locator("article")).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Choose a topic in Planning"})).toHaveAttribute("href","/dashboard/planning/active");
    recovered = true;
    await page.getByRole("button",{name:"Retry loading notes"}).click();
    await expect(page.getByText("Page 1 of 10",{exact:true})).toBeVisible();
    await expect(page.locator("article h2")).toHaveText(opening.pages[0].title);
    await expect(recovery).toHaveCount(0);
    expect(requests.every(topic=>topic===opening.topic_id)).toBe(true);
    const loadedRequests = requests.length;
    await page.getByRole("button",{name:"Next",exact:true}).click();
    await expect(page.getByText("Page 2 of 10",{exact:true})).toBeVisible();
    expect(requests.length).toBe(loadedRequests);
  });
}

test("switching topics clears the old lesson and ignores a late failed request",async({page})=>{
  await installWorkspaceMocks(page);
  let releaseMissing: () => void = ()=>{};
  const pending = new Promise<void>(resolve=>{releaseMissing=resolve;});
  let settled = false;
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,async route=>{
    if (route.request().method()==="OPTIONS") return route.fulfill({headers});
    const topic = new URL(route.request().url()).searchParams.get("topic_id");
    if (topic==="missing-topic") {
      await pending;
      await route.fulfill({headers,status:404,json:{detail:"Missing topic"}});
      settled = true;
      return;
    }
    return route.fulfill({headers,json:topic===measurement.topic_id ? measurement : opening});
  });
  await page.goto(url);
  await expect(page.locator("article h2")).toHaveText(opening.pages[0].title);
  await page.evaluate(()=>window.history.pushState(null,"","?topic=missing-topic"));
  await expect(page.getByText("Loading topic notes",{exact:true})).toBeVisible();
  await expect(page.locator("article")).toHaveCount(0);
  await page.evaluate(topic=>window.history.pushState(null,"",`?topic=${topic}`),measurement.topic_id);
  await expect(page.locator("article h2")).toHaveText(measurement.pages[0].title);
  releaseMissing();
  await expect.poll(()=>settled).toBe(true);
  await expect(page.locator("article h2")).toHaveText(measurement.pages[0].title);
  await expect(page.getByRole("main",{name:"Study notes"}).getByRole("alert")).toHaveCount(0);
});

test("a merged source section offers verified learning topics and opens the chosen notes",async({page})=>{
  await installWorkspaceMocks(page);
  const requests: string[] = [];
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>{
    if (route.request().method()==="OPTIONS") return route.fulfill({headers});
    const topic = new URL(route.request().url()).searchParams.get("topic_id") || "";
    requests.push(topic);
    return route.fulfill({headers,json:topic===measurement.topic_id ? measurement : {
      chapter:opening.chapter,resolution:"topic_choice",requested_topic_id:topic,topic_title:"Choose a learning topic",pages:[],concepts:[],
      topic_options:[opening,measurement].map(notes=>({id:notes.topic_id,title:notes.topic_title,estimated_minutes:notes.estimated_minutes})),
    }});
  });
  await page.goto(`/dashboard/study/notes/${opening.chapter.slug}?topic=merged-topic&page=7&planned=1`);
  await expect(page.getByRole("heading",{name:"Choose a learning topic"})).toBeVisible();
  await expect(page.getByText("This section covers several learning topics. Choose one to open its notes.")).toBeVisible();
  const choices = page.getByRole("region",{name:"Available learning topics"});
  await expect(choices.getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("main",{name:"Study notes"}).getByRole("alert")).toHaveCount(0);
  await choices.getByRole("link").filter({hasText:measurement.topic_title}).click();
  await expect(page.getByText("Page 1 of 10",{exact:true})).toBeVisible();
  await expect(page.locator("article h2")).toHaveText(measurement.pages[0].title);
  expect(new URL(page.url()).searchParams.get("topic")).toBe(measurement.topic_id);
  expect(new URL(page.url()).searchParams.get("page")).toBeNull();
  expect(new URL(page.url()).searchParams.get("planned")).toBe("1");
  expect(requests).toEqual(["merged-topic",measurement.topic_id]);
});

test("invalid page positions always open a real lesson page",async({page})=>{
  await installWorkspaceMocks(page);
  let requests = 0;
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>{
    if (route.request().method()==="OPTIONS") return route.fulfill({headers});
    requests++;
    return route.fulfill({headers,json:{...opening,saved_page:1.75}});
  });
  await page.goto(url);
  await expect(page.getByText("Page 2 of 10",{exact:true})).toBeVisible();
  for (const [value,index] of [["1.5",1],["-3",0],["999",9],["not-a-page",0],["Infinity",0],["1e309",0]] as const) {
    await page.evaluate(value=>{
      const query = new URLSearchParams(window.location.search); query.set("page",value);
      window.history.replaceState(null,"",`?${query}`);
    },value);
    await expect(page.getByText(`Page ${index+1} of 10`,{exact:true})).toBeVisible();
    await expect(page.locator("article h2")).toHaveText(opening.pages[index].title);
    await expect(page.getByText("No verified notes are mapped to this topic yet.",{exact:true})).toHaveCount(0);
  }
  expect(requests).toBe(1);
});

test("a new topic opens at the top after reading the previous section to the bottom",async({page})=>{
  await installWorkspaceMocks(page);
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>{
    if (route.request().method()==="OPTIONS") return route.fulfill({headers});
    const topic = new URL(route.request().url()).searchParams.get("topic_id");
    if (topic==="missing-topic") return route.fulfill({headers,status:404,json:{detail:"Missing source topic"}});
    return route.fulfill({headers,json:opening});
  });
  await page.goto(url);
  await expect(page.locator("article h2")).toHaveText(opening.pages[0].title);
  const main = page.getByRole("main",{name:"Study notes"});
  await main.focus(); await page.keyboard.press("End");
  await expect.poll(()=>main.evaluate(el=>el.scrollTop)).toBeGreaterThan(20);
  await page.goto(`/dashboard/study/notes/${opening.chapter.slug}?topic=missing-topic`);
  await expect(page.getByRole("heading",{name:"Notes could not open"})).toBeInViewport();
  await expect.poll(()=>main.evaluate(el=>el.scrollTop)).toBeLessThan(1);
});
