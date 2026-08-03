import { runtimeConfigSchema, type RuntimeConfig } from "./contracts";

export const runtimeDefaults:RuntimeConfig={site:{brandName:"Gruhswad",tagline:"Taste of Home",mobile:"8123415647",orderCutoff:"Order before 9:00 PM for next-day delivery"},operations:{open:true,message:"",pickupEnabled:true,deliveryEnabled:false,preorderWindow:{start:"00:00",end:"21:00"}},announcement:{enabled:false,title:"",message:"",linkLabel:"",linkUrl:"",startsAt:null,endsAt:null},serviceArea:{pickupCities:["Bengaluru"],pickupState:"Karnataka",pickupCountry:"India",kitchenPlaceId:"",kitchenLatitude:null,kitchenLongitude:null,deliveryRadiusKm:5},orderingPlatforms:[],publicLocation:{enabled:false,name:"",address:"",mapQuery:"",googleMapsUrl:"",directions:""}};
function normalizedMobile(value:unknown){const digits=String(value??"").replace(/\D/g,"");return digits.length>=10?digits.slice(-10):runtimeDefaults.site.mobile;}
export function normalizeRuntimeSetting(key:string,payload:any){
  if(key==="site"){const value=payload&&typeof payload==="object"?payload:{};return{...runtimeDefaults.site,...value,mobile:normalizedMobile(value.mobile??value.displayPhone??value.whatsapp)};}
  if(key==="operations"){const value=payload&&typeof payload==="object"?payload:{};return{...runtimeDefaults.operations,...value,preorderWindow:{...runtimeDefaults.operations.preorderWindow,...(value.preorderWindow&&typeof value.preorderWindow==="object"?value.preorderWindow:{})}};}
  if(key==="announcement"){const value={...runtimeDefaults.announcement,...(payload&&typeof payload==="object"?payload:{})};const parsed=runtimeConfigSchema.shape.announcement.safeParse(value);return parsed.success?parsed.data:runtimeDefaults.announcement;}
  if(key==="service_area")return{...runtimeDefaults.serviceArea,...(payload&&typeof payload==="object"?payload:{})};
  if(key==="ordering_platforms")return Array.isArray(payload)?payload:runtimeDefaults.orderingPlatforms;
  if(key==="public_location")return{...runtimeDefaults.publicLocation,...(payload&&typeof payload==="object"?payload:{})};
  return payload;
}
export function runtimeConfigFromSettings(map:Record<string,unknown>):RuntimeConfig{return runtimeConfigSchema.parse({site:normalizeRuntimeSetting("site",map.site),operations:normalizeRuntimeSetting("operations",map.operations),announcement:normalizeRuntimeSetting("announcement",map.announcement),serviceArea:normalizeRuntimeSetting("service_area",map.service_area),orderingPlatforms:normalizeRuntimeSetting("ordering_platforms",map.ordering_platforms),publicLocation:normalizeRuntimeSetting("public_location",map.public_location)});}
