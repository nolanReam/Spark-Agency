import React, { useState, useMemo } from "react";
import {
  LayoutDashboard, FileText, BarChart3, Sun, Moon, Lock, ChevronRight,
  Clock, Award, TrendingUp, ArrowLeft, Sparkles, CheckCircle2, Users,
  ClipboardCheck, Hourglass, Wrench, ListChecks, Target, Lightbulb,
  FlaskConical, Send, ThumbsUp, ThumbsDown, AlertCircle, HelpCircle,
  Activity, UserCheck, Inbox, ArrowRight, GraduationCap, ShieldCheck,
  Plus, Copy, Archive, Pencil, PlayCircle, StopCircle, Camera,
  ChevronDown, Layers, Calendar, X, Hand, Image,
} from "lucide-react";

/* ============================================================ TOKENS ============================================================ */
const tokens = {
  light: { "--bg":"#F7F8FA","--surface":"#FFFFFF","--surface-2":"#F1F3F6","--border":"#E2E6EB","--text":"#13202E","--text-muted":"#5C6B7A","--brand":"#2563EB","--brand-2":"#3B82F6","--brand-soft":"#DBEAFE","--accent":"#F97316","--accent-soft":"#FFEDD5","--success":"#16A34A","--success-soft":"#DCFCE7","--danger":"#DC2626","--danger-soft":"#FEE2E2","--warning":"#F97316","--warning-soft":"#FFEDD5" },
  dark:  { "--bg":"#0B1620","--surface":"#101D2B","--surface-2":"#16263A","--border":"#22354A","--text":"#E8EDF2","--text-muted":"#8FA3B8","--brand":"#5E9BD6","--brand-2":"#7FB4E8","--brand-soft":"#1E3A5F","--accent":"#FB923C","--accent-soft":"#2A2014","--success":"#4ADE80","--success-soft":"#13301F","--danger":"#F87171","--danger-soft":"#321A14","--warning":"#FB923C","--warning-soft":"#2A2014" },
};

/* ============================================================ CONSTANTS ============================================================ */
const CONCEPTS = ["Variables","Loops","Conditionals","Events","Operators","Lists","Functions","Custom Blocks"];

const CLEARANCE_LEVELS = [
  { level:1, title:"Junior Developer", casesRequired:0,  accuracy:0,  conceptsAt50:0 },
  { level:2, title:"Developer",        casesRequired:3,  accuracy:50, conceptsAt50:1 },
  { level:3, title:"Senior Developer", casesRequired:7,  accuracy:60, conceptsAt50:3 },
  { level:4, title:"Lead Developer",   casesRequired:14, accuracy:70, conceptsAt50:5 },
  { level:5, title:"Architect",        casesRequired:25, accuracy:80, conceptsAt50:7 },
];

const STAGES = [
  { key:"building",                    label:"Building" },
  { key:"impl_review_requested",       label:"Implementation Review Requested" },
  { key:"impl_review_claimed",         label:"Implementation Review In Progress" },
  { key:"impl_approved",               label:"Implementation Approved" },
  { key:"prediction_submitted",        label:"Prediction Submitted" },
  { key:"prediction_review_requested", label:"Prediction Review Requested" },
  { key:"prediction_review_claimed",   label:"Prediction Review In Progress" },
  { key:"prediction_approved",         label:"Prediction Approved" },
  { key:"testing",                     label:"Testing" },
  { key:"reflection",                  label:"Reflection" },
  { key:"complete",                    label:"Complete" },
];

function stageIndex(key){ return STAGES.findIndex(s=>s.key===key)||0; }

/* ============================================================ MOCK DATA ============================================================ */
const STUDENT = { name:"Maya R.", clearanceLevel:3, clearanceTitle:"Senior Developer", reputation:1240, predictionAccuracy:68 };

const STUDENT_MASTERY = [
  { concept:"Variables",   current:72, growth:46 },
  { concept:"Loops",       current:58, growth:38 },
  { concept:"Conditionals",current:81, growth:42 },
  { concept:"Events",      current:30, growth:18 },
  { concept:"Operators",   current:45, growth:25 },
];

const STUDENT_STATS = { casesCompleted:7, accuracy:68 };

const SESSION_ACTIVE = { id:"sess-271", code:"AGENCY-271", title:"Saturday Workshop — Riverside Library", status:"active", cases:["L1-03","L1-04","L1-05"], date:"Jun 14, 2026" };

const ACTIVE_CASE = {
  id:"case-loop-tracker", caseCode:"L1-03", status:"published",
  title:"Loop Tracker — Daily Step Counter", client:"Northwind Fitness",
  concepts:["Loops","Variables"], minClearance:2, reputationReward:25, estimatedMinutes:30,
  brief:"Northwind Fitness wants a Scratch project that tracks a sprite's steps across 7 days and signals when a day falls short of a 5,000-step goal.",
  lanes:[
    { name:"Required",  detail:"Use a repeat loop to add 7 day-values to a running total, then display the total.", available:true },
    { name:"Extension", detail:"Also count how many days fell below the 5,000-step goal using an if block inside the loop.", available:true },
    { name:"Challenge", detail:"Have the sprite visually react (costume change or say block) on any day below goal.", available:true },
  ],
  tools:["repeat","variables","operators (+, <)","say block"],
  initRules:[
    "Create a variable named total set to 0 before the loop starts.",
    "Create a variable named below_goal set to 0 before the loop starts.",
    "The 7 step values must use `set [steps v] to` blocks, not typed directly into the loop.",
  ],
  conceptWeights:{ Variables:8, Loops:12, Conditionals:0, Events:2, Operators:3, Lists:0, Functions:0, "Custom Blocks":0 },
  predictPrompt:"What will `total` and `below_goal` equal when your project finishes running? Explain how you arrived at each number.",
  reflectionPrompt:"What actually happened when you ran your project? How did it compare to your prediction?",
  transferHint:"This total-plus-counter pattern shows up anytime you need to add things up AND flag exceptions — like tallying quiz scores while counting students who need extra help.",
};

const AVAILABLE_CASES = [
  { id:"case-greeting-bot", caseCode:"L1-04", title:"Greeting Bot — Welcome Message", client:"Riverside Library", concepts:["Variables","Conditionals"], minClearance:2, reputationReward:20, estimatedMinutes:25, brief:"A sprite that greets visitors differently by time of day." },
  { id:"case-pet-feeder",   caseCode:"L1-05", title:"Pet Feeder Scheduler", client:"Maple Street Animal Shelter", concepts:["Conditionals","Variables"], minClearance:2, reputationReward:20, estimatedMinutes:25, brief:"A sprite that checks a hunger level and decides whether to signal feeding." },
  { id:"case-color-mixer",  caseCode:"L2-01", title:"Color Mixer — Paint Studio", client:"Downtown Arts Co-op", concepts:["Variables","Operators"], minClearance:3, reputationReward:30, estimatedMinutes:35, brief:"Combine color-variable values into a mixed result." },
];

const COMPLETED_CASES = [
  { id:"cc1", caseCode:"L1-01", title:"Welcome Sign — Crosswalk Safety", client:"City Parks Dept.", concepts:["Conditionals"], completedOn:"Jun 7, 2026", reputationEarned:20 },
  { id:"cc2", caseCode:"L1-02", title:"Lemonade Stand Tally", client:"Maple Street Co-op", concepts:["Variables","Loops"], completedOn:"May 31, 2026", reputationEarned:25 },
];

const MASTERY_HISTORY = [
  { concept:"Variables",    history:[45,58,72] },
  { concept:"Loops",        history:[20,38,58] },
  { concept:"Conditionals", history:[52,68,81] },
];

const REVIEW_QUEUE_SEED = [
  { id:"q1", student:"Maya R.",   caseTitle:"Loop Tracker — Daily Step Counter", stage:"Building", type:"Implementation", lane:"Extension", waitMin:4, status:"pending", claimedBy:null, screenshotUrl:null },
  { id:"q2", student:"Devon T.",  caseTitle:"Greeting Bot — Welcome Message",    stage:"Building", type:"Implementation", lane:"Required",  waitMin:12,status:"pending", claimedBy:null, screenshotUrl:"placeholder" },
  { id:"q3", student:"Priya S.",  caseTitle:"Pet Feeder Scheduler",              stage:"Prediction Submitted", type:"Prediction",      lane:"Required",  waitMin:22,status:"pending", claimedBy:null, screenshotUrl:null, prediction:"I think it will say 'Feed me!' because hunger starts at 7 and 7 > 5.", reasoning:"Because the if block checks hunger > 5 first so that branch runs." },
  { id:"q4", student:"Jordan K.", caseTitle:"Loop Tracker — Daily Step Counter", stage:"Prediction Submitted", type:"Prediction",      lane:"Required",  waitMin:3, status:"pending", claimedBy:null, screenshotUrl:null, prediction:"I think total will be 39910 and below_goal will be 3.", reasoning:"I added all 7 values by hand and counted which were under 5000." },
  { id:"q5", student:"Sam W.",    caseTitle:"Loop Tracker — Daily Step Counter", stage:"Building",              type:"Help",            lane:"Required",  waitMin:11,status:"pending", claimedBy:null, screenshotUrl:null, reason:"Stuck for 11 minutes on initialization." },
  { id:"q6", student:"Lena B.",   caseTitle:"Pet Feeder Scheduler",              stage:"Prediction Submitted", type:"Help",            lane:"Required",  waitMin:6, status:"pending", claimedBy:null, screenshotUrl:null, reason:"Repeated incorrect predictions (2 attempts)." },
];

const CLAIMED_SEED = [
  { id:"c1", student:"Ava L.", caseTitle:"Greeting Bot — Welcome Message", stage:"Building", type:"Implementation", lane:"Required", waitMin:1, status:"claimed", claimedBy:"J. Park", screenshotUrl:null },
];

const CASE_LIBRARY = [
  {
    id:"case-loop-tracker", caseCode:"L1-03", title:"Loop Tracker — Daily Step Counter", client:"Northwind Fitness",
    concepts:["Loops","Variables"], minClearance:2, reputationReward:25, estimatedMinutes:30, status:"published",
    lanes:[
      { name:"Required",  detail:"Use a repeat loop to add 7 day-values to a running total, then display the total.", available:true },
      { name:"Extension", detail:"Count days below the 5,000-step goal using an if block inside the loop.", available:true },
      { name:"Challenge", detail:"Have the sprite visually react on any day below goal.", available:true },
    ],
    conceptWeights:{ Variables:8, Loops:12, Conditionals:0, Events:2, Operators:3, Lists:0, Functions:0, "Custom Blocks":0 },
    tools:["repeat","variables","operators (+, <)","say block"],
    initRules:["Create a variable named total set to 0 before the loop starts.","Create a variable named below_goal set to 0 before the loop starts.","The 7 step values must use `set [steps v] to` blocks."],
    predictPrompt:"What will `total` and `below_goal` equal when your project finishes running?",
    reflectionPrompt:"What actually happened? How did it compare to your prediction?",
    transferHint:"Total-plus-counter shows up in quiz tallying, inventory counts, anything needing a running total with exceptions flagged.",
  },
  {
    id:"case-greeting-bot", caseCode:"L1-04", title:"Greeting Bot — Welcome Message", client:"Riverside Library",
    concepts:["Variables","Conditionals"], minClearance:2, reputationReward:20, estimatedMinutes:25, status:"published",
    lanes:[
      { name:"Required", detail:"Use if/else to say 'Good morning!' before hour 12 and 'Good afternoon!' at or after.", available:true },
      { name:"Extension", detail:"Add 'Good evening!' after hour 17.", available:true },
      { name:"Challenge", detail:"Let the user set the hour with an ask block and handle invalid values.", available:false },
    ],
    conceptWeights:{ Variables:6, Loops:0, Conditionals:10, Events:2, Operators:4, Lists:0, Functions:0, "Custom Blocks":0 },
    tools:["if / else","variables","operators (<, >=)","say block"],
    initRules:["Create a variable named hour and set it to 13 before any other blocks run.","Do not hardcode greeting text inside the if condition."],
    predictPrompt:"Predict exactly what your sprite will say when hour = 13, and explain which branch handles that case.",
    reflectionPrompt:"What did your sprite say? Did it match your prediction?",
    transferHint:"Branching on boundary values is behind shipping cutoffs, age-based pricing, and grade cutoffs.",
  },
  {
    id:"case-color-mixer", caseCode:"L2-01", title:"Color Mixer — Paint Studio", client:"Downtown Arts Co-op",
    concepts:["Variables","Operators"], minClearance:3, reputationReward:30, estimatedMinutes:35, status:"draft",
    lanes:[
      { name:"Required", detail:"Combine two color-amount variables into a mixed color name using conditionals.", available:true },
      { name:"Extension", detail:"Add a third variable for yellow and handle three-way mixes.", available:true },
      { name:"Challenge", detail:"Not yet defined.", available:false },
    ],
    conceptWeights:{ Variables:10, Loops:0, Conditionals:6, Events:2, Operators:8, Lists:0, Functions:0, "Custom Blocks":0 },
    tools:["variables","operators (+, =)","if / else","say block"],
    initRules:["Create variables named red and blue, each set to a starting value before the first if block."],
    predictPrompt:"What will your sprite say if red = 5 and blue = 3? Walk through the conditions step by step.",
    reflectionPrompt:"What happened with different input values? Did any combinations surprise you?",
    transferHint:"Color mixing is a direct analogy for combining conditions in real software — two inputs producing a third output.",
  },
  {
    id:"case-old-quiz", caseCode:"L0-02", title:"Trivia Quiz — Round 1", client:"Community Center",
    concepts:["Variables","Conditionals"], minClearance:1, reputationReward:15, estimatedMinutes:20, status:"archived",
    lanes:[
      { name:"Required", detail:"Ask 3 questions and track a score variable.", available:true },
      { name:"Extension", detail:"Give different end messages based on score.", available:true },
      { name:"Challenge", detail:"Randomize question order.", available:false },
    ],
    conceptWeights:{ Variables:5, Loops:0, Conditionals:5, Events:3, Operators:2, Lists:0, Functions:0, "Custom Blocks":0 },
    tools:["ask and wait","if / else","variables","say block"],
    initRules:["Set score to 0 at the start."],
    predictPrompt:"If the player answers 2 of 3 questions correctly, what will your sprite say at the end?",
    reflectionPrompt:"Were you able to answer all the quiz questions correctly yourself? What did the sprite say?",
    transferHint:"Score tracking is one of the most common variable patterns in real software.",
  },
];

