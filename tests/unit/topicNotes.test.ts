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

import { notePoints } from "@/components/study/notePoints";
import ThemedNotePoints from "@/components/study/ThemedNotePoints";
describe("themed source bullets",()=>{
 it("separates ideas without rewriting words, decimals, abbreviations or parenthesised examples",()=>{
  const source="Density is 1.25 g cm⁻³. Examples (e.g. H₂O and CO₂) retain their notation. Temperature is 273.15 K; units remain unchanged.";
  const points=notePoints(source);
  expect(points).toHaveLength(4);
  expect(points.join(" ")).toBe(source);
  expect(points[1]).toContain("e.g. H₂O");
 });
 it("renders distinct semantic bullets and highlights source examples",()=>{
  const html=renderToStaticMarkup(createElement(ThemedNotePoints,{text:"Matter has mass. It occupies space. For example, water is matter."}));
  expect(html.match(/<li/g)).toHaveLength(3);
  expect(html).toContain("In practice");
 });
 it("keeps math expressions intact",()=>{
  const display = "$$\nM = \\frac{n}{V}\n$$";
  expect(notePoints(display)).toEqual([display]);
  expect(notePoints("$M = \\frac{n}{V}$. Use the supplied units.")).toHaveLength(1);
 });
});
