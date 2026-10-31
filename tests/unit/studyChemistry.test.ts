import { describe, expect, it } from "vitest";
import {
  normalizeSubscriptGlyphs,
  tokenizeStudyText,
} from "@/lib/studyChemistry";

describe("study chemistry text transforms", () => {
  it("normalizes unicode subscript glyphs for consistent parsing", () => {
    expect(normalizeSubscriptGlyphs("C\u2086H\u2081\u2082O\u2086")).toBe("C6H12O6");
    expect(normalizeSubscriptGlyphs("C\u2099H\u2082\u2099\u208A\u2082")).toBe("CnH2n+2");
  });

  it("tokenizes formulas, hybridization, and variable powers without losing text", () => {
    expect(tokenizeStudyText("Bonding in H2O uses sp3 orbitals and x^-2 terms.")).toEqual([
      { kind: "text", value: "Bonding in " },
      { kind: "formula", atoms: [{ symbol: "H", subscript: "2" }, { symbol: "O", subscript: "" }], superscript: "" },
      { kind: "text", value: " uses " },
      { kind: "hybridization", superscript: "3" },
      { kind: "text", value: " orbitals and " },
      { kind: "variable_power", value: "x", superscript: "-2" },
      { kind: "text", value: " terms." },
    ]);
  });

  it("leaves non-chemical words as text", () => {
    expect(tokenizeStudyText("Carbon and water are words here.")).toEqual([
      { kind: "text", value: "Carbon and water are words here." },
    ]);
  });
});


describe("scientific notes notation", () => {
  it("renders the circled SI prefixes and source-PDF exponent variants", () => {
    for (const notation of ["10^3", "10^-3", "10^(-6)", "10^{-9}"]) {
      const parts=tokenizeStudyText(notation);
      expect(parts).toHaveLength(1);
      expect(parts[0].kind).toBe("variable_power");
    }
    expect(tokenizeStudyText("10⁻³")).toEqual([{kind:"text",value:"10⁻³"}]);
    expect(tokenizeStudyText("cm^3 mol^(-1) kg m^(-3)").filter(p=>p.kind==="variable_power")).toHaveLength(3);
  });
  it("retains values and renders compound ion charges", () => {
    expect(tokenizeStudyText("SO₄²⁻")).toEqual([{kind:"formula",atoms:[{symbol:"S",subscript:""},{symbol:"O",subscript:"4"}],superscript:"2-"}]);
    expect(tokenizeStudyText("Fe^{3+}")).toEqual([{kind:"formula",atoms:[{symbol:"Fe",subscript:""}],superscript:"3+"}]);
    expect(tokenizeStudyText("6.02214076 x 10^23")).toEqual([{kind:"text",value:"6.02214076 × "},{kind:"variable_power",value:"10",superscript:"23"}]);
  });
});
