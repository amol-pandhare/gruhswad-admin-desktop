const indiaDate = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

export function indiaToday(now=new Date()){
  const parts=Object.fromEntries(indiaDate.formatToParts(now).map((part)=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addCalendarDays(value:string,days:number){const [year,month,day]=value.split("-").map(Number);return new Date(Date.UTC(year,month-1,day+days)).toISOString().slice(0,10);}
export function tomorrowInIndia(now=new Date()){return addCalendarDays(indiaToday(now),1);}
export function weeklyWindow(now=new Date()){const tomorrow=tomorrowInIndia(now);return Array.from({length:7},(_,index)=>addCalendarDays(tomorrow,index));}

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
