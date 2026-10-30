import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import NotesChemistryText from "@/components/study/NotesChemistryText";
describe("notes scientific notation",()=>{
 it("preserves Unicode formula values and renders ASCII formula subscripts",()=>{
  const html=renderToStaticMarkup(createElement(NotesChemistryText,{text:"H₂O CO₂ H₂SO₄ Ca(OH)₂; H2O CO2; 273.15 K and 6.022 × 10²³ mol⁻¹"}));
  const visible=html.replace(/<[^>]+>/g,"");
  expect(visible).toContain("273.15 K");expect(visible).toContain("6.022 × 10²³ mol⁻¹");
  expect(html).toContain("<sub>2</sub>");expect(visible).toContain("Ca(OH)");
 });
});
