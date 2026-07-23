const indiaDate = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

export function normalizeServiceDate(value:unknown){
  if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const date=value instanceof Date?value:new Date(String(value));
  if(Number.isNaN(date.getTime()))return String(value??"");
  const parts=Object.fromEntries(indiaDate.formatToParts(date).map((part)=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function normalizeTimestamp(value:unknown){
  const date=value instanceof Date?value:new Date(String(value));
  return Number.isNaN(date.getTime())?String(value??""):date.toISOString();
}