const SESSION_LIST = [
  { id:"sess-271", code:"AGENCY-271", title:"Saturday Workshop — Riverside Library", status:"active", cases:["L1-03","L1-04","L1-05"], date:"Jun 14, 2026", students:18, volunteers:4 },
  { id:"sess-270", code:"AGENCY-270", title:"Wednesday After-School — Maple Street", status:"closed", cases:["L1-03","L1-04"], date:"Jun 10, 2026", students:14, volunteers:3 },
  { id:"sess-269", code:"AGENCY-269", title:"Saturday Workshop — Riverside Library", status:"closed", cases:["L1-03","L1-04","L1-05"], date:"Jun 7, 2026", students:16, volunteers:4 },
];

const SESSION_SUMMARY = { studentsParticipated:16, casesCompleted:11, casesInProgress:5, avgWaitImpl:6.4, avgWaitPrediction:9.1, reviewsCompleted:28, helpResolved:4 };

const OPS = { studentsPresent:18, volunteersActive:4, pendingReviews:4, pendingHelp:2, avgWaitImpl:8, avgWaitPred:13 };

const QUEUE_HEALTH = [
  { key:"building",                    label:"Building",                      count:7 },
  { key:"impl_review_requested",       label:"Implementation Review — Waiting", count:1 },
  { key:"impl_review_claimed",         label:"Implementation Review — In Progress", count:1 },
  { key:"impl_approved",               label:"Implementation Approved",       count:1 },
  { key:"prediction_submitted",        label:"Prediction Submitted",          count:1 },
  { key:"prediction_review_requested", label:"Prediction Review — Waiting",   count:1 },
  { key:"prediction_review_claimed",   label:"Prediction Review — In Progress", count:1 },
  { key:"prediction_approved",         label:"Prediction Approved",           count:1 },
  { key:"testing",                     label:"Testing",                       count:2 },
  { key:"reflection",                  label:"Reflection",                    count:1 },
  { key:"complete",                    label:"Complete",                      count:1 },
];

const COHORT_DIFFICULTY = [
  { caseTitle:"Loop Tracker — Daily Step Counter", avgAccuracy:71, attempts:14 },
  { caseTitle:"Greeting Bot — Welcome Message",    avgAccuracy:88, attempts:18 },
  { caseTitle:"Pet Feeder Scheduler",              avgAccuracy:64, attempts:9  },
];

const ROSTER_STUDENTS = [
  { name:"Maya R.",   clearance:3, stage:"Implementation Review Requested", caseTitle:"Loop Tracker", readyToPromote:false },
  { name:"Devon T.",  clearance:2, stage:"Implementation Review Requested", caseTitle:"Greeting Bot", readyToPromote:false },
  { name:"Priya S.",  clearance:4, stage:"Prediction Review Requested",     caseTitle:"Pet Feeder",   readyToPromote:false },
  { name:"Jordan K.", clearance:3, stage:"Prediction Review Requested",     caseTitle:"Loop Tracker", readyToPromote:false },
  { name:"Sam W.",    clearance:2, stage:"Building",                        caseTitle:"Loop Tracker", readyToPromote:true  },
  { name:"Ava L.",    clearance:3, stage:"Implementation Review Requested", caseTitle:"Greeting Bot", readyToPromote:false },
];

/* ============================================================ PRIMITIVES ============================================================ */
function Badge({ children, tone="neutral" }){
  const tones={ neutral:{background:"var(--surface-2)",color:"var(--text-muted)"}, accent:{background:"var(--accent-soft)",color:"var(--accent)"}, success:{background:"var(--success-soft)",color:"var(--success)"}, danger:{background:"var(--danger-soft)",color:"var(--danger)"}, brand:{background:"var(--brand-soft)",color:"var(--brand)"}, warning:{background:"var(--warning-soft)",color:"var(--warning)"} };
  return <span style={{...tones[tone],fontSize:"0.72rem",fontWeight:600,letterSpacing:"0.02em",padding:"0.2rem 0.55rem",borderRadius:"999px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{children}</span>;
}

function Card({ children, style, ...props }){
  return <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"14px",...style}} {...props}>{children}</div>;
}

function Btn({ children, variant="primary", icon:Icon, size:sz="md", ...props }){
  const base={display:"inline-flex",alignItems:"center",gap:"0.45rem",fontFamily:"'IBM Plex Sans',sans-serif",fontWeight:600,borderRadius:"9px",border:"1px solid transparent",cursor:props.disabled?"not-allowed":"pointer",transition:"opacity 0.15s",opacity:props.disabled?0.5:1,whiteSpace:"nowrap"};
  const sizes={ sm:{fontSize:"0.78rem",padding:"0.35rem 0.7rem"}, md:{fontSize:"0.875rem",padding:"0.6rem 1.1rem"} };
  const variants={ primary:{background:"var(--brand)",color:"#fff"}, accent:{background:"var(--accent)",color:"#fff"}, ghost:{background:"transparent",color:"var(--text)",border:"1px solid var(--border)"}, subtle:{background:"var(--surface-2)",color:"var(--text)"}, success:{background:"var(--success)",color:"#fff"}, danger:{background:"var(--danger)",color:"#fff"} };
  return <button style={{...base,...sizes[sz],...variants[variant]}} {...props}>{Icon&&<Icon size={sz==="sm"?13:16}/>}{children}</button>;
}

function SectionLabel({ children, muted, icon:Icon }){
  return <div style={{display:"flex",alignItems:"center",gap:"0.4rem",fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:muted?"var(--text-muted)":"var(--brand)"}}>{Icon&&<Icon size={13}/>}{children}</div>;
}

function ThickBar({ value, color="var(--brand)" }){
  return <div style={{height:12,borderRadius:999,background:"var(--surface-2)",overflow:"hidden",border:"1px solid var(--border)"}}><div style={{height:"100%",width:`${Math.min(value,100)}%`,background:color,borderRadius:999,transition:"width 0.6s ease"}}/></div>;
}

function ThinBar({ value, max, color="var(--brand)" }){
  return <div style={{height:8,borderRadius:999,background:"var(--surface-2)",overflow:"hidden"}}><div style={{height:"100%",width:`${(value/max)*100}%`,background:color,borderRadius:999}}/></div>;
}

