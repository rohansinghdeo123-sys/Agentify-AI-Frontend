export interface ChemistryAtom {
  symbol: string;
  subscript: string;
}

export type StudyTextPart =
  | { kind: "text"; value: string }
  | { kind: "hybridization"; superscript: string }
  | { kind: "variable_subscript"; value: string; subscript: string }
  | { kind: "variable_power"; value: string; superscript: string }
  | { kind: "formula"; atoms: ChemistryAtom[]; superscript: string };

const CHEMICAL_ELEMENTS = new Set([
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr",
  "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba",
  "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W",
  "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U",
  "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt",
  "Ds", "Rg", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
]);

const CHEMICAL_ELEMENT_PATTERN = Array.from(CHEMICAL_ELEMENTS).sort((left, right) => right.length - left.length).join("|");
const NUMERIC_SUBSCRIPT_PATTERN = "(?:\\d+|[\\u2080-\\u2089]+)";
const ATOM_SUBSCRIPT_PATTERN = "(?:\\d*n(?:[+-]\\d+)?|n|\\d+|[\\u2080-\\u2089\\u2099\\u208A\\u208B]+)";
const ATOM_PATTERN = `(?:${CHEMICAL_ELEMENT_PATTERN})(?:${ATOM_SUBSCRIPT_PATTERN})?`;
const CHARGE_PATTERN = "(?:\\^[+-]?\\d+[+-]?|\\^[+-])?";
const FORMULA_CANDIDATE = [
  "sp\\d+",
  "[A-Za-z]_\\{?[A-Za-z]\\}?",
  "(?:10|[a-z]{1,4}|L|K)\\^(?:\\{[+\\-0-9]+\\}|\\([+\\-0-9]+\\)|[+\\-]?\\d+)",
  "[a-zA-Z]\\^-?\\d+",
  `(?:${ATOM_PATTERN}){2,}${CHARGE_PATTERN}`,
  `(?:${CHEMICAL_ELEMENT_PATTERN})${NUMERIC_SUBSCRIPT_PATTERN}${CHARGE_PATTERN}`,
  `(?:${CHEMICAL_ELEMENT_PATTERN})(?:\\^[+-]?\\d+[+-]?|\\^[+-])`,
].join("|");
const TOKEN_REGEX = new RegExp(`(?<![A-Za-z])(${FORMULA_CANDIDATE})(?![A-Za-z0-9\\u2080-\\u2089\\u2099\\u208A\\u208B^])`, "g");
const EXACT_TOKEN_REGEX = new RegExp(`^(?:${FORMULA_CANDIDATE})$`);
const ATOM_REGEX = new RegExp(`^(${CHEMICAL_ELEMENT_PATTERN})(\\d*n(?:[+-]\\d+)?|n|\\d+)?`);

const SUBSCRIPT_TEXT: Record<string, string> = {
  "\u2080": "0",
  "\u2081": "1",
  "\u2082": "2",
  "\u2083": "3",
  "\u2084": "4",
  "\u2085": "5",
  "\u2086": "6",
  "\u2087": "7",
  "\u2088": "8",
  "\u2089": "9",
  "\u2099": "n",
  "\u208A": "+",
  "\u208B": "-",
};

export function normalizeSubscriptGlyphs(value: string) {
  return value.replace(/[\u2080-\u2089\u2099\u208A\u208B]/g, (char) => SUBSCRIPT_TEXT[char] || char);
}

function parseStudyTextPart(piece: string): StudyTextPart {
  const normalizedPiece = normalizeSubscriptGlyphs(piece);
  const indexedSymbol = normalizedPiece.match(/^([A-Za-z])_\{?([A-Za-z])\}?$/);
  if (indexedSymbol) return {kind:"variable_subscript",value:indexedSymbol[1],subscript:indexedSymbol[2]};
  const hybridization = normalizedPiece.match(/^sp(\d+)$/);
  if (hybridization) return { kind: "hybridization", superscript: hybridization[1] };

  const variablePower = normalizedPiece.match(/^(10|[a-z]{1,4}|[A-Z])\^(?:\{([+\-0-9]+)\}|\(([+\-0-9]+)\)|([+\-]?\d+))$/);
  if (variablePower) {
    return { kind: "variable_power", value: variablePower[1], superscript: variablePower[2] || variablePower[3] || variablePower[4] };
  }

  const chargeMatch = normalizedPiece.match(/^(.+)\^([+-]?\d+[+-]?|[+-])$/);
  const formula = chargeMatch ? chargeMatch[1] : normalizedPiece;
  const superscript = chargeMatch ? chargeMatch[2] : "";
  const atoms: ChemistryAtom[] = [];
  let cursor = 0;

  while (cursor < formula.length) {
    const match = formula.slice(cursor).match(ATOM_REGEX);
    if (!match || !CHEMICAL_ELEMENTS.has(match[1])) break;
    atoms.push({ symbol: match[1], subscript: match[2] || "" });
    cursor += match[0].length;
  }

  const hasSubscript = atoms.some((atom) => atom.subscript);
  if (cursor !== formula.length || !atoms.length || (atoms.length === 1 && !hasSubscript && !superscript)) {
    return { kind: "text", value: piece };
  }

  return { kind: "formula", atoms, superscript };
}

/** Display normalization only; persisted source wording and hashes stay intact. */
export function normalizeScientificNotation(value: string): string {
  const powers: Record<string,string> = {"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9","⁻":"-","⁺":"+"};
  return value
    .replace(/([A-Z][A-Za-z0-9₀-₉)]*)([⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)/g, (_,base:string,power:string) => `${base}^${Array.from(power,c=>powers[c]).join("")}`)
    .replace(/\^([({]?)[−–]/g, "^$1-")
    .replace(/\^\{([+\-]?\d+[+\-]?|[+\-])\}/g, "^$1")
    .replace(/\bmicro \(u\)/g, "micro (µ)")
    .replace(/(\d)\s*x\s*(?=10\^)/g, "$1 × ")
    .replace(/(\d)\s+x\s+(?=\d)/g, "$1 × ")
    .replace(/\b(m|n) x (g|N_A)\b/g, "$1 × $2")
    .replace(/->/g, "→")
    .replace(/([A-Z][a-z]?)_\{(\d+)\}/g, "$1$2")
    .replace(/([A-Z][a-z]?)_(\d+)/g, "$1$2");
}

export function tokenizeStudyText(value: string): StudyTextPart[] {
  return normalizeScientificNotation(value)
    .split(TOKEN_REGEX)
    .filter(Boolean)
    .map((piece) => (EXACT_TOKEN_REGEX.test(piece) ? parseStudyTextPart(piece) : { kind: "text", value: piece }));
}
