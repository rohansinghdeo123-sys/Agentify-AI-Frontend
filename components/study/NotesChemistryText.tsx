import { tokenizeStudyText } from "@/lib/studyChemistry";
export default function NotesChemistryText({text}:{text:string}) {
  return <>{tokenizeStudyText(text).map((p,i) => {
    if(p.kind === "text") return <span key={i}>{p.value}</span>;
    if(p.kind === "hybridization") return <span key={i}>sp<sup>{p.superscript}</sup></span>;
    if(p.kind === "variable_subscript") return <span key={i}>{p.value}<sub>{p.subscript}</sub></span>;
    if(p.kind === "variable_power") return <span key={i}>{p.value}<sup>{p.superscript}</sup></span>;
    return <span key={i}>{p.atoms.map((a,j)=><span key={j}>{a.symbol}{a.subscript?<sub>{a.subscript}</sub>:null}</span>)}{p.superscript?<sup>{p.superscript}</sup>:null}</span>;
  })}</>;
}
