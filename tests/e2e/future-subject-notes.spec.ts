import { expect, test } from "@playwright/test";
import type { ChapterNotes, NotePage } from "../../features/study/api";
import { isPlanningPortfolio } from "../../features/planning/contracts";
import planned from "./fixtures/planned-learning.json";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND, WORKSPACE_TEST_USER_ID } from "./helpers/mockWorkspace";

// These are browser transport fixtures, not claims about uploaded production
// curriculum. Backend integration tests exercise the actual source compiler.
const headers = {
  "access-control-allow-origin":"*", "access-control-allow-headers":"Authorization, Content-Type",
  "access-control-allow-methods":"GET, POST, OPTIONS",
};
const subjects = [
  {subject:"Physics",classLevel:"Class 11",chapter:"motion_in_a_straight_line",chapterName:"Motion in a Straight Line",topic:"average_acceleration",title:"Average acceleration",range:{min:30,max:40},
    content:[
      ["What acceleration measures","Acceleration describes the change in velocity per unit time. Velocity includes direction, so acceleration also depends on direction."],
      ["Use the average-acceleration relationship","For a time interval, average acceleration = (final velocity − initial velocity) / elapsed time. Use a consistent positive direction."],
      ["Check dimensions and meaning","The SI unit of acceleration is m s⁻². A negative acceleration indicates a direction relative to the chosen positive direction; it does not by itself establish whether the object is slowing down."],
      ["Work an average-acceleration example","A velocity changes from 2 m s⁻¹ to 8 m s⁻¹ in 3 s. Average acceleration = (8 − 2) / 3 = 2 m s⁻²."],
    ]},
  {subject:"Mathematics",classLevel:"Class 10",chapter:"quadratic_equations",chapterName:"Quadratic Equations",topic:"quadratic_formula",title:"Solving quadratic equations",range:{min:45,max:55},
    content:[
      ["Recognise a quadratic equation","A quadratic equation in one variable can be written as ax² + bx + c = 0, where a ≠ 0."],
      ["Write the standard form","Move all terms to one side and combine like terms before identifying a, b and c."],
      ["Identify coefficients with signs","For x² − 5x + 6 = 0, a = 1, b = −5 and c = 6. Retain the negative sign in b."],
      ["Understand what a root means","A root is a value of the variable that makes the equation true when substituted."],
      ["Define the discriminant","For ax² + bx + c = 0, the discriminant is D = b² − 4ac."],
      ["Calculate this discriminant","For x² − 5x + 6 = 0, D = (−5)² − 4 × 1 × 6 = 25 − 24 = 1."],
      ["Relate the sign to real roots","A positive discriminant gives two distinct real roots; zero gives two equal real roots; a negative discriminant gives no real roots."],
      ["State the quadratic formula","The roots are x = (−b ± √(b² − 4ac)) / (2a), where a ≠ 0. For real roots, the discriminant must be nonnegative."],
      ["Substitute coefficients carefully","For x² − 5x + 6 = 0, substitution gives x = (5 ± √1) / 2."],
      ["Evaluate both signs","The two values are (5 + 1) / 2 = 3 and (5 − 1) / 2 = 2."],
      ["Verify each root in the original equation","For x = 2, 4 − 10 + 6 = 0. For x = 3, 9 − 15 + 6 = 0. Both values satisfy the original equation."],
      ["Keep the conditions and scope","The formula assumes a ≠ 0. Restricting the solution to real numbers also requires b² − 4ac ≥ 0."],
    ]},
];

