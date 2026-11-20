import { expect, test } from "@playwright/test";
import type { ChapterNotes, NotePage } from "../../features/study/api";
import planned from "./fixtures/planned-learning.json";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND, WORKSPACE_TEST_USER_ID } from "./helpers/mockWorkspace";

const headers = {"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type"};
const pages: NotePage[] = [
  {id:"water-observe",page_number:1,title:"What changes when water freezes?",text:"Water can change its state while remaining the same substance.",source_type:"NCERT",source_section_ids:["physical_states"],
    blocks:[{kind:"explanation",text:"Cooling water can change liquid water to ice. Its molecules remain H2O: a change of state does not turn it into CO2.",source_type:"NCERT"}],
    interrupts:[{type:"predict_what_happens",heading:"Predict the molecule",question:"Will freezing change H2O into CO2?",hint:"Think about physical state and chemical composition separately.",answer:"No. H2O remains H2O; freezing changes its physical state."}]},
  {id:"water-explain",page_number:2,title:"Separate physical state from composition",text:"State and composition answer different questions.",source_type:"NCERT",source_types:["NCERT"],source_section_ids:["physical_states","physical_changes"],
    blocks:[{kind:"definition",text:"A physical change changes a physical property while preserving chemical composition.",source_type:"NCERT"},
      {kind:"explanation",text:"In a closed container, melting changes the arrangement of water molecules while preserving their identity.",expanded_text:"The molecules remain H2O before and after melting; their arrangement and freedom of movement change.",source_type:"NCERT"}]},
  {id:"water-check",page_number:3,title:"Use the idea in a new situation",text:"Apply the distinction rather than memorising a label.",source_type:"NCERT",source_section_ids:["physical_changes"],
    blocks:[{kind:"takeaway",text:"Check whether the substance keeps its composition; a change in shape or state alone is not evidence of a new substance.",source_type:"NCERT"}],
    questions:[{question:"Does cutting ice into smaller pieces create a new compound?",answer:"No. The pieces retain the composition H2O."}]},
];
const lesson: ChapterNotes = {
  resolution:"lesson",chapter:{slug:"matter_around_us",name:"Matter Around Us",class_level:"Class 8",subject:"Science",chapter_number:1},
  topic_id:"matter_states",topic_title:"Water and its states",active_unit_id:"matter_states",catalog_source:"published",can_save_position:true,
  content_version:"adaptive_notes_v2_water_first",source_fingerprint:"water-sources-v1",proficiency:"know_the_basics",learning_depth:"concept focused",explanation_style:"balanced",
  estimated_minutes:{min:20,max:30},pages,completed_page_ids:[],saved_page:0,saved_page_id:pages[0].id,concepts:[],
  review_required:[{reason:"The sources describe different temperature conditions; this point needs review before they can be combined."}],
};
const url = `/dashboard/study/notes/${lesson.chapter.slug}?topic=${lesson.topic_id}&classLevel=Class+8&subject=Science`;

