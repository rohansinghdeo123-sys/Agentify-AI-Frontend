import { describe, expect, it } from "vitest";
import { normalizeClassLevel } from "@/lib/syllabusIdentity";
import { catalogCacheKey, mapBackendCatalog } from "@/lib/catalog";
import { planningCatalogClassMatches } from "@/features/planning/api";

describe("future syllabus class identity",()=>{
  const roman=["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
  it.each(roman.map((value,index)=>[value,String(index+1)]))("matches class %s to numeric %s",(value,numeric)=>{
    expect(normalizeClassLevel(`Class ${value}`)).toBe(numeric);
    expect(planningCatalogClassMatches(`Grade ${value}`,`Class ${numeric}`)).toBe(true);
    expect(catalogCacheKey("reader",`Class ${value}`)).toBe(catalogCacheKey("reader",numeric));
  });
  it("keeps different classes and accounts separate",()=>{
    expect(planningCatalogClassMatches("Class X","Class XI")).toBe(false);
    expect(catalogCacheKey("reader1","Class X")).not.toBe(catalogCacheKey("reader2","Class X"));
    expect(catalogCacheKey("reader","Class X")).not.toBe(catalogCacheKey("reader","Class XII"));
  });
  it("includes every published subject for the selected class",()=>{
    const chapter=(slug:string)=>({slug,name:slug,topics:[{id:`${slug}_topic`,label:"A mapped topic"}]});
    const payload={source:"published",subjects:[
      {class_level:"Class XI",subject:"Chemistry",chapters:[chapter("chemistry")]},
      {class_level:"11",subject:"Physics",chapters:[chapter("physics")]},
      {class_level:"Grade XI",subject:"Mathematics",chapters:[chapter("mathematics")]},
      {class_level:"Class X",subject:"Mathematics",chapters:[chapter("other_class")]},
    ]};
    expect(mapBackendCatalog(payload,"Class 11").map(c=>[c.value,c.subject]))
      .toEqual([["chemistry","Chemistry"],["physics","Physics"],["mathematics","Mathematics"]]);
    expect(mapBackendCatalog(payload,"10").map(c=>c.value)).toEqual(["other_class"]);
  });
});
