import React,{useEffect,useState} from 'react';
export default function HostedEnquiry({fallback}){
 const [form,setForm]=useState(undefined),[values,setValues]=useState({}),[errors,setErrors]=useState({}),[done,setDone]=useState('');
 useEffect(()=>{fetch('/api/cms/forms/general_enquiry').then(response=>response.ok?response.json():null).then(setForm).catch(()=>setForm(null))},[]);
 if(form===undefined)return null;
 if(!form)return fallback;
 const submit=async event=>{
  event.preventDefault();
  const key=sessionStorage.getItem('fa-enquiry')||crypto.randomUUID();
  sessionStorage.setItem('fa-enquiry',key);
  const response=await fetch('/api/cms/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formId:form.id,answers:values,key})});
  const result=await response.json();
  if(!response.ok){setErrors(result.errors||{});setDone(result.error||'The enquiry could not be saved.');return}
  setErrors({});setDone(result.success||'Your enquiry has been received.');
 };
 return <section className="container engage-enquiry" id="enquiry"><div><p className="eyebrow">YOUR ENQUIRY</p><h2>Send a message.</h2><p>This form saves your enquiry for the Foreign Africa team. It does not confirm a partnership, booking or application.</p></div><form onSubmit={submit}>{form.fields.map(field=><label key={field.id}>{field.label}{field.required?' *':''}{field.type==='textarea'?<textarea name={field.id} required={field.required} value={values[field.id]||''} onChange={event=>setValues(current=>({...current,[field.id]:event.target.value}))}/>:field.type==='select'?<select name={field.id} required={field.required} value={values[field.id]||''} onChange={event=>setValues(current=>({...current,[field.id]:event.target.value}))}><option value="">Choose</option>{(field.options||[]).map(option=><option key={option}>{option}</option>)}</select>:<input name={field.id} type={field.type} required={field.required} value={values[field.id]||''} onChange={event=>setValues(current=>({...current,[field.id]:event.target.value}))}/>}{errors[field.id]&&<span className="engage-field-error">{errors[field.id]}</span>}</label>)}<button className="button gold" type="submit">Send enquiry</button>{done&&<p role="status">{done}</p>}</form></section>;
}