test("one Finish topic click retries a transient failure and opens the next topic", async ({page}) => {
  await installWorkspaceMocks(page);
  const deadline = new Date(Date.now() + 900_000).toISOString();
  const nextTopic = "changes_in_matter";
  let finishAttempts = 0;
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`, route => {
    const topic = new URL(route.request().url()).searchParams.get("topic_id");
    return route.fulfill({headers,json:{
      ...lesson, topic_id:topic, active_unit_id:topic,
      topic_title:topic === nextTopic ? "Changes in matter" : lesson.topic_title,
      pages:[pages[0]], study_session:{ends_at:deadline,remaining_seconds:900},
    }});
  });
  await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/heartbeat/**`, route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({headers});
    const position = route.request().postDataJSON().last_position;
    expect(position.finish_notes).toBe(true);
    expect(position.notes_completed_page_ids).toEqual([pages[0].id]);
    if (position.notes_topic !== nextTopic && ++finishAttempts === 1) {
      return route.fulfill({headers,status:503,json:{detail:"Temporarily unavailable"}});
    }
    const json = position.notes_topic === nextTopic
      ? {saved:true,notes_outcome:"time_up"}
      : {saved:true,notes_outcome:"continue",next_notes:{chapter_slug:lesson.chapter.slug,topic_id:nextTopic}};
    return route.fulfill({headers,json});
  });
  await page.goto(`${url}&planned=1&startSession=1`);
  await expect(page.getByRole("timer")).toContainText("remaining");
  await page.getByRole("button",{name:"Finish topic"}).click();
  await expect(page.getByRole("heading",{name:"Changes in matter",exact:true})).toBeVisible();
  expect(finishAttempts).toBe(2);
  await expect(page.getByRole("timer")).toContainText("remaining");
  await page.getByRole("button",{name:"Finish topic"}).click();
  await expect(page.getByRole("status")).toContainText("Study time is up");
  await expect(page).toHaveURL(new RegExp(nextTopic));
});

