/** Keep catalog, saved Planning scopes and profile class labels comparable. */
export function normalizeClassLevel(value: string) {
  const key=value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_")
    .replace(/^(?:class|grade)_/,"").replace(/^_+|_+$/g,"");
  const roman: Record<string,string>={i:"1",ii:"2",iii:"3",iv:"4",v:"5",vi:"6",vii:"7",viii:"8",ix:"9",x:"10",xi:"11",xii:"12"};
  return roman[key] || key;
}
