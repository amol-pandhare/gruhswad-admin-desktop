import type { CustomerInput } from "./contracts";

export function normalizeCustomerPhone(value:string){
  const trimmed=value.trim();
  const digits=trimmed.replace(/\D/g,"");
  if(digits.length===10)return `+91${digits}`;
  if(digits.length>=11&&digits.length<=15)return `+${digits}`;
  throw new Error("Enter a valid phone number, including country code when outside India.");
}

export function normalizeCustomerEmail(value:string){
  const email=value.trim().toLowerCase();
  if(!email)return null;
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid email address.");
  return email;
}

export function normalizeCustomerInput(input:CustomerInput){return{...input,name:input.name.trim(),phone:normalizeCustomerPhone(input.phone),email:normalizeCustomerEmail(input.email)};}
