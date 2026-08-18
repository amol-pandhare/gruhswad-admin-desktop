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
