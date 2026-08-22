import React,{useState} from "react";
import type {EnquiryDetail} from "../shared/contracts";
import {indiaToday} from "../shared/dates";
import {enquiryRequestedQuantity,enquiryWeekdays} from "../shared/service-operations";

const text=(value:unknown,fallback="")=>typeof value==="string"?value:fallback;
const displayText=(value:unknown,fallback="")=>typeof value==="string"||typeof value==="number"?String(value):fallback;
const optionalText=(...values:unknown[])=>values.map(value=>text(value).trim()).find(Boolean)??"";

function mealSlots(value:unknown):("lunch"|"dinner")[]{
  const normalized=text(value,"lunch").toLowerCase();
  const slots:("lunch"|"dinner")[]=[];
  if(normalized.includes("lunch")||normalized.includes("both"))slots.push("lunch");
  if(normalized.includes("dinner")||normalized.includes("both"))slots.push("dinner");
  return slots.length?slots:["lunch"];
}

export function EnquiryConversion({detail,close,done,notify}:{detail:EnquiryDetail;close():void;done():Promise<void>;notify(message:string):void}){
  const requirements=detail.requirements;
  const requestedQuantity=enquiryRequestedQuantity(requirements);
  const tiffinPeople=Math.min(500,requestedQuantity);
  const verifiedAddress=optionalText(detail.address?.formattedAddress,detail.address?.address);
  const initialAddress=verifiedAddress||text(requirements.locality);
  const customer={name:detail.customer.name,phone:detail.customer.phone,email:detail.customer.email??"",archived:false};
  const [date,setDate]=useState(optionalText(requirements.preferredDate,requirements.startDate)||indiaToday());
  const [time,setTime]=useState("12:00");
  const [fulfilment,setFulfilment]=useState<"pickup"|"delivery">(optionalText(requirements.fulfilment,requirements.fulfilmentPreference)==="delivery"?"delivery":"pickup");
  const [deliveryAddress,setDeliveryAddress]=useState(initialAddress);
  const [adjustment,setAdjustment]=useState(0);
  const [cadence,setCadence]=useState<"weekly"|"monthly">("weekly");
  const [price,setPrice]=useState(0);
  const [people,setPeople]=useState(tiffinPeople);
  const [weekdays,setWeekdays]=useState(enquiryWeekdays(requirements.frequency));
  const [lines,setLines]=useState(detail.items.map(item=>({menuItemId:item.id,name:item.name,quantity:requestedQuantity,unitPrice:item.price,consumptionMode:"none" as const,recipeId:null})));

  function toggleWeekday(day:number){setWeekdays(current=>current.includes(day)?current.filter(value=>value!==day):[...current,day].sort())}

  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(detail.type==="tiffin"){
      const routine=[optionalText(requirements.requirement,requirements.routineDetails),text(requirements.frequency)&&`Frequency: ${text(requirements.frequency)}`,text(requirements.duration)&&`Expected duration: ${text(requirements.duration)}`].filter(Boolean).join("\n");
      const result=await window.admin.enquiries.convertTiffin(detail.id,{customer,startDate:date,endDate:null,weekdays,mealSlots:mealSlots(requirements.mealSlots),peopleCount:people,quantityNotes:text(requirements.quantityNotes),cadence,fulfilment,address:deliveryAddress,dietaryNotes:optionalText(requirements.dietary,requirements.restrictions),routineNotes:routine,defaultUnitPrice:price,adjustmentLabel:adjustment?"Quoted adjustment":"",adjustmentAmount:adjustment,status:"active",recipeId:null});
      notify(`${result.reference} created.${result.syncPending?" Enquiry status sync is pending.":""}`);
    }else{
      const notes=[optionalText(requirements.requirement,requirements.requirementDetails),text(requirements.quantityNotes)&&`Quantity expectations: ${text(requirements.quantityNotes)}`].filter(Boolean).join("\n");
      const result=await window.admin.enquiries.convertOrder(detail.id,{customer,serviceType:detail.type,serviceDetails:{occasion:text(requirements.occasion),guestCount:Number(requirements.guestCount)||requestedQuantity,dietary:optionalText(requirements.dietary,requirements.restrictions),packaging:text(requirements.packaging)},serviceDate:date,serviceEndDate:null,serviceStartTime:time,serviceEndTime:null,fulfilment,address:deliveryAddress,notes,source:{id:"direct",name:"Direct order"},status:"confirmed",adjustmentLabel:adjustment?"Quoted adjustment":"",adjustmentAmount:adjustment,enquiryId:detail.id,enquiryReference:detail.reference,tiffinPlanId:null,lines});
      notify(`${result.reference} created.${result.syncPending?" Enquiry status sync is pending.":""}`);
    }
    await done();close();
  }

  return <div className="editor-overlay" role="dialog" aria-modal="true"><form className="manual-order-modal" onSubmit={event=>submit(event).catch(error=>notify(error.message))}>
    <header><div><small>FINAL SERVICE REVIEW</small><h2>Convert {detail.reference}</h2></div><button className="button button-ghost" type="button" onClick={close}>Close</button></header>
    <p>Review timing, fulfilment and pricing. The resulting service is confirmed and inventory reservations begin immediately.</p>
    <fieldset className="service-details"><legend>Customer and service</legend><div className="form-grid">
      <label>Customer<input value={customer.name} readOnly/></label><label>Phone<input value={customer.phone} readOnly/></label>
      <label>Service start<input required type="date" value={date} onChange={event=>setDate(event.target.value)}/></label>
      {detail.type!=="tiffin"&&<label>Start time<input required type="time" value={time} onChange={event=>setTime(event.target.value)}/></label>}
      <label>Fulfilment<select value={fulfilment} onChange={event=>setFulfilment(event.target.value as "pickup"|"delivery")}><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label>
      <label>Adjustment<input type="number" value={adjustment} onChange={event=>setAdjustment(Number(event.target.value))}/></label>
      {detail.type==="tiffin"&&<><label>People<input required type="number" min="1" max="500" value={people} onChange={event=>setPeople(Number(event.target.value))}/><small>Defaulted to the largest captured people or quantity value: {tiffinPeople}.</small></label><label>Cadence<select value={cadence} onChange={event=>setCadence(event.target.value as "weekly"|"monthly")}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>Price per meal/person<input required type="number" min="0" value={price} onChange={event=>setPrice(Number(event.target.value))}/></label></>}
    </div></fieldset>
    {(fulfilment==="delivery"||initialAddress)&&<label>{fulfilment==="delivery"?"Delivery address":"Captured locality/address"}<textarea required={fulfilment==="delivery"} value={deliveryAddress} onChange={event=>setDeliveryAddress(event.target.value)}/></label>}
    {detail.type==="tiffin"&&<fieldset className="service-details"><legend>Required days</legend><div className="weekday-options">{[[0,"Sun"],[1,"Mon"],[2,"Tue"],[3,"Wed"],[4,"Thu"],[5,"Fri"],[6,"Sat"]].map(([day,label])=><label key={day}><input type="checkbox" checked={weekdays.includes(day as number)} onChange={()=>toggleWeekday(day as number)}/>{label}</label>)}</div><small>Prefilled from: {text(requirements.frequency,"No frequency supplied; Monday-Friday assumed")}</small></fieldset>}
    {detail.type!=="tiffin"&&<section className="manual-lines"><h3>Confirmed lines</h3><p className="conversion-quantity-note">Each selected dish defaults to {requestedQuantity}, the larger captured value from guest count ({displayText(requirements.guestCount,"not supplied")}) and quantity expectations ({displayText(requirements.quantityNotes,"not supplied")}). Quantities remain editable before confirmation.</p>{lines.map((line,index)=><div className="manual-line" key={`${line.menuItemId}-${index}`}><input aria-label={`${line.name} name`} value={line.name} onChange={event=>{const next=[...lines];next[index]={...line,name:event.target.value};setLines(next)}}/><input aria-label={`${line.name} quantity`} type="number" min="1" value={line.quantity} onChange={event=>{const next=[...lines];next[index]={...line,quantity:Number(event.target.value)};setLines(next)}}/><input aria-label={`${line.name} unit price`} type="number" min="0" value={line.unitPrice} onChange={event=>{const next=[...lines];next[index]={...line,unitPrice:Number(event.target.value)};setLines(next)}}/></div>)}</section>}
    <div className="modal-actions"><button className="button button-outline" type="button" onClick={close}>Cancel</button><button className="button button-primary">Create confirmed {detail.type==="tiffin"?"plan":"order"}</button></div>
  </form></div>;
}
