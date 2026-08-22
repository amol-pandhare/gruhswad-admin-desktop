export const YOUTUBE_ID=/^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(input:string):string|null{
  const value=input.trim();if(!value)return null;
  let url:URL;try{url=new URL(value)}catch{return null}
  const host=url.hostname.toLowerCase().replace(/^www\./,"");let id="";
  if(host==="youtu.be")id=url.pathname.split("/").filter(Boolean)[0]??"";
  else if(host==="youtube.com"||host==="m.youtube.com"){
    if(url.pathname==="/watch")id=url.searchParams.get("v")??"";
    else if(url.pathname.startsWith("/shorts/")||url.pathname.startsWith("/embed/"))id=url.pathname.split("/")[2]??"";
  }
  return YOUTUBE_ID.test(id)?id:null;
}
export function youtubeDisplayUrl(id:string){if(!YOUTUBE_ID.test(id))throw new Error("Invalid YouTube video ID.");return `https://www.youtube.com/watch?v=${id}`}
export function youtubeEmbedUrl(id:string){if(!YOUTUBE_ID.test(id))throw new Error("Invalid YouTube video ID.");return `https://www.youtube-nocookie.com/embed/${id}`}

export function baseQuantity(packQuantity:number,packUnit:string,unitsPerPack:number,baseUnit:"g"|"ml"|"unit"){
  const multiplier=packUnit==="kg"?1000:packUnit==="l"?1000:packUnit==="pack"?unitsPerPack:1;
  if((baseUnit==="g"&&!['g','kg','pack'].includes(packUnit))||(baseUnit==="ml"&&!['ml','l','pack'].includes(packUnit))||(baseUnit==="unit"&&!['unit','pack'].includes(packUnit)))throw new Error("Purchase unit is incompatible with the stock base unit.");
  return packQuantity*multiplier;
}
export function weightedAverage(onHand:number,averageCost:number,received:number,totalCost:number){const total=onHand+received;return total<=0?0:(onHand*averageCost+totalCost)/total}

const iso=(date:Date)=>date.toISOString().slice(0,10);
const addDays=(value:string,days:number)=>{const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return iso(date)};
export function nextTiffinPeriod(start:string,cadence:"weekly"|"monthly",planEnd?:string|null){let end:string;if(cadence==="weekly")end=addDays(start,6);else{const date=new Date(`${start}T00:00:00Z`),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);const nextStart=iso(date);const target=new Date(`${nextStart}T00:00:00Z`);target.setUTCDate(Math.min(day,new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));end=addDays(iso(target),-1)}if(planEnd&&end>planEnd)end=planEnd;return{start,end,next:addDays(end,1)}}
export function countTiffinServices(start:string,end:string,weekdays:number[],mealSlots:string[],people:number){let days=0;for(let value=start;value<=end;value=addDays(value,1)){if(weekdays.includes(new Date(`${value}T00:00:00Z`).getUTCDay()))days++}return days*mealSlots.length*people}

function positiveWholeNumbers(value:unknown){
  if(typeof value==="number")return Number.isInteger(value)&&value>0?[value]:[];
  if(typeof value!=="string")return [];
  return [...value.matchAll(/\d[\d,]*/g)].map(match=>Number(match[0].replaceAll(",",""))).filter(number=>Number.isInteger(number)&&number>0&&number<=100000);
}

/** Uses the largest explicit count without interpreting free-form notes as arithmetic. */
export function enquiryRequestedQuantity(requirements:Record<string,unknown>){
  const candidates=[...positiveWholeNumbers(requirements.guestCount),...positiveWholeNumbers(requirements.peopleCount),...positiveWholeNumbers(requirements.quantityNotes)];
  return candidates.length?Math.max(...candidates):1;
}

export function enquiryWeekdays(frequency:unknown){
  if(typeof frequency!=="string"||!frequency.trim())return[1,2,3,4,5];
  const normalized=frequency.toLowerCase();
  if(/daily|every day|all days/.test(normalized))return[0,1,2,3,4,5,6];
  if(/weekday|monday\s*[-–]\s*friday|mon\s*[-–]\s*fri/.test(normalized))return[1,2,3,4,5];
  const names=[[0,/sun(day)?/],[1,/mon(day)?/],[2,/tue(sday)?/],[3,/wed(nesday)?/],[4,/thu(rsday)?/],[5,/fri(day)?/],[6,/sat(urday)?/]] as const;
  const selected=names.filter(([,pattern])=>pattern.test(normalized)).map(([day])=>day);
  return selected.length?selected:[1,2,3,4,5];
}

const operationalOrderRanks:Record<string,number>={draft:-1,awaiting_review:0,confirmed:1,preparing:2,ready:3,completed:4};
export function assertOperationalOrderTransition(current:string,next:string){
  if(current===next)return;
  if(["completed","cancelled"].includes(current))throw new Error("Completed and cancelled orders are terminal.");
  if(next==="cancelled")return;
  if(!(next in operationalOrderRanks)||!(current in operationalOrderRanks)||operationalOrderRanks[next]<operationalOrderRanks[current])throw new Error("Order status cannot move backwards.");
  if(operationalOrderRanks[next]>operationalOrderRanks[current]+1)throw new Error("Complete the next operational step before moving further.");
}