function TopBar({ title, subtitle, right, onBack }){
  return (
    <div style={{marginBottom:"1.75rem"}}>
      {onBack&&<button onClick={onBack} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"none",border:"none",color:"var(--text-muted)",fontSize:"0.85rem",cursor:"pointer",marginBottom:"0.75rem",padding:0,fontFamily:"'IBM Plex Sans',sans-serif"}}><ArrowLeft size={15}/>Back</button>}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"1rem"}}>
        <div>
          <h1 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.5rem",fontWeight:700,margin:0,letterSpacing:"-0.01em"}}>{title}</h1>
          {subtitle&&<p style={{margin:"0.2rem 0 0",color:"var(--text-muted)",fontSize:"0.875rem"}}>{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

function Textarea({ ...props }){
  return <textarea style={{width:"100%",padding:"0.7rem",borderRadius:"8px",border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)",fontSize:"0.85rem",fontFamily:"'IBM Plex Sans',sans-serif",resize:"vertical",boxSizing:"border-box",lineHeight:1.5}} {...props}/>;
}

function Input({ ...props }){
  return <input style={{width:"100%",padding:"0.6rem 0.8rem",borderRadius:"8px",border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)",fontSize:"0.875rem",fontFamily:"'IBM Plex Sans',sans-serif",boxSizing:"border-box"}} {...props}/>;
}

function Field({ label, hint, children }){
  return (
    <div style={{marginBottom:"1.1rem"}}>
      <label style={{display:"block",fontSize:"0.82rem",fontWeight:700,marginBottom:"0.3rem"}}>{label}</label>
      {hint&&<p style={{fontSize:"0.75rem",color:"var(--text-muted)",margin:"0 0 0.4rem",lineHeight:1.5}}>{hint}</p>}
      {children}
    </div>
  );
}

/* ============================================================ STAGE RAIL ============================================================ */
function StageRail({ currentKey, compact }){
  const current = stageIndex(currentKey);
  return (
    <div style={{display:"flex",alignItems:"flex-start",overflowX:"auto",gap:0,paddingBottom:"0.25rem"}}>
      {STAGES.map((stage,i)=>{
        const done=i<current, active=i===current;
        return (
          <React.Fragment key={stage.key}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:compact?54:80,gap:"0.35rem"}}>
              <div style={{width:compact?22:28,height:compact?22:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:done?"var(--success)":active?"var(--accent)":"var(--surface-2)",color:done||active?"#fff":"var(--text-muted)",fontSize:"0.68rem",fontWeight:700,flexShrink:0,border:active?"2px solid var(--accent)":"1px solid transparent",boxShadow:active?"0 0 0 3px var(--accent-soft)":"none"}}>
                {done?<CheckCircle2 size={compact?12:15}/>:i+1}
              </div>
              <div style={{fontSize:compact?"0.6rem":"0.65rem",textAlign:"center",color:active?"var(--text)":"var(--text-muted)",fontWeight:active?700:500,lineHeight:1.25}}>{stage.label}</div>
            </div>
            {i<STAGES.length-1&&<div style={{flex:1,height:2,background:done?"var(--success)":"var(--border)",minWidth:compact?8:12,marginTop:compact?"10px":"13px"}}/>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ============================================================ SHARED LAYOUT ============================================================ */
function Brand(){
  return (
    <div style={{display:"flex",alignItems:"center",gap:"0.6rem",padding:"0 0.25rem"}}>
      <div style={{width:30,height:30,borderRadius:8,background:"var(--brand)",display:"flex",alignItems:"center",justifyContent:"center"}}><Sparkles size={16} color="var(--accent)"/></div>
      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:"1.05rem",letterSpacing:"-0.01em"}}>SparkCode</div>
    </div>
  );
}

function RoleSwitcher({ role, setRole }){
  return (
    <div style={{display:"flex",gap:"0.2rem",background:"var(--surface-2)",borderRadius:"10px",padding:"0.2rem",border:"1px solid var(--border)"}}>
      {["student","volunteer","instructor"].map(r=>(
        <button key={r} onClick={()=>setRole(r)} style={{padding:"0.35rem 0.65rem",borderRadius:"8px",border:"none",cursor:"pointer",fontSize:"0.75rem",fontWeight:700,fontFamily:"'IBM Plex Sans',sans-serif",background:role===r?"var(--surface)":"transparent",color:role===r?"var(--brand)":"var(--text-muted)",boxShadow:role===r?"0 1px 2px rgba(0,0,0,0.08)":"none",textTransform:"capitalize"}}>
          {r}
        </button>
      ))}
    </div>
  );
}

function ThemeToggle({ theme, setTheme }){
  return (
    <button onClick={()=>setTheme(theme==="light"?"dark":"light")} style={{display:"flex",alignItems:"center",gap:"0.6rem",justifyContent:"center",padding:"0.5rem",borderRadius:"8px",border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text-muted)",cursor:"pointer",fontSize:"0.8rem",fontFamily:"'IBM Plex Sans',sans-serif"}}>
      {theme==="light"?<Moon size={15}/>:<Sun size={15}/>}
      {theme==="light"?"Dark mode":"Light mode"}
    </button>
  );
}

function Sidebar({ items, bottomContent, role, setRole, theme, setTheme, view, setView }){
  return (
    <aside style={{width:240,flexShrink:0,borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",padding:"1.25rem",gap:"1.25rem",boxSizing:"border-box"}}>
      <Brand/>
      <RoleSwitcher role={role} setRole={setRole}/>
      <nav style={{display:"flex",flexDirection:"column",gap:"0.2rem"}}>
        {items.map(item=>{
          const active=view===item.key||(item.subkeys&&item.subkeys.some(k=>view.startsWith(k)));
          return (
            <button key={item.key} onClick={()=>setView(item.key)} style={{display:"flex",alignItems:"center",gap:"0.65rem",padding:"0.55rem 0.7rem",borderRadius:"8px",border:"none",textAlign:"left",cursor:"pointer",fontSize:"0.875rem",fontWeight:active?600:500,background:active?"var(--surface-2)":"transparent",color:active?"var(--text)":"var(--text-muted)",fontFamily:"'IBM Plex Sans',sans-serif",width:"100%",boxSizing:"border-box"}}>
              <item.icon size={17} style={{flexShrink:0}}/>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:"0.6rem"}}>
        {bottomContent}
        <ThemeToggle theme={theme} setTheme={setTheme}/>
      </div>
    </aside>
  );
}

function Fonts(){ return <><link rel="preconnect" href="https://fonts.googleapis.com"/><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/></>; }

/* ============================================================ ============================================================
   STUDENT EXPERIENCE
   ============================================================ ============================================================ */
function StudentSidebar({ view, setView, role, setRole, theme, setTheme, onRaiseHand, handRaised }){
  const items=[
    { key:"home",     label:"Home",     icon:LayoutDashboard },
    { key:"cases",    label:"Cases",    icon:FileText },
    { key:"progress", label:"Progress", icon:GraduationCap },
  ];
  return (
    <Sidebar items={items} view={view} setView={v=>{setView(v);}} role={role} setRole={setRole} theme={theme} setTheme={setTheme}
      bottomContent={
        <>
          <Card style={{padding:"0.85rem"}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.3rem"}}><Users size={13} color="var(--success)"/><span style={{fontSize:"0.7rem",fontWeight:700,color:"var(--success)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Session active</span></div>
            <div style={{fontSize:"0.82rem",fontWeight:600}}>{SESSION_ACTIVE.title}</div>
            <div style={{fontSize:"0.75rem",color:"var(--text-muted)",marginTop:"0.15rem"}}>Code: {SESSION_ACTIVE.code}</div>
          </Card>
          <Card style={{padding:"0.85rem"}}>
            <div style={{fontSize:"0.72rem",color:"var(--text-muted)",marginBottom:"0.3rem",textTransform:"uppercase",letterSpacing:"0.04em"}}>Clearance Level</div>
            <div style={{display:"flex",alignItems:"baseline",gap:"0.35rem"}}>
              <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.6rem",fontWeight:700}}>{STUDENT.clearanceLevel}</span>
              <span style={{fontSize:"0.78rem",color:"var(--text-muted)"}}>— {STUDENT.clearanceTitle}</span>
            </div>
          </Card>
          <Btn variant={handRaised?"subtle":"accent"} icon={Hand} onClick={onRaiseHand} style={{width:"100%",justifyContent:"center"}}>
            {handRaised?"Hand raised — waiting":"Raise hand for help"}
          </Btn>
        </>
      }
    />
  );
}

/* --- Student: Clearance Progress Card --- */
function ClearanceCard(){
  const current = CLEARANCE_LEVELS.find(l=>l.level===STUDENT.clearanceLevel);
  const next = CLEARANCE_LEVELS.find(l=>l.level===STUDENT.clearanceLevel+1);
  const conceptsAt50 = STUDENT_MASTERY.filter(m=>m.current>=50).length;

  if(!next) return (
    <Card style={{padding:"1.25rem"}}>
      <SectionLabel icon={Award}>Clearance Level</SectionLabel>
      <div style={{marginTop:"0.6rem",fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.1rem",fontWeight:700}}>CL-{STUDENT.clearanceLevel} — {current.title}</div>
      <p style={{fontSize:"0.85rem",color:"var(--text-muted)",margin:"0.4rem 0 0"}}>Maximum clearance level reached.</p>
    </Card>
  );
  const reqs=[
    { label:"Cases completed", current:STUDENT_STATS.casesCompleted, required:next.casesRequired, met:STUDENT_STATS.casesCompleted>=next.casesRequired },
    { label:"Prediction accuracy", current:`${STUDENT_STATS.accuracy}%`, required:`${next.accuracy}%`, met:STUDENT_STATS.accuracy>=next.accuracy },
    { label:"Concepts at 50%+ mastery", current:conceptsAt50, required:next.conceptsAt50, met:conceptsAt50>=next.conceptsAt50 },
  ];
  return (
    <Card style={{padding:"1.25rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.85rem"}}>
        <div>
          <SectionLabel icon={Award}>Clearance Level</SectionLabel>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.1rem",fontWeight:700,marginTop:"0.35rem"}}>CL-{STUDENT.clearanceLevel} — {current.title}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:"0.72rem",color:"var(--text-muted)",textTransform:"uppercase",marginBottom:"0.2rem"}}>Next level</div>
          <div style={{fontWeight:700,fontSize:"0.85rem"}}>CL-{next.level} — {next.title}</div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"0.55rem"}}>
        {reqs.map((r,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:"0.6rem"}}>
            <div style={{flexShrink:0}}>{r.met?<CheckCircle2 size={15} color="var(--success)"/>:<div style={{width:15,height:15,borderRadius:"50%",border:"2px solid var(--border)"}}/>}</div>
            <div style={{flex:1,fontSize:"0.85rem"}}>{r.label}</div>
            <div style={{fontSize:"0.82rem",fontWeight:600,color:r.met?"var(--success)":"var(--text-muted)"}}>{r.current} / {r.required}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* --- Student: Mastery Summary --- */
function MasterySummary({ activeCase }){
  return (
    <Card style={{padding:"1.1rem"}}>
      <SectionLabel icon={GraduationCap}>Concept mastery</SectionLabel>
      <div style={{marginTop:"0.85rem",display:"flex",flexDirection:"column",gap:"0.85rem"}}>
        {STUDENT_MASTERY.map(m=>{
          const bonus = activeCase?.conceptWeights?.[m.concept]||0;
          return (
            <div key={m.concept}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"0.4rem"}}>
                <span style={{fontWeight:700,fontSize:"0.88rem"}}>{m.concept}</span>
                <span style={{fontSize:"0.82rem"}}>
                  <strong style={{fontFamily:"'Space Grotesk',sans-serif"}}>{m.current}%</strong>
                  <span style={{color:"var(--text-muted)"}}> mastery</span>
                  <span style={{color:"var(--success)",fontWeight:700,marginLeft:"0.5rem"}}>▲ +{m.growth}%</span>
                  {bonus>0&&<span style={{color:"var(--accent)",marginLeft:"0.5rem",fontWeight:700}}>+{bonus} from this case</span>}
                </span>
              </div>
              <ThickBar value={m.current} color={m.current>=50?"var(--brand)":"var(--brand-2)"}/>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* --- Student Home --- */
function nextAction(stage){
  const map={
    building:                  {title:"Build your project in Scratch",               body:"Follow the dossier and Initialization Rules. Raise your hand or request a review when ready.", cta:"Open case", waiting:false, inProgress:false},
    impl_review_requested:     {title:"Waiting for Implementation Review",            body:"You're in the queue. Keep Scratch open — a volunteer will come check your project.", cta:null, waiting:true, inProgress:false},
    impl_review_claimed:       {title:"A volunteer is on their way",                  body:"A volunteer has claimed your review and is heading over to check your project now.", cta:null, waiting:false, inProgress:true},
    impl_approved:             {title:"Implementation approved — write your prediction",body:"Your build is confirmed. Now predict what will happen before you test.", cta:"Open case", waiting:false, inProgress:false},
    prediction_submitted:      {title:"Write your prediction",                        body:"Use the Predict & Prove form — both fields required before submitting.", cta:"Open case", waiting:false, inProgress:false},
    prediction_review_requested:{title:"Waiting for Prediction Review",               body:"Your prediction is locked. A volunteer will read it with you before you can test.", cta:null, waiting:true, inProgress:false},
    prediction_review_claimed: {title:"A volunteer is reviewing your prediction",     body:"A volunteer has claimed your prediction review and is on their way.", cta:null, waiting:false, inProgress:true},
    prediction_approved:       {title:"Cleared to test in Scratch",                   body:"Your reasoning was approved. Go run your Scratch project and see what happens.", cta:"Open case", waiting:false, inProgress:false},
    testing:                   {title:"Test your project",                            body:"Run your Scratch project and compare the result to your prediction.", cta:"Open case", waiting:false, inProgress:false},
    reflection:                {title:"Write your reflection",                        body:"What actually happened? How did it compare to your prediction?", cta:"Open case", waiting:false, inProgress:false},
    complete:                  {title:"Case complete!",                               body:"Great work. Pick a new case from the Cases tab to keep going.", cta:"Browse cases", waiting:false, inProgress:false},
  };
  return map[stage]||map.building;
}

function StudentHome({ caseStage, onOpenCase, onGoToCases }){
  const action = nextAction(caseStage);
  const tone = action.inProgress?"var(--brand)":action.waiting?"var(--accent)":"var(--brand)";
  const bg = action.inProgress?"var(--brand-soft)":action.waiting?"var(--accent-soft)":"var(--brand-soft)";
  return (
    <div>
      <TopBar title={`Welcome back, ${STUDENT.name}`} subtitle="Here's what to do next"
        right={<div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}><Badge tone="brand">{STUDENT.reputation.toLocaleString()} rep</Badge><div style={{width:36,height:36,borderRadius:"50%",background:"var(--brand)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:"0.85rem"}}>MR</div></div>}
      />
      <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:"1.25rem"}}>
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          {/* Current case banner */}
          <Card style={{padding:"1.1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{display:"flex",gap:"0.4rem",marginBottom:"0.4rem"}}>{ACTIVE_CASE.concepts.map(c=><Badge key={c}>{c}</Badge>)}<Badge tone="brand">L{ACTIVE_CASE.minClearance}+</Badge></div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.1rem",fontWeight:700}}>{ACTIVE_CASE.title}</div>
                <div style={{fontSize:"0.8rem",color:"var(--text-muted)",marginTop:"0.15rem"}}>Client: {ACTIVE_CASE.client}</div>
              </div>
              <Btn variant="ghost" size="sm" onClick={onOpenCase}>Open <ChevronRight size={13}/></Btn>
            </div>
          </Card>
          {/* Stage rail */}
          <Card style={{padding:"1rem 1.25rem"}}>
            <SectionLabel icon={ListChecks}>Case progress</SectionLabel>
            <div style={{marginTop:"0.85rem"}}><StageRail currentKey={caseStage} compact/></div>
          </Card>
          {/* Next action */}
          <Card style={{padding:"1.25rem",border:`1px solid ${tone}`,background:bg}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
              {action.inProgress?<UserCheck size={16} color={tone}/>:action.waiting?<Hourglass size={16} color={tone}/>:<ArrowRight size={16} color={tone}/>}
              <span style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:tone}}>{action.inProgress?"Volunteer on the way":action.waiting?"Waiting for review":"Next action"}</span>
            </div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.05rem",fontWeight:700,marginBottom:"0.4rem"}}>{action.title}</div>
            <p style={{fontSize:"0.87rem",lineHeight:1.6,margin:"0 0 0.85rem"}}>{action.body}</p>
            {action.cta&&<Btn variant={action.cta==="Browse cases"?"subtle":"accent"} onClick={action.cta==="Browse cases"?onGoToCases:onOpenCase}>{action.cta}</Btn>}
          </Card>
          {/* Recent feedback */}
          <div>
            <SectionLabel muted icon={CheckCircle2}>Recent feedback</SectionLabel>
            <Card style={{padding:"0.9rem",marginTop:"0.5rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.3rem"}}><span style={{fontWeight:700,fontSize:"0.82rem"}}>Senior Dev — J. Park</span><span style={{fontSize:"0.72rem",color:"var(--text-muted)"}}>2 days ago</span></div>
              <div style={{fontSize:"0.78rem",color:"var(--text-muted)",marginBottom:"0.3rem"}}>On: Loop Tracker — Daily Step Counter</div>
              <div style={{fontSize:"0.84rem",lineHeight:1.5}}>Implementation matched the brief on the first check. Prediction reasoning was solid — good tracing.</div>
            </Card>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <ClearanceCard/>
          <MasterySummary activeCase={ACTIVE_CASE}/>
        </div>
      </div>
    </div>
  );
}

/* --- Student Cases --- */
function StudentCases({ onOpenCase }){
  const [completedOpen, setCompletedOpen] = useState(null);
  return (
    <div>
      <TopBar title="Cases" subtitle="Active · Available · Completed"/>

      <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1rem",margin:"0 0 0.75rem",color:"var(--brand)"}}>Active case</h2>
      <Card style={{padding:"1.1rem",marginBottom:"1.5rem",border:"1px solid var(--brand)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"0.5rem"}}>
          <div>
            <div style={{display:"flex",gap:"0.4rem",marginBottom:"0.4rem"}}>{ACTIVE_CASE.concepts.map(c=><Badge key={c}>{c}</Badge>)}<Badge tone="accent">+{ACTIVE_CASE.reputationReward} rep</Badge></div>
            <div style={{fontWeight:700,fontSize:"0.98rem"}}>{ACTIVE_CASE.title}</div>
            <div style={{fontSize:"0.8rem",color:"var(--text-muted)"}}>Client: {ACTIVE_CASE.client} · ~{ACTIVE_CASE.estimatedMinutes} min</div>
          </div>
          <Btn variant="primary" onClick={onOpenCase}>Open <ChevronRight size={14}/></Btn>
        </div>
      </Card>

      <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1rem",margin:"0 0 0.4rem"}}>Available cases</h2>
      <p style={{fontSize:"0.8rem",color:"var(--text-muted)",margin:"0 0 0.75rem"}}>Finish your active case to start a new one.</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.85rem",marginBottom:"1.5rem"}}>
        {AVAILABLE_CASES.map(c=>{
          const locked = STUDENT.clearanceLevel < c.minClearance;
          return (
            <Card key={c.id} style={{padding:"1.1rem",opacity:locked?0.55:1,cursor:locked?"default":"not-allowed",position:"relative"}}>
              {locked&&<div style={{position:"absolute",top:"0.75rem",right:"0.75rem"}}><Lock size={14} color="var(--text-muted)"/></div>}
              <div style={{display:"flex",gap:"0.35rem",marginBottom:"0.5rem",flexWrap:"wrap"}}>
                {c.concepts.map(concept=><Badge key={concept}>{concept}</Badge>)}
              </div>
              <div style={{fontWeight:700,fontSize:"0.92rem",marginBottom:"0.2rem"}}>{c.title}</div>
              <div style={{fontSize:"0.78rem",color:"var(--text-muted)",marginBottom:"0.55rem"}}>Client: {c.client}</div>
              <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",alignItems:"center"}}>
                <Badge tone={locked?"neutral":"brand"}>CL-{c.minClearance}+ required</Badge>
                <Badge tone="accent">+{c.reputationReward} rep</Badge>
                <span style={{fontSize:"0.75rem",color:"var(--text-muted)"}}>~{c.estimatedMinutes} min</span>
              </div>
            </Card>
          );
        })}
      </div>

      <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1rem",margin:"0 0 0.75rem"}}>Completed cases</h2>
      <Card style={{padding:"0.5rem"}}>
        {COMPLETED_CASES.map((c,i)=>(
          <div key={c.id}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.8rem 0.85rem",cursor:"pointer"}} onClick={()=>setCompletedOpen(completedOpen===c.id?null:c.id)}>
              <div>
                <div style={{fontWeight:600,fontSize:"0.88rem"}}>{c.title}</div>
                <div style={{fontSize:"0.78rem",color:"var(--text-muted)"}}>{c.client} · Completed {c.completedOn}</div>
              </div>
              <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                {c.concepts.map(concept=><Badge key={concept} tone="success">{concept}</Badge>)}
                <Badge tone="success">+{c.reputationEarned} rep</Badge>
                <ChevronDown size={14} color="var(--text-muted)" style={{transform:completedOpen===c.id?"rotate(180deg)":"none",transition:"transform 0.2s"}}/>
              </div>
            </div>
            {completedOpen===c.id&&(
              <div style={{padding:"0 0.85rem 0.85rem",fontSize:"0.82rem",color:"var(--text-muted)",borderTop:"1px solid var(--border)"}}>
                <p style={{margin:"0.6rem 0 0"}}>This case has been completed. You can review your dossier but cannot resubmit predictions or reflections.</p>
                <div style={{marginTop:"0.6rem"}}><Btn variant="ghost" size="sm">View dossier (read-only)</Btn></div>
              </div>
            )}
            {i<COMPLETED_CASES.length-1&&<div style={{height:1,background:"var(--border)",margin:"0 0.85rem"}}/>}
          </div>
        ))}
      </Card>
    </div>
  );
}

/* --- Student Progress --- */
function StudentProgress(){
  return (
    <div>
      <TopBar title="My Progress" subtitle="Clearance level and concept mastery"/>
      <div style={{display:"flex",flexDirection:"column",gap:"1.25rem",maxWidth:640}}>
        <ClearanceCard/>
        <Card style={{padding:"1.25rem"}}>
          <SectionLabel icon={GraduationCap}>Concept mastery</SectionLabel>
          <p style={{fontSize:"0.8rem",color:"var(--text-muted)",margin:"0.35rem 0 1rem",lineHeight:1.55}}>
            Mastery is earned by completing cases. Each case shows exactly how many mastery points it contributes to each concept before you start.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
            {STUDENT_MASTERY.map(m=>(
              <div key={m.concept}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"0.4rem"}}>
                  <span style={{fontWeight:700,fontSize:"0.9rem"}}>{m.concept}</span>
                  <span style={{fontSize:"0.83rem"}}><strong style={{fontFamily:"'Space Grotesk',sans-serif"}}>{m.current}%</strong><span style={{color:"var(--text-muted)"}}> mastery</span><span style={{color:"var(--success)",fontWeight:700,marginLeft:"0.5rem"}}>▲ +{m.growth}% growth</span></span>
                </div>
                <ThickBar value={m.current} color={m.current>=50?"var(--brand)":"var(--brand-2)"}/>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* --- Case Dossier --- */
function CaseDossier({ caseData, showTransferHint }){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"0.85rem"}}>
      <Card style={{padding:"1.1rem"}}>
        <SectionLabel icon={FileText}>Client brief</SectionLabel>
        <p style={{fontSize:"0.88rem",lineHeight:1.6,margin:"0.5rem 0 0"}}>{caseData.brief}</p>
      </Card>
      <Card style={{padding:"1.1rem"}}>
        <SectionLabel icon={Target}>Difficulty lanes</SectionLabel>
        <p style={{fontSize:"0.78rem",color:"var(--text-muted)",margin:"0.4rem 0 0.65rem",lineHeight:1.5}}><strong>Required</strong> is the case — everyone builds this. <strong>Extension</strong> and <strong>Challenge</strong> are optional add-ons to the same project.</p>
        <div style={{display:"flex",flexDirection:"column",gap:"0.55rem"}}>
          {caseData.lanes.map(lane=>(
            <div key={lane.name} style={{display:"flex",gap:"0.55rem",alignItems:"flex-start",opacity:lane.available===false?0.45:1}}>
              <Badge tone={lane.name==="Required"?"brand":lane.name==="Extension"?"accent":"danger"}>{lane.name}</Badge>
              <p style={{fontSize:"0.83rem",lineHeight:1.5,margin:0}}>{lane.detail}{lane.available===false&&<em style={{color:"var(--text-muted)"}}> — not available for this case</em>}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card style={{padding:"1.1rem"}}>
        <SectionLabel icon={Wrench}>Tools allowed</SectionLabel>
        <div style={{display:"flex",gap:"0.4rem",marginTop:"0.55rem",flexWrap:"wrap"}}>{caseData.tools.map(t=><Badge key={t}>{t}</Badge>)}</div>
      </Card>
      <Card style={{padding:"1.1rem"}}>
        <SectionLabel icon={ListChecks}>Initialization rules</SectionLabel>
        <ul style={{margin:"0.5rem 0 0",paddingLeft:"1.1rem",fontSize:"0.83rem",lineHeight:1.65}}>{caseData.initRules.map((r,i)=><li key={i}>{r}</li>)}</ul>
        <div style={{fontSize:"0.73rem",color:"var(--text-muted)",marginTop:"0.5rem"}}>A volunteer checks these during your Implementation Review.</div>
      </Card>
      <Card style={{padding:"1.1rem"}}>
        <SectionLabel icon={TrendingUp}>Mastery contribution</SectionLabel>
        <div style={{marginTop:"0.55rem",display:"flex",flexDirection:"column",gap:"0.3rem"}}>
          {Object.entries(caseData.conceptWeights).filter(([,v])=>v>0).map(([concept,pts])=>(
            <div key={concept} style={{display:"flex",justifyContent:"space-between",fontSize:"0.82rem"}}>
              <span>{concept}</span><span style={{fontWeight:700,color:"var(--accent)"}}>+{pts} mastery</span>
            </div>
          ))}
        </div>
        <div style={{fontSize:"0.73rem",color:"var(--text-muted)",marginTop:"0.45rem"}}>Extension×1.25 · Challenge×1.5 · capped at 100%</div>
      </Card>
      {showTransferHint&&(
        <Card style={{padding:"1.1rem",background:"var(--surface-2)",borderStyle:"dashed"}}>
          <SectionLabel icon={Lightbulb} muted>Transfer hint</SectionLabel>
          <p style={{fontSize:"0.83rem",lineHeight:1.6,margin:"0.5rem 0 0",color:"var(--text-muted)",fontStyle:"italic"}}>{caseData.transferHint}</p>
        </Card>
      )}
    </div>
  );
}

/* --- Stage Action Panel --- */
function StageActionPanel({ stage, setStage, caseData, prediction, setPrediction, laneAttempts, setLaneAttempts, screenshot, setScreenshot }){
  const waiting=(label,body,sim)=>(
    <Card style={{padding:"1.25rem",border:"1px solid var(--accent)",background:"var(--accent-soft)"}}>
      <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}><Hourglass size={16} color="var(--accent)"/><span style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--accent)"}}>{label}</span></div>
      <p style={{fontSize:"0.87rem",lineHeight:1.6,margin:"0 0 0.85rem"}}>{body}</p>
      <div style={{fontSize:"0.73rem",color:"var(--text-muted)",marginBottom:"0.55rem"}}>Demo controls (performed by volunteer in person):</div>
      {sim}
    </Card>
  );
  const inProgress=(label,body,sim)=>(
    <Card style={{padding:"1.25rem",border:"1px solid var(--brand)",background:"var(--brand-soft)"}}>
      <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}><UserCheck size={16} color="var(--brand)"/><span style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--brand)"}}>{label}</span></div>
      <p style={{fontSize:"0.87rem",lineHeight:1.6,margin:"0 0 0.85rem"}}>{body}</p>
      <div style={{fontSize:"0.73rem",color:"var(--text-muted)",marginBottom:"0.55rem"}}>Demo controls (performed by volunteer in person):</div>
      {sim}
    </Card>
  );
  switch(stage){
    case "building": return (
      <Card style={{padding:"1.25rem"}}>
        <SectionLabel icon={Wrench}>Build in Scratch</SectionLabel>
        <p style={{fontSize:"0.83rem",color:"var(--text-muted)",margin:"0.5rem 0 1rem",lineHeight:1.6}}>Open Scratch and build your project. Follow the Initialization Rules — the volunteer will check them.</p>
        {caseData.lanes.some(l=>l.name!=="Required"&&l.available)&&(
          <div style={{marginBottom:"1rem",padding:"0.85rem",borderRadius:"10px",background:"var(--surface-2)"}}>
            <div style={{fontSize:"0.72rem",fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",marginBottom:"0.5rem"}}>Optional add-ons attempted</div>
            {caseData.lanes.filter(l=>l.name!=="Required"&&l.available).map(lane=>(
              <label key={lane.name} style={{display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.83rem",marginBottom:"0.3rem",cursor:"pointer"}}>
                <input type="checkbox" checked={laneAttempts.includes(lane.name)} onChange={e=>{ if(e.target.checked)setLaneAttempts([...laneAttempts,lane.name]); else setLaneAttempts(laneAttempts.filter(l=>l!==lane.name)); }}/>
                I also attempted <Badge tone={lane.name==="Extension"?"accent":"danger"}>{lane.name}</Badge>
              </label>
            ))}
          </div>
        )}
        {/* Screenshot — student side */}
        <div style={{marginBottom:"1rem",padding:"0.85rem",borderRadius:"10px",background:"var(--surface-2)"}}>
          <div style={{fontSize:"0.72rem",fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",marginBottom:"0.4rem"}}>Optional screenshot</div>
          {!screenshot?(
            <label style={{display:"flex",alignItems:"center",gap:"0.5rem",cursor:"pointer",fontSize:"0.83rem"}}>
              <Camera size={14} color="var(--text-muted)"/>
              <span style={{color:"var(--text-muted)"}}>Add a photo of your Scratch screen (optional, never required)</span>
              <input type="file" accept="image/*" style={{display:"none"}} onChange={()=>setScreenshot("placeholder")}/>
            </label>
          ):(
            <div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}>
              <div style={{width:48,height:36,background:"var(--border)",borderRadius:"6px",display:"flex",alignItems:"center",justifyContent:"center"}}><Image size={16} color="var(--text-muted)"/></div>
              <span style={{fontSize:"0.82rem"}}>Screenshot attached</span>
              <Btn variant="ghost" size="sm" onClick={()=>setScreenshot(null)}>Remove</Btn>
            </div>
          )}
        </div>
        <Btn variant="accent" icon={Send} onClick={()=>setStage("impl_review_requested")}>Request Implementation Review</Btn>
      </Card>
    );
    case "impl_review_requested": return waiting(
      "Implementation Review Requested",
      "You're in the queue. Keep your Scratch project open — a volunteer will come check it against the Client Brief and Initialization Rules.",
      <Btn variant="primary" icon={UserCheck} onClick={()=>setStage("impl_review_claimed")}>Volunteer claims (demo)</Btn>
    );
    case "impl_review_claimed": return inProgress(
      "A volunteer is reviewing your project",
      "A volunteer has claimed your review and is on their way. They'll check your project against the brief, init rules, and any add-ons you attempted.",
      <div style={{display:"flex",gap:"0.6rem"}}>
        <Btn variant="success" icon={ThumbsUp} onClick={()=>setStage("impl_approved")}>Approve</Btn>
        <Btn variant="danger" icon={ThumbsDown} onClick={()=>setStage("building")}>Request changes</Btn>
      </div>
    );
    case "impl_approved": return (
      <Card style={{padding:"1.25rem",border:"1px solid var(--success)",background:"var(--success-soft)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}><CheckCircle2 size={16} color="var(--success)"/><span style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--success)"}}>Implementation approved</span></div>
        <p style={{fontSize:"0.87rem",lineHeight:1.6,margin:"0 0 0.85rem"}}>Your project matches the brief. Now predict what will happen before you test it.</p>
        <Btn variant="primary" onClick={()=>setStage("prediction_submitted")}>Go to Predict & Prove</Btn>
      </Card>
    );
    case "prediction_submitted": return (
      <Card style={{padding:"1.25rem",border:"1px solid var(--accent)",background:"var(--accent-soft)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}><Lock size={16} color="var(--accent)"/><span style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--accent)"}}>Predict & Prove</span></div>
        <p style={{fontSize:"0.87rem",lineHeight:1.6,margin:"0 0 1rem"}}>{caseData.predictPrompt}</p>
        <Field label="I think..."><Textarea rows={2} value={prediction.think} placeholder="...the result will be..." onChange={e=>setPrediction({...prediction,think:e.target.value})}/></Field>
        <Field label="Because..."><Textarea rows={3} value={prediction.because} placeholder="...I traced through the code and..." onChange={e=>setPrediction({...prediction,because:e.target.value})}/></Field>
        <div style={{marginTop:"0.85rem"}}>
          <Btn variant="accent" icon={Send} disabled={!prediction.think.trim()||!prediction.because.trim()} onClick={()=>setStage("prediction_review_requested")}>Submit prediction</Btn>
          <div style={{fontSize:"0.73rem",color:"var(--text-muted)",marginTop:"0.45rem"}}>Once submitted, your prediction is locked — you can't edit it.</div>
        </div>
      </Card>
    );
    case "prediction_review_requested": return (
      <Card style={{padding:"1.25rem",border:"1px solid var(--accent)",background:"var(--accent-soft)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}><Hourglass size={16} color="var(--accent)"/><span style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--accent)"}}>Prediction Review Requested</span></div>
        <p style={{fontSize:"0.87rem",lineHeight:1.6,margin:"0 0 0.75rem"}}>Your prediction is locked and waiting in the queue.</p>
        <div style={{marginBottom:"0.5rem"}}><div style={{fontSize:"0.7rem",fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",marginBottom:"0.25rem"}}>I think...</div><div style={{fontSize:"0.82rem",padding:"0.55rem",borderRadius:"8px",background:"var(--surface)"}}>{prediction.think}</div></div>
        <div style={{marginBottom:"0.85rem"}}><div style={{fontSize:"0.7rem",fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",marginBottom:"0.25rem"}}>Because...</div><div style={{fontSize:"0.82rem",padding:"0.55rem",borderRadius:"8px",background:"var(--surface)"}}>{prediction.because}</div></div>
        <div style={{fontSize:"0.73rem",color:"var(--text-muted)",marginBottom:"0.55rem"}}>Demo controls:</div>
        <Btn variant="primary" icon={UserCheck} onClick={()=>setStage("prediction_review_claimed")}>Volunteer claims (demo)</Btn>
      </Card>
    );

    case "prediction_review_claimed": return inProgress(
      "A volunteer is reviewing your prediction",
      "A volunteer has claimed your review and will talk through your reasoning before clearing you to test.",
      <div style={{marginTop:"0",display:"flex",gap:"0.6rem"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:"0.7rem",fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",marginBottom:"0.25rem"}}>I think...</div><div style={{fontSize:"0.82rem",padding:"0.55rem",borderRadius:"8px",background:"var(--surface)",marginBottom:"0.5rem"}}>{prediction.think}</div>
          <div style={{fontSize:"0.7rem",fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",marginBottom:"0.25rem"}}>Because...</div><div style={{fontSize:"0.82rem",padding:"0.55rem",borderRadius:"8px",background:"var(--surface)",marginBottom:"0.75rem"}}>{prediction.because}</div>
          <div style={{display:"flex",gap:"0.6rem"}}><Btn variant="success" icon={ThumbsUp} onClick={()=>setStage("prediction_approved")}>Approve</Btn><Btn variant="danger" icon={ThumbsDown} onClick={()=>setStage("prediction_submitted")}>Send back</Btn></div>
        </div>
      </div>
    );
    case "prediction_approved": return (
      <Card style={{padding:"1.25rem",border:"1px solid var(--success)",background:"var(--success-soft)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}><CheckCircle2 size={16} color="var(--success)"/><span style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",color:"var(--success)"}}>Prediction approved</span></div>
        <p style={{fontSize:"0.87rem",lineHeight:1.6,margin:"0 0 0.75rem"}}>Great reasoning. You're cleared to test — go run your Scratch project.</p>
        <div style={{marginBottom:"0.85rem"}}><div style={{fontSize:"0.7rem",fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",marginBottom:"0.25rem"}}>Your prediction</div><div style={{fontSize:"0.82rem",padding:"0.55rem",borderRadius:"8px",background:"var(--surface)"}}>{prediction.think}</div></div>
        <Btn variant="primary" onClick={()=>setStage("testing")}>Go test in Scratch</Btn>
      </Card>
    );
    case "testing": return (
      <Card style={{padding:"1.25rem",border:"1px solid var(--success)",background:"var(--success-soft)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}><FlaskConical size={16} color="var(--success)"/><span style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",color:"var(--success)"}}>Testing</span></div>
        <p style={{fontSize:"0.87rem",lineHeight:1.6,margin:"0 0 0.75rem"}}>Run your Scratch project and compare what actually happens to your prediction.</p>
        <div style={{marginBottom:"0.85rem"}}><div style={{fontSize:"0.7rem",fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",marginBottom:"0.25rem"}}>Your prediction</div><div style={{fontSize:"0.82rem",padding:"0.55rem",borderRadius:"8px",background:"var(--surface)"}}>{prediction.think}</div></div>
        <Btn variant="primary" onClick={()=>setStage("reflection")}>I tested it — continue</Btn>
      </Card>
    );
    case "reflection": return (
      <Card style={{padding:"1.25rem"}}>
        <SectionLabel icon={Lightbulb}>Reflection</SectionLabel>
        <p style={{fontSize:"0.83rem",color:"var(--text-muted)",margin:"0.5rem 0 0.75rem",lineHeight:1.6}}>{caseData.reflectionPrompt}</p>
        <Textarea rows={4} placeholder="My prediction was... what actually happened was..."/>
        <div style={{marginTop:"0.75rem"}}><Btn variant="primary" onClick={()=>setStage("complete")}>Submit reflection & complete case</Btn></div>
      </Card>
    );
    case "complete": return (
      <Card style={{padding:"1.25rem",border:"1px solid var(--success)",background:"var(--success-soft)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}><CheckCircle2 size={18} color="var(--success)"/><span style={{fontWeight:700,fontSize:"0.95rem"}}>Case complete</span></div>
        <p style={{fontSize:"0.83rem",lineHeight:1.6,margin:"0 0 0.85rem"}}>Your reflection has been logged. This case now counts toward your clearance progress and mastery.</p>
        <div style={{display:"flex",gap:"1.25rem",flexWrap:"wrap"}}>
          <div><div style={{fontSize:"0.7rem",color:"var(--text-muted)",textTransform:"uppercase"}}>Reputation</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:"1.2rem"}}>+{caseData.reputationReward+(laneAttempts.length*10)}</div></div>
          <div><div style={{fontSize:"0.7rem",color:"var(--text-muted)",textTransform:"uppercase"}}>Mastery gained</div><div style={{display:"flex",gap:"0.3rem",marginTop:"0.2rem",flexWrap:"wrap"}}>{Object.entries(caseData.conceptWeights).filter(([,v])=>v>0).map(([c,v])=><Badge key={c} tone="success">{c} +{v}</Badge>)}</div></div>
          {laneAttempts.length>0&&<div><div style={{fontSize:"0.7rem",color:"var(--text-muted)",textTransform:"uppercase"}}>Add-ons</div><div style={{display:"flex",gap:"0.3rem",marginTop:"0.2rem"}}>{laneAttempts.map(l=><Badge key={l} tone={l==="Extension"?"accent":"danger"}>{l}</Badge>)}</div></div>}
        </div>
      </Card>
    );
    default: return null;
  }
}

/* --- Case Workflow (student) --- */
function CaseWorkflow({ stage, setStage, onBack }){
  const [prediction, setPrediction] = useState({think:"",because:""});
  const [laneAttempts, setLaneAttempts] = useState([]);
  const [screenshot, setScreenshot] = useState(null);
  const showTransferHint = stage==="reflection"||stage==="complete";
  return (
    <div>
      <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"none",border:"none",color:"var(--text-muted)",fontSize:"0.85rem",cursor:"pointer",marginBottom:"1rem",padding:0,fontFamily:"'IBM Plex Sans',sans-serif"}}><ArrowLeft size={15}/>Back to Home</button>
      <div style={{marginBottom:"0.75rem"}}>
        <div style={{display:"flex",gap:"0.4rem",marginBottom:"0.4rem"}}>{ACTIVE_CASE.concepts.map(c=><Badge key={c}>{c}</Badge>)}{stage==="complete"&&<Badge tone="success">Complete</Badge>}</div>
        <h1 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.4rem",fontWeight:700,margin:0}}>{ACTIVE_CASE.title}</h1>
        <p style={{margin:"0.2rem 0 0",color:"var(--text-muted)",fontSize:"0.85rem"}}>Client: {ACTIVE_CASE.client}</p>
      </div>
      <Card style={{padding:"1rem 1.25rem",marginBottom:"1.25rem"}}>
        <SectionLabel icon={ListChecks}>Case progress</SectionLabel>
        <div style={{marginTop:"0.85rem"}}><StageRail currentKey={stage}/></div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.05fr",gap:"1.1rem"}}>
        <CaseDossier caseData={ACTIVE_CASE} showTransferHint={showTransferHint}/>
        <StageActionPanel stage={stage} setStage={setStage} caseData={ACTIVE_CASE} prediction={prediction} setPrediction={setPrediction} laneAttempts={laneAttempts} setLaneAttempts={setLaneAttempts} screenshot={screenshot} setScreenshot={setScreenshot}/>
      </div>
    </div>
  );
}

/* --- StudentShell --- */
function StudentShell({ role, setRole, theme, setTheme }){
  const [view, setView] = useState("home");
  const [caseStage, setCaseStage] = useState("impl_review_requested");
  const [handRaised, setHandRaised] = useState(false);

  const handleSetView = v => { setView(v); };
  return (
    <>
      <StudentSidebar view={view} setView={handleSetView} role={role} setRole={setRole} theme={theme} setTheme={setTheme} onRaiseHand={()=>setHandRaised(!handRaised)} handRaised={handRaised}/>
      <main style={{flex:1,padding:"1.75rem 2.25rem",overflow:"auto"}}>
        {view==="home"&&<StudentHome caseStage={caseStage} onOpenCase={()=>setView("case-detail")} onGoToCases={()=>setView("cases")}/>}
        {view==="cases"&&<StudentCases onOpenCase={()=>setView("case-detail")}/>}
        {view==="case-detail"&&<CaseWorkflow stage={caseStage} setStage={setCaseStage} onBack={()=>setView("home")}/>}
        {view==="progress"&&<StudentProgress/>}
      </main>
    </>
  );
}

/* ============================================================ ============================================================
   VOLUNTEER EXPERIENCE
   ============================================================ ============================================================ */
function escTone(min){ return min>=20?"danger":min>=10?"warning":"neutral";
}

function QueueCard({ item, onClaim, claimedIds }){
  const claimed = claimedIds.includes(item.id);
  const tone = escTone(item.waitMin);
  const border = tone==="danger"?"var(--danger)":tone==="warning"?"var(--warning)":"var(--border)";
  const typeTone = item.type==="Implementation"?"brand":item.type==="Prediction"?"accent":"danger";
  return (
    <Card style={{padding:"1rem",border:`1px solid ${border}`,display:"flex",flexDirection:"column",gap:"0.5rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"0.5rem"}}>
        <div style={{minWidth:0}}>
          <div style={{fontWeight:700,fontSize:"0.9rem"}}>{item.student}</div>
          <div style={{fontSize:"0.78rem",color:"var(--text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.caseTitle}</div>
          <div style={{fontSize:"0.75rem",color:"var(--text-muted)"}}>Stage: {item.stage}</div>
        </div>
        <Badge tone={tone==="neutral"?"brand":tone}>{item.waitMin} min</Badge>
      </div>
      <div style={{display:"flex",gap:"0.35rem",flexWrap:"wrap"}}>
        <Badge tone={typeTone}>{item.type==="Help"?"Help request":`${item.type} review`}</Badge>
        {item.type!=="Help"&&<Badge tone={item.lane==="Required"?"neutral":item.lane==="Extension"?"accent":"danger"}>{item.lane}</Badge>}
        {item.screenshotUrl&&<Badge tone="neutral"><Image size={10}/> Screenshot</Badge>}
      </div>
      {item.type==="Help"&&item.reason&&<div style={{fontSize:"0.8rem",display:"flex",gap:"0.4rem",alignItems:"flex-start"}}><AlertCircle size={13} color="var(--danger)" style={{flexShrink:0,marginTop:"0.1rem"}}/>{item.reason}</div>}
      {item.prediction&&<div style={{fontSize:"0.78rem",lineHeight:1.5,background:"var(--surface-2)",padding:"0.5rem",borderRadius:"7px"}}><strong>I think:</strong> {item.prediction}</div>}
      <div style={{marginTop:"auto"}}>
        {!claimed?<Btn variant="primary" size="sm" onClick={()=>onClaim(item)}>Claim</Btn>:<Badge tone="success">Claimed by you</Badge>}
      </div>
    </Card>
  );
}

function ClaimedCard({ item, onResolve }){
  const [photoAdded, setPhotoAdded] = useState(false);
  const typeTone = item.type==="Implementation"?"brand":item.type==="Prediction"?"accent":"danger";
  const isHelp = item.type==="Help";
  return (
    <Card style={{padding:"1rem",display:"flex",flexDirection:"column",gap:"0.6rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"0.5rem"}}>
        <div style={{minWidth:0}}>
          <div style={{fontWeight:700,fontSize:"0.9rem"}}>{item.student}</div>
          <div style={{fontSize:"0.78rem",color:"var(--text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.caseTitle}</div>
        </div>
        <div style={{display:"flex",gap:"0.3rem",flexWrap:"wrap",justifyContent:"flex-end",flexShrink:0}}>
          <Badge tone={typeTone}>{item.type==="Help"?"Help":item.type}</Badge>
          {item.type!=="Help"&&<Badge tone={item.lane==="Required"?"neutral":item.lane==="Extension"?"accent":"danger"}>{item.lane}</Badge>}
        </div>
      </div>

      {/* Show screenshot if student attached one */}
      {item.screenshotUrl&&(
        <div style={{padding:"0.55rem",borderRadius:"8px",background:"var(--surface-2)",display:"flex",alignItems:"center",gap:"0.55rem"}}>
          <div style={{width:48,height:36,background:"var(--border)",borderRadius:"6px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Image size={16} color="var(--text-muted)"/></div>
          <div style={{fontSize:"0.78rem",color:"var(--text-muted)"}}>Student screenshot attached (for reference)</div>
        </div>
      )}

      {isHelp&&item.reason&&<div style={{fontSize:"0.82rem",display:"flex",gap:"0.4rem",alignItems:"flex-start"}}><AlertCircle size={14} color="var(--danger)" style={{flexShrink:0,marginTop:"0.1rem"}}/>{item.reason}</div>}
      {item.type==="Implementation"&&(
        <div style={{fontSize:"0.78rem",padding:"0.55rem",borderRadius:"8px",background:"var(--surface-2)"}}>Walk through the Initialization Rules in person. Check any Extension/Challenge add-ons the student attempted.</div>
      )}
      {item.prediction&&(
        <div style={{fontSize:"0.78rem",lineHeight:1.5}}>
          <div style={{padding:"0.5rem",borderRadius:"7px",background:"var(--surface-2)",marginBottom:"0.4rem"}}><strong>I think:</strong> {item.prediction}</div>
          {item.reasoning&&<div style={{padding:"0.5rem",borderRadius:"7px",background:"var(--surface-2)"}}><strong>Because:</strong> {item.reasoning}</div>}
        </div>
      )}
      <div style={{display:"flex",gap:"0.5rem",alignItems:"center",flexWrap:"wrap"}}>
        {isHelp?<Btn variant="success" icon={CheckCircle2} size="sm" onClick={()=>onResolve(item.id,"helped")}>Mark helped</Btn>:(
          <><Btn variant="success" icon={ThumbsUp} size="sm" onClick={()=>onResolve(item.id,"approved")}>Approve</Btn><Btn variant="danger" icon={ThumbsDown} size="sm" onClick={()=>onResolve(item.id,"rejected")}>Send back</Btn></>
        )}
        {!isHelp&&!photoAdded&&!item.screenshotUrl&&<Btn variant="ghost" size="sm" icon={Camera} onClick={()=>setPhotoAdded(true)}>Add photo</Btn>}
        {!isHelp&&photoAdded&&<Badge tone="success">Photo added</Badge>}
      </div>
      {!isHelp&&<div style={{fontSize:"0.71rem",color:"var(--text-muted)"}}>Photo is optional — never required to approve.</div>}
    </Card>
  );
}

function VolunteerShell({ role, setRole, theme, setTheme }){
  const [view, setView] = useState("queue");
  const [queue, setQueue] = useState(REVIEW_QUEUE_SEED);
  const [claimed, setClaimed] = useState(CLAIMED_SEED);

  const handleClaim = item => { setQueue(q=>q.filter(i=>i.id!==item.id)); setClaimed(c=>[...c,{...item,status:"claimed"}]); };
  const handleResolve = (id) => { setClaimed(c=>c.filter(i=>i.id!==id)); };

  const pendingQueue = queue.filter(q=>q.type!=="Help");
  const helpQueue = queue.filter(q=>q.type==="Help");
  const sortedQueue = [...pendingQueue].sort((a,b)=>b.waitMin-a.waitMin);
  const sortedHelp = [...helpQueue].sort((a,b)=>b.waitMin-a.waitMin);
  const claimedIds = claimed.map(c=>c.id);

  const navItems=[
    { key:"queue",   label:"Review Queue",   icon:Inbox },
    { key:"help",    label:"Help Requests",  icon:HelpCircle },
    { key:"claimed", label:"Claimed",        icon:ClipboardCheck },
  ];
  const navBottom = (
    <Card style={{padding:"0.85rem"}}>
      <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.3rem"}}><UserCheck size={13} color="var(--brand)"/><span style={{fontSize:"0.7rem",fontWeight:700,color:"var(--brand)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Volunteer</span></div>
      <div style={{fontSize:"0.82rem",fontWeight:600}}>J. Park — Senior Dev</div>
      <div style={{fontSize:"0.75rem",color:"var(--text-muted)",marginTop:"0.15rem"}}>{SESSION_ACTIVE.title}</div>
    </Card>
  );
  return (
    <>
      <Sidebar items={navItems} view={view} setView={setView} role={role} setRole={setRole} theme={theme} setTheme={setTheme} bottomContent={navBottom}/>
      <main style={{flex:1,padding:"1.75rem 2.25rem",overflow:"auto"}}>
        {view==="queue"&&(
          <div>
            <TopBar title="Review Queue" subtitle="Implementation and prediction reviews — sorted by wait time"
              right={<div style={{display:"flex",gap:"0.4rem"}}><Badge tone="brand">{pendingQueue.filter(q=>q.type==="Implementation").length} impl</Badge><Badge tone="accent">{pendingQueue.filter(q=>q.type==="Prediction").length} pred</Badge></div>}
            />
            {sortedQueue.length===0?<Card style={{padding:"2rem",textAlign:"center",color:"var(--text-muted)"}}>Queue is empty — great work!</Card>:(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"0.85rem"}}>
                {sortedQueue.map(item=><QueueCard key={item.id} item={item} onClaim={handleClaim} claimedIds={claimedIds}/>)}
              </div>
            )}
            <div style={{marginTop:"1.25rem",display:"flex",gap:"1rem",fontSize:"0.75rem",color:"var(--text-muted)"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.35rem"}}><span style={{width:10,height:10,borderRadius:3,background:"var(--warning)",display:"inline-block"}}/> 10+ min</div>
              <div style={{display:"flex",alignItems:"center",gap:"0.35rem"}}><span style={{width:10,height:10,borderRadius:3,background:"var(--danger)",display:"inline-block"}}/> 20+ min</div>
            </div>
          </div>
        )}
        {view==="help"&&(
          <div>
            <TopBar title="Help Requests" subtitle="Students who raised their hand or were flagged as stuck" right={<Badge tone="danger">{sortedHelp.length} pending</Badge>}/>
            {sortedHelp.length===0?<Card style={{padding:"2rem",textAlign:"center",color:"var(--text-muted)"}}>No help requests right now.</Card>:(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"0.85rem"}}>
                {sortedHelp.map(item=><QueueCard key={item.id} item={item} onClaim={handleClaim} claimedIds={claimedIds}/>)}
              </div>
            )}
          </div>
        )}
        {view==="claimed"&&(
          <div>
            <TopBar title="Claimed" subtitle="Items you've claimed — go find the student" right={<Badge tone="brand">{claimed.length} claimed</Badge>}/>
            {claimed.length===0?<Card style={{padding:"2rem",textAlign:"center",color:"var(--text-muted)"}}>Nothing claimed. Pick something up from the queue.</Card>:(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"0.85rem"}}>
                {claimed.map(item=><ClaimedCard key={item.id} item={item} onResolve={handleResolve}/>)}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

/* ============================================================ ============================================================
   INSTRUCTOR EXPERIENCE
   ============================================================ ============================================================ */

/* --- Case Builder --- */
function CaseList({ onNew, onEdit }){
  const [tab, setTab] = useState("published");
  const filtered = CASE_LIBRARY.filter(c=>c.status===tab);
  return (
    <div>
      <TopBar title="Case Builder" subtitle="Manage your curriculum case files" right={<Btn variant="primary" icon={Plus} onClick={onNew}>New case</Btn>}/>
      <div style={{display:"flex",gap:"0.25rem",background:"var(--surface-2)",borderRadius:"10px",padding:"0.25rem",border:"1px solid var(--border)",width:"fit-content",marginBottom:"1.25rem"}}>
        {["draft","published","archived"].map(s=>(
          <button key={s} onClick={()=>setTab(s)} style={{padding:"0.4rem 0.85rem",borderRadius:"8px",border:"none",cursor:"pointer",fontSize:"0.78rem",fontWeight:700,fontFamily:"'IBM Plex Sans',sans-serif",textTransform:"capitalize",background:tab===s?"var(--surface)":"transparent",color:tab===s?"var(--brand)":"var(--text-muted)",boxShadow:tab===s?"0 1px 2px rgba(0,0,0,0.06)":"none"}}>
            {s} <Badge tone={s==="published"?"success":s==="draft"?"warning":"neutral"}>{CASE_LIBRARY.filter(c=>c.status===s).length}</Badge>
          </button>
        ))}
      </div>
      {filtered.length===0&&<Card style={{padding:"2rem",textAlign:"center",color:"var(--text-muted)"}}>No {tab} cases.</Card>}
      <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
        {filtered.map(c=>(
          <Card key={c.id} style={{padding:"1rem 1.25rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"1rem"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.35rem",flexWrap:"wrap"}}>
                  <span style={{fontFamily:"'IBM Plex Mono',sans-serif",fontSize:"0.75rem",color:"var(--text-muted)",fontWeight:600}}>{c.caseCode}</span>
                  <span style={{fontWeight:700,fontSize:"0.95rem"}}>{c.title}</span>
                  {c.status==="published"&&<Badge tone="success">Published</Badge>}
                  {c.status==="draft"&&<Badge tone="warning">Draft</Badge>}
                  {c.status==="archived"&&<Badge>Archived</Badge>}
                </div>
                <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap",alignItems:"center",fontSize:"0.78rem",color:"var(--text-muted)"}}>
                  <span>CL-{c.minClearance}+ required</span>
                  <span>+{c.reputationReward} rep</span>
                  <span>~{c.estimatedMinutes} min</span>
                  <span style={{display:"flex",gap:"0.3rem"}}>{c.concepts.map(concept=><Badge key={concept}>{concept}</Badge>)}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:"0.4rem",flexShrink:0}}>
                <Btn variant="ghost" size="sm" icon={Pencil} onClick={()=>onEdit(c)}>Edit</Btn>
                <Btn variant="ghost" size="sm" icon={Copy}>Duplicate</Btn>
                {c.status==="draft"&&<Btn variant="primary" size="sm">Publish</Btn>}
                {c.status==="published"&&<Btn variant="subtle" size="sm" icon={Archive}>Archive</Btn>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const EMPTY_CASE = { caseCode:"", title:"", client:"", minClearance:1, reputationReward:25, estimatedMinutes:20, status:"draft", brief:"", tools:"", predictPrompt:"", reflectionPrompt:"", transferHint:"", conceptWeights:Object.fromEntries(CONCEPTS.map(c=>[c,0])), lanes:[{ name:"Required",detail:"",available:true },{ name:"Extension",detail:"",available:false },{ name:"Challenge",detail:"",available:false }], initRules:[""] };
function CaseBuilderForm({ existing, onBack }){
  const isEdit = !!existing;
  const [form, setForm] = useState(existing||EMPTY_CASE);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const setWeight = (concept,v) => setForm(f=>({...f,conceptWeights:{...f.conceptWeights,[concept]:parseInt(v)||0}}));
  const setLane = (i,key,val) => { const lanes=[...form.lanes]; lanes[i]={...lanes[i],[key]:val}; setForm(f=>({...f,lanes})); };
  const addInitRule = () => setForm(f=>({...f,initRules:[...f.initRules,""]}));
  const setInitRule = (i,v) => { const r=[...form.initRules]; r[i]=v; setForm(f=>({...f,initRules:r})); };
  const removeInitRule = i => setForm(f=>({...f,initRules:f.initRules.filter((_,idx)=>idx!==i)}));

  return (
    <div>
      <TopBar title={isEdit?"Edit Case":"New Case"} subtitle={isEdit?`${existing.caseCode} — ${existing.title}`:"Create a new case file"} onBack={onBack}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.25rem"}}>
        {/* Left col */}
        <div style={{display:"flex",flexDirection:"column",gap:"0"}}>
          <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
            <SectionLabel icon={FileText}>Case metadata</SectionLabel>
            <div style={{marginTop:"0.85rem"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem"}}>
                <Field label="Case Code"><Input placeholder="L1-06" value={form.caseCode} onChange={e=>set("caseCode",e.target.value)}/></Field>
                <Field label="Client Name"><Input placeholder="Client / Organization" value={form.client} onChange={e=>set("client",e.target.value)}/></Field>
              </div>
              <Field label="Case Title"><Input placeholder="Descriptive project title" value={form.title} onChange={e=>set("title",e.target.value)}/></Field>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.75rem"}}>
                <Field label="Min Clearance">
                  <select value={form.minClearance} onChange={e=>set("minClearance",Number(e.target.value))} style={{width:"100%",padding:"0.6rem 0.8rem",borderRadius:"8px",border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)",fontSize:"0.875rem",fontFamily:"'IBM Plex Sans',sans-serif"}}>
                    {CLEARANCE_LEVELS.map(l=><option key={l.level} value={l.level}>CL-{l.level} — {l.title}</option>)}
                  </select>
                </Field>
                <Field label="Reputation Reward"><Input type="number" min={5} max={100} value={form.reputationReward} onChange={e=>set("reputationReward",Number(e.target.value))}/></Field>
                <Field label="Est. Minutes"><Input type="number" min={5} max={120} value={form.estimatedMinutes} onChange={e=>set("estimatedMinutes",Number(e.target.value))}/></Field>
              </div>
            </div>
          </Card>

          <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
            <SectionLabel icon={FileText}>Client brief</SectionLabel>
            <div style={{marginTop:"0.75rem"}}><Textarea rows={4} value={form.brief} placeholder="Describe the client scenario and what they need..." onChange={e=>set("brief",e.target.value)}/></div>
          </Card>

          <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
            <SectionLabel icon={Target}>Difficulty lanes</SectionLabel>
            <p style={{fontSize:"0.78rem",color:"var(--text-muted)",margin:"0.4rem 0 0.75rem",lineHeight:1.5}}>Required is always on. Extension and Challenge are optional add-ons students can attempt after Required is approved.</p>
            <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
              {form.lanes.map((lane,i)=>(
                <div key={lane.name} style={{padding:"0.85rem",borderRadius:"10px",background:"var(--surface-2)",opacity:!lane.available&&lane.name!=="Required"?0.6:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.5rem"}}>
                    <Badge tone={lane.name==="Required"?"brand":lane.name==="Extension"?"accent":"danger"}>{lane.name}</Badge>
                    {lane.name!=="Required"&&<label style={{display:"flex",alignItems:"center",gap:"0.4rem",fontSize:"0.78rem",cursor:"pointer"}}><input type="checkbox" checked={lane.available} onChange={e=>setLane(i,"available",e.target.checked)}/>Available for this case</label>}
                  </div>
                  <Textarea rows={2} value={lane.detail} placeholder={`Describe the ${lane.name} lane requirements...`} onChange={e=>setLane(i,"detail",e.target.value)}/>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{padding:"1.25rem"}}>
            <SectionLabel icon={Wrench}>Tools allowed</SectionLabel>
            <div style={{marginTop:"0.75rem"}}><Input placeholder="repeat, variables, operators (+, <), say block" value={form.tools} onChange={e=>set("tools",e.target.value)}/></div>
            <p style={{fontSize:"0.73rem",color:"var(--text-muted)",margin:"0.35rem 0 0"}}>Comma-separated Scratch blocks/categories</p>
          </Card>
        </div>

        {/* Right col */}
        <div style={{display:"flex",flexDirection:"column",gap:"0"}}>
          <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
            <SectionLabel icon={ListChecks}>Initialization rules</SectionLabel>
            <p style={{fontSize:"0.78rem",color:"var(--text-muted)",margin:"0.4rem 0 0.75rem"}}>Exact starting conditions the volunteer checks during Implementation Review.</p>
            <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
              {form.initRules.map((rule,i)=>(
                <div key={i} style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                  <Input value={rule} placeholder={`Rule ${i+1}...`} onChange={e=>setInitRule(i,e.target.value)} style={{flex:1}}/>
                  {form.initRules.length>1&&<button onClick={()=>removeInitRule(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",padding:"0.3rem",borderRadius:"6px"}}><X size={14}/></button>}
                </div>
              ))}
              <Btn variant="ghost" size="sm" icon={Plus} onClick={addInitRule}>Add rule</Btn>
            </div>
          </Card>

          <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
            <SectionLabel icon={TrendingUp}>Concept weights</SectionLabel>
            <p style={{fontSize:"0.78rem",color:"var(--text-muted)",margin:"0.4rem 0 0.75rem",lineHeight:1.5}}>How much mastery this case contributes to each concept on completion. Extension×1.25, Challenge×1.5. Max 15 per concept.</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.4rem 0.75rem"}}>
              {CONCEPTS.map(concept=>(
                <div key={concept} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"0.5rem"}}>
                  <label style={{fontSize:"0.82rem",fontWeight:500}}>{concept}</label>
                  <input type="number" min={0} max={15} value={form.conceptWeights[concept]} onChange={e=>setWeight(concept,e.target.value)} style={{width:52,padding:"0.35rem 0.5rem",borderRadius:"6px",border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)",fontSize:"0.82rem",fontFamily:"'IBM Plex Sans',sans-serif",textAlign:"right"}}/>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
            <SectionLabel icon={Lock}>Predict & Prove prompt</SectionLabel>
            <div style={{marginTop:"0.75rem"}}><Textarea rows={3} value={form.predictPrompt} placeholder="What will your project output / do? Walk through your reasoning." onChange={e=>set("predictPrompt",e.target.value)}/></div>
          </Card>

          <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
            <SectionLabel icon={Lightbulb}>Reflection prompt</SectionLabel>
            <div style={{marginTop:"0.75rem"}}><Textarea rows={2} value={form.reflectionPrompt} placeholder="What actually happened? How did it compare to your prediction?" onChange={e=>set("reflectionPrompt",e.target.value)}/></div>
          </Card>

          <Card style={{padding:"1.25rem",marginBottom:"1.25rem"}}>
            <SectionLabel icon={ArrowRight}>Transfer hint</SectionLabel>
            <p style={{fontSize:"0.78rem",color:"var(--text-muted)",margin:"0.4rem 0 0.75rem"}}>Revealed after the student completes their reflection. Connects to a real-world application.</p>
            <Textarea rows={2} value={form.transferHint} placeholder="This pattern appears in real software when..." onChange={e=>set("transferHint",e.target.value)}/>
          </Card>

          <div style={{display:"flex",gap:"0.6rem",justifyContent:"flex-end"}}>
            <Btn variant="ghost" onClick={onBack}>Cancel</Btn>
            <Btn variant="subtle">Save as draft</Btn>
            <Btn variant="primary">Publish case</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Session Management --- */
function SessionList({ onNew, onMonitor }){
  const statusTone = s => s==="active"?"success":s==="closed"?"neutral":"brand";
  return (
    <div>
      <TopBar title="Sessions" subtitle="Workshop session lifecycle — create, open, monitor, close" right={<Btn variant="primary" icon={Plus} onClick={onNew}>New session</Btn>}/>
      <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
        {SESSION_LIST.map(s=>(
          <Card key={s.id} style={{padding:"1rem 1.25rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"1rem"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:"0.5rem",alignItems:"center",marginBottom:"0.35rem",flexWrap:"wrap"}}>
                  <span style={{fontFamily:"'IBM Plex Mono',sans-serif",fontSize:"0.75rem",color:"var(--text-muted)",fontWeight:600}}>{s.code}</span>
                  <span style={{fontWeight:700,fontSize:"0.95rem"}}>{s.title}</span>
                  <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                </div>
                <div style={{display:"flex",gap:"0.75rem",fontSize:"0.78rem",color:"var(--text-muted)",flexWrap:"wrap"}}>
                  <span>{s.date}</span>
                  <span>{s.students} students</span>
                  <span>{s.volunteers} volunteers</span>
                  <span>{s.cases.length} cases: {s.cases.join(", ")}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:"0.4rem",flexShrink:0}}>
                {s.status==="active"&&<Btn variant="primary" size="sm" onClick={onMonitor}>Monitor</Btn>}
                {s.status==="closed"&&<Btn variant="ghost" size="sm">Summary</Btn>}
                {s.status==="draft"&&<Btn variant="accent" size="sm">Open session</Btn>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SessionBuilder({ onBack }){
  const [sessionName, setSessionName] = useState("");
  const [selectedCases, setSelectedCases] = useState([]);
  const [generated, setGenerated] = useState(false);
  const publishedCases = CASE_LIBRARY.filter(c=>c.status==="published");
  const toggleCase = id => { if(selectedCases.includes(id)) setSelectedCases(selectedCases.filter(c=>c!==id)); else setSelectedCases([...selectedCases,id]); };
  return (
    <div>
      <TopBar title="New Session" subtitle="Configure and open a workshop session" onBack={onBack}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.25rem"}}>
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <Card style={{padding:"1.25rem"}}>
            <SectionLabel icon={Calendar}>Session details</SectionLabel>
            <div style={{marginTop:"0.85rem"}}>
              <Field label="Session name"><Input placeholder="Saturday Workshop — Location" value={sessionName} onChange={e=>setSessionName(e.target.value)}/></Field>
              {generated&&(
                <div style={{padding:"0.85rem",borderRadius:"10px",background:"var(--success-soft)",border:"1px solid var(--success)",marginTop:"0.5rem"}}>
                  <div style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",color:"var(--success)",marginBottom:"0.3rem"}}>Session code generated</div>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.4rem",fontWeight:700,letterSpacing:"0.05em"}}>AGENCY-272</div>
                  <div style={{fontSize:"0.78rem",color:"var(--text-muted)",marginTop:"0.2rem"}}>Share this code with students to join the session.</div>
                </div>
              )}
              {!generated&&<Btn variant="ghost" onClick={()=>setGenerated(true)} style={{marginTop:"0.5rem"}}>Generate session code</Btn>}
            </div>
          </Card>
          <Card style={{padding:"1.25rem"}}>
            <SectionLabel icon={FileText}>Session lifecycle</SectionLabel>
            <div style={{marginTop:"0.75rem",display:"flex",flexDirection:"column",gap:"0.5rem"}}>
              {[
                { state:"draft",   label:"Draft", body:"Code generated, cases assigned. Students can't join yet." },
                { state:"open",    label:"Open", body:"Code is live. Students can join, but workflow is inactive." },
                { state:"active",  label:"Active", body:"Workshop is live — queues open, students can submit." },
                { state:"closing", label:"Closing", body:"New requests blocked. In-flight reviews can still resolve." },
                { state:"closed",  label:"Closed", body:"Session ended. Summary generated." },
              ].map((s,i)=>(
                <div key={s.state} style={{display:"flex",gap:"0.6rem"}}>
                  <div style={{width:24,height:24,borderRadius:"50%",background:i===0?"var(--brand)":"var(--surface-2)",color:i===0?"#fff":"var(--text-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.7rem",fontWeight:700,flexShrink:0}}>{i+1}</div>
                  <div><div style={{fontWeight:700,fontSize:"0.82rem"}}>{s.label}</div><div style={{fontSize:"0.78rem",color:"var(--text-muted)",lineHeight:1.5}}>{s.body}</div></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div>
          <Card style={{padding:"1.25rem"}}>
            <SectionLabel icon={Layers}>Assign cases</SectionLabel>
            <p style={{fontSize:"0.78rem",color:"var(--text-muted)",margin:"0.4rem 0 0.85rem"}}>Only published cases can be assigned to sessions.</p>
            <div style={{display:"flex",flexDirection:"column",gap:"0.5rem",marginBottom:"1.1rem"}}>
              {publishedCases.map(c=>(
                <label key={c.id} style={{display:"flex",alignItems:"center",gap:"0.6rem",padding:"0.65rem 0.75rem",borderRadius:"9px",background:selectedCases.includes(c.id)?"var(--brand-soft)":"var(--surface-2)",border:`1px solid ${selectedCases.includes(c.id)?"var(--brand)":"transparent"}`,cursor:"pointer"}}>
                  <input type="checkbox" checked={selectedCases.includes(c.id)} onChange={()=>toggleCase(c.id)}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:"0.85rem"}}>{c.title}</div>
                    <div style={{fontSize:"0.74rem",color:"var(--text-muted)"}}>{c.caseCode} · CL-{c.minClearance}+</div>
                  </div>
                  <div style={{display:"flex",gap:"0.3rem"}}>{c.concepts.map(concept=><Badge key={concept}>{concept}</Badge>)}</div>
                </label>
              ))}
            </div>
            <div style={{display:"flex",gap:"0.5rem",justifyContent:"flex-end"}}>
              <Btn variant="ghost">Save as draft</Btn>
              <Btn variant="primary" icon={PlayCircle} disabled={!sessionName||selectedCases.length===0||!generated}>Open session</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* --- Session Monitor / Ops --- */
function QueueHealthBoard(){
  const max = Math.max(...QUEUE_HEALTH.map(s=>s.count));
  const THRESHOLD = 3;
  return (
    <Card style={{padding:"1.25rem"}}>
      <SectionLabel icon={Activity}>Queue health — students per stage</SectionLabel>
      <div style={{marginTop:"1rem",display:"flex",flexDirection:"column",gap:"0.55rem"}}>
        {QUEUE_HEALTH.map(s=>{
          const isBottleneck = s.count>=THRESHOLD;
          const isReview = s.key.includes("review");
          return (
            <div key={s.key} style={{display:"flex",alignItems:"center",gap:"0.6rem"}}>
              <div style={{width:230,flexShrink:0,fontSize:"0.77rem",color:"var(--text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</div>
              <div style={{flex:1,height:9,borderRadius:999,background:"var(--surface-2)",overflow:"hidden"}}>
                <div style={{width:`${(s.count/max)*100}%`,height:"100%",background:isBottleneck?"var(--danger)":isReview?"var(--accent)":"var(--brand)",borderRadius:999}}/>
              </div>
              <div style={{width:20,textAlign:"right",fontSize:"0.82rem",fontWeight:700,flexShrink:0}}>{s.count}</div>
              <div style={{width:76,flexShrink:0}}>{isBottleneck&&<Badge tone="danger">Bottleneck</Badge>}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SessionMonitor({ onBack }){
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);

  const helpItems = REVIEW_QUEUE_SEED.filter(q=>q.type==="Help");
  if(closed) return (
    <div>
      <TopBar title="Session Closed" subtitle="Summary generated" onBack={onBack}/>
      <Card style={{padding:"1.25rem",border:"1px solid var(--success)",background:"var(--success-soft)",marginBottom:"1.25rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.75rem"}}><CheckCircle2 size={18} color="var(--success)"/><span style={{fontWeight:700}}>Session closed successfully</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:"0.75rem"}}>
          {[
            ["Students participated", SESSION_SUMMARY.studentsParticipated],
            ["Cases completed", SESSION_SUMMARY.casesCompleted],
            ["Cases in progress", SESSION_SUMMARY.casesInProgress],
            ["Reviews completed", SESSION_SUMMARY.reviewsCompleted],
            ["Help requests resolved", SESSION_SUMMARY.helpResolved],
            ["Avg wait — Implementation", `${SESSION_SUMMARY.avgWaitImpl} min`],
            ["Avg wait — Prediction", `${SESSION_SUMMARY.avgWaitPrediction} min`],
          ].map(([label,val])=>(
            <div key={label}>
              <div style={{fontSize:"0.72rem",color:"var(--success)",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:"0.2rem"}}>{label}</div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:"1.15rem"}}>{val}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
  return (
    <div>
      <TopBar title="Session Monitor" subtitle={`${SESSION_ACTIVE.title} · ${SESSION_ACTIVE.code}`}
        right={<div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
          <Badge tone="success">Session live</Badge>
          {!closing?<Btn variant="subtle" icon={StopCircle} size="sm" onClick={()=>setClosing(true)}>Close session</Btn>:(
            <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
              <span style={{fontSize:"0.8rem",color:"var(--danger)"}}>Confirm close?</span>
              <Btn variant="danger" size="sm" onClick={()=>setClosed(true)}>Yes, close</Btn>
              <Btn variant="ghost" size="sm" onClick={()=>setClosing(false)}>Cancel</Btn>
            </div>
          )}
        </div>}
        onBack={onBack}
      />
      {closing&&!closed&&(
        <Card style={{padding:"0.85rem",border:"1px solid var(--warning)",background:"var(--warning-soft)",marginBottom:"1rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.85rem"}}><AlertCircle size={15} color="var(--warning)"/><span>Closing is a two-step process. New review requests will be blocked, but in-flight claimed reviews can still be resolved. Student progress is preserved.</span></div>
        </Card>
      )}
      <div style={{display:"flex",gap:"1rem",marginBottom:"1.25rem",flexWrap:"wrap"}}>
        {[
          { icon:Users,     label:"Students",      val:OPS.studentsPresent },
          { icon:UserCheck, label:"Volunteers",    val:OPS.volunteersActive },
          { icon:Inbox,     label:"Pending reviews", val:OPS.pendingReviews, tone:"var(--accent)" },
          { icon:HelpCircle,label:"Help requests",  val:OPS.pendingHelp, tone:"var(--danger)" },
          { icon:Clock,     label:"Avg wait — Impl",  val:`${OPS.avgWaitImpl}m`, tone:OPS.avgWaitImpl>=10?"var(--danger)":"var(--text)" },
          { icon:Clock,     label:"Avg wait — Pred",  val:`${OPS.avgWaitPred}m`, tone:OPS.avgWaitPred>=10?"var(--danger)":"var(--text)" },
        ].map(k=>(
          <Card key={k.label} style={{padding:"1rem",flex:"1 1 0",minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.4rem",color:"var(--text-muted)",fontSize:"0.75rem",marginBottom:"0.4rem",whiteSpace:"nowrap"}}><k.icon size={13} style={{flexShrink:0}}/><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{k.label}</span></div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.6rem",fontWeight:700,color:k.tone||"var(--text)"}}>{k.val}</div>
          </Card>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:"1.25rem"}}>
        <QueueHealthBoard/>
        <div>
          <SectionLabel icon={AlertCircle} muted>Students needing help</SectionLabel>
          <div style={{marginTop:"0.6rem",display:"flex",flexDirection:"column",gap:"0.55rem"}}>
            {helpItems.map((h,i)=>(
              <Card key={i} style={{padding:"0.85rem",border:`1px solid ${escTone(h.waitMin)==="danger"?"var(--danger)":"var(--warning)"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.3rem"}}><span style={{fontWeight:700,fontSize:"0.85rem"}}>{h.student}</span><Badge tone={escTone(h.waitMin)}>{h.waitMin} min</Badge></div>
                <div style={{fontSize:"0.77rem",color:"var(--text-muted)",marginBottom:"0.3rem"}}>{h.caseTitle}</div>
                <div style={{fontSize:"0.8rem"}}>{h.reason}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Analytics --- */
function InstructorAnalytics(){
  const width=520, height=180, padL=48, padB=36, padT=12, padR=16;
  const innerW=width-padL-padR, innerH=height-padT-padB;
  const colors={"Variables":"var(--brand)","Loops":"var(--accent)","Conditionals":"var(--success)"};
  const yTicks=[0,25,50,75,100];
  const nSessions = MASTERY_HISTORY[0].history.length;
  const xLabels = Array.from({length:nSessions},(_,i)=>`Session ${i+1}`);
  return (
    <div>
      <TopBar title="Analytics" subtitle="Cohort learning evidence and concept difficulty"/>
      <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
        <Card style={{padding:"1.25rem"}}>
          <SectionLabel icon={TrendingUp}>Learning Evidence Graph</SectionLabel>
          <p style={{fontSize:"0.78rem",color:"var(--text-muted)",margin:"0.35rem 0 0.5rem"}}>X-axis: Workshop Sessions (chronological) · Y-axis: Average Prediction Accuracy (%) · One line per concept</p>
          <div style={{overflowX:"auto"}}>
            <svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%",maxWidth:width,height:"auto",display:"block"}}>
              {/* Y grid + labels */}
              {yTicks.map(v=>{
                const y = padT + innerH - (v/100)*innerH;
                return <g key={v}><line x1={padL} x2={padL+innerW} y1={y} y2={y} stroke="var(--border)" strokeWidth="1"/><text x={padL-6} y={y+4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{v}%</text></g>;
              })}
              {/* X labels */}
              {xLabels.map((label,i)=>{
                const x = padL + (i/(nSessions-1))*innerW;
                return <text key={i} x={x} y={height-4} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{label}</text>;
              })}
              {/* Axis labels */}
              <text x={padL+innerW/2} y={height} textAnchor="middle" fontSize="10" fill="var(--text-muted)" dy="-1">Workshop Sessions</text>
              {/* Lines */}
              {MASTERY_HISTORY.map(m=>{
                const pts = m.history.map((val,i)=>{
                  const x=padL+(i/(nSessions-1))*innerW;
                  const y=padT+innerH-(val/100)*innerH;
                  return `${x},${y}`;
                }).join(" ");
                return <g key={m.concept}><polyline points={pts} fill="none" stroke={colors[m.concept]||"var(--text-muted)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>{m.history.map((val,i)=>{const x=padL+(i/(nSessions-1))*innerW;const y=padT+innerH-(val/100)*innerH;return <circle key={i} cx={x} cy={y} r="3.5" fill={colors[m.concept]||"var(--text-muted)"}><title>{m.concept}: {val}%</title></circle>;})}</g>;
              })}
            </svg>
          </div>
          <div style={{display:"flex",gap:"1rem",marginTop:"0.75rem",flexWrap:"wrap"}}>
            {MASTERY_HISTORY.map(m=>(
              <div key={m.concept} style={{display:"flex",alignItems:"center",gap:"0.4rem",fontSize:"0.78rem"}}>
                <span style={{width:10,height:10,borderRadius:2,background:colors[m.concept],display:"inline-block"}}/>
                <span>{m.concept}: {m.history[0]}% → {m.history[m.history.length-1]}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{padding:"1.25rem"}}>
          <SectionLabel icon={Target}>Case difficulty — cohort average accuracy</SectionLabel>
          <p style={{fontSize:"0.78rem",color:"var(--text-muted)",margin:"0.35rem 0 0.85rem"}}>Average prediction accuracy across all student attempts per case. Cases below 70% may need revision or extra instructor attention.</p>
          <div style={{display:"flex",flexDirection:"column",gap:"0.7rem"}}>
            {COHORT_DIFFICULTY.map(c=>(
              <div key={c.caseTitle}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"0.3rem"}}>
                  <span style={{fontWeight:600,fontSize:"0.85rem"}}>{c.caseTitle}</span>
                  <span style={{fontSize:"0.8rem",color:"var(--text-muted)"}}>{c.avgAccuracy}% avg · {c.attempts} attempts{c.avgAccuracy<70&&<Badge tone="warning" style={{marginLeft:"0.4rem"}}>Needs attention</Badge>}</span>
                </div>
                <ThinBar value={c.avgAccuracy} max={100} color={c.avgAccuracy<70?"var(--warning)":"var(--brand)"}/>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* --- Roster --- */
function InstructorRoster(){
  return (
    <div>
      <TopBar title="Roster" subtitle={`${ROSTER_STUDENTS.length} students checked in — ${SESSION_ACTIVE.title}`}/>
      <Card style={{padding:"0.5rem"}}>
        {ROSTER_STUDENTS.map((r,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.8rem 0.85rem",borderBottom:i<ROSTER_STUDENTS.length-1?"1px solid var(--border)":"none",gap:"0.5rem"}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontWeight:600,fontSize:"0.88rem"}}>{r.name}</div>
              <div style={{fontSize:"0.78rem",color:"var(--text-muted)"}}>{r.caseTitle} — {r.stage}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
              <Badge tone="brand">CL-{r.clearance}</Badge>
              {r.readyToPromote&&<Badge tone="success">Ready to promote</Badge>}
              {r.readyToPromote&&<Btn variant="success" size="sm">Promote</Btn>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* --- InstructorShell --- */
function InstructorShell({ role, setRole, theme, setTheme }){
  const [view, setView] = useState("operations");
  const [editingCase, setEditingCase] = useState(null);
  const [sessionBuilderOpen, setSessionBuilderOpen] = useState(false);
  const [sessionMonitorOpen, setSessionMonitorOpen] = useState(false);
  const navItems=[
    { key:"operations",   label:"Operations",    icon:Activity },
    { key:"cases",        label:"Case Builder",  icon:Layers, subkeys:["cases-new","cases-edit"] },
    { key:"sessions",     label:"Sessions",      icon:Calendar, subkeys:["sessions-new","sessions-monitor"] },
    { key:"analytics",    label:"Analytics",     icon:BarChart3 },
    { key:"roster",       label:"Roster",        icon:Users },
  ];
  const navBottom=(
    <Card style={{padding:"0.85rem"}}>
      <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.3rem"}}><ShieldCheck size={13} color="var(--brand)"/><span style={{fontSize:"0.7rem",fontWeight:700,color:"var(--brand)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Instructor</span></div>
      <div style={{fontSize:"0.82rem",fontWeight:600}}>{SESSION_ACTIVE.title}</div>
      <div style={{fontSize:"0.75rem",color:"var(--text-muted)",marginTop:"0.15rem"}}>Code: {SESSION_ACTIVE.code}</div>
    </Card>
  );
  const handleSetView = v => { setView(v); setEditingCase(null); setSessionBuilderOpen(false); setSessionMonitorOpen(false); };
  // Determine what to render
  const renderMain = () => {
    if(view==="cases"){
      if(editingCase) return <CaseBuilderForm existing={editingCase} onBack={()=>setEditingCase(null)}/>;
      if(view==="cases-new") return <CaseBuilderForm existing={null} onBack={()=>setView("cases")}/>;
      return <CaseList onNew={()=>setEditingCase(EMPTY_CASE)} onEdit={c=>setEditingCase(c)}/>;
    }
    if(view==="sessions"){
      if(sessionBuilderOpen) return <SessionBuilder onBack={()=>setSessionBuilderOpen(false)}/>;
      if(sessionMonitorOpen) return <SessionMonitor onBack={()=>setSessionMonitorOpen(false)}/>;
      return <SessionList onNew={()=>setSessionBuilderOpen(true)} onMonitor={()=>setSessionMonitorOpen(true)}/>;
    }
    if(view==="operations") return <SessionMonitor onBack={null}/>;
    if(view==="analytics") return <InstructorAnalytics/>;
    if(view==="roster") return <InstructorRoster/>;
    return null;
  };

  return (
    <>
      <Sidebar items={navItems} view={view} setView={handleSetView} role={role} setRole={setRole} theme={theme} setTheme={setTheme} bottomContent={navBottom}/>
      <main style={{flex:1,padding:"1.75rem 2.25rem",overflow:"auto"}}>
        {renderMain()}
      </main>
    </>
  );
}

/* ============================================================ ROOT APP ============================================================ */
export default function SparkCodeApp(){
  const [theme, setTheme] = useState("light");
  const [role, setRole] = useState("student");
  const cssVars = useMemo(()=>tokens[theme],[theme]);

  return (
    <div style={{...cssVars,background:"var(--bg)",color:"var(--text)",minHeight:"600px",display:"flex",fontFamily:"'IBM Plex Sans',sans-serif"}}>
      <Fonts/>
      {role==="student"    && <StudentShell    role={role} setRole={setRole} theme={theme} setTheme={setTheme}/>}
      {role==="volunteer"  && <VolunteerShell  role={role} setRole={setRole} theme={theme} setTheme={setTheme}/>}
      {role==="instructor" && <InstructorShell role={role} setRole={setRole} theme={theme} setTheme={setTheme}/>}
    </div>
  );
}