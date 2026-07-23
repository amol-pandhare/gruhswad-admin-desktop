type UnknownRecord = Record<string, unknown>;

function objectValue(value:unknown):UnknownRecord {
  if(value&&typeof value==="object"&&!Array.isArray(value))return value as UnknownRecord;
  if(typeof value==="string")try{const parsed=JSON.parse(value);return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};}catch{return {};}
  return {};
}

export function normalizeCloudOrderLine(line:UnknownRecord){
  const item=objectValue(line.item_snapshot),quantity=Math.max(1,Number(line.quantity)||1),lineTotal=Number(line.line_total)||0;
  const selectionValue=typeof line.bundle_selection==="string"?(()=>{try{return JSON.parse(line.bundle_selection);}catch{return [];}})():line.bundle_selection;
  const selections=Array.isArray(selectionValue)?selectionValue:[];
  const unitPrice=Number(line.unit_total)||Number(item.basePrice)||lineTotal/quantity||0;
  return {...line,name:String(item.name??line.item_id??"Menu item"),portion:String(item.portion??""),itemType:String(item.type??"dish"),quantity,unit_price:unitPrice,line_total:lineTotal,item_snapshot:item,bundle_selection:selections};
}