test("Study Lab keeps Chemistry, Physics and Mathematics visible together for one class",async({page})=>{
  await installWorkspaceMocks(page);
  const physics=subjects[0];const {notes}=fixtureFor(physics);
  const chapter=(slug:string,name:string,topic:string)=>({slug,name,topics:[{id:topic,label:topic}]});
  await page.route(`${WORKSPACE_TEST_BACKEND}/catalog`,route=>route.fulfill({headers,json:{source:"published",subjects:[
    {class_level:"Class XI",subject:"Chemistry",chapters:[chapter("chemistry_basics","Chemistry basics","matter")]},
    {class_level:"11",subject:"Physics",chapters:[chapter(physics.chapter,physics.chapterName,physics.topic)]},
    {class_level:"Grade XI",subject:"Mathematics",chapters:[chapter("math_relations","Mathematical relations","functions")]},
    {class_level:"10",subject:"Mathematics",chapters:[chapter("other_class","Different class chapter","other")]},
  ]}}));
  await page.route(`${WORKSPACE_TEST_BACKEND}/coach/study-lab/context/**`,route=>route.fulfill({headers,status:404,json:{detail:"No saved learning route"}}));
  await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,route=>route.fulfill({headers,json:notes}));
  await page.goto("/dashboard/study");
  const select=page.getByRole("combobox",{name:"Chapter",exact:true});
  await expect(select.getByRole("option")).toHaveText(["Chemistry basics",physics.chapterName,"Mathematical relations"]);
  await select.selectOption(physics.chapter);
  await page.getByRole("button",{name:"Start learning",exact:true}).click();
  await expect(page.getByText("Page 1 of 4",{exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.get("subject")).toBe("Physics");
  expect(new URL(page.url()).searchParams.get("classLevel")).toBe("11");
});

function fixtureFor(scope:typeof subjects[number]) {
  const pages:NotePage[] = scope.content.map(([title,text],index)=>({
    id:`${scope.topic}-page-${index+1}`,page_number:index+1,title,text,
    source_types:[index===scope.content.length-1 ? "NCERT_FALLBACK" : "MASTER_NOTES"],
    source_section_ids:[`${scope.topic}_outcome_${index+1}`],
    blocks:[{kind:index===scope.content.length-1 ? "conditions" : "explanation",text,
      source_type:index===scope.content.length-1 ? "NCERT_FALLBACK" : "MASTER_NOTES"}],
  }));
  const notes:ChapterNotes={resolution:"lesson",catalog_source:"published",chapter:{slug:scope.chapter,name:scope.chapterName,
    class_level:scope.classLevel,subject:scope.subject,chapter_number:scope.subject==="Physics" ? 3 : 4},
    topic_id:scope.topic,topic_title:scope.title,active_unit_id:scope.topic,can_save_position:true,
    estimated_minutes:scope.range,proficiency:"know_the_basics",explanation_style:"balanced",content_version:`adaptive_notes_v2_${scope.topic}_fixture`,
    source_fingerprint:`${scope.topic}-reviewed-source`,pages,saved_page:0,saved_page_id:pages[0].id,completed_page_ids:[],concepts:[],
  };
  const route=structuredClone(planned.route);
  const chapter=route.chapters[0];
  const unit=chapter.learning_units[0];
  const key=`published_${scope.classLevel.replaceAll(" ","_").toLowerCase()}_${scope.subject.toLowerCase()}_${scope.chapter}`;
  Object.assign(unit,{id:scope.topic,title:scope.title,primary_topic_id:`${scope.topic}_outcome_1`,short_description:scope.content[0][1],
    estimated_minutes:scope.range,dependent_unit_ids:[],ncert_sections:pages.map(p=>({id:p.source_section_ids![0],title:p.title})),
    ncert_subtopics:pages.map(p=>({id:p.source_section_ids![0],title:p.title,section_id:p.source_section_ids![0]})),
    concepts:pages.map(p=>({id:p.source_section_ids![0],title:p.title,status:"not_started",evidence_count:0})),
    learning_route:["Understand the relationship","Work an example","Check conditions"],skills:[scope.content[0][1]],
    mastery_criteria:["Explain and apply the relationship with its conditions."],practice:["Check the worked example."],why_it_matters:scope.content[0][1]});
  const next={...chapter.next_step,unit_id:scope.topic,title:scope.title,estimated_minutes:scope.range,
    reason:"Continue the current source-mapped learning topic.",outcome:"Apply the relationship and retain its conditions."};
  Object.assign(chapter,{curriculum_key:key,chapter_slug:scope.chapter,chapter:scope.chapterName,learning_units:[unit],next_step:next,
    progress:{...chapter.progress,total_units:1},coverage:{status:"complete",included_unit_ids:[scope.topic],unit_count:1},
    completion_criteria:["Explain the relationship, solve an example and check its conditions."],
    curriculum:{...chapter.curriculum,key,source:`NCERT ${scope.subject}`,chapter_number:notes.chapter.chapter_number,
      source_reference:{...chapter.curriculum.source_reference,authority:"approved_content_pipeline",type:"published_chapter",path:scope.chapter}}});
  Object.assign(route,{subject:scope.subject,class_level:scope.classLevel,chapters:[chapter],study_time_today:"30",
    global_next_step:{...route.global_next_step,...next,curriculum_key:key,chapter_slug:scope.chapter,chapter:scope.chapterName,
      selection_reason:"Continue this unfinished, source-mapped topic."},aggregate_progress:{...route.aggregate_progress,total_units:1},
    effective_proficiency:{[key]:{effective:"know_the_basics",demonstrated_accuracy:0}},
    current_step:{...route.current_step,current_unit_id:scope.topic,current_unit_title:scope.title,current_unit_activity:next.reason,
      current_unit_minutes:25,recommended_approach:unit.learning_route,outcome:next.outcome,key_notes:unit.skills}});
  route.today_route={...route.today_route,budget_minutes:30,total_minutes:30,estimated_minutes:{min:25,max:30},items:route.today_route.items.map((item,index)=>({...item,
    unit_id:scope.topic,title:scope.title,curriculum_key:key,chapter_slug:scope.chapter,chapter:scope.chapterName,
    minutes:index===0 ? 25 : 5,activity:index===0 ? next.reason : "Check the relationship and conditions."}))};
  route.portfolio={...route.portfolio,class_level:scope.classLevel,subject:scope.subject,study_time_today:"30",chapters:[chapter],global_next_step:route.global_next_step,
    today_route:route.today_route,aggregate_progress:route.aggregate_progress};
  return {notes,route,pages};
}

for (const scope of subjects) {
  test(`${scope.subject} starts its current notes directly, completes ${scope.content.length} notes pages and preserves exact Ask AI scope`,async({page})=>{
    await installWorkspaceMocks(page);
    const {notes,route,pages}=fixtureFor(scope);
    expect(isPlanningPortfolio(route.portfolio)).toBe(true);
    let state=structuredClone(notes);
    let learning:Record<string,unknown>={};
    const errors:string[]=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route(`${WORKSPACE_TEST_BACKEND}/catalog`,request=>request.fulfill({headers,json:{source:"published",subjects:[{
      class_level:scope.classLevel,subject:scope.subject,chapters:[{slug:scope.chapter,name:scope.chapterName,
        chapter_number:notes.chapter.chapter_number,topics:[{id:scope.topic,label:scope.title}]}],
    }]}}));
    await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/**`,request=>{
      if (request.request().method()==="OPTIONS") return request.fulfill({headers});
      if (request.request().method()==="GET") return request.fulfill({headers,json:route});
      const position=request.request().postDataJSON()?.last_position;
      if (position?.notes_version) {
        expect(position.unit_id).toBe(scope.topic);expect(position.notes_topic).toBe(scope.topic);
        expect(position.notes_version).toBe(notes.content_version);expect(position.notes_total_pages).toBe(pages.length);
        expect(position.notes_page_id).toBe(pages[position.notes_page].id);
        state={...state,saved_page:position.notes_page,saved_page_id:position.notes_page_id,completed_page_ids:position.notes_completed_page_ids};
      }
      return request.fulfill({headers,json:{saved:true}});
    });
    await page.route(`${WORKSPACE_TEST_BACKEND}/notes/**`,request=>{
      if (request.request().method()==="OPTIONS") return request.fulfill({headers});
      const url=new URL(request.request().url());
      expect(url.pathname).toBe(`/notes/${scope.chapter}`);
      expect(url.searchParams.get("subject")).toBe(scope.subject);expect(url.searchParams.get("class_level")).toBe(scope.classLevel);
      expect(url.searchParams.get("topic_id")).toBe(scope.topic);
      return request.fulfill({headers,json:state});
    });
    await page.route(`${WORKSPACE_TEST_BACKEND}/coach/chat/stream`,request=>{
      if (request.request().method()==="OPTIONS") return request.fulfill({headers});
      learning=request.request().postDataJSON().learning_context;
      return request.fulfill({headers,contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"turn_event",event:"answer.completed",answer:scope.content.at(-1)![1],blocks:[]})}\n\ndata: [DONE]\n\n`});
    });
    await page.goto("/dashboard/planning/active");
    await page.getByRole("button",{name:"Start today’s route",exact:true}).click();
    await expect(page.getByText(`Page 1 of ${pages.length}`,{exact:true})).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/dashboard/study/notes/${scope.chapter}`);
    await expect(page.getByRole("progressbar",{name:"Reading progress"})).toHaveAttribute("max",String(pages.length));
    await expect(page.locator("article h2")).toHaveText(pages[0].title);
    for (let index=1;index<pages.length;index++) {
      await page.getByRole("button",{name:"Next",exact:true}).click();
      await expect(page.getByText(`Page ${index+1} of ${pages.length}`,{exact:true})).toBeVisible();
    }
    await page.getByRole("button",{name:"Mark page read",exact:true}).click();
    await expect.poll(()=>state.completed_page_ids?.length).toBe(pages.length);
    await page.reload();
    await expect(page.getByText(`Page ${pages.length} of ${pages.length}`,{exact:true})).toBeVisible();
    await expect(page.getByText(`${pages.length} of ${pages.length} pages read`,{exact:true})).toBeVisible();
    await expect(page.getByText("Supplementary NCERT",{exact:true}).first()).toBeVisible();
    await page.getByRole("link",{name:"Ask AI about this page"}).click();
    await page.getByRole("textbox",{name:"Message your AI tutor"}).fill("Why is the condition on this page important?");
    await page.getByRole("button",{name:"Send message"}).click();
    await expect.poll(()=>learning.notes_page_id).toBe(pages.at(-1)!.id);
    expect(learning.selected_subject).toBe(scope.subject);expect(learning.class_level).toBe(scope.classLevel);
    expect(learning.selected_chapter_id).toBe(scope.chapter);expect(learning.selected_topic_id).toBe(scope.topic);
    expect(learning.notes_page_number).toBe(pages.length);expect(learning.notes_subtopic_ids).toEqual(pages.at(-1)!.source_section_ids);
    expect(learning.notes_content_version).toBe(notes.content_version);expect(learning.notes_proficiency).toBe(notes.proficiency);
    await page.getByRole("link",{name:"Return to notes page"}).click();
    await expect(page.getByText(`Page ${pages.length} of ${pages.length}`,{exact:true})).toBeVisible();
    await expect(page.getByText(`${pages.length} of ${pages.length} pages read`,{exact:true})).toBeVisible();
    expect(new URL(page.url()).searchParams.get("pageId")).toBe(pages.at(-1)!.id);
    expect(route.user_id).toBe(WORKSPACE_TEST_USER_ID);expect(errors).toEqual([]);
  });
}
