// Verified against the supplied Meet Our Interns poster; no inferred biographies.
// Crop coordinates reference the original 2048×1152 artwork, leaving face pixels unchanged.
export const interns=[
 ['col-augustine','Col Augustine Awuku-Annie','Ghana',254,235],
 ['jennifer','Aforla Jennifer Ewoenam','Ghana',564,235],
 ['aleemah','Aleemah Williams','United States',874,235],
 ['abdul-razak','Abdul-Razak Musah','Ghana',1183,235],
 ['iman','Iman Kemal Abdella','Ethiopia',1497,235],
 ['hildana','Hildana Mesai','Ethiopia',254,687],
 ['caleb','Caleb Munuihe','Kenya',564,687],
 ['gwendoline','Domayele Gwendoline Nuonzie','Ghana',874,687],
 ['christian','Christian Negese','Ethiopia',1183,687],
 ['blessing','Blessing Osose Obinyan','Nigeria',1497,687],
].map(([id,name,country,x,y],order)=>({id,name,country,order,role:'Remote Internship Programme',portrait:{src:'/images/hero/interns-desktop.jpg',x,y,width:275,height:291},published:true}));