test("dynamic NCERT notes complete actual pages and return from a page-scoped tutor",async({page},testInfo)=>{
  await installWorkspaceMocks(page);
  let state = structuredClone(lesson);
  let writes = 0;
  let assessments = 0;
  let navigationId = "";
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>{
    if (route.request().method()==="GET") {
      const query = new URL(route.request().url()).searchParams;
      expect(query.get("class_level")).toBe("Class 8"); expect(query.get("subject")).toBe("Science");
    }
    return route.fulfill({headers,json:state});
  });
  await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/**`,route=>{
    if (route.request().method()==="OPTIONS") return route.fulfill({headers});
    const position = route.request().postDataJSON()?.last_position;
    if (position) {
      expect(position.notes_version).toBe(lesson.content_version);
      expect(position.notes_total_pages).toBe(3);
      expect(typeof position.notes_navigation_id).toBe("string");
      if (navigationId) expect(position.notes_navigation_id).toBe(navigationId);
      navigationId = position.notes_navigation_id;
      expect(Number.isInteger(position.notes_navigation_seq)).toBe(true);
      expect(position.notes_page_id).toBe(pages[position.notes_page].id);
      state = {...state,saved_page:position.notes_page,saved_page_id:position.notes_page_id,completed_page_ids:position.notes_completed_page_ids};
      writes++;
    }
    return route.fulfill({headers,json:{saved:true}});
  });
  await page.route(`${WORKSPACE_TEST_BACKEND}/coach/study-lab/complete-unit/**`,route=>{assessments++;return route.fulfill({headers,json:{}});});
  await page.goto(url);
  await expect(page.getByText("Page 1 of 3",{exact:true})).toBeVisible();
  await expect(page.getByRole("progressbar",{name:"Reading progress"})).toHaveAttribute("value","0");
  await expect(page.getByRole("progressbar",{name:"Reading progress"})).toHaveAttribute("max","3");
  expect(writes).toBe(0);
  const interrupt = page.getByRole("complementary",{name:"Predict the molecule"});
  await interrupt.getByText("Show a hint",{exact:true}).click();
  await interrupt.getByText("Reveal the explanation",{exact:true}).click();
  await expect(interrupt.locator("sub").first()).toBeVisible();
  await page.getByRole("button",{name:"Next",exact:true}).click();
  await expect(page.getByText("Page 2 of 3",{exact:true})).toBeVisible();
  await expect.poll(()=>state.completed_page_ids).toEqual([pages[0].id]);
  await expect(page.getByText("NCERT",{exact:true}).first()).toBeVisible();
  await page.getByText("See the full reasoning",{exact:true}).click();
  await expect(page.getByText("The molecules remain H2O before and after melting; their arrangement and freedom of movement change.",{exact:false})).toBeVisible();
  await page.getByText("Source material awaiting review",{exact:true}).click();
  await expect(page.getByText(lesson.review_required![0].reason,{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Mark page read",exact:true}).click();
  await expect.poll(()=>state.completed_page_ids?.length).toBe(2);
  await page.getByRole("button",{name:"Next",exact:true}).click();
  await page.getByRole("button",{name:"Mark page read",exact:true}).click();
  await expect(page.getByText("3 of 3 pages read",{exact:true})).toBeVisible();
  await expect.poll(()=>state.completed_page_ids?.length).toBe(3);
  expect(assessments).toBe(0);
  await page.reload();
  await expect(page.getByText("Page 3 of 3",{exact:true})).toBeVisible();
  await expect(page.getByText("3 of 3 pages read",{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("dynamic-completed-notes.png")});
  let learning: Record<string,unknown> = {};
  await page.route(`${WORKSPACE_TEST_BACKEND}/coach/chat/stream`,route=>{
    if (route.request().method()==="OPTIONS") return route.fulfill({headers});
    learning=route.request().postDataJSON().learning_context;
    return route.fulfill({headers,contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"turn_event",event:"answer.completed",answer:"Cutting changes size while the substance remains H2O.",blocks:[]})}\n\ndata: [DONE]\n\n`});
  });
  await page.getByRole("link",{name:"Ask AI about this page"}).click();
  await page.getByRole("textbox",{name:"Message your AI tutor"}).fill("Explain this application.");
  await page.getByRole("button",{name:"Send message"}).click();
  await expect.poll(()=>learning.notes_page_id).toBe(pages[2].id);
  expect(learning.notes_page_number).toBe(3);
  expect(learning.notes_source_fingerprint).toBe(lesson.source_fingerprint);
  expect(learning.selected_subject).toBe("Science"); expect(learning.class_level).toBe("Class 8");
  expect(learning.notes_subtopic_ids).toEqual(pages[2].source_section_ids);
  await page.getByRole("link",{name:"Return to notes page"}).click();
  await expect(page.getByText("Page 3 of 3",{exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.get("pageId")).toBe(pages[2].id);
  expect(new URL(page.url()).searchParams.get("notesVersion")).toBe(lesson.content_version);
});

test("regeneration rebases stale page IDs and completion against the new content",async({page})=>{
  await installWorkspaceMocks(page);
  const updated: ChapterNotes = {...lesson,content_version:"adaptive_notes_v2_water_changed",progress_rebased:true,
    pages:[{...pages[0],id:"new-observation"},pages[1],{...pages[2],id:"new-practice"},{...pages[2],id:"new-revision",page_number:4,title:"A final comparison"}],
    saved_page:1,saved_page_id:pages[1].id,completed_page_ids:[]};
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:updated}));
  await page.goto(`${url}&page=2&pageId=${pages[2].id}&notesVersion=${lesson.content_version}`);
  await expect(page.getByText("Page 2 of 4",{exact:true})).toBeVisible();
  await expect(page.getByText("0 of 4 pages read",{exact:true})).toBeVisible();
  await expect(page.getByRole("status").filter({hasText:"These notes have been updated"})).toBeVisible();
  await expect(page.locator("article h2")).toHaveText(pages[1].title);
});

test("missing or conflicting sources receive an explicit review state rather than filler notes",async({page})=>{
  await installWorkspaceMocks(page);
  let reviewed = false;
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:reviewed ? lesson : {
    ...lesson,resolution:"review_required",pages:[],review_required:[{reason:"The source sections disagree on the conditions for this statement."}],
  }}));
  await page.goto(url);
  await expect(page.getByRole("region",{name:"Source review needed"})).toBeVisible();
  await expect(page.getByText("The source sections disagree on the conditions for this statement.",{exact:true})).toBeVisible();
  await expect(page.getByRole("navigation",{name:"Reading pages"})).toHaveCount(0);
  await expect(page.locator("article")).toHaveCount(0);
  reviewed = true;
  await page.getByRole("button",{name:"Retry loading notes"}).click();
  await expect(page.getByText("Page 1 of 3",{exact:true})).toBeVisible();
});

test("notes can contain more than ten pages and save their last actual page",async({page})=>{
  await installWorkspaceMocks(page);
  const longer: ChapterNotes = {...lesson,pages:Array.from({length:12},(_,i)=>({...pages[i%pages.length],id:`extended-${i}`,page_number:i+1})),saved_page:11,saved_page_id:"extended-11"};
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:longer}));
  let saved: Record<string,unknown> = {};
  await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/**`,route=>{
    if (route.request().method()==="OPTIONS") return route.fulfill({headers});
    saved=route.request().postDataJSON().last_position;
    return route.fulfill({headers,json:{saved:true}});
  });
  await page.goto(url);
  await expect(page.getByText("Page 12 of 12",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Next",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Mark page read",exact:true}).click();
  await expect.poll(()=>saved.notes_total_pages).toBe(12);
  expect(saved.notes_page).toBe(11);expect(saved.notes_page_id).toBe("extended-11");
  expect(saved.notes_completed_page_ids).toEqual(["extended-11"]);
});

test("advanced worked previews reveal complete solutions and Markdown keeps scientific notation",async({page})=>{
  await installWorkspaceMocks(page);
  const calculation = {...lesson,pages:[{...pages[0],text:"A source-backed worked example",blocks:[
    {kind:"worked_example",source_type:"NCERT",presentation:"source_preview",text:"Given m = 60 g and V = 20 cm^3, find density.",
      expanded_text:"Given m = 60 g and V = 20 cm^3, find density. Use density = mass / volume. Substitute: 60 / 20 = 3 g cm^(-3). Water is H2O; the amount formula is $n = m/M$."},
  ]}],saved_page_id:pages[0].id};
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:calculation}));
  await page.goto(url);
  await expect(page.getByText(/Substitute: 60 \/ 20/)).not.toBeVisible();
  await page.getByText("Reveal full worked solution",{exact:true}).click();
  await expect(page.getByText(/Substitute: 60 \/ 20/)).toBeVisible();
  await expect(page.getByText(/Water is H₂O/)).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
});

test("a saved route in another class and subject opens its current notes directly",async({page})=>{
  await installWorkspaceMocks(page);
  const universal = JSON.parse(JSON.stringify(planned.route)
    .replaceAll("ncert_class_11_chemistry_chapter_01","published_class_8_science_matter")
    .replaceAll("some_basic_concepts_of_chemistry",lesson.chapter.slug)
    .replaceAll("chem11_u01_lu01_chemistry_and_its_importance",lesson.topic_id!)
    .replaceAll("Class 11","Class 8").replaceAll("Chemistry","Science")
    .replaceAll("Some Basic Concepts of Science",lesson.chapter.name)) as typeof planned.route;
  await page.route(`${WORKSPACE_TEST_BACKEND}/catalog`,route=>route.fulfill({headers,json:{source:"published",subjects:[{subject:"Science",class_level:"Class 8",chapters:[{slug:lesson.chapter.slug,name:lesson.chapter.name,chapter_number:1,topics:[{id:lesson.topic_id,label:lesson.topic_title}]}]}]}}));
  await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/**`,route=>route.fulfill({headers,json:universal}));
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:lesson}));
  await page.goto("/dashboard/planning/active");
  await expect(page.getByRole("button",{name:"Start today’s route",exact:true})).toBeVisible({timeout:30000});
  await page.getByRole("button",{name:"Start today’s route",exact:true}).click();
  await expect(page.getByText("Page 1 of 3",{exact:true})).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/dashboard/study/notes/${lesson.chapter.slug}`);
  expect(new URL(page.url()).searchParams.get("topic")).toBe(lesson.topic_id);
  expect(new URL(page.url()).searchParams.get("classLevel")).toBe("Class 8");
  expect(universal.user_id).toBe(WORKSPACE_TEST_USER_ID);
});
