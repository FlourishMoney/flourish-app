import { useState, useEffect, useRef, useCallback } from "react";
import {
  Home, Calendar, CreditCard, Sparkles, Users, User,
  Bell, Settings as LucideSettings, ShoppingCart, Coffee,
  Zap, Package, Film, Music, Pill, Shirt,
  TrendingUp, Shield, CheckCircle,
  Target, PiggyBank, DollarSign,
  ShoppingBag, Flame, Star, Car, BarChart2
} from "lucide-react";

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
@keyframes fadeUp    { from{opacity:0;transform:translateY(24px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes fadeIn    { from{opacity:0} to{opacity:1} }
@keyframes slideUp   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
@keyframes slideIn   { from{opacity:0;transform:translateX(-16px)} to{opacity:1;transform:translateX(0)} }
@keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.4} }
@keyframes shimmer   { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes mintGlow  { 0%,100%{box-shadow:0 0 0 0 rgba(0,214,143,0)} 50%{box-shadow:0 0 70px 10px rgba(0,214,143,0.14)} }
@keyframes goldGlow  { 0%,100%{box-shadow:0 0 0 0 rgba(240,196,66,0)} 50%{box-shadow:0 0 60px 8px rgba(240,196,66,0.12)} }
@keyframes ringPulse { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.6);opacity:0} }
@keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes floatUp   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
@keyframes numberIn  { from{opacity:0;transform:translateY(10px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes gradShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes breathe   { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:0.9;transform:scale(1.04)} }
@keyframes orbit     { from{transform:translate(-50%,-50%) rotate(0deg) translateX(110px)} to{transform:translate(-50%,-50%) rotate(360deg) translateX(110px)} }
@keyframes logoFloat { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-6px) rotate(1deg)} }
* { -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; box-sizing:border-box; }
*:focus-visible { outline:2px solid rgba(0,214,143,0.55); outline-offset:2px; border-radius:4px; }
::selection { background:rgba(0,214,143,0.25); color:#fff; }
::-webkit-scrollbar { width:0; background:transparent; }
input,button,select,textarea { font-family:inherit; }
button { cursor:pointer; }
`;


// ─── COUNTRY CONFIG ────────────────────────────────────────────────────────────
const CC = {
  CA:{
    currency:"CAD", symbol:"$", flag:"🇨🇦", name:"Canada",
    locale:"en-CA",
    banks:[
      {name:"TD Bank",color:"#00B140"},{name:"RBC",color:"#003168"},
      {name:"Scotiabank",color:"#DA1710"},{name:"BMO",color:"#0079C1"},
      {name:"CIBC",color:"#D31145"},{name:"Tangerine",color:"#E46C00"},
      {name:"EQ Bank",color:"#00A94F"},{name:"Desjardins",color:"#00713C"},
      {name:"Simplii Financial",color:"#E31837"},{name:"National Bank",color:"#E31837"},
      {name:"ATB Financial",color:"#0066B2"},{name:"PC Financial",color:"#FF6600"},
    ],
    incomeTypes:[
      ["employment","💼 Employment / T4"],["selfemployed","🧾 Self-Employed / T4A"],
      ["cpp","🏛️ CPP / Pension"],["ei","📋 EI Benefits"],
      ["odsp","♿ ODSP / Ontario Works"],["ccb","👶 Canada Child Benefit"],
      ["rental","🏠 Rental Income"],["gig","🚗 Gig / Freelance"],["other","➕ Other"],
    ],
    debtTypes:["Credit Card","Line of Credit","HELOC","Car Loan","OSAP / Student Loan","Personal Loan","Mortgage","Buy Now Pay Later","Other"],
    taxTips:[
      {title:"RRSP Contribution",body:"Every RRSP dollar reduces your taxable income. At a 30% marginal rate, putting in $5,000 gets you ~$1,500 back at tax time. Deadline is March 1.",savings:"Up to 33%",flag:"🇨🇦",priority:"high",action:"Check My RRSP Room"},
      {title:"TFSA — You're Probably Under-Using It",body:"Your TFSA isn't just for savings — it's for investing. Any growth inside is 100% tax-free forever. If you opened one at 18, you may have $75,000+ of contribution room sitting unused.",savings:"Tax-free growth",flag:"🇨🇦",priority:"high",action:"Calculate My Room"},
      {title:"FHSA (First Home Savings Account)",body:"If you've never owned a home, you can contribute up to $8,000/year and get a tax deduction — like an RRSP. Unused room carries forward. Withdraw tax-free to buy your first home.",savings:"Up to $8,000/yr",flag:"🇨🇦",priority:"high",action:"Open an FHSA"},
      {title:"GST/HST Credit",body:"Filing your taxes means CRA automatically checks if you qualify for quarterly GST/HST credits. Under ~$50k income? You likely qualify and may not know it. File every year even if you owe nothing.",savings:"Up to $519/yr",flag:"🇨🇦",priority:"medium",action:"File Your Taxes"},
      {title:"Canada Child Benefit (CCB)",body:"Tax-free monthly payments if you have children under 18. A family earning $50k with two kids can get $12,000+/year. Apply on CRA My Account or when registering the birth.",savings:"Up to $7,787/child",flag:"🇨🇦",priority:"high",action:"Apply on CRA"},
      {title:"Home Office Deduction",body:"Work from home? Even employees can claim a flat $2/day (up to $500) without receipts. Self-employed? Claim actual rent, internet, hydro proportionally.",savings:"$200–$1,200",flag:"🇨🇦",priority:"medium",action:"Track Home Office Days"},
      {title:"Ontario Trillium Benefit",body:"Ontario residents: combines the Ontario Sales Tax Credit, Ontario Energy Credit, and Northern Ontario Energy Credit into one monthly payment. Low-to-mid income earners often miss this.",savings:"Up to $1,421/yr",flag:"🏙️ ON",priority:"medium",action:"Apply on CRA"},
      {title:"Disability Tax Credit (DTC)",body:"If you or a dependent has a severe disability, the DTC provides up to ~$1,300/year in federal tax credits, plus retroactive claims. Often missed — a doctor fills out T2201.",savings:"Up to $1,300/yr",flag:"🇨🇦",priority:"medium",action:"Get T2201 Form"},
      {title:"Child Care Expense Deduction",body:"Daycare, after-school programs, summer camp — most childcare costs are deductible from the lower-income spouse's return. Families earning $50k often leave $2,000–$4,000 on the table.",savings:"$1,200–$4,000",flag:"🇨🇦",priority:"high",action:"Gather Receipts"},
      {title:"RESP — Free Government Money",body:"Open an RESP for your child and the government adds 20% on the first $2,500/year = $500 free per child. Canada Learning Bond adds another $500 for lower-income families.",savings:"$500–$1,000/yr free",flag:"🇨🇦",priority:"high",action:"Open an RESP"},
      {title:"Working Income Tax Benefit (CWB)",body:"Working but earning under ~$36k? CRA may owe you a refundable tax credit just for filing. Many low-income workers miss this entirely.",savings:"Up to $1,428",flag:"🇨🇦",priority:"medium",action:"Check Eligibility"},
    ],
    learnCards:[
      {emoji:"🏦",title:"TFSA vs RRSP — The Real Difference",body:"RRSP lowers your taxes now but you pay tax when you withdraw. TFSA has no upfront deduction but all growth and withdrawals are 100% tax-free. If you're in a low tax bracket now, use TFSA first. If you're in a high bracket, RRSP first.",key:"Low income now → TFSA. High income now → RRSP."},
      {emoji:"🏠",title:"The FHSA: Best Account Most Canadians Don't Have",body:"The First Home Savings Account opened in 2023. You get an RRSP-style deduction going in AND tax-free withdrawals for a first home. Up to $40,000 lifetime room. If you're not a homeowner, this should be your first account.",key:"Open an FHSA before your RRSP if you want to buy a home."},
      {emoji:"👶",title:"Canada Child Benefit vs US Child Tax Credit",body:"The CCB is more generous than most Canadians realize. A single parent earning $40k with two kids under 6 can receive over $14,000/year. Unlike US credits, CCB is completely tax-free and paid monthly.",key:"Apply at birth — retroactive claims are possible but painful."},
      {emoji:"📋",title:"What EI Actually Covers",body:"Employment Insurance isn't just for job loss. It also covers maternity (15 weeks), parental (up to 35 weeks standard or 61 weeks extended), sickness (26 weeks), and compassionate care. Many employees don't claim what they're entitled to.",key:"Know your EI benefits before you need them."},
      {emoji:"💳",title:"Why minimum payments are a trap",body:"If you owe $3,000 at 20% and pay only the minimum, it takes 8+ years and costs nearly $3,000 extra. You buy everything twice.",key:"Never just pay the minimum."},
      {emoji:"🆘",title:"The emergency fund rule",body:"One car repair without savings = credit card debt at 20%. A $1,000 cushion breaks that cycle. In Canada, keep it in a TFSA high-interest savings account.",key:"Build $1,000 in a TFSA HISA first."},
    ],
    retirementAccounts:[
      {id:"rrsp",name:"RRSP",fullName:"Registered Retirement Savings Plan",icon:"🏦",color:"#2E8B2E",annualLimit:"18% of income (max $31,560)",taxNote:"Contributions deductible. Withdrawals taxed as income.",tip:"Contribute in high-income years. Use spousal RRSP for income splitting."},
      {id:"tfsa",name:"TFSA",fullName:"Tax-Free Savings Account",icon:"🛡️",color:"#2FADA6",annualLimit:"$7,000 (2024). Unused room accumulates.",taxNote:"No deduction on contribution. All growth and withdrawals tax-free.",tip:"Invest in ETFs inside your TFSA — don't just park cash."},
      {id:"fhsa",name:"FHSA",fullName:"First Home Savings Account",icon:"🏠",color:"#CFA03E",annualLimit:"$8,000/yr (max $40,000 lifetime)",taxNote:"Deductible going in. Tax-free withdrawal for first home purchase.",tip:"Best account for first-time buyers. Open even if you're not buying immediately — room accumulates."},
      {id:"resp",name:"RESP",fullName:"Registered Education Savings Plan",icon:"👶",color:"#8A5FC8",annualLimit:"$2,500/yr to maximize CESG grant",taxNote:"No deduction. Government adds 20% (CESG) on first $2,500/yr.",tip:"Even $2,500/yr gets $500 free from government. Start at birth."},
    ],
    benefitsChecker:[
      {name:"Canada Child Benefit",icon:"👶",eligible:"Has children under 18",amount:"Up to $7,787/child under 6",apply:"CRA My Account",url:"https://canada.ca/ccb"},
      {name:"GST/HST Credit",icon:"🛒",eligible:"Under ~$50k income",amount:"Up to $519/yr",apply:"File your taxes",url:"https://canada.ca/gst-credit"},
      {name:"Ontario Trillium Benefit",icon:"🏙️",eligible:"Ontario residents, low-mid income",amount:"Up to $1,421/yr",apply:"ON-BEN form with taxes",url:"https://canada.ca/trillium"},
      {name:"Canada Workers Benefit",icon:"💼",eligible:"Working, under ~$36k",amount:"Up to $1,428",apply:"Schedule 6 with taxes",url:"https://canada.ca/cwb"},
      {name:"CERB / CRB Replacements",icon:"📋",eligible:"Income disruption",amount:"Varies",apply:"CRA My Account",url:"https://canada.ca/ei"},
      {name:"Disability Tax Credit",icon:"♿",eligible:"Severe disability",amount:"~$1,300 credit",apply:"T2201 with doctor",url:"https://canada.ca/dtc"},
    ],
    creditBureaus:["Equifax (Borrowell — free)","TransUnion (Credit Karma — free)"],
    emergencyMonths:3,
    healthcareNote:"Healthcare is covered — emergency fund is for income disruption, not medical bills.",
  },
  US:{
    currency:"USD", symbol:"$", flag:"🇺🇸", name:"United States",
    locale:"en-US",
    banks:[
      {name:"Chase",color:"#117ACA"},{name:"Bank of America",color:"#E31837"},
      {name:"Wells Fargo",color:"#D71E28"},{name:"Citi",color:"#003B8E"},
      {name:"Capital One",color:"#D03027"},{name:"Ally Bank",color:"#5A1F8E"},
      {name:"Chime",color:"#00D062"},{name:"SoFi",color:"#0F3D5C"},
      {name:"Discover",color:"#F76400"},{name:"US Bank",color:"#002B6C"},
      {name:"PNC",color:"#CC0000"},{name:"TD Bank US",color:"#00B140"},
    ],
    incomeTypes:[
      ["employment","💼 W2 Employment"],["selfemployed","🧾 Self-Employed / 1099"],
      ["socialsecurity","🏛️ Social Security / SSI"],["disability","♿ SSDI / Disability"],
      ["childsupport","👶 Child Support / Alimony"],["gig","🚗 Gig / Freelance"],
      ["rental","🏠 Rental Income"],["investment","📈 Investment / Dividends"],["other","➕ Other"],
    ],
    debtTypes:["Credit Card","Student Loan (Federal)","Student Loan (Private)","Medical Debt","Car Loan","Personal Loan","Mortgage","HELOC","Payday Loan","Buy Now Pay Later","Other"],
    taxTips:[
      {title:"Earned Income Tax Credit (EITC)",body:"One of the most under-claimed credits in America. Under ~$63k with qualifying children? You could get up to $7,430 back — even if you owe nothing. Must file to claim.",savings:"Up to $7,430",flag:"🇺🇸",priority:"high",action:"Check EITC Eligibility"},
      {title:"Child Tax Credit",body:"Up to $2,000 per qualifying child under 17. Partially refundable — meaning you can get money back even if you owe nothing. File even if your income is low.",savings:"$2,000/child",flag:"🇺🇸",priority:"high",action:"Claim on Schedule 8812"},
      {title:"401(k) — Get the Full Match First",body:"If your employer matches 401(k) contributions, not contributing enough to get the full match is leaving free money on the table. A 4% match on $50k = $2,000/year you're giving up.",savings:"Up to $23,000/yr",flag:"🇺🇸",priority:"high",action:"Increase 401k Contributions"},
      {title:"HSA: The Triple Tax Advantage",body:"If you have a high-deductible health plan, an HSA lets you contribute pre-tax, grow tax-free, and withdraw tax-free for medical expenses. It's legally the most tax-advantaged account available.",savings:"Up to $4,150/yr",flag:"🇺🇸",priority:"high",action:"Open an HSA"},
      {title:"Roth IRA: Tax-Free Retirement",body:"Under $146k single / $230k married? You can contribute $7,000/year to a Roth IRA. You pay tax now, but all growth and withdrawals are 100% tax-free in retirement.",savings:"$7,000/yr tax-free",flag:"🇺🇸",priority:"high",action:"Open a Roth IRA"},
      {title:"Student Loan Interest Deduction",body:"Paying student loans? You may be able to deduct up to $2,500 of interest per year, reducing taxable income directly — even without itemizing.",savings:"Up to $2,500",flag:"🇺🇸",priority:"medium",action:"Find 1098-E Form"},
      {title:"Child & Dependent Care Credit",body:"Paying for daycare, after-school, or a caregiver while you work? You can claim 20–35% of up to $3,000 in care expenses as a tax credit — not just a deduction.",savings:"$600–$1,050",flag:"🇺🇸",priority:"medium",action:"Track Care Receipts"},
      {title:"Saver's Credit",body:"Low-to-mid income and contributing to a 401k or IRA? The Saver's Credit gives you up to 50% of your contribution back as a tax credit. Under $36k single? You likely qualify.",savings:"Up to $1,000",flag:"🇺🇸",priority:"medium",action:"Check Form 8880"},
      {title:"American Opportunity Tax Credit",body:"Paying for the first 4 years of college? You can claim up to $2,500/year per student — and 40% is refundable even if you owe nothing.",savings:"Up to $2,500/yr",flag:"🇺🇸",priority:"medium",action:"Claim on Form 8863"},
      {title:"Medical Expense Deduction",body:"Medical expenses exceeding 7.5% of your AGI are deductible if you itemize. For Americans with significant medical debt, this can mean thousands back.",savings:"Varies",flag:"🇺🇸",priority:"low",action:"Track Medical Receipts"},
      {title:"Home Office Deduction",body:"Self-employed and work from home? The simplified method allows $5 per square foot (up to 300 sq ft = $1,500). No complex calculations needed.",savings:"Up to $1,500",flag:"🇺🇸",priority:"medium",action:"Measure Your Office"},
    ],
    learnCards:[
      {emoji:"🏦",title:"401(k) vs Roth IRA: Which First?",body:"Your 401(k) lowers taxes now — great if you're in a high bracket. A Roth IRA gives tax-free income in retirement — great if you're younger or lower income. Rule of thumb: get the full 401k employer match first, then max your Roth IRA, then go back to the 401k.",key:"Always get the full employer match first. It's a 50–100% instant return."},
      {emoji:"🏥",title:"The Emergency Fund is Different in the US",body:"Unlike Canada, a medical emergency in the US can mean a $10,000–$50,000 bill. Your emergency fund isn't just for job loss — it's healthcare insurance. Most financial planners recommend 6 months of expenses, not 3.",key:"Aim for 6 months of expenses, not 3."},
      {emoji:"📋",title:"Medical Debt: Know Your Rights",body:"Medical debt under $500 was removed from credit reports in 2023. Negotiate bills before paying — hospitals routinely accept 40–60 cents on the dollar. Never pay full price without asking for a discount.",key:"Always negotiate medical bills before paying."},
      {emoji:"🎓",title:"Federal vs Private Student Loans",body:"Federal loans have income-driven repayment, deferment, and forgiveness programs. Private loans have none of these protections. If you have both, pay private first — federal loans have a safety net.",key:"Never refinance federal loans to private. You lose your safety net."},
      {emoji:"💳",title:"Why minimum payments are a trap",body:"If you owe $3,000 at 20% and pay only the minimum, it takes 8+ years and costs nearly $3,000 extra. You buy everything twice.",key:"Never just pay the minimum."},
      {emoji:"🆘",title:"The emergency fund rule",body:"Medical emergencies are the #1 cause of bankruptcy in America. A $1,000 cushion in a high-yield savings account (4–5% APY) breaks the cycle of borrowing.",key:"Keep your emergency fund in a high-yield savings account."},
    ],
    retirementAccounts:[
      {id:"401k",name:"401(k)",fullName:"Employer Retirement Plan",icon:"🏦",color:"#2E8B2E",annualLimit:"$23,000/yr ($30,500 if 50+)",taxNote:"Traditional: contributions pre-tax, withdrawals taxed. Roth 401k: after-tax contributions, tax-free withdrawals.",tip:"Always contribute enough to get the full employer match — it's free money."},
      {id:"roth",name:"Roth IRA",fullName:"Individual Retirement Account",icon:"🛡️",color:"#2FADA6",annualLimit:"$7,000/yr ($8,000 if 50+). Phaseout at $146k+",taxNote:"After-tax contributions. All growth and qualified withdrawals 100% tax-free.",tip:"Open early — the tax-free compounding over decades is massive. Use Fidelity or Vanguard."},
      {id:"hsa",name:"HSA",fullName:"Health Savings Account",icon:"🏥",color:"#CFA03E",annualLimit:"$4,150 single / $8,300 family (2024)",taxNote:"Triple tax advantage: pre-tax in, tax-free growth, tax-free for medical expenses.",tip:"After 65, HSA funds can be used for anything (taxed like a 401k). Best account in the US tax code."},
      {id:"529",name:"529 Plan",fullName:"Education Savings Account",icon:"🎓",color:"#8A5FC8",annualLimit:"No annual limit. $18k/yr gift tax exclusion.",taxNote:"State deduction varies. Federal tax-free growth and withdrawals for education.",tip:"Start when kids are young. Some states give immediate tax deductions."},
    ],
    benefitsChecker:[
      {name:"Earned Income Tax Credit",icon:"💰",eligible:"Working, under ~$63k",amount:"Up to $7,430",apply:"File taxes (IRS Free File)",url:"https://irs.gov/eitc"},
      {name:"SNAP (Food Stamps)",icon:"🛒",eligible:"Low income households",amount:"$291/mo average",apply:"Benefits.gov",url:"https://benefits.gov"},
      {name:"Medicaid / CHIP",icon:"🏥",eligible:"Low-income adults and children",amount:"Free/low-cost healthcare",apply:"Healthcare.gov",url:"https://healthcare.gov"},
      {name:"Child Tax Credit",icon:"👶",eligible:"Children under 17",amount:"Up to $2,000/child",apply:"File taxes",url:"https://irs.gov/ctc"},
      {name:"LIHEAP Energy Assistance",icon:"⚡",eligible:"Low income, utility hardship",amount:"Varies by state",apply:"Benefits.gov",url:"https://benefits.gov"},
      {name:"WIC Program",icon:"🍼",eligible:"Pregnant/postpartum, children under 5",amount:"Food + support",apply:"Local health dept",url:"https://wic.fns.usda.gov"},
    ],
    creditBureaus:["Equifax","Experian","TransUnion — all three count for FICO"],
    emergencyMonths:6,
    healthcareNote:"Medical emergencies are the #1 cause of US bankruptcy. 6 months of expenses is the minimum.",
  },
};

// ─── THEME PALETTES ──────────────────────────────────────────────────────────
const DARK_C = {
  bg:"#050810",surface:"#0A1018",card:"#0D1520",cardAlt:"#121D2A",
  cream:"#EDE9E2",muted:"rgba(237,233,226,0.50)",mutedHi:"rgba(237,233,226,0.80)",
  glass:"rgba(10,16,24,0.75)",glassBright:"rgba(16,26,38,0.82)",
  glassEdge:"rgba(255,255,255,0.06)",glassEdgeHi:"rgba(255,255,255,0.12)",
  green:"#00CC85",greenBright:"#00E89A",greenDim:"rgba(0,204,133,0.12)",
  gold:"#E8B84B",goldBright:"#F5CC6A",goldDim:"rgba(232,184,75,0.11)",
  red:"#FF4F6A",redBright:"#FF6B84",redDim:"rgba(255,79,106,0.11)",
  blue:"#4DA8FF",blueBright:"#6DBCFF",blueDim:"rgba(77,168,255,0.11)",
  teal:"#00C8E0",tealBright:"#22D8EE",tealDim:"rgba(0,200,224,0.11)",
  orange:"#FF8C42",orangeBright:"#FFA060",orangeDim:"rgba(255,140,66,0.11)",
  purple:"#9B7DFF",purpleBright:"#B09AFF",purpleDim:"rgba(155,125,255,0.11)",
  pink:"#FF6B9D",pinkBright:"#FF85AE",pinkDim:"rgba(255,107,157,0.11)",
  border:"rgba(255,255,255,0.07)",borderHi:"rgba(255,255,255,0.15)",
  heroGreen:"linear-gradient(160deg,#061510 0%,#0A1E14 45%,#060A0E 100%)",
  heroRed:"linear-gradient(160deg,#160609 0%,#1E0A0E 45%,#060A0E 100%)",
  shadow:"rgba(0,0,0,0.45)",shadowHi:"rgba(0,0,0,0.70)",isDark:true,
};
const LIGHT_C = {
  bg:"#F4F1EB",surface:"#FDFCFA",card:"#FFFFFF",cardAlt:"#EDEAE4",
  cream:"#1A2035",muted:"rgba(26,32,53,0.44)",mutedHi:"rgba(26,32,53,0.72)",
  glass:"rgba(255,255,255,0.84)",glassBright:"rgba(255,255,255,0.94)",
  glassEdge:"rgba(0,0,0,0.07)",glassEdgeHi:"rgba(0,0,0,0.13)",
  green:"#00935F",greenBright:"#00A86D",greenDim:"rgba(0,147,95,0.10)",
  gold:"#B87010",goldBright:"#CC8018",goldDim:"rgba(184,112,16,0.10)",
  red:"#D42E4A",redBright:"#E84060",redDim:"rgba(212,46,74,0.08)",
  blue:"#2472C8",blueBright:"#3386D8",blueDim:"rgba(36,114,200,0.09)",
  teal:"#008AA0",tealBright:"#009DB5",tealDim:"rgba(0,138,160,0.10)",
  orange:"#C45E10",orangeBright:"#D86C1A",orangeDim:"rgba(196,94,16,0.10)",
  purple:"#5840BC",purpleBright:"#6A52CC",purpleDim:"rgba(88,64,188,0.10)",
  pink:"#BC3070",pinkBright:"#CC4282",pinkDim:"rgba(188,48,112,0.10)",
  border:"rgba(0,0,0,0.08)",borderHi:"rgba(0,0,0,0.17)",
  heroGreen:"linear-gradient(160deg,#E4F5EE 0%,#EEF9F3 45%,#F4F1EB 100%)",
  heroRed:"linear-gradient(160deg,#FDE6EC 0%,#FEECF1 45%,#F4F1EB 100%)",
  shadow:"rgba(0,0,0,0.08)",shadowHi:"rgba(0,0,0,0.16)",isDark:false,
};
// Mutable reference — FlourishApp reassigns this before each render pass
let C = DARK_C;


const CAT_ICON = {
  "Groceries":      "cart",
  "Coffee & Dining":"coffee",
  "Income":         "income",
  "Gas & Transport":"gas",
  "Subscriptions":  "film",
  "Shopping":       "bag",
  "Health":         "pill",
  "Utilities":      "zap",
  "Investments":    "chartUp",
  "Default":        "card",
};
function txnIcon(txn){return CAT_ICON[txn.cat]||"card";}

const DEMO = {
  balance:     1_243.88,
  income:      1_847.50,
  netWorthAdd:   1_840,   // mock savings/TFSA for net worth calc
};

// ─── PLAID API HELPERS ────────────────────────────────────────────────────────
async function callPlaid(action, params={}) {
  const res = await fetch("/api/plaid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Plaid error");
    err.needs_reconnect = data.needs_reconnect || false;
    throw err;
  }
  return data;
}

// Plaid Personal Finance Category (PFC) primary values → Flourish display meta
const CAT_META = {
  FOOD_AND_DRINK:            { cat:"Coffee & Dining", icon:"🍕", color:"#D97A3A" },
  GROCERIES:                 { cat:"Groceries",       icon:"🛒", color:"#2E8B2E" },
  GENERAL_MERCHANDISE:       { cat:"Shopping",        icon:"🛍️", color:"#C45898" },
  CLOTHING_AND_ACCESSORIES:  { cat:"Shopping",        icon:"👕", color:"#C45898" },
  TRANSPORTATION:            { cat:"Gas & Transport", icon:"⛽", color:"#CFA03E" },
  TRAVEL:                    { cat:"Travel",          icon:"✈️", color:"#4A8FCC" },
  ENTERTAINMENT:             { cat:"Entertainment",   icon:"🎬", color:"#8A5FC8" },
  PERSONAL_CARE:             { cat:"Health",          icon:"💊", color:"#4A8FCC" },
  MEDICAL:                   { cat:"Health",          icon:"💊", color:"#4A8FCC" },
  UTILITIES:                 { cat:"Utilities",       icon:"⚡", color:"#CFA03E" },
  LOAN_PAYMENTS:             { cat:"Bills",           icon:"📱", color:"#CFA03E" },
  RENT_AND_UTILITIES:        { cat:"Utilities",       icon:"🏠", color:"#CFA03E" },
  HOME_IMPROVEMENT:          { cat:"Home",            icon:"🔨", color:"#CFA03E" },
  INCOME:                    { cat:"Income",          icon:"💰", color:"#6FE494" },
  TRANSFER_IN:               { cat:"Income",          icon:"💰", color:"#6FE494" },
  TRANSFER_OUT:              { cat:"Transfer",        icon:"↔️", color:"#888"    },
  BANK_FEES:                 { cat:"Fees",            icon:"🏦", color:"#888"    },
  GENERAL_SERVICES:          { cat:"Services",        icon:"⚙️", color:"#888"    },
  GOVERNMENT_AND_NON_PROFIT: { cat:"Services",        icon:"🏛️", color:"#888"    },
  EDUCATION:                 { cat:"Education",       icon:"📚", color:"#4A8FCC" },
  // Legacy Plaid category strings (pre-PFC API)
  "Food and Drink":          { cat:"Coffee & Dining", icon:"🍕", color:"#D97A3A" },
  "Shops":                   { cat:"Shopping",        icon:"🛍️", color:"#C45898" },
  "Travel":                  { cat:"Gas & Transport", icon:"⛽", color:"#CFA03E" },
  "Transfer":                { cat:"Transfer",        icon:"↔️", color:"#888"    },
  "Payment":                 { cat:"Bills",           icon:"📱", color:"#CFA03E" },
  "Recreation":              { cat:"Entertainment",   icon:"🎬", color:"#8A5FC8" },
  "Healthcare":              { cat:"Health",          icon:"💊", color:"#4A8FCC" },
};

function normaliseTxns(plaidTxns) {
  return plaidTxns.map((t, i) => {
    // Match exact key, then try stripping underscores for legacy, then prefix
    const rawCat = t.category || "OTHER";
    const meta = CAT_META[rawCat]
      || CAT_META[rawCat.replace(/_/g," ")]
      || Object.entries(CAT_META).find(([k]) => rawCat.startsWith(k))?.[1]
      || { cat:"Other", icon:"💳", color:"#888" };
    // Compute day-of-week (0=Sun) — used by spending charts & patterns
    const d = t.date ? new Date(t.date + "T12:00:00") : new Date();
    return {
      id:         t.id || `plaid_${i}`,
      date:       t.date,
      name:       t.name,
      amount:     t.amount,     // positive = expense (matches MOCK_TXN convention)
      cat:        meta.cat,
      icon:       meta.icon,
      color:      meta.color,
      dow:        d.getDay(),   // 0–6; matches shape expected by spend screens
      pending:    t.pending || false,
      account_id: t.account_id,
      currency:   t.currency || "CAD",
      logo:       t.logo_url || null,
    };
  });
}

// ─── Recurring Bill Detector ─────────────────────────────────────────────────
// Scans Plaid transactions and finds recurring bills (same merchant, monthly cadence)
// Returns array of { name, amount (avg), date (day of month), auto:true }
function detectRecurringBills(txns) {
  if (!txns || txns.length === 0) return [];

  // Categories that indicate a bill (not groceries, dining, etc.)
  const BILL_CATS = new Set([
    "Utilities","Bills","Services","Health","Education","Home",
    "Gas & Transport","Entertainment","Shopping",
  ]);

  // Also catch by name keywords regardless of category
  const BILL_KEYWORDS = [
    "hydro","electric","gas","water","internet","wifi","rogers","bell","telus",
    "shaw","videotron","fido","koodo","virgin","netflix","spotify","apple",
    "google","amazon prime","disney","crave","insurance","allstate","intact",
    "aviva","manulife","sunlife","great-west","rent","mortgage","condo","strata",
    "gym","goodlife","ymca","planet fitness","adobe","microsoft","dropbox","icloud",
    "hulu","paramount","phone","mobile","wireless","hydro one","enbridge","atco",
    "fortis","toronto hydro","bc hydro","epcor","alectra",
  ];

  // Only look at expenses (positive = money out), exclude income/transfers
  const expenses = txns.filter(t =>
    t.amount > 0 &&
    t.cat !== "Income" &&
    t.cat !== "Transfer" &&
    t.cat !== "Fees"
  );

  // Group by normalized merchant name
  const byMerchant = {};
  expenses.forEach(t => {
    const key = t.name.toLowerCase().trim();
    if (!byMerchant[key]) byMerchant[key] = [];
    byMerchant[key].push(t);
  });

  const bills = [];

  Object.entries(byMerchant).forEach(([key, txList]) => {
    // Must appear at least 2 times in 90 days to be "recurring"
    if (txList.length < 2) return;

    // Check if it's a bill category OR matches a bill keyword
    const isBillCat     = txList.some(t => BILL_CATS.has(t.cat));
    const isBillKeyword = BILL_KEYWORDS.some(kw => key.includes(kw));
    if (!isBillCat && !isBillKeyword) return;

    // Check monthly cadence — dates should be ~28-35 days apart
    const dates = txList.map(t => new Date(t.date + "T12:00:00")).sort((a,b) => a-b);
    let isMonthly = false;
    if (dates.length >= 2) {
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        gaps.push((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
      }
      const avgGap = gaps.reduce((a,b) => a+b, 0) / gaps.length;
      isMonthly = avgGap >= 25 && avgGap <= 40;
    }
    // Also accept if only 2 occurrences but both in bill category
    if (!isMonthly && !(txList.length === 2 && isBillCat)) return;

    // Average of last 3 months amounts
    const recent = txList.slice(-3);
    const avg    = recent.reduce((s,t) => s + t.amount, 0) / recent.length;

    // Estimate due date from most common day of month
    const days     = txList.map(t => new Date(t.date + "T12:00:00").getDate());
    const dayMode  = days.sort((a,b) =>
      days.filter(d=>d===b).length - days.filter(d=>d===a).length
    )[0];

    // Clean up display name — capitalize words, strip account numbers
    const displayName = txList[0].name
      .replace(/\s+\d{4,}.*$/, "")   // strip trailing account numbers
      .replace(/\w/g, c => c.toUpperCase())
      .trim();

    bills.push({
      name:    displayName,
      amount:  avg.toFixed(2),
      date:    String(dayMode),
      auto:    true,   // flag so UI can show "detected" badge
      avgNote: txList.length >= 3 ? `avg of last ${Math.min(txList.length,3)} months` : "estimated",
    });
  });

  // Sort by amount desc, deduplicate by normalized name
  const seen = new Set();
  return bills
    .sort((a,b) => Number(b.amount) - Number(a.amount))
    .filter(b => {
      const k = b.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

// ─── Plaid Link SDK hook ──────────────────────────────────────────────────────
// Loads Plaid CDN script once. Uses a ref for onSuccess so the handler is
// never stale even if the callback closes over fresh state.
function usePlaidLinkSDK(linkToken, onSuccess) {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);

  useEffect(() => {
    if (window.Plaid) { setSdkReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.onload  = () => setSdkReady(true);
    script.onerror = () => setSdkError(true);
    document.head.appendChild(script);
  }, []);

  const openPlaidLink = useCallback(() => {
    if (!sdkReady || !window.Plaid || !linkToken) return;
    window.Plaid.create({
      token: linkToken,
      onSuccess: (...args) => onSuccessRef.current(...args),
      onExit: (err, meta) => { if (err) console.warn("Plaid exit:", err, meta); },
    }).open();
  }, [sdkReady, linkToken]);

  return { openPlaidLink, plaidReady: sdkReady && !!linkToken, plaidSdkError: sdkError };
}

const MOCK_TXN = [
  {id:"t1", date:"2026-03-06",name:"Loblaws",         amount:67.43,  cat:"Groceries",      icon:"🛒",color:"#2E8B2E",dow:4},
  {id:"t2", date:"2026-03-06",name:"Tim Hortons",      amount:4.85,   cat:"Coffee & Dining",icon:"☕",color:"#D97A3A",dow:4},
  {id:"t3", date:"2026-03-06",name:"Tim Hortons",      amount:5.10,   cat:"Coffee & Dining",icon:"☕",color:"#D97A3A",dow:4},
  {id:"t4", date:"2026-03-05",name:"Payroll Deposit",  amount:-DEMO.income,cat:"Income",         icon:"💰",color:"#6FE494",dow:3},
  {id:"t5", date:"2026-03-05",name:"Shell Gas",        amount:62.10,  cat:"Gas & Transport",icon:"⛽",color:"#CFA03E",dow:3},
  {id:"t6", date:"2026-03-04",name:"Starbucks",        amount:6.75,   cat:"Coffee & Dining",icon:"☕",color:"#D97A3A",dow:2},
  {id:"t7", date:"2026-03-03",name:"Netflix",          amount:18.99,  cat:"Subscriptions",  icon:"🎬",color:"#8A5FC8",dow:1},
  {id:"t8", date:"2026-03-03",name:"Amazon.ca",        amount:34.99,  cat:"Shopping",       icon:"📦",color:"#C45898",dow:1},
  {id:"t9", date:"2026-03-02",name:"Uber Eats",        amount:28.40,  cat:"Coffee & Dining",icon:"🍕",color:"#D97A3A",dow:0},
  {id:"t10",date:"2026-03-01",name:"LCBO",             amount:24.15,  cat:"Shopping",       icon:"🛍️",color:"#C45898",dow:6},
  {id:"t11",date:"2026-02-29",name:"Walmart",          amount:89.22,  cat:"Groceries",      icon:"🛒",color:"#2E8B2E",dow:5},
  {id:"t12",date:"2026-02-28",name:"Hydro One",        amount:124.00, cat:"Utilities",      icon:"⚡",color:"#CFA03E",dow:4},
  {id:"t13",date:"2026-02-28",name:"Starbucks",        amount:6.50,   cat:"Coffee & Dining",icon:"☕",color:"#D97A3A",dow:4},
  {id:"t14",date:"2026-02-27",name:"Spotify",          amount:11.99,  cat:"Subscriptions",  icon:"🎵",color:"#8A5FC8",dow:3},
  {id:"t15",date:"2026-02-27",name:"Rexall Pharmacy",  amount:18.40,  cat:"Health",         icon:"💊",color:"#4A8FCC",dow:3},
  {id:"t16",date:"2026-02-26",name:"H&M",              amount:67.00,  cat:"Shopping",       icon:"👕",color:"#C45898",dow:2},
  {id:"t17",date:"2026-02-25",name:"Harvey's",         amount:14.50,  cat:"Coffee & Dining",icon:"🍔",color:"#D97A3A",dow:1},
  {id:"t18",date:"2026-02-25",name:"Tim Hortons",      amount:4.25,   cat:"Coffee & Dining",icon:"☕",color:"#D97A3A",dow:1},
  {id:"t19",date:"2026-02-24",name:"Amazon.ca",        amount:29.99,  cat:"Shopping",       icon:"📦",color:"#C45898",dow:0},
  {id:"t20",date:"2026-02-22",name:"Payroll Deposit",  amount:-DEMO.income,cat:"Income",         icon:"💰",color:"#6FE494",dow:6},
  {id:"t21",date:"2026-02-21",name:"Loblaws",          amount:73.18,  cat:"Groceries",      icon:"🛒",color:"#2E8B2E",dow:5},
  {id:"t22",date:"2026-02-21",name:"Uber Eats",        amount:31.20,  cat:"Coffee & Dining",icon:"🍕",color:"#D97A3A",dow:5},
  {id:"t23",date:"2026-02-19",name:"Winners",          amount:45.00,  cat:"Shopping",       icon:"🛍️",color:"#C45898",dow:3},
  {id:"t24",date:"2026-02-18",name:"Apple.com/bill",   amount:3.99,   cat:"Subscriptions",  icon:"☁️",color:"#8A5FC8",dow:2},
  {id:"t25",date:"2026-02-17",name:"Starbucks",        amount:7.10,   cat:"Coffee & Dining",icon:"☕",color:"#D97A3A",dow:1},
  {id:"t26",date:"2026-02-15",name:"Bell Canada",      amount:65.00,  cat:"Utilities",      icon:"📱",color:"#CFA03E",dow:6},
  {id:"t27",date:"2026-02-14",name:"Kelsey's",         amount:54.20,  cat:"Coffee & Dining",icon:"🍷",color:"#D97A3A",dow:5},
  {id:"t28",date:"2026-02-12",name:"Shopify/Etsy",     amount:38.00,  cat:"Shopping",       icon:"🎁",color:"#C45898",dow:3},
  {id:"t29",date:"2026-02-10",name:"Costco Gas",       amount:55.80,  cat:"Gas & Transport",icon:"⛽",color:"#CFA03E",dow:1},
  {id:"t30",date:"2026-02-08",name:"Payroll Deposit",  amount:-DEMO.income,cat:"Income",         icon:"💰",color:"#6FE494",dow:6},
];

const MOCK_ACCOUNTS = [
  {id:"a1",name:"TD Chequing ••4521",type:"checking",balance:DEMO.balance,institution:"TD Bank"},
  {id:"a2",name:"TD Savings ••8803",type:"savings",balance:1840.00,institution:"TD Bank"},
  {id:"a3",name:"TD Visa ••2291",type:"credit",balance:-3420.00,institution:"TD Bank"},
  {id:"a4",name:"Questrade TFSA ••7723",type:"investment",balance:12480.00,institution:"Questrade",ticker:"XEQT",gain:2140,gainPct:20.7},
  {id:"a5",name:"TD e-Series RRSP ••9910",type:"investment",balance:8650.00,institution:"TD Bank",ticker:"TDB902",gain:890,gainPct:11.4},
];
const MOCK_ACCOUNTS_US = [
  {id:"a1",name:"Chase Checking ••2891",type:"checking",balance:DEMO.balance,institution:"Chase"},
  {id:"a2",name:"Chase Savings ••5504",type:"savings",balance:1840.00,institution:"Chase"},
  {id:"a3",name:"Chase Sapphire ••4471",type:"credit",balance:-3420.00,institution:"Chase"},
  {id:"a4",name:"Fidelity Roth IRA ••0033",type:"investment",balance:14200.00,institution:"Fidelity",ticker:"FXAIX",gain:2980,gainPct:26.5},
  {id:"a5",name:"Fidelity 401(k) ••8812",type:"investment",balance:23400.00,institution:"Fidelity",ticker:"Target 2055",gain:3890,gainPct:19.9},
];

// ─── DEMO DEFAULTS — used when no real data is connected ─────────────────────

// ── ICON SYSTEM: Lucide React ─────────────────────────────────────────────────

// Map string IDs → Lucide components (all icons same visual language, 1.5px stroke)
const ICON_MAP = {
  home:      Home,
  calendar:  Calendar,
  card:      CreditCard,
  sparkles:  Sparkles,
  users:     Users,
  user:      User,
  bell:      Bell,
  settings:  LucideSettings,
  bank:      BarChart2,
  cart:      ShoppingCart,
  coffee:    Coffee,
  zap:       Zap,
  package:   Package,
  film:      Film,
  music:     Music,
  pill:      Pill,
  shirt:     Shirt,
  gas:       Car,
  income:    DollarSign,
  bag:       ShoppingBag,
  house2:    Home,
  target:    Target,
  piggy:     PiggyBank,
  chartUp:   TrendingUp,
  trendUp:   TrendingUp,
  shield:    Shield,
  check:     CheckCircle,
  star:      Star,
  flame:     Flame,
};

function Icon({ id, size=20, color="currentColor", strokeWidth=1.5, style={} }){
  const Comp = ICON_MAP[id];
  if(!Comp) return null;
  return <Comp size={size} color={color} strokeWidth={strokeWidth} style={{flexShrink:0,...style}}/>;
}
// ──────────────────────────────────────────────────────────────────────────────


// ── DECISION ENGINE ─────────────────────────────────────────────────────────────
function DecisionEngine({data, safe, bal, monthlyIncome, soonBills, todayDate, setScreen}) {
  const bills = data.bills || [];
  const debts = data.debts || [];

  // Find next payday (assume monthly income on the 15th or 1st, whichever is sooner)
  const today = todayDate || new Date().getDate();
  const paydayGuess = today < 15 ? 15 : 1;
  const daysToPayday = paydayGuess >= today ? paydayGuess - today : (31 - today + paydayGuess);
  const incomeAmt = parseFloat(data.profile?.income || DEMO.income);

  // Decision Engine calculations
  const daysLeft = daysToPayday > 0 ? daysToPayday : 14;
  const safePerDay = safe > 0 ? safe / daysLeft : 0;
  const safeToday = Math.floor(safePerDay);

  // Debt payoff impact
  const topDebt = debts.sort((a,b)=>parseFloat(b.rate||0)-parseFloat(a.rate||0))[0];
  const extraPayment = 150;
  let monthsSaved = 0;
  if (topDebt) {
    const rate = parseFloat(topDebt.rate || 19.99) / 100 / 12;
    const balance = parseFloat(topDebt.balance || 0);
    const minPay = Math.max(25, balance * 0.02);
    const calcMonths = (bal, pay) => {
      if (pay <= 0 || bal <= 0) return 0;
      let m = 0, b = bal;
      while (b > 0 && m < 240) { b = b * (1 + rate) - pay; m++; }
      return m;
    };
    monthsSaved = Math.max(0, calcMonths(balance, minPay) - calcMonths(balance, minPay + extraPayment));
  }

  // Savings move suggestion
  const safeToMove = Math.max(0, Math.floor(safe * 0.25));

  // Spending spike warning — if safe < 20% of income
  const lowCash = safe < monthlyIncome * 0.15;

  // Build decision cards
  const decisions = [];
  if (safeToday > 0) {
    decisions.push({
      type: "daily",
      icon: "💡",
      color: C.teal,
      title: `Spend max $${safeToday} today`,
      detail: `Keeps you safe until ${daysToPayday <= 1 ? "tomorrow's" : `your payday in ${daysToPayday}d`} deposit of $${incomeAmt.toLocaleString()}`,
      action: "See forecast", screen: "plan"
    });
  }
  if (lowCash) {
    decisions.push({
      type: "warning",
      icon: "⚠️",
      color: C.orange,
      title: "Cash is running tight",
      detail: `Your balance is below 15% of monthly income. Hold non-essential spending for ${daysToPayday} days.`,
      action: "See Plan", screen: "plan"
    });
  }
  if (safeToMove > 20) {
    decisions.push({
      type: "savings",
      icon: "💚",
      color: C.green,
      title: `Move $${safeToMove} to savings`,
      detail: "You can do this now and still stay safe until your next deposit.",
      action: "See Goals", screen: "goals"
    });
  }
  if (topDebt && monthsSaved > 0) {
    decisions.push({
      type: "debt",
      icon: "🎯",
      color: C.purple,
      title: `Pay $${extraPayment} extra on ${topDebt.name}`,
      detail: `Cuts ${monthsSaved} month${monthsSaved!==1?"s":""} off your payoff date. Worth more than any subscription cancel.`,
      action: "Debt Plan", screen: "goals"
    });
  }

  if (decisions.length === 0) return null;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{color:C.cream,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:7}}>
          <Icon id="zap" size={15} color={C.goldBright} strokeWidth={2}/>
          What to do today
        </div>
        <span style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Decision Engine</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {decisions.map((d,i)=>(
          <button key={i} onClick={()=>setScreen(d.screen)} style={{background:C.card,border:`1.5px solid ${d.color}28`,borderRadius:18,padding:"14px 16px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",gap:12,alignItems:"flex-start",transition:"all .2s",width:"100%"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=d.color+"66";e.currentTarget.style.background=d.color+"0A";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=d.color+"28";e.currentTarget.style.background=C.card;}}>
            <span style={{fontSize:20,flexShrink:0,marginTop:1}}>{d.icon}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:d.color,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:3}}>{d.title}</div>
              <div style={{color:C.muted,fontSize:11.5,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.55}}>{d.detail}</div>
            </div>
            <div style={{color:d.color,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,whiteSpace:"nowrap",marginTop:3}}>{d.action} →</div>
          </button>
        ))}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██ AUTOPILOT ENGINE — Daily Money Plan                                       ██
// ██ "What should happen with my money today?"                                 ██
// ═══════════════════════════════════════════════════════════════════════════════

// ── AUTOPILOT CARD (Dashboard component) ──────────────────────────────────────
function AutopilotCard({data, setScreen}) {
  const [revealed, setRevealed] = useState(false);
  const plan = AutopilotEngine.generate(data);
  const today = new Date().toLocaleDateString("en-CA", {weekday:"long", month:"long", day:"numeric"});
  const hasActions = plan.savingsTransfer > 0 || plan.debtPayment > 0 || plan.goalContribution > 0;

  const lineItems = [
    plan.dailySpendLimit > 0 && {
      icon:"💡", label:"Safe to spend today", amount:`$${plan.dailySpendLimit}`,
      color:C.green, detail:`for the next ${plan.daysLeft} day${plan.daysLeft!==1?"s":""}`,
    },
    plan.savingsTransfer > 0 && {
      icon:"🐷", label:`Move to ${plan.savingsTarget}`, amount:`$${plan.savingsTransfer}`,
      color:C.teal, detail:"builds your safety net",
    },
    plan.debtPayment > 0 && plan.debtTarget && {
      icon:"🎯", label:`Extra toward ${plan.debtTarget.name}`, amount:`$${plan.debtPayment}`,
      color:C.purple, detail:`saves on ${plan.debtTarget.rate}% interest`,
    },
    plan.goalContribution > 0 && plan.goalTarget && {
      icon:"🌱", label:plan.goalTarget.name||"Goal contribution", amount:`$${plan.goalContribution}`,
      color:C.gold, detail:"progress toward your goal",
    },
    plan.buffer > 100 && {
      icon:"🔒", label:"Untouched buffer", amount:`$${plan.buffer.toFixed(0)}`,
      color:C.muted, detail:"stays in your account",
    },
  ].filter(Boolean);

  return (
    <div style={{background:`linear-gradient(155deg,#061510 0%,#0B1E14 50%,#080D10 100%)`,borderRadius:26,overflow:"hidden",border:`1px solid ${C.green}30`,boxShadow:`0 16px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(0,214,143,0.08)`,backdropFilter:"blur(12px)"}}>
      {/* Header */}
      <div style={{padding:"18px 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{color:"rgba(237,232,225,0.4)",fontSize:9,textTransform:"uppercase",letterSpacing:3,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,marginBottom:5}}>Autopilot · {today}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:"#fff",lineHeight:1.2}}>Today's Money Plan</div>
            <span style={{background:C.teal+"33",color:C.tealBright,fontSize:8,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,letterSpacing:1,textTransform:"uppercase",padding:"3px 7px",borderRadius:99,border:`1px solid ${C.teal}44`}}>Adaptive</span>
          </div>
        </div>
        <div style={{background:plan.mode==="low"?"rgba(110,240,160,0.15)":plan.mode==="medium"?"rgba(255,193,69,0.15)":"rgba(255,100,100,0.15)",border:`1px solid ${plan.mode==="low"?C.green+"55":plan.mode==="medium"?C.gold+"55":C.red+"55"}`,borderRadius:99,padding:"4px 10px"}}>
          <span style={{color:plan.mode==="low"?C.greenBright:plan.mode==="medium"?C.goldBright:C.redBright,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>
            {plan.modeLabel}
          </span>
        </div>
      </div>

      {/* Alert banner */}
      {plan.alerts.length > 0 && (
        <div style={{margin:"12px 20px 0",background:"rgba(255,100,100,0.12)",border:"1px solid rgba(255,100,100,0.25)",borderRadius:12,padding:"10px 14px",display:"flex",gap:8,alignItems:"flex-start"}}>
          <span style={{fontSize:14,flexShrink:0}}>⚠️</span>
          <span style={{color:"rgba(255,160,160,0.9)",fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.5}}>{plan.alerts[0].msg}</span>
        </div>
      )}

      {/* Line items */}
      <div style={{padding:"14px 20px 6px",display:"flex",flexDirection:"column",gap:10}}>
        {lineItems.map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingBottom:10,borderBottom:i<lineItems.length-1?"1px solid rgba(255,255,255,0.06)":"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18,flexShrink:0}}>{item.icon}</span>
              <div>
                <div style={{color:"rgba(255,255,255,0.85)",fontWeight:600,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{item.label}</div>
                <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:1}}>{item.detail}</div>
              </div>
            </div>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,color:item.color==="muted"?"rgba(255,255,255,0.3)":item.color,flexShrink:0}}>{item.amount}</div>
          </div>
        ))}
      </div>

      {/* Weekly adherence bar */}
      <div style={{margin:"0 20px",padding:"12px 0 16px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{color:"rgba(255,255,255,0.4)",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>Plan adherence</span>
          <span style={{color:plan.adherence>=75?C.greenBright:plan.adherence>=50?C.goldBright:C.redBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800}}>{plan.adherence}%</span>
        </div>
        <div style={{height:4,borderRadius:99,background:"rgba(255,255,255,0.08)",overflow:"hidden"}}>
          <div style={{height:"100%",width:`${plan.adherence}%`,background:`linear-gradient(to right,${plan.adherence>=75?C.green:plan.adherence>=50?C.gold:C.red}88,${plan.adherence>=75?C.greenBright:plan.adherence>=50?C.goldBright:C.redBright})`,borderRadius:99,transition:"width 1.2s ease"}}/>
        </div>
      </div>
      {/* Adaptive adjustments made to this plan */}
      {plan.adaptations && plan.adaptations.length > 0 && (
        <div style={{margin:"0 0 4px",padding:"0 0 12px",display:"flex",gap:5,flexWrap:"wrap"}}>
          {plan.adaptations.map((a,i)=>(
            <span key={i} style={{background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.4)",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,padding:"3px 8px",borderRadius:99,letterSpacing:0.3}}>⚙ {a}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FINANCIAL TIME MACHINE (Timeline + What-If overlay) ───────────────────────
function TimeMachine({data}) {
  const [whatIfAmount, setWhatIfAmount] = useState(0);
  const [whatIfLabel, setWhatIfLabel] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [activePreset, setActivePreset] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Single source of truth: ForecastEngine (uses real income schedule, not mocked payday)
  const { forecast } = ForecastEngine.generate(data, 30);
  const safeFloor = SafeSpendEngine.calculate(data).balance * 0.12;

  // Filter to meaningful events
  const events = forecast.filter(f => f.isPayday || f.bills.length > 0 || f.day === 0 || f.day === 30);
  const displayed = expanded ? events : events.slice(0, 5);

  // What-if overlay: deduct the amount from every day after today
  const overlayBalance = (f) => {
    if (whatIfAmount <= 0) return null;
    return f.day > 0 ? f.balance - whatIfAmount : f.balance;
  };

  const presets = [
    {label:"$500 vacation", amount:500},
    {label:"$900 laptop",   amount:900},
    {label:"$300/mo invest", amount:300},
    {label:"$1,200 car repair", amount:1200},
  ];

  const applyWhatIf = (label, amount) => {
    setWhatIfLabel(label); setWhatIfAmount(amount);
    setInputVal(label); setActivePreset(label);
  };
  const clearWhatIf = () => {
    setWhatIfAmount(0); setWhatIfLabel(""); setInputVal(""); setActivePreset(null);
  };

  const parseInput = (v) => {
    const m = v.match(/\$?([\d,]+)/);
    return m ? parseFloat(m[1].replace(/,/g,"")) : 0;
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{color:C.cream,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:15}}>⏳</span> Financial Time Machine
        </div>
        <button onClick={()=>setExpanded(e=>!e)} style={{background:"none",border:"none",color:C.teal,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,cursor:"pointer"}}>
          {expanded?"Collapse ↑":"30 days ↓"}
        </button>
      </div>

      {/* What-if input */}
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:16,padding:"12px 14px",border:`1px solid ${whatIfAmount>0?C.purple+"55":C.border}`,marginBottom:12,transition:"border-color .2s"}}>
        <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,marginBottom:8}}>
          {whatIfAmount > 0 ? `Showing impact of ${whatIfLabel}` : "What if I…"}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {presets.map(p=>(
            <button key={p.label} onClick={()=>applyWhatIf(p.label, p.amount)} style={{background:activePreset===p.label?C.purple+"33":C.surface,border:`1px solid ${activePreset===p.label?C.purple+"66":C.border}`,color:activePreset===p.label?C.purpleBright:C.muted,borderRadius:99,padding:"5px 10px",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,cursor:"pointer",transition:"all .15s"}}>{p.label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:7}}>
          <input
            value={inputVal}
            onChange={e=>setInputVal(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&inputVal){const amt=parseInput(inputVal);if(amt>0)applyWhatIf(inputVal,amt);}}}
            placeholder="Type e.g. $650 TV…"
            style={{flex:1,padding:"9px 12px",borderRadius:11,border:`1px solid ${C.border}`,background:C.surface,color:C.cream,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,outline:"none"}}
          />
          {whatIfAmount > 0
            ? <button onClick={clearWhatIf} style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.redBright,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:11,padding:"9px 12px",borderRadius:11,cursor:"pointer",whiteSpace:"nowrap"}}>Clear ✕</button>
            : <button onClick={()=>{const amt=parseInput(inputVal);if(amt>0)applyWhatIf(inputVal,amt);}} style={{background:C.purple+"22",border:`1px solid ${C.purple}44`,color:C.purpleBright,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:11,padding:"9px 12px",borderRadius:11,cursor:"pointer",whiteSpace:"nowrap"}}>Apply →</button>
          }
        </div>
      </div>

      {/* Timeline */}
      <div style={{position:"relative"}}>
        <div style={{position:"absolute",left:19,top:8,bottom:8,width:2,background:`linear-gradient(to bottom,${C.teal}55,${C.border}22)`,borderRadius:99}}/>
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {displayed.map((ev, idx) => {
            const baseBalance = ev.balance;
            const overlayBal = overlayBalance(ev);
            const isLow = baseBalance < safeFloor;
            const overlayLow = overlayBal !== null && overlayBal < safeFloor;
            const dotColor = ev.day===0 ? C.green : ev.isPayday ? C.greenBright : ev.bills.length>0 ? C.gold : isLow ? C.red : C.border;
            const balColor = isLow ? C.redBright : ev.isPayday ? C.greenBright : C.mutedHi;
            const overlaydiff = overlayBal !== null ? overlayBal - baseBalance : 0;

            return (
              <div key={idx} style={{display:"flex",gap:14,paddingBottom:14,position:"relative"}}>
                <div style={{width:40,display:"flex",justifyContent:"center",flexShrink:0,paddingTop:3}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:dotColor,border:`3px solid ${C.bg}`,zIndex:1,boxShadow:ev.day===0||ev.isPayday?`0 0 8px ${dotColor}88`:"none",flexShrink:0}}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:ev.day===0?800:600,fontSize:13,color:ev.day===0?C.cream:C.mutedHi,marginBottom:ev.isPayday||ev.bills.length>0?3:0}}>
                        {ev.day===0?"Today":ev.day===1?"Tomorrow":ev.date.toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"})}
                      </div>
                      {ev.isPayday && <div style={{color:C.greenBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>{`+$${FinancialCalcEngine.cashFlow(data).monthlyIncome.toFixed(0)} paycheck`}</div>}
                      {ev.bills.map((b,bi)=><div key={bi} style={{color:C.gold,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{b.name} −${b.amount}</div>)}
                      {isLow && !ev.isPayday && <div style={{color:C.redBright,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginTop:2}}>⚠ Low balance</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,minWidth:80}}>
                      {/* Base balance */}
                      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:13,color:balColor}}>{`$${baseBalance.toFixed(0)}`}</div>
                      {/* What-if overlay balance */}
                      {overlayBal !== null && (
                        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:11,color:overlayLow?C.redBright:C.purpleBright,marginTop:2}}>
                          → ${overlayBal.toFixed(0)}
                          <span style={{color:overlaydiff<0?C.redBright:C.greenBright,fontSize:9,marginLeft:3}}>
                            ({overlaydiff>0?"+":""}{overlaydiff.toFixed(0)})
                          </span>
                        </div>
                      )}
                      <div style={{color:C.muted,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>balance</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {whatIfAmount > 0 && (
          <div style={{background:C.purple+"10",border:`1px solid ${C.purple}22`,borderRadius:12,padding:"10px 14px",marginTop:4,display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:14,flexShrink:0}}>🔮</span>
            <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>
              <strong style={{color:C.purpleBright}}>{whatIfLabel}</strong> would reduce your balance by <strong style={{color:C.purpleBright}}>${whatIfAmount}</strong> immediately.
              {(() => {
                const firstDanger = events.find(e => e.day > 0 && (e.balance - whatIfAmount) < safeFloor);
                return firstDanger
                  ? <> Your balance would drop below safe levels on <strong style={{color:C.redBright}}>{firstDanger.date.toLocaleDateString("en-CA",{month:"short",day:"numeric"})}</strong>.</>
                  : <> <strong style={{color:C.greenBright}}>Your timeline stays safe</strong> — you can afford this.</>
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FINANCIAL TIMELINE — powered exclusively by ForecastEngine ──────────────────
// Fix: replaced manual payday loop (isPayday = i === 7 mock) with ForecastEngine
// which reads income frequency from onboarding. Single source of truth.
function FinancialTimeline({data}) {
  const [expanded, setExpanded] = useState(false);
  // ── Delegate to ForecastEngine — no duplicate forecasting logic ──
  const { forecast } = ForecastEngine.generate(data, 30);
  const safeFloor = SafeSpendEngine.calculate(data).balance * 0.12;
  const { monthlyIncome } = FinancialCalcEngine.cashFlow(data);

  const events = forecast.filter(f => f.day === 0 || f.isPayday || f.bills.length > 0 || f.day === 30);
  const displayed = expanded ? events : events.slice(0, 4);

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{color:C.cream,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:7}}>
          <Icon id="calendar" size={15} color={C.teal} strokeWidth={2}/>
          Financial Timeline
        </div>
        <button onClick={()=>setExpanded(e=>!e)} style={{background:"none",border:"none",color:C.teal,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,cursor:"pointer"}}>
          {expanded ? "Collapse ↑" : "See 30 days ↓"}
        </button>
      </div>
      <div style={{position:"relative"}}>
        <div style={{position:"absolute",left:19,top:8,bottom:8,width:2,background:`linear-gradient(to bottom,${C.teal}55,${C.border}22)`,borderRadius:99}}/>
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {displayed.map((ev, idx) => {
            const isLow = ev.balance < safeFloor;
            const dotColor = ev.day===0 ? C.green : ev.isPayday ? C.greenBright : ev.bills.length>0 ? C.gold : isLow ? C.red : C.border;
            const balColor = isLow ? C.redBright : ev.isPayday ? C.greenBright : C.mutedHi;
            const label = ev.day===0?"Today":ev.day===1?"Tomorrow":ev.date.toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"});
            return (
              <div key={idx} style={{display:"flex",gap:14,paddingBottom:14,position:"relative"}}>
                <div style={{width:40,display:"flex",justifyContent:"center",flexShrink:0,paddingTop:2}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:dotColor,border:`3px solid ${C.bg}`,zIndex:1,boxShadow:ev.day===0||ev.isPayday?`0 0 10px ${dotColor}88`:"none",flexShrink:0}}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:ev.day===0?800:600,fontSize:13,color:ev.day===0?C.cream:C.mutedHi,marginBottom:2}}>{label}</div>
                      {ev.isPayday && <div style={{color:C.greenBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>{`+$${monthlyIncome.toFixed(0)} paycheck`}</div>}
                      {ev.bills.map((b,bi)=><div key={bi} style={{color:C.gold,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{b.name} −${b.amount}</div>)}
                      {isLow && !ev.isPayday && <div style={{color:C.redBright,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginTop:2}}>⚠ Low balance</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:13,color:balColor}}>{`$${ev.balance.toFixed(0)}`}</div>
                      <div style={{color:C.muted,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>balance</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── WHAT IF SIMULATOR ──────────────────────────────────────────────────────────
function WhatIfSimulator({data, onClose}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [inputVal, setInputVal] = useState("");
  const presets = [
    "Buy a $800 laptop",
    "Take a $1,200 vacation",
    "Get a $600 phone",
    "Pay off my credit card",
    "Invest $300/month",
    "Buy a used car for $8,000",
  ];

  const bal = parseFloat((data.accounts?.[0]?.balance || DEMO.balance).toString().replace(/,/g,""));
  const monthlyIncome = parseFloat(data.profile?.income || DEMO.income) * 2.2;
  const totalDebt = (data.debts||[]).reduce((s,d) => s + parseFloat(d.balance||0), 0);
  const bills = (data.bills||[]).reduce((s,b) => s + parseFloat(b.amount||0), 0);
  const {score} = calcHealthScore(data);

  const simulate = async (q) => {
    const qText = q || inputVal;
    if (!qText.trim()) return;
    setQuery(qText);
    setLoading(true);
    setResult(null);

    const prompt = `You are a financial simulator. The user wants to know the impact of: "${qText}".
Current financial data: Balance $${bal.toFixed(0)}, Monthly income ~$${monthlyIncome.toFixed(0)}, Total debt $${totalDebt.toFixed(0)}, Monthly bills $${bills.toFixed(0)}, Financial Health Score ${score}/100.
Respond ONLY with valid JSON (no markdown) like:
{"cashImpact":"safe"|"tight"|"risky","cashDetail":"1 sentence","debtImpact":"none"|"increases"|"decreases","debtDetail":"1 sentence","savingsDelay":"none"|"X weeks"|"X months","healthScoreDelta":-5,"healthDetail":"1 sentence","verdict":"Go for it"|"Proceed carefully"|"Think twice"|"Not recommended","verdictReason":"1 sentence","tip":"1 actionable alternative if risky, else empty string"}`;

    try {
      const r = await fetch("/api/coach", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ type:"simulator", payload:{ prompt } })
      });
      const d = await r.json();
      const text = d.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g,"").trim();
      setResult(JSON.parse(clean));
    } catch {
      setResult({cashImpact:"tight",cashDetail:"Could reduce your safe-to-spend buffer significantly.",debtImpact:"none",debtDetail:"No direct debt change.",savingsDelay:"2 weeks",healthScoreDelta:-3,healthDetail:"Temporary dip in your financial health score.",verdict:"Proceed carefully",verdictReason:"Make sure you have enough buffer after this purchase.",tip:""});
    }
    setLoading(false);
  };

  const verdictColor = result ? (result.verdict==="Go for it"?C.greenBright:result.verdict==="Proceed carefully"?C.goldBright:result.verdict==="Think twice"?C.orangeBright:C.redBright) : C.muted;
  const verdictBg = result ? (result.verdict==="Go for it"?C.greenDim:result.verdict==="Proceed carefully"?C.goldDim:result.verdict==="Think twice"?C.orangeDim:C.redDim) : C.surface;
  const impactIcon = (v) => v==="safe"||v==="none"||v==="decreases"?"✓":v==="tight"||v==="increases"?"~":"✗";
  const impactColor = (v) => v==="safe"||v==="none"||v==="decreases"?C.greenBright:v==="tight"||v==="increases"?C.goldBright:C.redBright;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:999,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.bg,borderRadius:"28px 28px 0 0",padding:"28px 24px 44px",width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 -20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:C.cream,lineHeight:1.2}}>What If Simulator</div>
            <div style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:3}}>Test any financial decision instantly</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:24,cursor:"pointer",padding:"4px 8px",lineHeight:1}}>×</button>
        </div>

        {/* Quick presets */}
        <div style={{marginBottom:16}}>
          <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginBottom:8}}>Quick scenarios</div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {presets.map(p=>(
              <button key={p} onClick={()=>simulate(p)} style={{background:query===p?C.greenDim:C.cardAlt,border:`1px solid ${query===p?C.green+"55":C.border}`,color:query===p?C.green:C.mutedHi,borderRadius:99,padding:"6px 12px",fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,cursor:"pointer",transition:"all .15s"}}>{p}</button>
            ))}
          </div>
        </div>

        {/* Custom input */}
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          <input
            value={inputVal}
            onChange={e=>setInputVal(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&simulate()}
            placeholder="e.g. Buy a $450 TV…"
            style={{flex:1,padding:"12px 16px",borderRadius:14,border:`1.5px solid ${C.border}`,background:C.surface,color:C.cream,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,outline:"none"}}
          />
          <button onClick={()=>simulate()} style={{background:`linear-gradient(135deg,${C.green},${C.greenBright})`,color:"#fff",border:"none",borderRadius:14,padding:"12px 18px",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap"}}>Simulate →</button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{textAlign:"center",padding:"30px 0"}}>
            <div style={{fontSize:36,marginBottom:12,animation:"spin 1s linear infinite"}}>⚙️</div>
            <div style={{color:C.cream,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,fontSize:15}}>Simulating "{query}"…</div>
            <div style={{color:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,marginTop:6}}>Running your numbers</div>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeUp 0.3s ease both"}}>
            {/* Verdict */}
            <div style={{background:verdictBg,border:`2px solid ${verdictColor}33`,borderRadius:20,padding:"18px 20px",textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:6}}>{result.verdict==="Go for it"?"🟢":result.verdict==="Proceed carefully"?"🟡":result.verdict==="Think twice"?"🟠":"🔴"}</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:verdictColor,marginBottom:6}}>{result.verdict}</div>
              <div style={{color:C.mutedHi,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>{result.verdictReason}</div>
            </div>

            {/* Impact grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                {label:"Cash Impact",    val:result.cashImpact,    detail:result.cashDetail,    icon:"💵"},
                {label:"Debt Impact",    val:result.debtImpact,    detail:result.debtDetail,    icon:"💳"},
                {label:"Savings Delay",  val:result.savingsDelay,  detail:"Impact on savings goals", icon:"🐷"},
                {label:"Health Score",   val:result.healthScoreDelta>=0?`+${result.healthScoreDelta}`:String(result.healthScoreDelta), detail:result.healthDetail, icon:"💚"},
              ].map((item,i)=>(
                <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 14px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <span style={{fontSize:16}}>{item.icon}</span>
                    <span style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{item.label}</span>
                  </div>
                  <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:14,color:i===3?(result.healthScoreDelta>=0?C.greenBright:C.redBright):impactColor(item.val),marginBottom:4}}>{i===3?(result.healthScoreDelta>=0?`+${result.healthScoreDelta}`:`${result.healthScoreDelta}`)+" pts":impactIcon(item.val)+" "+item.val}</div>
                  <div style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.5}}>{item.detail}</div>
                </div>
              ))}
            </div>

            {/* Tip */}
            {result.tip && (
              <div style={{background:C.tealDim,border:`1px solid ${C.teal}33`,borderRadius:14,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{fontSize:18,flexShrink:0}}>💡</span>
                <div style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}><strong style={{color:C.teal}}>Better option:</strong> {result.tip}</div>
              </div>
            )}

            {/* Try another */}
            <button onClick={()=>{setResult(null);setQuery("");setInputVal("");}} style={{background:"none",border:`1px solid ${C.border}`,color:C.mutedHi,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,fontSize:13,padding:"12px",borderRadius:14,cursor:"pointer"}}>Try another scenario</button>
          </div>
        )}
      </div>
    </div>
  );
}


// ── MONEY PERSONALITY ──────────────────────────────────────────────────────────
function calcPersonality(txns, data) {
  const t = txns || MOCK_TXN;
  const neg = t.filter(x => x.amount < 0);
  const total = neg.reduce((s,x) => s + Math.abs(x.amount), 0) || 1;

  const food    = neg.filter(x=>["Food","Coffee","Dining"].includes(x.cat)).reduce((s,x)=>s+Math.abs(x.amount),0);
  const shop    = neg.filter(x=>x.cat==="Shopping").reduce((s,x)=>s+Math.abs(x.amount),0);
  const subs    = neg.filter(x=>x.cat==="Subscriptions").reduce((s,x)=>s+Math.abs(x.amount),0);
  const ent     = neg.filter(x=>x.cat==="Entertainment").reduce((s,x)=>s+Math.abs(x.amount),0);
  const income  = (data.incomes||[]).length;

  const scores = {
    convenience: food/total,
    lifestyle:   (shop+ent)/total,
    digital:     subs/total,
    builder:     income > 1 ? 0.8 : 0.3,
  };
  const top = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];

  const personas = {
    convenience: {
      name:"The Convenience Spender", emoji:"🛍️",
      color:C.orange,
      traits:["High food delivery spend","Values time over money","Subscription-heavy lifestyle"],
      insight:"Your biggest lever is replacing 3 deliveries/week with home cooking — saves ~$180/mo.",
      shareText:"I'm a Convenience Spender 🛍️ on @flourishmoney"
    },
    lifestyle: {
      name:"The Experience Collector", emoji:"✈️",
      color:C.purple,
      traits:["Prioritizes experiences","Shopping for quality","Social spending peaks"],
      insight:"You spend richly on life. Automating $200/mo to savings before spending keeps goals on track.",
      shareText:"I'm an Experience Collector ✈️ on @flourishmoney"
    },
    digital: {
      name:"The Digital Native", emoji:"💻",
      color:C.teal,
      traits:["Heavy subscription stack","Tech-first spending","Optimizes with apps"],
      insight:"You have ~$82/mo in subscriptions. Auditing unused ones could free up a full investment contribution.",
      shareText:"I'm a Digital Native 💻 on @flourishmoney"
    },
    builder: {
      name:"The Wealth Builder", emoji:"🏗️",
      color:C.green,
      traits:["Multiple income streams","Disciplined with spending","Goal-oriented mindset"],
      insight:"You're already ahead — make sure your savings are in a high-interest account earning 4%+.",
      shareText:"I'm a Wealth Builder 🏗️ on @flourishmoney"
    }
  };
  return {...personas[top], scores, topKey:top};
}

function MoneyPersonality({data}) {
  const [revealed, setRevealed] = useState(false);
  const txns = data.transactions || MOCK_TXN;
  const p = calcPersonality(txns, data);
  const bars = [
    {label:"Convenience", pct:Math.round(p.scores.convenience*100), color:C.orange},
    {label:"Lifestyle",   pct:Math.round(p.scores.lifestyle*100),   color:C.purple},
    {label:"Digital",     pct:Math.round(p.scores.digital*100),      color:C.teal},
    {label:"Builder",     pct:Math.round(p.scores.builder*100),      color:C.green},
  ];

  return (
    <div style={{background:C.card,borderRadius:20,padding:"20px",border:`1.5px solid ${p.color}33`,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-40,right:-40,width:140,height:140,borderRadius:"50%",background:`radial-gradient(circle,${p.color}12 0%,transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{color:C.cream,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:16}}>{p.emoji}</span> Money Personality
        </div>
        <span style={{background:p.color+"22",color:p.color,fontSize:9,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"3px 8px",borderRadius:99,textTransform:"uppercase",letterSpacing:0.8}}>Your type</span>
      </div>

      {!revealed ? (
        <div style={{textAlign:"center",padding:"16px 0 8px"}}>
          <div style={{fontSize:48,marginBottom:10,filter:"blur(8px)",transition:"filter .3s"}}>?</div>
          <div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:16}}>Based on your spending patterns</div>
          <button onClick={()=>setRevealed(true)} style={{background:`linear-gradient(135deg,${p.color},${p.color}BB)`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:14,padding:"12px 28px",borderRadius:99,border:"none",cursor:"pointer",boxShadow:`0 4px 16px ${p.color}44`}}>Reveal My Type →</button>
        </div>
      ) : (
        <div style={{animation:"fadeUp 0.4s ease both"}}>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:52,marginBottom:6}}>{p.emoji}</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:21,fontWeight:900,color:p.color,lineHeight:1.2,marginBottom:8}}>{p.name}</div>
            <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap",marginBottom:12}}>
              {p.traits.map((t,i)=>(
                <span key={i} style={{background:p.color+"18",color:p.color,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,padding:"4px 10px",borderRadius:99}}>{t}</span>
              ))}
            </div>
            <div style={{background:p.color+"12",border:`1px solid ${p.color}33`,borderRadius:14,padding:"12px 14px",textAlign:"left",marginBottom:14}}>
              <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginBottom:5}}>Coach Insight</div>
              <div style={{color:C.cream,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.65}}>{p.insight}</div>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            {bars.map(b=>(
              <div key={b.label} style={{marginBottom:7}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{b.label}</span>
                  <span style={{color:b.color,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>{b.pct}%</span>
                </div>
                <div style={{height:5,borderRadius:99,background:C.border,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${b.pct}%`,background:`linear-gradient(to right,${b.color}88,${b.color})`,borderRadius:99,transition:"width 1s ease"}}/>
                </div>
              </div>
            ))}
          </div>
          <button onClick={()=>{if(navigator.share)navigator.share({title:"My Money Personality",text:p.shareText,url:"https://flourishmoney.app"}).catch(()=>{});}} style={{width:"100%",background:"none",border:`1.5px solid ${p.color}44`,color:p.color,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:12,padding:"10px",borderRadius:14,cursor:"pointer"}}>Share My Type 🔗</button>
        </div>
      )}
    </div>
  );
}

// ── FUTURE WEALTH FORECAST ─────────────────────────────────────────────────────
function WealthForecast({data}) {
  const [extra, setExtra] = useState(0);
  const [horizon, setHorizon] = useState(20);
  const monthlyIncome = (data.incomes||[]).reduce((s,i)=>s+parseFloat(i.amount||0),0) || 4200;
  const totalDebt = (data.debts||[]).reduce((s,d)=>s+parseFloat(d.balance||0),0);
  const bal = parseFloat((data.accounts?.[0]?.balance||1243).toString().replace(/,/g,""));
  const invBal = (data.accounts||[]).filter(a=>a.type==="investment").reduce((s,a)=>s+parseFloat(a.balance||0),0);
  const savingsRate = 0.10; // assume 10% baseline savings
  const monthlyInvest = monthlyIncome * savingsRate + extra;
  const annualReturn = 0.07;

  const project = (monthly, years) => {
    let val = invBal + bal * 0.5;
    for (let y = 0; y < years; y++) {
      val = val * (1 + annualReturn) + monthly * 12;
    }
    return Math.round(val - totalDebt * Math.max(0, 1 - years * 0.1));
  };

  const scenarios = [
    {label:"Current Path",        monthly:monthlyInvest,           color:C.teal,    icon:"📍"},
    {label:"+$200/mo saved",       monthly:monthlyInvest+200,       color:C.green,   icon:"📈"},
    {label:"+$500/mo invested",    monthly:monthlyInvest+500,       color:C.purple,  icon:"🚀"},
  ];

  const vals = scenarios.map(s => project(s.monthly, horizon));
  const maxVal = Math.max(...vals);

  const fmt = n => n >= 1000000 ? `$${(n/1000000).toFixed(2)}M` : `$${(n/1000).toFixed(0)}k`;

  return (
    <div style={{background:C.card,borderRadius:20,padding:"20px",border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{color:C.cream,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:16}}>🔭</span> Future Wealth Forecast
        </div>
        <div style={{display:"flex",gap:4}}>
          {[10,20,30].map(y=>(
            <button key={y} onClick={()=>setHorizon(y)} style={{background:horizon===y?C.purple+"33":C.cardAlt,border:`1px solid ${horizon===y?C.purple:C.border}`,color:horizon===y?C.purpleBright:C.muted,borderRadius:99,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>{y}y</button>
          ))}
        </div>
      </div>

      {/* Bars */}
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
        {scenarios.map((s,i)=>{
          const pct = maxVal > 0 ? (vals[i]/maxVal)*100 : 0;
          return (
            <div key={i}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:14}}>{s.icon}</span>
                  <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{s.label}</span>
                </div>
                <span style={{color:s.color,fontWeight:900,fontFamily:"'Playfair Display',serif",fontSize:18}}>{fmt(vals[i])}</span>
              </div>
              <div style={{height:8,borderRadius:99,background:C.border,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(to right,${s.color}88,${s.color})`,borderRadius:99,transition:"width 0.8s ease"}}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Extra investment slider */}
      <div style={{background:C.surface,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>Extra monthly investment</span>
          <span style={{color:C.greenBright,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{extra}/mo</span>
        </div>
        <input type="range" min={0} max={1000} step={25} value={extra} onChange={e=>setExtra(Number(e.target.value))}
          style={{width:"100%",accentColor:C.green,cursor:"pointer"}}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
          <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>$0</span>
          <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>$1,000/mo</span>
        </div>
      </div>
      {extra > 0 && (
        <div style={{marginTop:10,background:C.greenDim,border:`1px solid ${C.green}33`,borderRadius:12,padding:"10px 14px",textAlign:"center"}}>
          <span style={{color:C.green,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>
            +${extra}/mo → {fmt(project(monthlyInvest+extra,horizon))} in {horizon} years vs {fmt(project(monthlyInvest,horizon))} now
          </span>
        </div>
      )}
    </div>
  );
}

// ── OPPORTUNITY DETECTION ──────────────────────────────────────────────────────
function OpportunityDetector({data, setScreen}) {
  const txns = data.transactions || MOCK_TXN;
  const debts = data.debts || [];
  const cc = CC[data.profile?.country || "CA"];
  const opportunities = [];

  // Subscription audit
  const subTxns = txns.filter(t => t.cat === "Subscriptions" && t.amount < 0);
  const subTotal = subTxns.reduce((s,t) => s + Math.abs(t.amount), 0);
  if (subTotal > 40) {
    const dupes = subTxns.length > 3 ? subTxns.slice(-2).map(t=>t.merchant||t.name).join(", ") : subTxns.map(t=>t.merchant||t.name).join(", ");
    opportunities.push({
      id:"subs", icon:"📱", color:C.teal,
      title:`$${subTotal.toFixed(0)}/mo in subscriptions`,
      detail:`${subTxns.length} active subscriptions detected. Cancelling unused ones could free $${Math.round(subTotal*0.3)}/mo.`,
      action:"Review", screen:"spend", badge:"Save $"+Math.round(subTotal*0.3)+"/mo"
    });
  }

  // High-rate debt refinancing
  const highRateDebt = debts.find(d => parseFloat(d.rate||0) > 12);
  if (highRateDebt) {
    const bal = parseFloat(highRateDebt.balance||0);
    const saving = Math.round(bal * (parseFloat(highRateDebt.rate||0)/100 - 0.065));
    if (saving > 0) opportunities.push({
      id:"refi", icon:"💳", color:C.orange,
      title:`Refinance ${highRateDebt.name}`,
      detail:`At ${highRateDebt.rate}% you're overpaying. A 6.5% personal loan could save ~$${saving}/yr in interest.`,
      action:"Debt Plan", screen:"goals", badge:"Save $"+saving+"/yr"
    });
  }

  // Tax benefits (country-specific)
  if (cc.currency === "CAD") {
    opportunities.push({
      id:"tax", icon:"🍁", color:C.red,
      title:"Tax benefits you may qualify for",
      detail:`Based on your profile you may be eligible for the Canada Workers Benefit, GST/HST credit, or Ontario Trillium Benefit.`,
      action:"Tax Tips", screen:"goals", badge:"Claim now"
    });
  } else {
    opportunities.push({
      id:"tax", icon:"🦅", color:C.blue,
      title:"US tax credits available",
      detail:`You may qualify for the Earned Income Tax Credit or Saver's Credit — worth up to $2,000/yr.`,
      action:"Tax Tips", screen:"goals", badge:"Claim now"
    });
  }

  // Low-yield savings
  const savingsAcct = (data.accounts||[]).find(a => a.type==="savings");
  if (savingsAcct) {
    const bal = parseFloat(savingsAcct.balance||0);
    if (bal > 500) opportunities.push({
      id:"hisa", icon:"🏦", color:C.gold,
      title:`Earn more on your savings`,
      detail:`$${bal.toFixed(0)} in savings at typical 0.3% earns $${(bal*0.003).toFixed(0)}/yr. A HISA at 4%+ earns $${(bal*0.04).toFixed(0)}/yr.`,
      action:"Learn More", screen:"goals", badge:"+$"+(Math.round((bal*0.04)-(bal*0.003)))+"/yr"
    });
  }

  if (opportunities.length === 0) return null;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{color:C.cream,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:15}}>🔍</span> Opportunities Detected
        </div>
        <span style={{background:C.goldDim,color:C.goldBright,fontSize:10,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"3px 8px",borderRadius:99}}>{opportunities.length} found</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {opportunities.map(o=>(
          <button key={o.id} onClick={()=>setScreen(o.screen)} style={{background:C.card,border:`1.5px solid ${o.color}28`,borderRadius:18,padding:"14px 16px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",gap:12,alignItems:"flex-start",transition:"all .18s",width:"100%"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=o.color+"66";e.currentTarget.style.background=o.color+"08";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=o.color+"28";e.currentTarget.style.background=C.card;}}>
            <span style={{fontSize:20,flexShrink:0,marginTop:1}}>{o.icon}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3,flexWrap:"wrap"}}>
                <span style={{color:o.color,fontWeight:700,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{o.title}</span>
                <span style={{background:o.color+"22",color:o.color,fontSize:9,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"2px 7px",borderRadius:99}}>{o.badge}</span>
              </div>
              <div style={{color:C.muted,fontSize:11.5,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.5}}>{o.detail}</div>
            </div>
            <div style={{color:o.color,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,whiteSpace:"nowrap",marginTop:3}}>{o.action} →</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── MONEY WRAPPED ──────────────────────────────────────────────────────────────
function MoneyWrapped({data, onClose}) {
  const [slide, setSlide] = useState(0);
  const txns = (data.transactions || MOCK_TXN).filter(t => t.amount < 0);
  const income = (data.incomes||[]).reduce((s,i)=>s+parseFloat(i.amount||0),0)*12 || 50400;
  const totalSpent = txns.reduce((s,t)=>s+Math.abs(t.amount),0);
  const totalDebt = (data.debts||[]).reduce((s,d)=>s+parseFloat(d.balance||0),0);
  const invBal = (data.accounts||[]).filter(a=>a.type==="investment").reduce((s,a)=>s+parseFloat(a.balance||0),0);
  const bal = parseFloat((data.accounts?.[0]?.balance||1243).toString().replace(/,/g,""));

  // Category analysis
  const cats = {};
  txns.forEach(t => { cats[t.cat||"Other"] = (cats[t.cat||"Other"]||0) + Math.abs(t.amount); });
  const topCat = Object.entries(cats).sort((a,b)=>b[1]-a[1])[0] || ["Food","340"];
  const lowestCat = Object.entries(cats).sort((a,b)=>a[1]-b[1])[0] || ["Transport","45"];
  const biggestTxn = txns.sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount))[0];
  const netWorthChange = Math.round(invBal + bal - totalDebt + 2400); // mock positive change
  const {score} = calcHealthScore(data);
  const year = new Date().getFullYear();

  const slides = [
    // Slide 0: Opener
    {
      bg:`linear-gradient(160deg,${C.green} 0%,#1A3D2A 100%)`,
      content:(
        <div style={{textAlign:"center",padding:"0 8px"}}>
          <div style={{fontSize:56,marginBottom:16}}>🌱</div>
          <div style={{color:"#ffffff99",fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>Your {year} in review</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:38,fontWeight:900,color:"#fff",lineHeight:1.1,marginBottom:12}}>Money Wrapped</div>
          <div style={{color:"#ffffff88",fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.7}}>A year of growth, decisions,<br/>and financial wisdom.</div>
        </div>
      )
    },
    // Slide 1: Net Worth Change
    {
      bg:`linear-gradient(160deg,${C.teal} 0%,#0A3A4A 100%)`,
      content:(
        <div style={{textAlign:"center"}}>
          <div style={{color:"#ffffff88",fontSize:11,letterSpacing:2.5,fontFamily:"'Plus Jakarta Sans',sans-serif",textTransform:"uppercase",marginBottom:12}}>Your net worth changed by</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:64,fontWeight:900,color:netWorthChange>=0?"#6EF0A0":"#FF7070",letterSpacing:-2,lineHeight:1,marginBottom:8}}>{netWorthChange>=0?"+":""}{netWorthChange>=0?`$${(netWorthChange/1000).toFixed(1)}k`:`-$${Math.abs(netWorthChange/1000).toFixed(1)}k`}</div>
          <div style={{color:"#ffffff88",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:24}}>{netWorthChange>=0?"You grew richer this year 🚀":"You're building the foundation 🏗️"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[
              {label:"Invested",   val:`$${(invBal/1000).toFixed(1)}k`, icon:"📈"},
              {label:"Health Score", val:`${score}/100`,               icon:"💚"},
            ].map((s,i)=>(
              <div key={i} style={{background:"rgba(255,255,255,0.12)",borderRadius:16,padding:"14px 12px",textAlign:"center"}}>
                <div style={{fontSize:24,marginBottom:6}}>{s.icon}</div>
                <div style={{color:"#fff",fontWeight:900,fontFamily:"'Playfair Display',serif",fontSize:20}}>{s.val}</div>
                <div style={{color:"#ffffff77",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:3}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    // Slide 2: Spending Story
    {
      bg:`linear-gradient(160deg,${C.purple} 0%,#1A0A3A 100%)`,
      content:(
        <div style={{textAlign:"center"}}>
          <div style={{color:"#ffffff88",fontSize:11,letterSpacing:2.5,fontFamily:"'Plus Jakarta Sans',sans-serif",textTransform:"uppercase",marginBottom:12}}>Your spending story</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:48,fontWeight:900,color:"#fff",letterSpacing:-1,marginBottom:6}}>{`$${(totalSpent/1000).toFixed(1)}k`}</div>
          <div style={{color:"#ffffff88",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:20}}>spent across {txns.length} transactions</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[
              {label:"Biggest splurge", val:biggestTxn?`$${Math.abs(biggestTxn.amount).toFixed(0)} — ${biggestTxn.merchant||biggestTxn.name}`:"None", icon:"💸", color:"#FF9EBC"},
              {label:"Top category",    val:`${topCat[0]} ($${Number(topCat[1]).toFixed(0)})`, icon:"🏆", color:"#FFD166"},
              {label:"Lowest spend",    val:`${lowestCat[0]} ($${Number(lowestCat[1]).toFixed(0)})`, icon:"✨", color:"#6EF0A0"},
            ].map((item,i)=>(
              <div key={i} style={{background:"rgba(255,255,255,0.1)",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
                <span style={{fontSize:22,flexShrink:0}}>{item.icon}</span>
                <div>
                  <div style={{color:"#ffffff66",fontSize:9,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:3}}>{item.label}</div>
                  <div style={{color:item.color,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13}}>{item.val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    // Slide 3: Money Personality
    {
      bg:`linear-gradient(160deg,${C.orange} 0%,#3A1500 100%)`,
      content:(()=>{
        const p = calcPersonality(txns, data);
        return (
          <div style={{textAlign:"center"}}>
            <div style={{color:"#ffffff88",fontSize:11,letterSpacing:2.5,fontFamily:"'Plus Jakarta Sans',sans-serif",textTransform:"uppercase",marginBottom:12}}>Your money personality</div>
            <div style={{fontSize:64,marginBottom:10}}>{p.emoji}</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:900,color:"#fff",marginBottom:12,lineHeight:1.3}}>{p.name}</div>
            <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap",marginBottom:20}}>
              {p.traits.map((t,i)=>(
                <span key={i} style={{background:"rgba(255,255,255,0.15)",color:"#fff",fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,padding:"5px 12px",borderRadius:99}}>{t}</span>
              ))}
            </div>
            <div style={{background:"rgba(255,255,255,0.12)",borderRadius:16,padding:"14px 16px"}}>
              <div style={{color:"#ffffff88",fontSize:10,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:6}}>Your coach says</div>
              <div style={{color:"#fff",fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.65}}>{p.insight}</div>
            </div>
          </div>
        );
      })()
    },
    // Slide 4: Share / CTA
    {
      bg:`linear-gradient(160deg,#1A3D2A 0%,${C.green} 100%)`,
      content:(
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:52,marginBottom:12}}>🌱</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:900,color:"#fff",lineHeight:1.2,marginBottom:8}}>Here's to an even better {year+1}</div>
          <div style={{color:"#ffffff88",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.7,marginBottom:24}}>Keep checking in, keep improving your score, and let Flourish guide every money decision.</div>
          <div style={{background:"rgba(255,255,255,0.12)",borderRadius:16,padding:"16px",marginBottom:20}}>
            <div style={{color:"#ffffff88",fontSize:10,textTransform:"uppercase",letterSpacing:1.4,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:8}}>Your {year} number</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:52,fontWeight:900,color:"#6EF0A0",letterSpacing:-2}}>{score}</div>
            <div style={{color:"#ffffff88",fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4}}>Financial Health Score</div>
          </div>
          <button onClick={()=>{if(navigator.share)navigator.share({title:"My Flourish Money Wrapped",text:`My Financial Health Score is ${score}/100. Check yours on Flourish! 🌱`,url:"https://flourishmoney.app"}).catch(()=>{});}} style={{width:"100%",background:"rgba(255,255,255,0.2)",border:"2px solid rgba(255,255,255,0.4)",color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:14,padding:"14px",borderRadius:99,cursor:"pointer",marginBottom:10}}>Share My Wrapped 🔗</button>
          <button onClick={onClose} style={{width:"100%",background:"none",border:"none",color:"#ffffff66",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,fontSize:13,padding:"10px",cursor:"pointer"}}>Back to Flourish</button>
        </div>
      )
    }
  ];

  const cur = slides[slide];

  return (
    <div style={{position:"fixed",inset:0,zIndex:999,background:cur.bg,transition:"background 0.5s ease",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0"}}>
      {/* Top bar */}
      <div style={{position:"absolute",top:0,left:0,right:0,padding:"48px 24px 16px",display:"flex",gap:6}}>
        {slides.map((_,i)=>(
          <div key={i} style={{flex:1,height:3,borderRadius:99,background:i<=slide?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.25)",transition:"background 0.3s"}}/>
        ))}
      </div>
      <button onClick={onClose} style={{position:"absolute",top:52,right:24,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:18,width:36,height:36,borderRadius:"50%",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>

      {/* Slide content */}
      <div style={{width:"100%",maxWidth:400,padding:"0 24px",animation:"fadeUp 0.4s ease both"}}>
        {cur.content}
      </div>

      {/* Navigation */}
      <div style={{position:"absolute",bottom:48,left:24,right:24,display:"flex",gap:12}}>
        {slide > 0 && (
          <button onClick={()=>setSlide(s=>s-1)} style={{flex:1,background:"rgba(255,255,255,0.15)",border:"2px solid rgba(255,255,255,0.2)",color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:14,padding:"14px",borderRadius:99,cursor:"pointer"}}>← Back</button>
        )}
        {slide < slides.length-1 ? (
          <button onClick={()=>setSlide(s=>s+1)} style={{flex:2,background:"rgba(255,255,255,0.25)",border:"2px solid rgba(255,255,255,0.5)",color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:15,padding:"14px",borderRadius:99,cursor:"pointer",boxShadow:"0 4px 20px rgba(0,0,0,0.2)"}}>Next →</button>
        ) : null}
      </div>
    </div>
  );
}


// ── EMPTY STATE COMPONENT ──────────────────────────────────────────────────────
function EmptyState({icon, title, body, action, onAction, color}) {
  const c = color || C.teal;
  return (
    <div style={{textAlign:"center",padding:"32px 20px",background:C.card,borderRadius:20,border:`1px solid ${C.border}`}}>
      <div style={{fontSize:44,marginBottom:14}}>{icon}</div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:C.cream,marginBottom:8,lineHeight:1.3}}>{title}</div>
      <div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.7,marginBottom:20,maxWidth:260,margin:"0 auto 20px"}}>{body}</div>
      {action&&onAction&&(
        <button onClick={onAction} style={{background:`linear-gradient(135deg,${c},${c}CC)`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:13,padding:"12px 28px",borderRadius:99,border:"none",cursor:"pointer",boxShadow:`0 4px 16px ${c}33`}}>{action}</button>
      )}
    </div>
  );
}

// ── FLOURISH LOGO MARK ────────────────────────────────────────────────────────
function FlourishMark({ size = 24, style = {} }) {
  return (
    <img
      src={`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAACYmElEQVR42uz9d5xk2XUeCH7n3PteRKQp2w7dDaANGmiAaAANS4AECJBcEhBIQRIpUZofCWm00nBkh9qROBqtzPy0s9KuRtKM9NNytBJHXuRqKHoSdCAJ17DtvXfVXT6rstKEee+e8+0f977IKNuZWVmFaqgD9Wt0Z0VEvnhxzrnHfOf7ZDwe47XHa48r70ESgIhc4G/P9zjfq85+TnztRr/2+C/ZwXSn3uvCHvna47XHVh8icoFAPv3bsw1vM+F/+tDXbvRrj1e1k6helA3H86VWm3SjWf+7cNK2I7+ie4lfsT58vrD02uOy3fNN2uG5HWCr1vza44yHu792315Fj3gxlfj5XjL7/FnvPFcs30L4f+3x2uMCJ8D2bCZu3go37wazz88RcTM1yqv9zMmdgLNToNdOgyv51I1b+oK3ahAXU55f8HjRK9D6z/cBX0smL/8XcXYmsgMOsIOH1Laf89rjyje+bHlXwrfp7q94JfGba/TfMgWAiFz4ajcZkL71MvIdfM+zK8nNZBxnnMBnfFOvTYJ37JEb0mfXPN/0HOxbJsu/FME0bjWSXf5kbjaCXswXvLMmcva7TX9yzht46UxzG6OYHTem2fh65edpsxf5qjkBLmbgN9uf2Uxe+NpjM3fymxIHd96utp2TveLI84rK4C9biDpndLw84f8MMz373y9dljX9LTv7pV8GE4oXaVVXTsr0LVDqvfa4/I948d/62XnwZhx68wZ04WdeacXf+Q7Gi7/Os99583f74kP++a7/UnzSbVx/DsTbSM+u6Brg0jXUXr2Z9zfr+q/8+7a9fCSez5ku7JSbRF9cwCNf8a8ujAXfUqTZqS9ve0jPsz/O5s/MbZ+W5+yhXQqjP5+1XP5a+RJCIa40iG/uCl/+ieNOIT1nu9qbd+DZKvObexq8WrKGzVhs3JLrnwH2Onu6ttU89WIC3quom3nh424zt/0iw9D2btRmjOnCbcCdrXkuxRcRt3RBF8iOcp/+W7UjtLMF5aslF9/qSXXl14pnT5PiK3reJguLbZjI9iLEZfax7X2u8+Xl53u3nTWvSwHG3qoDb6Z3d6kjwmZMN559y874qHl0epFX+c3FybzWM7mYvtNWP+mFU5crLUeI247umydsuRTDslfdiXwlJ4fnrDHOZ9mbthaf+Yls6Rp20AxecT7wqkeDvtp3ry7dNX+z7kZnylfQHT4jBM86W9zM6y+cuV5kz+ci0/HZy7tiMfc7jmzdWdPf8X4LSYCvmKBfpLtu+waeFw261eX3zd+y13bbL9yL+Barf0TkdOqaS+hsF1sDXIaQeYEDZEuZ3/mef4GXX2Tzcae+pyscMnhprm3WyS9TjrAdB7gSLmLzGP0LTxsufmB0qaP+ayfhlXb/LxMU4sJkIVslXPlmpVsXv4/2qktmdqRhfzFUMVuFNmz1/sfLcx8387Gv8F2t/6KAN1cmDndaO7F77MB7XoYPcAHH3d45cM5a/Hw9oosPXZcohF9RlNqzkX7bE4CtGsBW7wBnHt9SNcCrJcReTEl9+bdpt963ebWU19+kIvgiM7Dz3eJtdEgu5/zh7Mu7dNj6V+PjfMAnbALws715xc4Caq6IE2CrN2IzfKOv0ZR/6z0uBZYsbs/Rv4lhb5NXsoOmv4MLZa8uh9zqlOZ8939HWknbtsALg9NeY4a7rI/ZGfBrp9NlS8xwFnf31BXjZhzoCmxWvEpj55WwPruzR99lONYuhpb8FYcPryyQcRnwbTtLoXHlGNPmJxuXgkr+7Mj3rV2OX5IaYPPWv9Xbeoab7uC38k1kCjq7JbJ5xbRL9CkuDxPeOZsQF2gQbfV+bvIs3cZxETcfOb5Zt/i1x3/Jj/NZ105hq+JFhp9tT4W2lwNsvrm5+VPlEqVP2479l86GLsVvvKTh7xVxvtu7pa9Kduj/cmLbVl1984/XEKln33Z9xdxu+ricJfJmjGPHuwcXbxw7iB26FPf2m9jQu2Lz5HjhaHG+mHTpmMle7RXFaxXRq+sRt/ot7sgXvCXEyPby2k3y0rz2uESPHWT+2ZJVvOI3+2pViLlE0VdQ9vVmmTt4xhPO+XOe9ddnPUsu+Gu7J7I8j6e9gOd9j02Q6XLj9/C0dyi/iflfme+XUOy0V0Fe7Taw+QAXt+1JW4oEr0gitFPdpHOnc4QpHAgExEm4kKRTAGq+QE6pPKgU6YyAgqmpy9nGx7MMa8Z6XC7odzL79vk6lRs/yknm2R/5TEMvt+60W6FCUPINshk/DwAhPr1zDgASqQIpv1qMoFLPcMhXV0J4Pv7wTa1EfuulBw6ACCSNLiYiqlpVVdDqnN8xQXdnMfCNGOozx4R2pi6dbzCfrgwbDjPL6iw+NSgi/zsBIcL0PUN+A5BAAIQoXjlji2SYeiQxewz57Odl6W8IpBJAIQK4qkLkDEile3KaG0kQgqACCqmzZ8K3SC10dh8sntP6L1LncDP8/TviZmecd+U3qgqnxgGS5i5EXdexXz7v+mj96NEjB44fOXjsyNHlpeOnlpeGp4bj0bgZj8eTxpO5G12CipZfIyKWnUFERVQhKqoqIlZsnhDR6KKqKqqKUGK4CKAiAoGICgNERCAalNo5kkgIIiq59eaB3S9SCJFfK6LBVbsOhFA2zqps9lDVitJ18DQKgqoQQUOtUkmstBpU/V31wt56z/541b7evj2D3fO9+T76Ak3uSGbupgzYePdvscrk0tYAO8Wjv/1fLwCE7nBWVdXv9wEcW1m+//5H737sgYefeuKZIy8dOn7sxNqpSdMkukRFBAFRVdWgQFAJ6ioSqJJtDxZMANUAgUSBMGiA5NQKxRYryW8iKhoIgWoQAUK5H6IKpQYVUQhRF+PWoIhOlaABQSjMJ5UIVKfvI0FzU1pVEOAd7ZlLAEFVzScSneUqKoOQRgFUaJYIB6gSAqVG7Fe9+Xrx2nr/G3vX37L7jbftuv3Ghdct1Lt7ppbaBg5hwBm1xLdOTSij0ejimyqv6GcXVpTZuqucezGCUHESbGEBYW4wAHBy5dTn7/76Zz7/e5+77+vPHH7J2waVVnODqgoxVCEqBBoEChGlUFRNXFUlCLOFdTHYAymiUTTPRVREkV+uIiIqIp6NOwhUqNTyHNEYnA4F6BIlxOAkAA2Sny8iCBQFVDT/pwICh8cQRUSDkFSNQRCCCh2gai5mRRQkVZUkxBUikCAaqiBCId1dVAAHCXiAkiaB7qllCyeMyrCgc9cOrnnHrne+55r33bL35v31HrQy8gZiOVczUeXliM2XJ4aewwHOWUe/KhzARNlaEO3P9QHc/fBDP/Pbv/ZrX/q9p557Fm5xfi5WVRUiYBIUQkdnwVGYjVpFVV1cRCguIsghN4gImFMaoagglKxGY3dCiEBAoQSFQqNCsgMIVCQoBBCKAAEiwvIqiohWQUQo1CgaFDlTFWgQgqIhh3MKBag0qEJFAEp+V0HJkAAnAVdIEFEVyXkMmYsOFWR/ICmAaC55GCAqEihMOubQ3fraf/3gxvfuf893vu7Dt+y+VRsZsbXgPXcX/ZZ1gHNe0EXy9uzUm59Z1p5B407COJifN8dn7/riv/yF//TZu75warhazQ3qQS0QcQdhAaIQzcZarFmDsATdbJIUFZZzQJGNWIioJCkeQpAoEiSnBqKSUw8RQQAFOZBDGYJKACBUBA1aqQryCQOREpIBCSrZSRQSwHwhQSC5mM2JUHGzqPm6NNfooggqpJf6vWvqBmGMoTSAmJMlqAiEmrtecNJFhfQwdUyj5BPGxTFeA/Zh74euuuPDb/j4O/a+VZtqyCSS9FJmRJcTz3teB9jBjuSldgACZjbo9TRUv3XXF/7Bv/z//t7dX4VgsGsxhABzijs9Rz8IVEEphWnu4GQHKOaeeyBg8Y0Yg6pEIYiQe4X5ZIAGFYUEzXanQUXExTUohQgiClXNjoQgqhqqEIImmgigCjCbNcszS1qV31MUpUqGiiCoQlw1qEAFQYMISBdBCIJp9yInY/SgVC21MGi5Ftd8kqmioH3zy0yJqAFgogRoyGdFkIrJ3Vbatof6g/s/+Idu/dRb99+eJt5yEiTkzqmQOzs6uJz73DIej3fE5y58uefzgW22/3M1aSWIUTA3GLx49Mjf/of/8N/90n+msre4GKM6cmePCDlJYOmxqGScB7uWi6ggSKgClRSqKGHMJigxxECliJgKBCWpEIEWH+gaNAKBwUrvSEVEIRCFBEhUCQwxSBC6kkTIGbyranYVF6Eglw1UiCDEkOdVAgkh5INIVUOQru2UEx8qsjVTwKAxZ1YiLN3QMjEA4Dmbm/3KohS/oxNwFQEpgiBKd5JC0NuldvVqXvOpmz/xA7f/4f26b5zGuRnMfCB4BXn1CaC8Wh0gf6NmFutQx95//KVf+h/+yT94+YUX6717ICLmiECuXwHmAx5UFeqGA+T8Pj9NIiQIczVMIU2CQKgSEFSEULGcakcRUFWRO6FBIAghlHMjHy+hS8wVGjREoebagKICV5QSNTenoaoaxIhchYtSYyCp0vkYoKWtk3udG5z3ubctdMnnk0gQFaHkD9clQdKN9ULuGqlMZ3IhnxOECNxNVXINnc8NOOlGSx6CizTN5Jb5m/7rt/7JD17/nT5Jia4CF6eoXLLh6aXb+Csp0MVXHjurd4sLUwkRFJjZ3Nzc8RMn//Lf/59+9pd/MdaDOOi1KQkRIIyY9tQRkc98EeRUB7m9E4Ln1qEKFRIEObN3AZhTfIklirOcGHC4KkIIEoSCGFW6ygGAixOMvUhARB0egmpUV+YqFioBmt9fg+aQH4LkspRCDaE0jlS7k6pYfwhBkFCcWTlzS5UkGHLuRIoiRi2phLsGBSHIUwdOJwllkOGlJs7pZT4BVMQtT4VLiygkrQIQ21HbauN/4M2f+tNv+6970kuTJmhI6srtbwVe2NwvfrlsCw6wPfmGS+EA53uVAKlNcwvz9z7y8I/993/l0Scfm9+/19zNCaeKUEBFiKGYyFkOkDOEkluoQoRKjaqVulCoJCWPq6JIUMIhMObimFMH6CpgiGp2gBzpQ1QHQYHmJo/mJCrX00HU3TTkVlJQlRCUdIBU0SAaJJt0CKpBqCQQQhAghpy7l8FcNuA86yUpShEROsRjDHlEkGO9QnLZH1S0i7ExBhVx8+IABME8OAPplgiqSMZPtGhCCGJBxEGujkZ37n/7X/7AX7p54ZZm1DCKULAVBMW2s/xL6wC4uPXNHbzuM9WIu8F/Y83C3OIX773nD//5P7O0vLprYVfTNhRQLedHUC1NRs2tSoFSFATLDCl3dTKeISfLSo1BQ3kt6RoknwylNZR7OSoUdB0bySeDCqUUGGAQDYoAFQUhKigtSeS0JxchntsvoASEqAWj4EmC5uQHyMmPaDmykIdigEMgSp1BpGv27zwJDiCpYAgqoIMKBM2JVwA8FotWAWJQ5tEJqSoZ+RFE6A4C9BwN6e7eMidJxcqpjCuT5Zv6r/8fv+P//va9d4yaoYQ8gBRsAkdx8TXuzgCTL48DXExaVXYPuvZeznx+9fOf+/RP/PnV1PbrQUqWc1+XbBwClvw+t9shAqXGHGWzA0Akd8JLnZAjPUAJSpVp0ezCPBzIsBwN0nVFS0FsZCkllJo7L8UxGCRPxPJvAYR5noCgADxnLMEBhBBISp6aZR8joNAQ8pQtD7lyuUyxUhmLaPlfrj8sd3xQchhmUEjxPsk+ySDlkFSVoEIaRN29BP4cQZyCPFQo5bLTwNzyceQ5Ahilmkzaean/1nf8nfe/7v3j8ThodHGIgzu5EXrpEiHdKWOVsx6zP9+2i5+WGoq0lubm5j7zhS/88R//v55qJ3VVt21TYDA5BiMnNTrDyC4EmUeh5f265KrkD6WgdHd37yJpaZqcTpuc4ywzlBQEzRU56wZEnWCuhSkqARAaM8xMIIIgVLAUryEn+C5CFark8jl3goySfZ4F5hnyUZZvA1Ea+U66o4DY8g+FThrzhEAosDz8JR3mTiK/okSHbOGkAkoEEThont+wfFDvJgzsbrSDDpgkS3XUdVv7f/z+33zwyH29Qc88KdWxA+nAhbcRd6pPqrO/TKdl15XYr4JZmp+b/8r99/7xv/DjE8gg9KRxgIRrQEEEbAwpZ8y3w6qdUVd0luyzEECCzuIJZ83FZwQjAHrXJCEJuFElFExleVVWCBV39+SdaXYE3zmEd36mEM2DCaJ0JLOzuZNuZtnW3TOSVIqjEnTSSXeBFOfLewAEPT8h//HiTt0bT6/BzPKncPPiUe7FUbr7RpZTR0XFSyImBm8osVpF+7c/93eePPVY1a+c9iqC0Omsh+3UzujO756KJFqvCoeXln70J35idTise73UmoGlA5MzdGZAThDRHIlz6BPk9FVyEcAOfQkqqJ31FzAPvewDKJQEGOEqOS8hBJINDs6c+ReoKDQHSz3dZCAgnYCRZu7mcGGimblly3Z4hj4Y3eAQR4DSABdxwIQGN7jT3eECV5oKa1DdmN8H5kyWr8ppdHN3NwfFHd3B4hnSLaQnoznMaCZAcTCU5nLx0eRoXYxijJRABM/bBCIUONxpcE8MWh+cHP9ffv8frbarQdWxkyxPF9AEuHgze3XIFdJdKa7Vn/vJv/bsM0/35+dT2+aEZ+bunP5/M7dPIBCw42nr0qBSYJQuZmmrT3H3yC/MJYDk9jtRymfzvDCQQ2o+LfLh485sfvS8kwIzp1NQYDfZjoXiya31/IvMfHYRxs0VohA3AwkvKYp4l5G7u3vJlJxMlo8Kz9mLI+dU+UpysmTmdOQL85wjOemAMXs/CDejuSJXveXa6M788vxJnRsnU36C0VK7Oy4+cOTxf/bl/4/WFUw2s7l24aT38qzwX1oH2Kl2lbv3B4P/9z//qV/+9V8b7NtvKZ19d0q6crpOHs8WKZ+e/jytYsk/NLNpAsXyXM95RbZfN9IhUFCF4lYarSzBPqfJIhSFAkKnSBCoO91oBnPChQbBRprknssGEeYUnPlfOmyzC4CSrG18dGaT9GyM+V9hRjroZCrlLN3dDU6CXj4C4aDDkyP7c7LsPPmCinuwLAa5OwkzN8s/yF3anCySThjaxnb35n79kV//ncd/a65f2yaozHfEPM42gy25zavgBDD3wWBwz0MP/v1//I/jvv1sk5z9UVnsabbM3XhaxupM0WPZ3KelsJz2lRTcpLPbkBK6S0m1yxsUxFnOu3IV6jnpIB0KBUEjCSdy1zHbFbpn0kGjeCm+S4mZbY5dyQIKxHO17UR5q640zYdD3l6zUr2X8sCzH5alz66YRg78udR3I41ePCEfFF1JDUi3UMmN38fuI3QfmXDCfVoTmzdAVf2zr/3vB9YO9ELP8U1bLZzejsvhADzrgZ1U3fEgaM1/4n/6u8PRSIEcpKcDILDMNwmBd2BIekABOKNLePKlZRvN5TJhhOWsCfTcvg65yYcCL8itcBJe1gyFhEgAc7WQR8QAFK7iAaLToF5sN7k61BlyGk2oBMnVdzKhwPOs1Zno5mZu7gmW4FbKcSQzemnwKz2AkrOtnJMYLbm7u5mn1t2sZDmcFhVKESOTWTIzo5knFwcMaCVS1SU6AqG5kqEbc/bGnFe5W86HxB2W90zhRk/u5sl8Ym2P+sKpI//2rn8dKjgjxCC21UNgG/OiM+qEzb+DXqTpXwrRjtPM36zXH/zHX/iFL33uc/3duz0lAOZTE5WNj1yCn5+e70w3d6fnQ85oCOI0j9Uurvt0w7K8gKC55RGncKMTCiDbRG61TvMuL10kp5t2YRtdeZIT+nJJMkMKkV3CyyJYCfbuOf+ZNotyHpKPo1yOKzSDk+l0s5yylzBgno/QjY7WzGZXSeBTKh8BnqcfeTKtBSeFroLOACTkwp0kzWG5MUV3JqcBaNr5Ov76I7/zpRe+Nh+iuYJhe7vFl0cyVM+XOW0yl9pBDz7nz2OsTq6u/r1/+k9kfg7mejoZCXEONubOqFnG+KelNyy4+e7rL7JTs51QOa2Ono0ulsxJEUlmxQFK5xTT9Hzj3ciSezhlhkpMVOEQp5DioHnp63dumpEKdA+5BIeIU3Nt4C6UTN4wbRPRCAp8wyLhTjdLid45ay7T8ws9N7jyD3Mg95IVgpobT+IiHgODUoVB8/DLpTS16O5MVj4FYDTC6dYC6lyP45/+0r8ZYT3IK2+PnV34Tr+L7aFytmTDur3MaWcr9PN9SPNU1b1//3M/9/QTT1SLC9O8XTeeXyL0bLY6jd7FoKccCuTppD15U2q2HJg5NzI6QLr19o1ao2w8ZyPIeTa7HWjp3rkrGHJmBU5HbPnl3eiqQJln88ZpZlfycgiRW5rM/5IcBqEGqGaMR/exyluZ53Mmh29rE0pdIfQy+5spo+F0VZB5OVNCkBBFA0JECCFG0UBRDSp566B4cv4WOB0WiwDqPgniHnfFwT0vfvU3n/h8r1e7J7+CK009Z+S+gHFf2PR38NgiWMd6dW39p372P8riLpibCjOWprtESjHTrnid9vbKXAyy8Y+NgRgJKn26eAhVzf+fQ7MnSiGNcnenOYySyvS1OA8FLiqqVKVGqBKa4z2h1CAqXV07C27MEdzzlMoAggaa02hWKEokj66KtdHdLefuCUzMUAOh5LgLd3ETWt5vo4uUj0F1Dy5IZCIcpNMsY/Bydsi8iCAQddEUolUV6spibGPwnkod0aukFyQKK5EggtyKdRKS8at5HuKGBBED6NKK9vq/cvcvTiZD1Qj6VoPgaQ3ri2ZZ3YID7JSs9E5k/17V9S/+5m8+8chj9dycl9FoaXVyo+Gz8UG9a+SXpj7Lvhi9G/f6NHfvLLP8jKdBIbqjYwNsXDLijY8522ktxbdvHNl5/bAgyWYCfEchtPHz/BuTpZRSvgJLuacDkVCGBiJ5293dBSUNL4PhZDKthXKVnKfLFDfvOrkEkYdiQhVXRRAStCCu6lAL0auaVc0qoq61qlBV7PVHVU97dTVXpTpQ1QVU2ZiLO7vVPJZhQv5USXyh6j3w8sN3Pf+NftVzXvEnwAX875v1CKrJ/f/4+Z9HqMSTaDafDq9QKoFiGd1l5011LZMa5sbFRnYkqhtwBm54jnU5vWyk6gXlICIhhKqqtEPXlRRotu2QoUTcaI6qqOcE/AyGGE6X108767KDcZaXieJGM8s+kNvqIQRh1zIyF6OUzqnD6Wbd3ABuRAYsODI+KY+3QHNP7qaKoIyRdc26Yh1trsf5ns/1bFC1c7UPel4F2c3xVbXHWnu11JEafIpO3ZiUkSISY1SWJoHRYT6UyW88/BuuptRNhuSzo/6lnoVdFC/QDrKBn93HHfT79z766FfuvTvOzdFTjmZnq/xls84MCdkhur/NQB1AWdoqQQrZWtkkprtLUNWAKenVDO5NVVhQw7nw0MTSgYUgd1qye2QzCEFVtaDvM2lVxl2jnDkEgwTVmS9YNtpTXU0v7HquhVFOJW8Li6qb6RQ95A6Y6EZW2mFYwQ6y4TQV0a53A2kpQFASSq2CBGUdEUV7UeYjBpWEWglP7TpNb5h/yx+46Y8cXj/8c8/829AbmEEVTNPKetoGFBHNfa+8lEzzFnGurr/x9F3PLL1w6+6bJjbRyzJ02hlu0G1kO7N0ohd/dLg7RH75t3+nXT7Vu2o/Ww2wYh8o4OSSSMyak9Az/UFe9Jt5gpPiHbuaCGiqQgl5UiyFHBQalKRqAZZm5MIUcx8gpTEveUULIuJMhGZzNXigQMVhmU2FKBAJhQsBc4qoKJ2ioLnkhWBqdzJ1+Ivpoj0hpIrATFWZBwcZjA3NeY8YqXBAMyFpxqYCAjEzlEpeWLyWogg1Q5Q6Si9gPrCufaEfFqJSJ7Xy9Qvveuf+T92279r5MNCl/iDGEaUKaBOS0IVUioPQwOB0UMTzZKXrgpn1pD42Pn7v03ff9oFbLEFnGIEvvBC7jS7i2SnMGcfI+d5zUxph21Byv8gMKsY4bprf+OzvSK93Rmt/I4cun1AyqoFgof2AOPPWBiEyXW+a5jyayXpEXItLYGpORAgBMu0dltXEUhtogQuFELoeeQ55JQvqyAoVTqq4uWhmoipAymx+pbvujsLDUv5dVAi4IwQFLW+iaAgZoCZ558ESQkSGHs3cYpky4OYWUP5cFEWgEyogVYMqo7KuY+x5XVk/+qCS+RqDmn1p9sb5t+369jdf/cnXz7834OmTk89Udsv+wa3zcde4HUaVoAUACBbEf3de5d6AEk5CKe7WiiQNX3ry6z/8/h+qSw/2fJRO58/RZ9g8zxfXLwbCHDcT5jcjirFTa8sEYN6fG3z9oQcefOyRqt+HlyYeTpsBZMOVKdan62mi5Bi5ha7SEUJptkKW3a6yCpYNUVWdLhCqZ4BnJuLJjpT9OQ+EVURCwAaAqLCoeM6WcjEgHVxGC6YobyGXEybPrkvpIpnHsbhHd0ahrJhTirfn5fdQKm4mES0VClCwfPDiELmaBzTEPC1TFUEKColeVVJH9irr1VL1fC6kOUgd4hvmdr198QNv2//JaxfeDpwa2y+t2RPOsaPdHffO19VJa0WCCmKQNmVf7cARGxFTAKU7TOBukirt3/fygweWX7pp4cZ1WqDJFil3L52A7A7UAJfiHGAu4oAvfPnLk7XVuf3XtCmV8xwbqB5iykZ+1qjLXbTs4HY8zDLN3SWzdpbvL6OZ8zataMe31gW2jU6QiJa3EjhdGSDIZIPTiUPG0lAUQtFAz4cOO86sMtjNDIddNMnezZBL/NxKKcUA0ZHHlRZXHrrCqYLiKyGj3QrZeyYXyrsB+fQoLEAeA0OlWkkdfKGvdS9UlamuL0p1257b3vu6j7x57/fvqa4HXh7bZ5M/B1k2JlFtsDoX4/xg0YeHJMcWMmP78seZngME8tV5adeBtB7royuHHnjh0Zve9cbUpCrDSWQLpj9rP5dC4yxuo3W6jXJkenq84jtnjhsAd919NzR2y9rOErhn4sdppOFUVbjlPpGAOa/ODAmlKMhZQ5kEwbvDoCw3SsE/d9tgmvndunTFpFBsQlUzBEI7TsSElDmy3J1ClOWu6eRNcyGel+TdAGGhORSPqnQGEXE4XIXikq9Og1RVEJHENAVp0gHNa8SSUQ8Fi0p3ej4GnEYiSJ6QuAqrqBo4V0nVg1ZjiO+v975z33d98NrvuWX/+yu5ynl0ZJ9PfFx8VQLb1gKDiAHjqLogC3RXQJyBAFNOaPIMODusk55AJ0QNLoBKANxS++CLD3zqXZ+ozUyoW4z6PB3ee2V1gbZ6GmxKutQZYlxbHz72xFOoe6fN3cpCi+bOD2Uj/J/dw93o2UtHBDVtneaiVsq2NzZ4NTETcc9sw2UwKaWkTEGLY2rQKErC4LnNpJDsMJL7RXmjVlhaqPl6nOgQl6pKurjm4yWE4qIg3Avajs7kKYTQ4XmEvoGCyuM6QV66hwYqECIFLSoLVT/U6PdbiU3V19t33fTh6779zms+fNXcOwFN/vzQ7jU+C1kWr0UwacfJJ3VVIUXzBkAl87kd260ZwYyWCtovd65yxUTQC6RcPa8xhPj4gaeaZEFgV96mWNx87H/Fyn2T7IjnW20uhY5b1Z97+rlnXzx4SKs49Zzut+tGPHAWMqdpJ1C7aK8bqOhpCpEZOHNDXbpWpsgUl79BOFVK6QIEm/GEkvaok2IsqbdZBh50JNHQoN1v3KjeRDWHTBUxuk5X/Ql3D6GQTeQBMMG8KRapqoUDIvtrBpKamdOrGFXVPeUDKxMcgawqVXhdMapChWE9xPbqhV13XPvtH7vhu+/Y/8FKrwHWm/SE8RHji5SxoKYLZT3BRu2wP+i5J9HKbQ2Y1GHR8ta9M3lGQdMdZqYMJRulZhA5crzJuawxxHjg5EvL6yf3zy26eSf4cblbn+cLvlecRlguRp957vnR2rDeNe9m52655hmne2kydu1/3VgeP80tc4N94yDK6Xwm0+/kJwpeSEQ7kMXsZMDdVSWIQjt1mDL7zC2ZjoZFy5Q3b1jnAbbTxSUUWhNq5qY2V2WmWcw5cwmoU7Aqyg575nSg0N1VAoQGDyG4ewyhqioIzZLCo6gHCSJ1rAQpoalD8+Zrrvv+Wz72oRu+63XzbwZq+uFxeqjFiy4HFSPlgB5NDGxdfXl9bW5uTghxEEaZAKMYem2bAmh5W9iyd0s5EFBcuYtTeaEZnidxIsfWlo6eOn7N4t7GGrk0+cW2S+S4pUB+4XNgk4na+fRjOrMGgKcOPAtPhcMVnZ5Q5m8TKQNamZKIT2l8Ngbb9FwskvCO4zznYCxVb+73ZNbykNk+Clei0YtoGEr3Os/FsvCM0qdAYZAoHR4qVDaUkArrW24BiUpmaiiLxyz7xQV1Z56HWM5MW4tCbgfNjCfdr2IIqoU81FUNIYqYimhApIpKjHBrDRz76jV1/f7r3/yxt3zwvdd/52K4Dlgfp6cbP0i+IDgmwoCK6Dkbw3ryxUGwl9dPDsKeWoU2ElYu7myBkbJqzQujLgCDuNMYKFOqgbzfg4wFKhsWdGdEtd6MXlw59Ha93STpjCTURQ6ztmRp3+QaYAvHGQDg+ZcOYAOWT5kOv85MImXWeXIMKqfBtPAAReiAuE8PCnbA6FiSauYGZblZhYuzRLWyfNNVyTn0zs78QgyWVYWQuZ5zQUuJIU+g8uyspHi5kRMyHYNrkQ3I50npPuWTMFTqboCHjvwnlwAa8iURSJTgUQWoYpzIpPXJQh3fdvXVH735Oz9y450377kdWGjt0Fpzr/nhpGtAE6BkHyCQCM+N3L6MXxwfC4wLg9DaWoAY6JI3KUcgzGCU5DTLvMFl4iyFBobuuRmVj7K8SZm/IXX3oyeOlh7fRR8BWy2FL+wGcavZ/IUzqs3TY537DOm6LgePHEbQKWxBpokj6SWf7qAEkgtN74reLjCHIF6AYnk8jELGr+WcLhQQpkU+IswUAzKzE7OBXZtiYKTox3TdzZwLdefPFE1dmpoFdCU0IxBi1NLEh1BoXlidVdy9jKJFYtCM4tOAkOl4Q6YQdVUhrKqCwBGdYs14NKrtjbv3f+TGO7775m97+7U3zYf9xtWT6Ruejk7kpMuo0hAxANShlCQwSF4IcA29Y6Mj662/cc/VTTrBrI+g7gKHG9ZImmnrTEmSdes9ohDNyzEddJbTtQh2c0gBEtOJ9RMANB/KsmXzvcBPzr0afh6rPrsWveJOABV1cOnkSWjwvIAnembZ5J6Fu4JqXgWZGmvHBid0F83JUpnaaNdlJWcJs5zUbjdr4/Z1My/NPfXTAIKZBHf27hNTD8mr9ZJZ6NiJ6qlkIh0ImIxRumNqmuEwM1DTM20czC2T5mpG4QcgFILHAASNUbUlJu3qfPB33Hj9973lPR+9+Y7rB3uBZrl5+eDkriQnXBGkqhjVa1MlTIoqsGvuFbMNoVpujh2ajN60+y1uR73ApwygMzjdfUh6SgJhSnAXJ3IV4NZRFU33ngFmFGon1JqphU+uLKGMADZbBF8KLOZmRfK2cQhsMiF7pTEwVaRpbW19iBhKRWgJnTpczqK75r16nsHKxohEMnFrKRwkgx5cimJWp2maYfOZ3UHEC5C+cPyDNM8pRkAwQHJqXkbIuTxwGjPPbf5eHczEgxlvoy4SQvbnbCKSBwiFgjx3SxCCFj4VultmLHQRaJTWM9k/BAi5pR80BgZIq9LYBOPx/vn6e994yw++7X133vCWBdF1Wz84emDEgwkrIilqVXkPIiYmSB0PjGZlZCPEJVR6ytZeWj168573R4wnGBKVwNXzDMWIsWNo5p6Uqnnr2Axubglu0JK5oWPPyNulBQbrDhOjyan1ZZTZ3pWlIRAvbK9nm/jZQ4odb2m1bRpPJtBzYGgLKSemzZKNfuUUDYGCVpnJ/7JL57Mh8+YCErrXKESQaCpFdyjHtABxZhbOHM7zwUJRZpUK0uk5EdLpqG06gMD0KgvPZteDQgcK2kAcSVAtzSIt2sAhqMMAcVor6EnVU2X0tfGEwd68d+773vxtH73tHW/be23w8eHJEwfTgcQVahLRILUwumsrphkZVDamc1nuoIqL94YrKR5afvmNu97XFw79OWKRSAIoMpW7OMzh5ta6ZUWozvQJV2acNiU3c8Uz3EemhywJS+bO4Xh4ZSpNxm0gMbZh91vSGG7bZjJpkOVVOv232YJ4isIpuMdCMpiFTThbGnvOZDqpxpIGKUIMeekKgMSsFU8oPPNLayaSptOjKumqau4icWNanIEARR+yqwdk+ssJiHiempWfTc+lKWFRmSR4xlJK5oKWQJbGf4A4yMieh7jaDPts33fLVX/4LXd++A037RmEUXP86dWvrvqRyFWRvgRXVGCfSAJXMkA9CwKUbpbL9FCpudLIoeXnXr/nzoVqYaW9WzCgjPPdZElh1OhGT3BC3OmJNHYrbNkN8up92XPLBQzKuLzwMTrQWio8kVtXoL/A/HTzpng+rNoVVwNAJCVr27bja8O0j3+mo8yMe3Vmm2SaZ9Jdo053b8u+QCUaVUUDaMFRdFRcszKL6gZwtGi2F45lFZq7aDkQpiM2AfJilDO3atQ45VSjaAmK+TBRjd08eIq3pYqYMQTRkOUFAukUBpi7M4TVdq0n7UdufcOPvPM9H7zllkomx0bPvLD04gQnVZqoPceCgOrBAZVhElEopWCCghQonmRECbWKXBo3B5aev2nf+6/r3XRk8mWoizuQiOx9QYBMGmTwNjVeuml5nYbuBZ5SqHanXKVFhYPdIh6yOGCTWnPbfAHwis33nco+LrkDbAr+MFME5PDjbkBuJZZZr29gdjIEPleUgHYBNfcuwA6gXFTrJHhG5rhoD7KytoYQ6vl6blDVMRBR4eqpDZKKEp16atApZ3jmuifo0GAkPeVtARYNMMJQxmfu3QJKJrTK+F92Awkgz/WYtbrKwJia1QaCaIAFGl0dIQgZxp5CM37XLft/7IPv+L7bb43g4VMPHZu8MMGJKNQQVWoQSUaCSjGdGqhRMi4vIAMQRCBORrdQLRwerj299Mybdr319Yu3HB3eZzIU1pBRMV+WZfwOztRMxmMxdUdyMWpyy+O5jLXKu2biHSZjYzaf9yQ8GMfNmjkiM4hvy+nDheHQW5pZnfGfl9wBtorVltJGzk0TeNd8lJksAjMQztKMLvDDck5olsHoYmoIYaztQr/3b/7OX19ZOnDXA888/PJLTy8dOLU+dmlDrKowqCJipQjwlIKIe9kDLuzRDgTmeQTKDLQgQ3O/W6ZsEbllpSiNn2yUbtOljQIHUpiVejfTXRHqHqI5Qmpjm1yGbXPbtfV/8/63/cAdt1e98PLJR48Mn21wSiOjDoA+3VrplPYyKhRwFxGTLEgPpRBE8rwbxBr9QyePPbX60m27b75t3wePD78xlqOB80Q7tUwXVTdCM7bB3Ybt2MgoBZOas/wM1siZomSZjQ6h201ZOgYXsmkac6+w8ziIy3cCbG8AgW25u5l3qOANoz/NS0peUxDD6JbISjM0t+GEnuV1K3XaDa+77i1v0nT7E5/8/jtk8vGDS/74i0sPP//kPc889syxIwfXxqN2pAi92IuRNGYGOebC1KAbv7cDn6LbuvHCa5VVjMrCJZDPARFxYrrYzilpeoESuYZgZgjShlFkdHJtbe3aPdWf/c6bPvW+m6/u1S8tP/Ly0WdGWA86X4V+5XRIG5Iwy3KrQnNbKgfmLNBRtuTdc0YSiSiDR9aOH1195vZdb3nb/g8fG96/zhMS5mW66omMRc/Lc24Ukq3bujUe1Aq+A4WOL6gDnoxdv4olyZGUTIQiSs9DdE2FfTpsNy/eLNpnq5q8V14NgLyeSG4ufZq258uh0RHtlL2tUHSwpbEbX3fteu/UF5/+2ruuf/oaXVzY/5aPX/9tf+TbP+n44WNrp546tPTVJx///cfue+iFp08sT4JWvboXJSRziiOKesxohVysZlEM94IjYseJAKeEYJ6lsPNhAYVOmShK+6gglwLF6S4a4FY11RqTT459/ztu/AufuPMt184fWH7qi8eendioll4dB4CBLRgp2pjl/izdO31uBFHvRFCR9bbhJKOGCfno8RdPDVdvu/rb7rjqE0fWHzthB2LsB0uW9S8ZCvEjqRI8/wfgzlPD9UxKtCEskNk0PM/6CgtBFh/PG6Okw5nVBU9bnLm4DuEFfODsXGMz22Txyon9G7OAbPo8bXrH6ec/oxKaKqNrLtuYAckiVZnoiqh4Mn/9666S2ryujo0WrtqtR0YPH1t/sieLC9UbdvXf+KHbrv3O2z7xlz/5g0+/9MLvPvDQ7z58z70vvLA8GcYqzIUoQKIDGl0L7pfq5hrE3QnPCr5lyWbmjitEPY8PMv0gvE0EYx0lj6iztqqS4Nq4vW4h/Td/8IM/9IE3rI+Off3FB45NlkS8UiWkJSOFwhbWWJHBIUFLeUEziOS14AQq64AyApkTWU/pwSMnTjYn3rv/1ndf9cnDo2eW2idDqOBmxU2lg2u4CAMrRXBXByzVq6NVtC0s0gQOJa3c9LwbyTKezGjwskQKKZTwDC4pk5SqdFipi5phbdLANmO3cadj90V3emWaRG50fviKgQFlTcyz7nSQzNnXSXQB4A3X72/alUGNk6PhUm/3vt58glKHa3xsOHz6iPb7snch3HzrjW96241/9C9+8kfuff7JX7n7t3/robufP34yVv3dMYxZJVKM3rqxCO0BYJDMylCKk24Vjm7GMpSgktM9XRVPrlEzrRqjWrU2Wo8fvmPf3/yhO964b3zfy/cfOHWoDaNYh8jolJR5d6VujaBrEC3rOcxO7iIuUvS/NFQgaRBqHQ8MR08dOjhJzTuuuuMd13/P8bXnj7X3qEb3lAfqREdSWji0MyZXHUkRhq2vDNc8wdzNxKwQZZe2lgTL3DMdwqEb8wlmwKEds/arbQ5wua2/5M2e28kC6Vgeur/r9rlm9102csRcpCqK4lbOZ0UdqKJcc/WuUXuI1gwGfP7USu+avZVMSA2oIDUErRw6lQ6urj8Q5bo9ett7bnrre276iZ/4/vXffPQ3f+6+X3v0pZd7HPSqQduQDcbjVEg1SyUgIah7iY2QvOybDwU3c621V9fj8ZhEyLMEpai6eNN6NdIf+/69f/mTb1oZH/v1Rx4/3pzo9aoKAQ1EmUJ+bpy0RpEYpKY4bKpFp5kqA5p7VuKqTAjRYn1o6cSzx4/Bwx1X3/H+N3zk+Oqzh4f3SR3NITDNgvTs6ibASusmOQLY1lxcadLaeAgGM7ckZuJFA0E9sZNlKggVoOz6lFSqoLxLa25LQKDZvH/z4f98O8QXxQqxDajqRTdPC2HbVO2u1AYdc8gGbdsG7irbQAEdi+ZFYhJMzhjCvr1zExsK6gHG6735Z46v3X71oqUG4q4TdbrUItHUwBcP4/njo/sWcNuexTv/xAf+9A+954d/76lf/9lv/OK9B15A3CNVZd6yhVCDS+Opy944ZZ+mU1QLMRZA52TSOhE00JKrSIJGX29lIEv//Y++9Yc/dN2DB5554PDzTeSgqoTiCSYwSZpiXYVxSnBoFeEQpqw0SZUp/E6lpB8BE4n1mPLUS0cOra4Oor/72nd86IbvPLzy1MvDh1GJmkCsQAxZypgO5GRlu4FOtgFhddSMmrFGbc3JrOSXm6QgxNrEKU2Ydzx5IiS0E+Hr0KEb+MLNPHaKePzCu+lx8xH9nIsml2AUwNmrneb8uRwrxU0meCgPE+nGnJ4RaUJ3eJ5KiQiTtXU1v2dBGlsNOt+a7ZmLxyd4cbm9Zbc15spAohVzpboCGrwfZNTwvqOjZ/vylt3VnR9/64985Lbv+/kHfuHffflXnzu20pubi5OQGndpGUlDm0wyko0F0pdVuzPvg5shWUYCZeGB6OHUKO1aaP7On7rjQ2/b/buP3vPIiRNVpT2XtnUSHpQKTxIjUtMIJYaA1FhQVw1OVSrVJXNnuaorETzESpdHzbNHjx1rmiqG91zz7g/c+JHDK489v/6gVkGoFMtygrlZ2RG7CApWIu8MtYlEFdbWtPFR5ECh5pmVOpNla+475A/ITrJSIXAHtMt6pHBT0EQiN2cwly0xuUxdoAuvU27utbpB4ixTqCF1Y2Gyo0nsWG3hIi4qYsnnFvpzg7jSDiUEwtkMr909f+DwyUHvmv2DdbRw1RaNewgaiBDROiLQE0lD+ep48khP3ry3ft+PvefPffetH/5nn//Xv3Lf15OHEAajtlZvjdQgNLeMC/CSy0lHK4SuUEwKF8wb13x4TT/9vT/75htubX/pngcONMcGdTRKa93SSY6xUceNCRBDMEudID1doKQKXUSFUQB3DaKhfnGpefbEYcY4H8KHbnj3+699/8Glh5+0h2IVQEJSd0Yi359u87/AJLRQ38LYUPuHVk4YrWLZV5Ku4KV5/ueUznwqd7CB4yOYsehXqm5k3J45XrgRe1Gb/B33qs7QRIoUDOFGX4iYoudF9TR2/w1+fy1kcq4Lc3VVo5mMJYi7JLa9tH71vt5Dx49+17X7PbQJHpwIyOvtLu5ZU9pNsQj1Ie5dbR7shbddt+fjf/9Tf/u7bv31f/TbP/Pk0vK8Ly4zle1KQBx0T+6AqMQ8CnCnKnq93mg4FGrfwymMFnc3f/e/vWnftZNfvuuZU7JSV3OtiakXdRkROiTG9UlSjSHAzGMQzTMFqAuyrH35nbReqMesn3jp5NG1JIP+HvS+96b33rHvzY+f/OrLzeO1LsDZMkmmkuxgVURZVs4829m5VITuxkTueuHUsUQB1dwy/IREVqcEdAbjBHqH9iQKi0xHRSxnTHK2G/V3HCMdN38Rm7nE2edMc7htXfRUJXpDLWFa+E4FbqcLK9PZMMqyfIbfuOZuvflcvxeDt2wUNNEErrvN1+M39sNXD5567xsWxcctgptXWpDtDgRxlRSYAgIJYnLKf2+9uX9//OjH3/69t7/u5v/5l//FZ554KvR7aJwpr0plekadZYwC4Obj9ZG7hzBZpyz00t/7szctXN383DeeGlPqfr9JCaohQzvKkafro0kQCcE9s56WnB9CBAWFCsmKGtqrT6ylZ14+seJVGMj1nPuBN3/Hm3a//qGluw+PH9Vqd4tEGiiaeZc8C8pqpmEpGAoFXRygQwVuntrBgeVTIj1L2TNnxMIAN5/C2wjMdHqkcMIUWKiU18gWqs3L89BNjpku3cD4rPgPBCOCl5uinRpDEISs7Jvhl4UUyiWnOnBIR/tGZEiMFJImYwyDEOBoGMyldRih683kxl1zc6F3zwvHoJU4W3iyrAraJjYtJy3HEw7HXJ/4qHVXDhouvTj6z8+f+jev37/rn/7YX/+R99+ZbF0HVR1DXatW0AgVDS400pJ6EpqRbAQibatohn/107dcc7X/0teeWU7u4k3jLTW5uok5LDG1GK5PzOEiiWZwhye6AVlJLHMC5Y2UGHsvHmm/8dTxZYut2F7pf+r2775p9zX3H//KC8OnGebotCISACvY/Wnd6s6iIJwyy49TnBNLLdP6UI6snqilNyFbY3JpjYnTYWXmARU3pNZheUZc+PeKsmD+3Zmt6axO6Bm58fmM7ZxguC1pGp2XVvHKzMwgIirnG5RNE2uZyqIUzS/HjFxwOUcE7qmqomxsThb2VlIPTo6963VXY33wwIunQgzRh+shtfBEbzw1nhqzxlNjTaJNvJnQWwaKHEx337f8U/An/vEP/YW/+L2fsMmKzIUeM/WWEszoeBpJUapapnWIo9XJj/+RN7z1llP/7u4nV5skLhOTVFSus2qfOLRpk0OSI7knemuWSsqdMcg00py10Fg9+Pyph59ZanUwnkxuXtj/Z+74wWsW4z1HvvL86EVRNWNiMs8qHPTO/qcqNuXEnupcki4cNZM6zh1aXl0dLYegma4905mSUiQMIHklsugWTwFRGxmpdH97UYHxDLKP2SzjAjLaW06Bztfb2R4Kb5tzYOlUHjKEX87BO30aa1UeA21ADzaiiHa1XcbzYAPpLAZPNDWxwBNrz7//rd/26/ffp72l91yz1xqzACtrvp4XZlBkvNSTq8LYqPiqH/3Gyr++ee77/vYP/kAt6X/9rc9D50WMAq0EMfgoq3LAC1WUjNaXf/B79nz0Y/XPfPHJ1bbSgcFChBASixIdFNpmtWojNCu/OKXAzqKqQhIE7rEfTw71iedXT47q2Nu9Pl77yBtv+vTbv6OF3/Py10+mw3Xoe14CKEQwJTLkqV3ZTNbCLFeQG+6ktO4JaS5e+8CpUeNNnws0zz1SUul5WT+nQOpeuNk5lXntRNpUNlTdNpNGXAZl7K0VwZf/grrKaWMZQE5jYT6zqPDZgtsLrXmpj52qCGX8UpR+8+lgpMMrD5XXR8Lx3vjZT73tff/hwc/2UN1+1a6hj/MAOZj4lM2ZnYYdzEE3BMFI7LGTv9WkE3/1Bz62Opn81G98odIFYXJoDCpRbWSkeGKIOho1b7qp96d/9PrP3Pvwk+t+TS+lyYCh7US5AaGYNJ6EDCIxCJJ7kDDDcJodMgQJ1eDFA83DLy4zDGKvGQ2bH3nruz71zjvXmtWvHvnaSjpZ1RGpFFOCbnkC5LSJDwUUmUKUU0wrSbbmolbJvicOHU/mTOqW/0pScjMrgsGdaEORSys0lBkwmI+UlNeSLinW+GKsdMu8QBfTgt1MM1RmpIQcQtnQs94gGHWfykyULYxCy5xJass25YbcI4UTN0AJQ5HwFQpohEUZHBwefuvuPd//5vf+0qNfNTS3Xr3gk9RErTOB6MaSlECMZiIwN2IsDEnS/ctfHHv6mz/03c8dO/rzX3pyX+yPW4440iaoBBJBmYzQ9OM/esP9Lz//lRdWFxYH69k/Xdv8+QJhioIeNcSITBRX0DaiEIcmZ1214K77H1175oVhWOiH1Eprf+o7vv0Hb3nbkdHhu489fCItVVVMTmom8YRIEBYu7QzhJ+lCEXi3zpYRbUF0Yq1I1RdtJvWjB14m3VKb6G1K4kEploNJxnd6OSTpgGQdJwBQpxQ1QDLBWhdS9JKoJW2Kc3Ybg7AdhKpu07+77idkQwCYpGgZ73UzgcLXOUW0s+OoQWEuQNu2eevRzLTInBfSLCQJIT588on3vu7bv/u2d/3Gk1+z9oY3XbPgtj7UuspY/ewAU7yAGWjm4khmSNp+Y+mzUfV/+ZOfePGFQ195sdmLhlZDlGZujND11ZU/+APXXXvN+N//ziHt9Sw5NCt1M5T+ubtSRZMQgJEwImRF1CpD3EDO9cLauj/66KHDS3O9uYXJyuiqPfVPfPd3f8eN1x9YOfD14w+dxHKloU0epNA5oyMrzBgRFJdgJvMvoPIMSgo6aVqnhzAZxMVDR/zI0ZNxoRq3rZkJhVn9u9QiMqWGdnTk9J0ARmkWOc3drSxEnL0RprMt7IuzwPPti22ZF2gHx2xntLc20U0SbiQ9M8SamcKt8Bj6mVWDdC25SkkqNMMap9MXgYzGY3eqaCb3EyMoVoQjPEK89vuOPfTx6z+UJvYbT39tIje87ZrdqR01qhucKSglRKePam0mSGslyeBzL/3699ysf+tP/1/+6P/8/7OmFhfPhadzbdLsv8b/8PfKLzzw0hrr3UTryKbfFXECIARUioYegjA5gpR0PSYXN9deNX/k6Ojh+5q1yd56ASdXJrfftO9vfP+3374vPnnqyW8cerzBehW1zRRgKurdPrW6TNNILZOqglYt23UC1UnbpjZVdW223q9ue+C542vNaI8vJssZoGamiFw+C8S9UEB0rd6M4MpnluSaOhOJzq6lbinH3hSZyAVdaAsqkVOn7LjQttADnX3V2XX6xcyPZ9V/HX6Gu+cqufDCdqdhR8JZxNsIGa6P2tZDjF7qUph7Ilpn62ySMXHFTn3u2L3f/Zbb7th3w5efeOnxQ6teR2fbWpM8JbfG2om1jVvjNkltY94mG7ufEkNqJsDvPPVr77wNP/59b19ebaCucJqBbMejH/7ENc8Pj93/wtqcautmxmSekqfElJjM2+SW0LRGihmSsXXLkTRZSCkE3fXcU+O7Pt+cWO8xyLGTK9/+pn3/4A9/16374mMnj9914P5jPOngJEkymjF5+dM6k1lys/xPN3M3R+4jeSdPn5INRyNROFU9iu+959nnWLkkCYyFTcJzCppVPkSzauqUogOgmefZcCEPLSOVLvxvLbZehuFAvJjCdzNLylv8DJk3JxCJdEgs7R3khiKosC4bydpH5VfntdpCcws4RVxFU2rNoPS11dXxqNLQo4MQJ6ykwWVxzJwacHD95QcO4Q++8z2Hvrb2lRcPTOzqW6+fMxuD6lQvSqhw0qxVSmve0pPTPQn1RFr93OO/+6d/4Ht/6YsHXnqpqYMIOR6119+o77gz/PsvHlfE5A2Y6VeEIiHDBkgEUYMFSUBQKMSYzHuZyqqK/ScfP/XMQ65hoZ1rlo+v/5HvuOknP/WeXerPLB+968Cj6zIODCP3IImqBZIppCTJGP2uT5BFdOJ00giqoE02Go9qjereui3G/tGT/sTB44Oqn2gioKsbQGHr4iETvJMMZcirZZPbM3mruxUUoApUArxQkG0mX9iMzZytab09b7lC5wBy+ifsuAdl42hS8Rl19dIe0dAlfLmIphCerNKwtra+ujKpw0KyPEsqffTWfeJsjK1hYi4hPrr88oHxSz9+54f29/d++blj33jmlOuA1jScJLPWrEltk9rGvDEzosk/NI5Sq5y75/CBI/b8/+1T7xqPhm5oqe1o8n3fu+u5U8sHjq2JSGpohvLHaQY35H+mRHOY0YzuZtYbG1p1hT78jdVH7nHhYmu2cnT06Y/d+Df/4LfNsXly5dAXnn3wlK2ZSGswSCLMYUQikjOlnIi5ecnILJNbMf/EKNJau7K6GkQF6l65j+fm9j7wxNLK2ihAIWogXdzpxowGzaJnoZArIcu5kuJESnlBoIv9nvlDSbwCbebFSH1dqknwGfPgzSf0269pphq+0hGayJRp57SiYnq/ClNQnoNRO56UQAostyM4GrXLy6O5uLdpEiGWHYA0oiEm1IaaHA2Junr40GPjOPyTd35X7b17nlm654kTbVg0snFrvG0sTSwl9yYlI5pkjdnEOE6YtGiq6rOPfOVD75u747a58cqwWW/3XmPv/sD8lx562cM8WmNSS/REN7ohI+zpwUyc0hrblM00Nkmp697q/Xc1zzykEXtHabQ8Xvsrf+jb/uInb1v38RMrRz/31L3HODKVRJiKQZKIAUYkZ6YicRYyw+TME18nksEcoqFNaWVtLcSYdTtcNBL0q77y2MEYAo1Nm5KXkorIywCAk8k9FcmMqXCGQMwy+Dk324AyLt74cncq7eEMTubSOsArOsOl8WY5x6nQbS2dKeAHdKtf3XKkU0TdiLzPPpkcOXxyvr9n0qYmJaeY0dxa99bYOCbOlOCJnmwS+DvP3rOrzz/zgY/UDA89t/z1x5bI2qxpEluzZKlJNknWuhnZmDfmTYuJp9jwxeXxI8uPfPoHbk3jxk+NP/Id+5bT2vMvpqi1J0smZiXMW/aB7hBI5mZOihkn3kpIHM7f97vtgadiL/aGk/Vm2Pyt/+qOH/3Etc24fXb56GeeumfJE6jeYprut0ZzJEebmBxmnllM3OjOTHRV8pEYRqPxqdXVqq5Es+SMGSeDuHjkCJ546WhVhbZNnkuIlNi9SY4cglLmssAfkEte1ZA/Qv466Chz4ks2UjrfnPjSpkBbxcZtpQwwQZx+IJZ7rJIxBTOc9LMK7JmIrAipe77xGUaqAJCa554/NFftMfhobLSQ60t3mrFNNk5pZBwZxg0tVauc/NqjX7jluv0/+p4PNj554tDaNx49adTEZpK0ab2x1LiMGwPQGCfmyb0xb5Ip9K7Hn337Hb2bbpxH8jvfXd316LExg6e2cTUjEzyJJU0tLIEtPAFJ4EKm1jhxseCc6INfGB1/QfparY/GqRn9nT/7zj/6HddO1tLB9VOfe/qxdTMnmmQT99TCWrjRzNvEJnljqXUzhyVYoru4K+nORDBotbKyujZa7/frkIdVAhNxs34199VHD62uTAKFLnSGFpqE+b08TXFEpeFpRktMhrItIOIIpJojuSRBK2xyJ8hn+0DnhDBsEtdw8bF/x+YAFz4rtsWjeJpYRrddWm7NFPIw20jukNiYFs2ZXquotlMh8ZmnDka8t5LepG1AUY2tJRKWuZzIBIbclXdYCAebtV9/8AufevsHXhrf8RsPPf+1B/3QkfGHP6hqk7EHY0ODuUHYJm+NyaRpvGlgCQdW1h8/8fLb3764unZq7urek19er6rKXYrCWe7JB8+cv0aGoOZUlcb6gtTvm4x6933JVo/KQr8er7VtD//bX3nXJ9+1uLY+OrK+/itPPTxKqDQkeggKETqSlXRb1KNoyORugiAAJVCCmAO19mhycnVZhIvzgwKMLixdSmlONaOv3388iHprzLcXnrFA4kqfAnBEIOYmnSoxOrA6Rd0Nzrz849088hJNgq9QB9i232SZoo7sZCPSz5x0Pttm3fC0jpnVnRAPGrJqI0RR955+6qXxer1QLwzbpaZp5uqB0ZNbZjfJHqZgEBHSXFzjw6uH9Mmv/OjbP7xyavy/3/fs4Zf2tGv60Y+Z+7BNIVlqneYpuZupeWwsTFoZjW211S8+8vze11/1nYt7XzwxPLmsvX5wuhQEc4GghQAnnAiUIExozUO/Slybf+SuteXDWFzoD4cVeuN/8Ffe8Yl37FkaTY6Mh7/w8ANjV+lFIwO1JZHavCYQg0SVAFgoe1uap19Cd0jQoIO1kY2H671BmOvVWZwGwTOkimSs64efWn/u8Frd6zGRUURCCfdUs8x64V3iOUUicAoz8gIB7cq4GQTAlOnyAmXkVL7kFflAz6ljfcU5wDaTs6matZQp7FQsY3ombLTMZrfmpSNDydJDzBTOFqIeOnjk6OFTu+f3vrR8mFVvddj0BuqWQZc096zyrEJKUhNBCFJ/7eUj89Xd/+1H33Pwefzs55776t391uSjH+2bjZqkiT5JZpbIaB6a1keNNxNPjR44MXrDvvXb3rtw77NLhKJILDJvaU4rpaa1Oqpb5u2PUgkm9WNfGq2+hPn5erxWx8Hxf/DX7vz4O+KJ0erhxn7x3gdOJtF+FYeTBHe4qsQQooag6i6pBAhSNeQ76RCRWFUtwqnlNRBzg1rUk6UqhIK10LwNZGDvq18/MUa7S/rmEVm8FeqEG5FXYTbkP1xFs1MTblnQjd32BgsZPK7gxzaL4G0kbZvtAJGBManl/gGEhOUEnwKH+VkE86XbplPu/xzMNEYdzPVIwqRWGZ9Ye+ihZ3cvvsFSA2prWF+dRK0spcY8OdrkbWLTetNgbBylZImi+hvPPvbEgYN/47/6yHtu2r9ykt/4cvOlz49C1XO2KZklnTRhPJFm4m3D1CI1kGGYnNKlY+NW159/aT0EcapT4EoTGGACAy0D69TNCJhQ6c/d06wdQL83GI8BrP+//to7vutdg+XhZM38l+579ODIzH08HA5bayxTTAQre2du7u6lsDZzc7e2VZda+uM1P3J8xYD+oFZhnpJZ7gaZGMzIusahg+2DT63UcWAuSb1j9ZIyQOyyGRENqkKIUXIt5cwDG6CT2yGz6iU2tPQu2kJ2GnGzZQeYIr931vTP6QsZgjbtCHWavqc5XrkGgap6hlF0k4K2tdFoLNLxN1O++sVHdw2ujxppjaqPky+vjmKo0abUWkreGBvDJMk4YWwYZf77Zu7f3Hv38fGhf/TnP/KGBT1xsvq9X53ce9d4bqFOro1pSmEy4WSCZoxmwslYxus+XsVwfbS2huXlBEQzursZablcpzusdTFtPE3QttoElYP3TE48hl4Vx62nJP/of3zjd71f11ZOrrP37+9+7PkTq4rQWAayBULNkYzJ2LrnJpI5G6J1t5SUjDI3mciRpdVTw0mv3wuVOps8VXSHOd0dTJoiLEmovviN5ZVxpRK92+jyblHAS9OnYBUzA1wGaZeufyFIlAyBEBT7xyUe6F7MzFi353/n3MfZqRnYVOsInYivdBqkOI9Ch8wkRZjCsVzoIZNJ0IPW1de/+OjoxGDf4jVuLd2rGEdNOnFqWMWeuzdmLXXiMk4+SZgkjFpOWhrCi9b8h6/cte+a9b//k29fsLW0PvfZ/1OeuK/dvTe609ySsWk4GvtkjNEa21EYnsSePYO1oY8mwmxDVrgEQXEXS2wbE2hriRIqGZx6rF16CHO+kFr4cPg3/ocbv/vbd60sraVq8Mt3PfLo4fUQek3y5Nq6NgmteXKaizmSoc1NF0cyukuMfWdcXmmXVybUWPX7nlfJ8k4MMh4ETrjAXUJVHzgYv3rfWq83Z20yau6lpdYtd087QBszgGhq32WrWAWSR2AZBGGesaB5TOab7O28oszcNrYUX32T4DI4FDkN7Hp+zqMpQ1YRsMhIFIRuQFOZSRX1xAvHH7nnpddf96bUGgFaU9e9sWHp1DBWPULbZMlhHlpDa0hJmiQTG/cQ7jm+8m++ev93vXPP3/jz75iMlidr9pl/Oz7ybLX/qmhmKVlKqWnTZMzJCO0IkyEWFuul5bU2dTiOMjOCU/N+LTNhOlGHevWF5shXmzr1TFfXV9b+u7908x/7Xhw8ueb9xf/8jec+f3gpxnrd0sTYGnPUt5RnxjSHQYxo3Z0SJdJ16eTo0LH1kSMO+qKS0sRcpn/yxeSefgttMUGoPvf5Y2srIUojoCF4sWDmnoQbUdB7gm7frtsPzjkYsgbhdAVsFgK0eV70y4MC2jEHOAOzcEZysqU0qYBApWDoLFOvSon+qiDgp98ZTrfjCWHh9lDkZqMDBCPosCRUOH//N++/dtdtAdIwJcDYDnqRKieWxkHrUIlZq+4FmNBaSt4mpMZV4u8++vJnH3/+T/zQ9Z/8vjek9cnqUvztnz0ymsQ9e+cmE2uISfKmaZqGbZPcKP1w9LhHqBjhQShwgQMGuDgB1dHEwbh+YnLkqyOu1Qhp/djw05++5Y//8J7jRyZhTn/nwQOfe/xw6A0aa5Jpa9IaksMMtOCWCRqkadvkbR1DQFxft5MnR+OJx6ongia1rXuimnlK1pq3GRZBMYcZUptiFZ99fvL1b5yq69qMrQYilS0IwJN5WxitnJ4/hSWn090yCmgGE006tUPjCsSp8MKGd+WY/g44wKW7XJkKnsqsb7BAHs65Dd390MuwHlNFvfyXKbnOL3zpsw+ePOg3XHNjO2mNcGcyDyEwyrHjo3ZY9aueZyEUo5kmQzJJLmJoUP+He558+cThv/VXrn/jrS2a8PKj1ed+dkmj9xZ0PDFLbFpJyduJ0x2KlVOtImQkWTeOBR2pNRq8ZevaJD31NUyOhtiz0dHR9/+B237ix/cuH12Kc/Hux5vP3H8o9ueYIT1WtNrLDjuDuzB5MJ8PdQ/16qnm2PG1UWux1w91lehNSsmYPJ8bSM5kTI7k4p5XkEkg2fxv//qx8XBO1J1ampgIgghqloGhI++CzWxdc7YL6eRpqQ5LxSiXRvLxm+AA26b831rRzOlSWMlqtOsvOH3qG+ctBqZfzXT2Uko0VHU9OrLy2V949LYb3mNNymwIlkdIQep+7+Ty2tKJdUetEsxS45Jck0vr0rpo0GdX7Ge+eGDP3vSTf/Xboq5XXj3yWXvoc6N9e3c7mtTALKSk7QRwgXA0JChICgeTuIm38AQ3wKVtrBekeX4yfHbYq3S43N7+joW/9tevO7V0RCp59NjoV77+VFPPOWHUnOtnoFtOY5IZKXU1iNofrtnSsfFwBO0NGEJDNxETMUeb2CS2ztY9uRhhjkRpKcl90vpgrn/3N04+/NBav680FQiobrRUshrJbMN5yssCws2bkBlWUehSvEvzNvYcZua1Z4euHc2ZL9MJcD7c/9by+wtfrnSHwOkfb7rY6jM0A1lEfvZEyuxO2kHoOlVsFShpMlf/ys98jet7r96/b9K02ancwURyVM/rsMHhIyvjcer3ehRP5uYwlwRFksUQf++lo79934GPfij+oT8xPznVBJv7xi9Oll5Y37W3Hk9yvSiphULMfTJGBxDIuyGEZ20VYYLDfBmj+0VCaJp2cY/8P//eHXV1ZE3C0bH87O8fPuZ17fRUGr2kOtQpuawcVCGGeHJldGhpdWUMqRe06rWpbc0T0RLdwkOulWlTvJDTTJJLaxjMhxPH4m/88hHRhUz2WxL9DCRxkmKJZl5oiQsTU+Eukin/Rj6GOy2yWWPPJcS3yBzgnOYrp6+rX1jL+8IuS0GAZs4fmOdUsjN3CinmSgTVjDunFOl2AOJQZt5laGlFT+fHxWPjXH30qeO//bP3v++296d2YoBJMjK5G7VNEmKQKh4/2Rw9NqpEYoXWG6MbkWhECNRffuTYU0dOfvrHrn79myufNOMl/eovjswqjcIWcNKN4sMGqXHxvN8YxAQuntXoTKzxOlXDx8a2xijBRvaTf/PdN92yfmxtPdTzP/+Foy+eGAOhaTPvSKSHTARknub6Yb5fL6+0h4+spqSD/nyMMXlq2za1SIlti7Zhk9ACCZpckknWdTQikcnYJKtCGOjiL/6nA8eO9GKM7kIGp5jBvAjglS6+RmQhDDN1Vy+0P2bZOQmKmAVS8xqCaF6hVKq60OEZqYvcf/KOYXRnjoRvAhhuk2fFxUwMdIZl8cx6uhsMT+O8FNGu0j5ioeOXjhchtywCXeNi+Nl/8YXJ0atvfd2NNmmVg5yvWuaKMBewrgaTiRw6tLq+0vTCXBRlmrjLxFSk98KJ0a/cd2JxXj79E7vFU2Tv8MOT578x6s1hYm1yN/cgMbVMLZlYSNmySZmEVI05Eog9r6MXW+ljfHL0x//Udd/7yfXnDx7c09v/Ow8evfu5pdCba1ozl5SCWwYZtH34Ym/QjPTIkbXRpO0P5mPVyxMAdzfCnG1ia96a52ZRcrYZH2raJk2tpBTH5nOcXL9r7vO/Obz368P+3FzryT0SWpi2Rd0zhC6TKzEv7QQNUlo9pcNfJnDmOenvBEQ2BkcdeJFX+gmw7e7N2QWxbHDWbi1vK2T7spExTqdbG79oNj/ihjBwNy0uWg0Ei3qwQFQkKEXcqbWuvjz6V//w999320d62pIt0BZu78waaDBLEiLC3KmVdOTwqXYidZg3Y7I0aZ0y//nHVr72zIn3fbj68CcX0nCktvDiXakZVqyQ3N3FDJ7RlCYsDiBMgKslV4+6GlefGNaqaSXd/t49f+Yv7Tl0cDXMLT744qlf/fIx1IspiZu0JomaPNGsHwfi8cTR9eXlSagG9WDORRqzlt4SbdmDKb0dcxglMfc90Tom1NbRJmmaNgDX7L76mYflN371UG9uwcOIaibJaAINEgRBJds6AFGo5O3HjC/pBsNumVyAQtAIh0CDaGf6pUIoBInfAinQ5XmUsNGBQWdbDR0w1DeAQDPnQ0EjdgwFZuakhiBBUYiuPLVV3F1/7ufufvB31979be8fjtbhNa2oU5asl9b6JLGVOHDpHT22fvLkpNIobnRTC2vj+JkH15rV9EOfvnrhOkc7Gb0YDj6WQh3MHNC84AsKDTTkfiUoZtZi3EuD4XMTjtV9sLgLP/l3b1jzlcZ1aZX/8QtHJ9YLTHADmRDM2xClqnqrK5NjJxuTQdXrEymZ5dW2ZGUeXOjlPJPMiTmnHHLJmGgtrLWkCNfuDoeO+L/79y+2HkKddbAXiaqwSlKkxPhsJOoF58MOn97xpzqzRmCH2JVcDZsZiy6ad/Iw8k1vep7DAbbHqLhTUIhzvJxFclwLDYGSQs/6tRnZGHzKM9b1/hWZ5lg0H9bmlKIxnAs1FdEYJERIECUgGub+6d/8hf7wpuv271sbjuG1mNLEHck9B2843E1E+/3BZOzHjyWVqoohmdf9+NSB8f1PDl93U/rYD1zla60gnXhw3AxjqhswsOF6k9QrJrqBBjiQ3EaNik1OTNqXU6x77erkz/x3b77ltrB8QqWHX/7q4ZeXtK7pHrJQO9H2qjo1OLa0PmmlqiuKtWbJ1U09SUoZ0EPPY90ckV2KxHsST5mbgnTxNtSC6/fKZLX6j//Hi8eXrD/oKesgtUgCIBqVCgclAJq35i0Z83DXmFImWKTn9F/V8ozPcguI7jDrlN4o5BntUZ3588pmdinhNlfuCVConmcxtTPRvQjIZA6sc+CCphsEpx8L3XtrhmnFQTzxwvCf/63P3XnTh3tBJtYkwF0y31NHayN0uJmZxxggPHG0SZOqV6vYZILq9+5rDy6NPvCJsOvGvjfSHLG155sq9nOLshmrSI7AUuDEjbkntPXkOe+Rk7XJ2z88/31/xF94cSUsyNeeGN7z2KQ3cEuVSTBKHXs96a8st6urKca+xpjczJk7oaWpb0h5C4xIPu30u5GJ7ibuIe+1pMR+xPXXeGgG/+mnj7z0rPf6c5YiEZm1VUXPGO7C4ckBodFSCehmhBdByG4rW09r4WH6HQGOKXH3lVgDyIau95ZpVV7xCNse60uhrzmX4GsecmVJ9GzI5/kVRZJBTmfUyvwRmQfcjNWuwQOfeew3f/rh733vxzBOyd0oNM2SS9ZxALrDkqfkAlHtLR8fjdaaQET1p45PvvHE+tzrmu/4Q4FjDU1v9PRY2spiSq036wghq0kDThjcvAqVHzUs0Wx3NW+f/gv7l5aH68aXlse/8/Vl0700cQoodeh5q6vLYyJUdd+BZFboo710aXJnlSLW9ZfMUUZmDkKtsF8BzoVabrimiZPdP//TS08/nAZzA8Il0gUIATFCg0AFmokzcqtTQygu4ZRi9zBzehbBLn86csQuBlGEmonXsWkU0Nl2eKnTpO20Qf2yILyLyPrp+f0GEbRPpy88A6JXrpBlXyO3knwqMZ9zIhGKOFkvLP7KP77nod9c+vhHPmzr4wzSLJQJOYE2z3RoZp7M6E2l9fopHa71B1a52D2P+ZFjuPOju3bfmjx5cxjrS2us4MbhqqmCLsgkJclJsNX0gkQ0k8mpj/+xq17/Zhw+MZlUzRe+OjqyFDS01tZEWyNO1pu1tTFCBfGUWisTiUwkQSsIzfzHu2QD+fjqNnw867Cajef64carYhjt/vmfPvnwA8vzc5FuYF+0DrGSECABqtm+VTT7bVlHhQiFLsIMSelmw5RZ8jLM4j49k3Mo/bR+3bdCEbwj/KEX8mxps7x5lqLOOoZCVyXEIac11LSUARlbs+EG7oV6xL2wH5fV7SCIqlVAyCqPFnr9f/nXf+fIvfyeD717vD5sPZAKF0KdgSZuAlcmsUYsIbmFGNqJN201H+aOHG2eeqod7Ld3f89eti3H0r6gyd2ktWV1DcEIb+lE0woijzVcadtx3H1N+AN/bO/BpRWvqidebO9/chLqAZODDFatrbZNQwnRSUtwRzJPZma0Auo08xLmidAdAOxIEEUc4oCRTLv7vdfvgy2Hn/8Xh598YG1+vm8kGUoXJwi7A1U0aBbfRtaFD+JEcjODgKC5CxGIwMK4UWghsk4nUWle+8ysXga4QoVVBhedkx7rEm2YbOZ99EoAJF0IFLHx/5wifE6jTMwnLE+D4p2m1KSSD+cpaFRECJHM4k8wMEjvf/1zv7Xy4OLHPnTHqFltHMbozFEwl8K5v5HXTWhmQXU8alJDMD785NrBJb7l2+uFa2tL2h5PMqYGa0dJNBooLmg5iRNN7gcRKD5KH/+x3b44XlnFasOvfH19YjW9FVdhWF9LOe56ymFe6JnGgk54brAyw5LRIaGk49El6HQ6pHVUOr56T3PD/t6JF8PP/NShZx9L/UGVnKSyUyXP8mqqGkLYOFNZhMAsOX2jePUy9oIlY95xn2qkikA63pROPt55mWYA28tN9Ay7P58u6o5WuBd0sI6seOY509B+5vbndBumVA7dLcgpAUSzeInMVmdZvwSqogziAnciVGzlf/vLv7r09d4nP/zekCZN09K1EOhODasIHoIOTxQP4/WkUh08XD/5XBP2j9/0wQqtY01kRWIINrKiOJR32iTKKeeapnG89u2Dd37v/AtHVjnAg0+tvnQUIYDJ2cpo2AatvZi7mJGEGeiKDlTHjGf20pnp2EpyCM7S3BQfz1e8bs/guvnB8/cOf/6fHz9+UAb92tzoA6AiAhCdSs+71OIOES1o5+z5yd0yK5BOO/rdhpd02deUGF27SFTgjB3+L1cM4E74gZyrODznWvBmQvmV2AWSs1F0G/qQBeRzmg9kiHrubnYk+iiCEBvH4EwYygLCojEUwTgaag2c+1d/7YuP/cLy933o3Yv9MB61cGWBNBYazelKeMF1mrQTS23/2efGJ8d60wd71W7jCGnZgtY+IbNorpPwqunzuLskcvKxH1lkbcnS8TXc/whNaiXRVMO1SQjRuhLE3elwQwc4g1np0rhJN5AqN8DLpxRAY/B989UN+3ReB1/+Zf+1f7XSnAr9KloSQkUVGkRj/qeoFutn7lYJoLndmQsmeI4pHfK8E61SDV2Eh+fjKR9KGecAUQlFOHnneNEvZlx77jnABcL8OQ8EmdFvvPBj6xmPgAwOz3mNF/o2BQSqUKHSRRDyP0HtyrIglMigLuqS0UQBUmmIoqHDxomKashfH0MxhbLdau4ioV//yj+++7f+yfPvv+1tr78xro7GbSsZgiyGmXyDFDHSxZOzqtLRw374pbR4g7zurX1LhpPRpPVknIhIK6YkZJjSevSEvTf1bv1A79jKKa13PfL45PgJaKC5rI3GEoJ19Fh5esDSePTCZZdxHQ5xSN6Cyf0g01wLKTBXcc9u7N/bGx6pfvunj379MysiPY3uKbd2aqgiBgRFEYgUOoIERSjHaSfNwE7nO6sO5tVmdtqPnSsy78rkYFEqsNwjyjlJ0asNF9iJ2Tzv4IXbklt91WWiRdmGhsCUTy+bnErAlBLizA922gfPIuf5bOtaE8qZEhkd1lpUJUaCNJQRs6Ba2P3Afz54+LGlj/6lm3vvah978LnUSqUDbMw0MyUys0Qf3QBaql94brz/6vp1764PfC1hrbFRLbVpcslyHC620oRJzyb6nu/f1VbjZm2wvJYeemykYVHN2xGDRhFJTZKid19aubkvC5VCzOtwUSlsswIPAlE2AdLv69y879qFAfvPfT7d/5trays6NzcPjmgVAyACDVAVKLqiiEVWWXNxJBosmUCdebtIzAlRp+XIdBrOp8NFiwjzDJkAdaP3ydOP9StwDnA+epaLzP5PY4PZ+ntO51/dnEXOdxCdnQVOq93yt15mwQL1zIasIqqFQiIGD+J5PuBws2pPOPpE+5//hyfWv3jqzjfdvP/qeuinxrOtFZZiQBwK8ZaK6thRHF2y+dvawTWaxvBlcxpbFwNgwZWr0Rufv95u/Y5qac094JHH1pZPhRibdjwStaiBbVlwLGpmzBA6gSs6PcySsuduPQgYPGmtvd26e5/um+8Nn60//69Ofek/HbO11B805JCAe89ZUyrRKCGWPesQcy0hEou1F9w/3LxMwfLyex7keRdJ5DSeVoJmnm917sZyKtssU3UpYBNzoQsYyYXTildQHjobT7n5E2B7xEMXy9olp+mCnX2QnU8XZEolPQMf6p4lIoE6/WI0d7hVq8hO4xPu7hbngyX7yj8/eM07Vt/1Qzded/vk8aePTE4CUYnClJ8JD+BAqlGlSYODB/iGN9neN/vLh6u41nB/8GQwQBNHwLBO7crt79+ne3w4btsVeeoJH/RjO2qrOJd0Iq7uVJWCyhPJmURWhxcUjq/S1Q1CuoIxYK4fFvbEhUHdHAz337Xy3D0nfdTrDRZSnJAimHeYVK6hkqCuElRUgsOTedCQKfRCiF3zx7ImDyEKdcvCImUl3rNWMU+PO4W/QzowbnkGHVlZ8oo9AeL2Jriv+Jxt7o6BEFgJ1NCgOYlk6UrIFCCdlSFxrlWE4uvmoqrIp3O5XlXJsvJOyyoaDhVCXV1JWkctFMxEVOL84OjDw9995pG3/oHXv/kjN760e+nYoXU0MVCVzMuwJBicpjGEU0ds9Lqw/9b48pdHNoqYQCyJVxTDSpT1JHNy6/v666sNfPD8M0Nv5ypN0EhC2UtsIZncJffc81qllDVooZKkige0FGFVxXqu2bUgu3r9dhVPfW74/NdWRidRV/3QZ/IWFkQCIyVExOAqorkccpeYI61SMpshreh7u7uU1lrKRH2GwvdfUHCF3S4jPHO5xgAwccrqlscKyLRCVkCGRatpRzBjW7e0c86v4hXolBsAn43tx9MMnWfFfulizixoVLoekYSN85rdN5cBEcJu/axwrniXqDldiBQGEtqFh//Pgwv3DG74xL4bXr/nxMrq6PA4j1hRJB8MVHg1XOPKybTr2sX+vsn4OKpRRgFRob7epJFc/db5+dfL6tBSGh1+URWgW6zqNqXcY5UytSvsj5l8pGgaUZ1KV41tv+J8vxrsinP90J4MTzzYHLr71Pg4e7E3N2gzNwTFhQqFBpEQocG1q3xE81hQSzhgCCHH/imYtuOU0ynqEyJwFikeBwRZOxUbCQKnW6zsEv8NfO4VsA9wtrds0wHOx964MW/agS7o7BtidsEOp4NrpdMJlu5YyGvEG98CZ7LAfI5AQ36yMw8wPUuQBSkbfTmJcjXC1evB3PD55smfOrT7zvk9H94Vb8TKwZGtJWWlLi7CzBKLavk4+9fZ/A3V+FDDdYSkRkcSjgwq1985vypjs3jk5cnq8sA56Q16bTJAzVy1cMxiw4iEFM/9FE9RZX5QDfZyblFqqB1unn3Ajz7UNEsT9GLdq0zFUEF8WugjhO5PJ76sSoGEACkgoaz2pap5Lyj38rWTFO8WX7Qbp5edjVwNbEQWUlQ74gLQLH8L0jHJCXY49u8ITCFu25PO+Zt2SuRj2m08+4PJ6dZ/xub1bLupY8wt0mxTKoO8Kla6+qqwQsALzSIDoFvGDAGM5q4pMYVeNIblbwxXHlvZ957de+5cmPTTcGmdKWRKKEoLiasn42D/aHB9D9LYusvYpS8+dhuz2huvfUsYjoytvfSCNs2414ebuBuLpitKXzJnPHAAYgIIe1bPc/fu3sKeQWh1+HB68b7hiWdHaZiqqpJBNv1GoIHqpdWrUNFQaYgSowcNIhKUsMx3m7tLTs/dz9zJyfhVKRA6pVFKBVIO3zxr7J7J6VENgCXblCkxUNgYv1+mTtBsmbuZQBwv3eGyzffJQlIlD5hqXpxWyHsOLbn7BnTKtDo1fEjREevuhWzcEwjc0VHN0XwqTZw5eKmCqFkAQsShmtMkJ0jTeUWqjn9htX52uOdD+wY37h4vraX15KjgJtpMhrqyFOI1FueRJkHWPc0hDiPWff+3adhfWbLV47KyDFRmWqemzWuFKnSRwgosoEhwNTRepfn5arAvLs4PwqoevWt44pHR+guGBqEnVS9SkT+EahTmdZYyONGoCIFBIRDNdpyNlR27g6hohzCHk8P1Sd2rqkpJk4ykA+kMkrl9SBKhdEhLRpm5vrTcc3ejd2pgvjGD7E5uvqInbCmE80xGQG6peROvBKO/cC+0jNZl5jduTHdnI31n/SXWiHcxvvsbRcFrgV4CLafsTZCsvJdLNwhhzHVCR8aeHZIQhEFlB+XorxxeuGN+8K49FkY8NY6uZnDacAWLC4O4V9NhQwtlsFEC7erbdjdoU4qHXxq3bezP17NKE6Vt6FRRCFKcSJB6oNXeehCrcKg6/sT4xLOr7fEQBXVfU490WNZ917z0LIV/QUSiUkVC0BioAtFyo8Di+XAR7aANxY5T8o99Yv/zT7UvvbBS1718XZkeYoMDHaBtLGpMI67Nlg/TgUxehfErdBngvA5wzvTmIuX4tlYCd238qUBqroNPRz6f9pyitTstwqY9oiwcILMFWX6rgtOlKuBKpXjmK6AKSztSAEgokUspzP15IQepP5kf3jMZHT469659/V3VcLSONoijWU9pl+q1EYeTG5DExwy7OLi5Gk7Gzcn+sYMukbHX83HjYtN5nxgo3oQ2Rl2Y72F/iuOAx/Tkk8P1F09hGKRX6wCUZHSkikoooCoqLgJBUJUQoMjr6wjqiqwhK4VHw0IIIjDodHVaCv8hlOjX/TQZCQV5wTcPzDLbvPm0opWpEG0nXeUs2I2ys+2SR5kC6Y6LS8Ohdp5C9NLWAJenGXT2mm+pPTJoa6asmhUcL8oa3NiDgU6tX7ujoGta569FlZYKG5d24xrN+VJZQsvHhbgy5B1wbesErXi4Gf7ekfodi/2b5ttm7MnTBOPWqqtqYARTNaSRLNzc8/3uYz3x0qQZx/4+WDJxSF6ZymBtk1Snak/s7651aOmrOPHo+mSp1RRRqfQpkiS5S00VSIKEHObzZ9aoEKWqVkKBBBUtmlKF0lYlSHBzKWldgbiGDbo9fubnDvT6vaqqvDP3nGqeBrbNlVi2dXZ9Z895TqY+KSsKBZ23icJ0B/lRthSg46W7lG2avYCMYAIpVGF3RsvG7oVK14DsvoBphQYQ4gINIWx4TlaozU8wn8LqIF4ktd1VIwiqkxYQoGUQJAq6Z6oJIaEQBxXqweBqJlU019G9p/orVr9pcdKO2NJPST2ABuFY2bYw3XtzzyraCT12ZCxzMbKy9UZUXF1d4Za0RVWFQR3Xw+SJyfrDQztpIlWINfvdSg9FYyUCiCGIF85UgUpe/BdVCcqYp96S6xjNgDaS7pIH4hAUFTsVSrI0baAN5qLmDD8DfuidFupUD8ZlZgycX9VR9+UFeZdOpTyzqQugxguo5G3b5C4+GbnkJ8B25Ws42xYtvZwzwFIlJm30nRxTVW0XnMalLt1oWTvgCspaQPniIVqkVKikAypaoJ8lIWO3rg9HEc0SFgSfVJybPD30tVTftNsqH62PtT8XenXyoTeCiLkba6a0doLNyPu7q9SkTNgoBuGQQUJ/IY2a9sHJ5NkJTpF1CFXVaVuXpBCqplkOUyCCoKJBgkhWD1RFKP6Qh73IunsZIq2arxqz+Qs9x+wNviWDOQt0WcSMErxLdboQNW09i+Z2mpmVfJJeermZn76wMl3y3fZt22HcRid1kznWVuvxmQtA9xV5gQTIVCmjUKbn6lZm0CWiZZW+25IRkBq0mwyga+adOTzunCdD7oQEc3bFzLNupdrOS7EqhGwAvChZfKONUBk0R9o0Ojm4be9IR20wWQi6olirZX7M/W5DnjohVdVXl9YYRDOhcjOYi6OAh0f+/JBrQbRvc0mcQhFV75BwCMqgCAIVwqGiMSv6QVQkqsZQKtOchgglQJg7QyQ8r7xnc1cVcweVtFz55/yQNm3BgaAQlhydYEnhS5wWxMrTQkzp3nb4bGSejgt9+5vHE1yAj/CbcAJc2KAv3tc7mpnZ+dfGX2HmNNi4ko6nbKNKnvVVLWCV0924g+/mSZmqgxKUuU1KZLoPiogr6RAvTfCiCkEBKa6eKQ8RpOJJHz2zXN+2mKJxkeFobCYyf1vgQMbLvr5exSqkSRMopFutIjE+Zc0TK75mqhUqmiahgOrZ0XKYVUVA8YGM4wxdhz2zwQRFpgALIgoqNQiFeYNCdAOf0zUZ8oaKqQRASe8CnxAIuaYqgGeW1xJaGOwFLMGipEDSVRrdKFsBOsvJm0cvVyQeaAtdoM0cBTtwzIkQLV3zLS47d+6FsW8KZzjtAjoIYaesx43nds/Ji1IK5+xnhEp0dnTqXnqKIg46FHAXjUJS8mZXhAABdFc3sGNj9KQlOyJ6wU9aem5N3zYnVW06RvJ6f0ya1paEpkDShBQshBhXpXlsbXxwPXqtVc8kdfoIIuIUEQSIelBRhBigoIoooJCgHgQSJAjUC4tAUKiIMMu7kKYiEA21eu4L0AAhA50AXdzgkdkMlHSoBBECGtRSzukzaNa7BEg6WZgiR+JettDYQeSmjCkkrMjIEFvfCJsSg2+Ph+F8ncxZo72sXaCppOnmz4ENY4XPZDtTbWCdSqnO/paZgTSnyIkpnmIKlCinuUqH63KWJKoCXFUA8060iS6gl9GEa4FDM8Appu6tiNNNwBiqtDSJBxqZD3neVl0TrZHhioFm5lQjajvQpseXbSQh9KA0aTPhCwCqmEJUVaCZrSdGhgoiQZME9QgEVJk7RsQARFdFCCYqhkpUQ8xxX6CQiCp0Cy4ioOTNMqRcpxKi5qaqIERzxcxycvp05/00DdPpLpiUk5qSE05n6Dp0zGv6zm2PAjZv+tsLvnGnMBWbefIZazHn8QTOMJhg5gieAcCd/oQNGPns24pnOtmNPmnejNnIg8Rp2Z3QLbGWCGcgNXmmFW9hhClMsSHDQbgCdG0hLrn7nrusuWqxOh1o6jdUqCLEw744WUG7DmpL6aOt5Ynl9OKE0otRSKcW3Fq2aAdgzpZGMWSqnoTQIBP4CBGAINAIbaCGoAhEVFQx9GKlTRVD7EUNEQoJELXcHQhBRGHmqWFqCVGxDAZxDSH37d1SKZIBsEAeupWXDQWgkAVfM19A/mbN81jGc03MzDQ8Q0uz03XtGZnwll6YX3KFzgHKnEs3wrZgo1md691pzppvgnf/kU+AgsRyiTESntqkWgZahTldEhQaVERSYpscyZC1dymoUM+F3bvrxYXe3EB6c6hqC3UMKiTaNq2NfbTOZhiGq+14pWnW3ceKFBGJ4KIuE/gRN1VdMJ2vR8uTNBGdc6x7++CaLTcx1FCjChHJwJZmBiYEkb4Odoe5PTp/Vdx9VbVrvppb1N27sbigvVjVMfSqGERcFIhp0l9dkdW1enXUnFwbn1gdrgyb4WS9adZczHsaVXtBq0E9qEIVVRBSg1FII5hTVMQlkz+nEiDQSRlImNrW9JbOjH4tp00ABTP1dUdJtMHj0QkLv2pqgM0fAluaum2meCehjIo09eoOspt1FhQb6GiZSvQUlUhsFAgUyaPg0sJgZAYZKFUEmeZyDKQJgNiv9+zW667efesb5296w8J1N1R7rtLe4vpgIcV+4+KNt2NrJuaNYdRiNLG1sQ9HHI5lbWirq5O1w1w/GFdebtcPtmtLjQ0hNueTFBJlX2yUoxP0iOpkHD96wtc0xJ47mSJbQl0WuXBtmLu63n1Dve+Nce91uuuquGsR8/M+Nxfnqzio2a99UGNXjbk6DmKoY6hDNYhz/TBfy3wVrxIuejPfjuv1kS6vNceW0qEjo+cPHXvu8AsvnHr55GQZOg6VhxhDXavUgtCI2Di1IiaZRAOSac4zBoSgGzx3osXpmfInF1uO0qBy94LY7s7m3ASdObF1Qy+VW+vkbJ5gfPNrt7OrVFfcCSB5qqPKzbWhMgd3gf0QEnIN6G6l3rC2BVxj5YoW5mNH0wJW7RrcetPcW27f98537XvTrYvXXSW79o96CyuNj0bp5Ki11aGtj9N6solhNPFxY8MUx60PJ2k4sVEjo4kNG5s0bhbbRU5uSnId5t6k9bG58cscvZRspeXEevOL7bpNGqtPhPHTK7LeC4Q1Y6nQ21MvXB/2vHGweGuvvsbRY9VjXU1CIGJsidHY6VXqVakJVolH5cCaOg0DKmVQ64W21rUqalU9XWvdk17dq/cuhmuvW3z7m/ZW2FvjTS3etrqGw8dWnz+x9vLJg88dfvGZlw8/fXC4vDZeSz1D1YMEFYq0yaQbY5XKtVi0ZBV477Qgc9R35uNSThc/ytYvHV2RwBlCyAXGVgER29gmv9yDsM33izY3Pcgg9lgWDqf5/szv4szpNB0IlAiUXKIWmhuhqNAlNcBkHZrqfXO3vHXXHe/a/65373r7HVe94fW7BrWMJkurp44vr7VPHzhxdGm4ckpH62E88dHEh+tpvOqTSTIPbeI4TTI/rIGNigMh9hBkEtoEbYiGGFXgPtM5VtcyHJxvXx6l/RyvyuD4/PjJUzoO3vMwQO/aXu/mOLihGuwN9YBer1vFXvSq0n5fF+d6e+aqXujVEgJQu2mStqG7jpaiUkJGNDFElagWI0Ps11HnKhv0mmogdZz0q6W5fpjv1fP13oWFq9++cM3bb34z8CFARzZ+4eiRB5565osPP/G1x5599OnR8OQaNNRVL1aVaAGKujGodAIwhf4KJETdu60kTquy6ZeTC+mNAg70uu7l2fzFTHy3ITfxiqdN3ImY/coXt/k9gZxoalB0A5XZBnYJ6vTZOoZZIqlIJnU7LkZrElIrc+H1b9r1jne+6Y47r7rtzbsX9wwsjZaPnrj/ay/99q9ODr689sIL6ydPpNFwMlrzyZo149bdkbKYae7+lV5Mx7CVV4oVAsgIAkQJkRot9oCeSK2shbGyxXbuxvnJwP0k2+dOUVG9ua/XO3cHWRSfb60/Ri/0FqpBvwoQa2R0zMcrOLnSPjW08cpotMJmhHbEpnVLNJPWzckMT3Bh0XJR1SAhSIwSo6BfVXXs1+wPvF4IexZ7+3fFa/YtXrV399W79169a/e1e/e+bt81H//gO/7QR94zQnr0wAtfue/pLz/w0t0PvnDgpRWOROq5qieqKGRBTEGlM/q8QFEo6mfgidMvKksLcAOaS9RVDBpwWVhld+wE2J5LXRRgQ0CwiqFfV2AS1am6CGZsfYply9xjGdoiEIqaGZoWQH9vdd3ti2+6/aqbb7t27+5quGqPP3LiN375kQPPnTq5NOa6IuUqwhFzVUzVPFCKIiKho4Nzdno0TgQoRAIEGceW/y7RPcHb0K6ZJBAOeASoMgxrYT1yALlR4nU19yr7qpVXItW4L0NMDvHoOtqV1Cz7eFnSKNkEbAk3iCJWUCAUthJVZYCGQFXkcZVkAI44aJTWgYbStpSUdxhTWHe1WCPWEitqQHbrKP3F/mDfwsIbrnvdm2/Yf9NN1/zJP/qGT//QnU8+f/ihR196/KmTTz938uQJh0svVjEEIMDajDhlMgEVodTK00FlN0KWgp0g8vowtR/6lWpzfgfYLmRmszF6x3iBZguI822EnSaOufWMKsZY1TW6tsFs7xldeiqqMxjpTtoFob8ge/cvXHX9roW9PXr18oHhfV+5f+nwEMMGrBB6iJDQiwu53xG67lEuJKyTOiSzGWepCci095lrFEhZVC97Nd0KogsQQ2XBjcktOOKunuyNvg+h7w7quoelwBHGK81wFT5EarL2aFREr1KIVVVTenREFt6KDPzL9LXugLhlwip3gcKFYoIooiodrKlg/kUiqyh1EERBpaqqDiZ3a/Tomr186OT9j55ICXCvq2r/7l2vv6b3+tf333fndR949xsOHj32zLPLBw9MTp1KllIlaiZTtp+ixzyDGJ01tQwBUohC4V5VlWoAW1wyLP3ZlrkZC4ybz21ms47NJEKz7HGvyNkyfa2TqiHGCLcMPpl14lkwOgtKFFncc9fi/NwuqXuDpuFzT55aPzniuIVJiL1QL+oCIC1h9AB3psZyRps7qMKy7mQZ7g9m0StyQ+6qpLoC6nTdrCBkOoiSioDu3qBmva/26y30B4GhWUt8yX2VHIpPzEkXZaAEhFhBgEDAgikJy6vxmiUZUd42g3vKwCLDzjrKnYxtToDQEiFULURKmcOTAdbA6tBG0ZDZghWwAAm9mr0gCTRYg5NLo0OHVr7+ZQXSwoJde/WevVcv3nLbwnAyPn7Y1pfX2raFRqYNUFbWyJvy+UwR7NqhFV0AsxjjGVRC20gTzoYGnXMZ4OzAf4Hfu4UTYDa67yxGb+bDCN16vf6uhYUpbnkG21M4Z07rOEghOkjJjh3xNBkiMUgIIUo/FA57H5qXZQAiwb2gfdyAzN3cXUwX6qe6qnnLFWHKGdHVAJ1juxOqWZrL3cOuWF+7C3vEMeEpHR8Y6xo5yjO3oJEMLhKjZnBFgT1JTq+ltLKAkEUyMhyInEG05sXNAj3I1PDdjyWfUZkdvbyTSBGzoAEhTGXvMsRDhEALV5qQotCFqoc9LRmbSf3cC5Nnnl+VwMFcrz8Xe705emNQERPvpIKnwbHTPZ3OZbrdOsB9cXERm9mGvOzWGLeaP22JhmVLl5jvnRGqetXuPTBo/kpLT4JFHxIb/LiZ/4eAJx+NRhBWElAhazJ6yistJnlDNc8vwemOXxZvyb3tGSIP5LEOzlzknlI+CUBoEtZCURgTHK0uSLx6TucCkrQHm7SSdCxiMBFhkIi8b5CdPEP1M+cJOzrs02j6OoUzEekYOjMONhRlqEzKk7ccmd+n4/+1TP8eCEIFQjbwAKp1EL//f3vXHmvZWdXXWt8+99x7585MO4+WKe10SnkODExhBlvKw9intPVBQgArmIhiNPiIhhBJFDXBqH9o9B8U/uBhoUQSg/KoQCVtRTSKsVVjIGJEYjuFPqZ07uM89reWf6zvtR/n3PO655w792xumnJ77t7f+fZa33r91m8hEDmGFOUx94S2wiSSAQOiZEsMYFAw3+TzFzaMIWMyQCaMx6qkAQA6G47iomfloQfmyy49FPSk9sAe1vsfn7pqCAsQKUZ2BsVRvY4cOgSWy99AIAFFY+GLsujsO5d9UBCk+zh5GFICZYgQI/0BPzfAmxnP+0bRBXK2Rk25xayRI0huyZr9tHT4ICxD3mrnjwq3JWPT4Cabro4sdlwUSjqLXou0Sx1jdkuKYFUg0sc59iHfw+UA/MqC7gwB+pSjEbHOOXJgJ239ESU8VKYJQBDDqgZh4oLqoGUWtg5SxwBCai4bjUaCF/T8iAGN4ic3aE2ARRsPfPbO8uFLD0EAseyWLFARmDBcxXf0BmIWADh69DLIc7e7WJ8riLgUnYPkjbLjy4VCAA06wQEKZ7qg8R48JLbF9y6lRGYO1o7W64GxwtSFNbN0yVq2BK3N3D4JjfYyZl0ywMaK5lL9EDl/XvrDmzBJG7ojnSEQoQIL+wnfbgKdY7bTXnOK05K19RCNtkCw4kXRJW1d13QZhQUoFohQwfulmZvAwGJBUE2lUoZh4PpM1Zh9z6qzTgEBEQFd+leXHTnqIuPxIGcTxBwMHQMMm6jadn5eMlgqujS6lVc997lKfsgeh1htrwnS7zwVJxqSAuaqGx27YbTa4D3swkoUJBcqza4hTEhIGQ5YOFsjOriPEHkj3zpPlENGki/naMXJLZPL1Krge0V1bILkEPKYIF6JKAAvHRsPkX6eiNDTOrhGTWHXExBKs0hACIzaAiAAxhh2YCpBIuBAKakpJVBINFCBdMxJMDsb4yyG+vT+ZThQdDrAQQcB6hdlf3ggCDMsNa85caKXSOxEbDlJC1B2Q/qmPgeR/pJxKAP6kADg+VddDY3MOl4Oi7HQ4gLftBHJCTdh5JFz4DgXzPpjl5xrrR0lBQMujvBPrJ636Fv5fCcNIDnXl4w0VxrWmO56Dh0xloRYiFHE2EBx4mhzISM9GZEd1lQQwgxMQdSSXxxfoxBLESLjHgrA6PHcrrUFBIDIOLulrhr40ZiGJCSmDAFbz2MoiMQiSIioU8BitOGruILKIynscIiWde6INkD6qN1NMFTuGQU7IKJoNUYXYlmX1xW7um/txLErQQCGbworH1uTthgTqASXSGrHNVuEIvK8q69eO3hwo73letvr5qjVDO8gkiTwKPGnY6AMckKjLoezII64AwNq2lMJuVQGIqIYaTSaJqNu3uH1jhLJMeUgLvLDEKWg7zEI3KYUc1a+cTGMKSjEGz44caGX+P4HZs6yTClJVRm03KT2IQgmeMYXBLDWIqZEMkzGiOeJcV2LZJS4loiYWUVffxnoVvUwYNUKj3vg9PQJYRJ4rw50viTaTvfocy+/4vLLbZ7T2EISAstJyRsN4slMsD7Xh27IP086nfYVx55zzVVXSbdLLndZ4z6F4eOlSkWfnLFn6EPvQWM4jyXMUEKfWCWXC3K8uQDUyFik3epwFzJs+LNYIqu9P3pRD28dQRBuS461CgiBiN2zABBNZowxzjL4HwYXB6t3ROQdsGSRqh6A6AeHY5j5EBLzJd7sNN3kPXhS5I9KsBuH7dkpHbFzuqvJhrNnQfSfD5URd5xBt3PiyuMH9x/I81yGF6S5mxO842hQAJt3l5ebrzj1Mmi31TPpOcIDsHa0cgq/cxdRkIBAoCshz1lRm5AVdSzKmUFC7lqwbBhIKCdmbWoHE1XLPwWoIIXo6seqFchK+WKInOzWGHU0pK2IgpBMoXOOm04Ms64uAQyCZARQXEtNwaUvl1zQH6VRSbRz2GjwgFGCY/TspZxLqYUSVZmbbZsENtDNT518qZqXOewKnowCDKijA2K1BQ0AvO7VZwCAEQyXy3skoCPACIDE/xS1KL45pdTXcVsIQgaMYYoyKj6SKUXkmpCJI+lZSIefAAAwedoupT5TJ1hLZkIoqPNcgEGEUAg5/kYjWp+C9RE2iy4P3Y+qZzr2Rhsi9ISPOavIxoAESoVCTpSJ2Q1GBjAABpBQqSg8mRKLY29TBAgw604iC4nS6xryPwDIOiTTTUHVucRuvCQ46gkmAQRgJAOGEcE0bnzVqyEie8uWfKhK0VCyNKUYYLKXACjN6g1nX71y8JJWni/FbCH2cnhcijpwxWEcURVImoID4IQeo6b4iLSmcoee5wPSeaxx9Hk/5nuJQ84kYiXKrhoB1KeMo2HxqZgQUYiAIVM+f9Crk9oU60MFhlTVIYmEfAJDq21MLkckTvWU4kFcQiDQOohA7ID3hCmSMFyDn8vZbXcuOXTk7OnrWBG7YyTWZ2kBJkhbN8gvCanVbr/4+S84ffKUbG5qbFidBZuSJdaUxtJJGYjkPeni43zK3E917hM8aHSe0uFDklFVGraggdjjgsoYrJBCSNeGiK6DJJF4ZueAiACR0fGMOjYeGET9dstiXXDkAMm+h04kwgt96QoBSAXbR7duxJHbGZ1FKQjsIyQGYEf2IG6Et2Kp0KQFFhAl8ZCNzbMvP33i2JXtdhvIqeCkgJ8TEct5nBMMAJzbRpbdeftt0O7olMQo2Cy4vRnB0IFQYrcs8sdTYAf1NEJSW6+IQUdZeykkl8gQFDFhtW+rRHFHiT6QVwMXXFoLxUhGxZN06KX6+wJO+QSAfX0M4iBra/0w0zAEweOZRHyROsy7dtBYdFNhhNgqMwroFBCvBgIi6nkqE3pkw9IQy1MyQTe/45bbzEhIgtlbgIkMIu4T2vcJ8DUDeNetNzf3H+yKKLOBc5q1pqsIIZaSRxR8hpibK3JKh6ciAEhOaBFykFzrv6oK5A95z50O3h0nRKMWxcUd+i8Onim+i430k3qup86bSzpRIK91KSYWLb0CWNZxvM4L9yRs4SsQA7LoP0PYrW0LAsRC7FeNrjroZl0jAucsVoBBrOOyBXGTJ5HBiEEmjWCQXfSNiNoUJCDMsUVIPIg8DHNQGJC+F11/p90+cOTIHTfdrO2pvWz+UKXV/mJz8VgAImq3Widf/KLX3nC9Xb9AhgJXdFDNXhtRmhESEhfVfEhIalc/UEvEV7IG5adLYf1VnydkcWLMHYlKa9BTQWsLv2Q3rw58jhKi/+9Q3OHPHdeRtwZa23JJMGV9U1ITSOln/Jet2MzQl4oeGRGcLhV98b6aq4s9e+Gm173h2uMnWq2t2vBmp1OcU1KAiThzVYFjYYP0U2+7G2zOFNBaiImfUEJTl6KCwKdSCp2Ds+pnnUut0av+vpaFJmBUQ4TaC+6hyZ80g26tFRHlYZCicoarmGh3t09rIO7X7EbGJzVdTSWJMLu5Oz4fAAAE6OCG2kea3DZlAYr7mey8m/giEcehiqSVCGAdNcsA+PY3vwWlvLcT8SkmpTzYarXGDDJGAMkN9Ccihmgjtzfcess3/+sb2fIqswTAZng0Q5QwIX+gApg4HwkY6+FAhdJ66LosIpRqt8LNgYutORZ8DxQgJarCgZFOS7YBVhTH+Hk4qHLrlHRG6UpFGV1AUgYwVkhasBIByEooOg7DQTA4DPG1SaaLks4VZcgLYzJCUJSeGsaB6kBR5IVsT7I/JA40kW+sv/K6Mw9+9r4lAVtENMI0ZgtNwgKUjNREdG6IJgHEVt49uLry7p9+J6+32BBIyo/ofQaOBw+yGOeVA2uunpAJ1Z8OvrX62VHakp7jUD1K7UA9zCnk6QMIwr1m9ZJZHAunbjKx5s99BJkmSdVtIC4/SDlI3OJdgCpgWX/QxkDIc+B5iDUL5oyWMWeXwGEQ1jGrrmzijwJiAbYslkMro4uOdW+99fDWEgFM+OLlpIKnQBRD0rW/8nPv3tdsdi0j1WTD5qXw2scC1Ert+CzVgxsBBjAIrdzecMut//nNbzRWVhSlRT0wDhLYzxFZwskHYUhJgR9ZRwVjodWzhB2SpIDQV4c5HWMDsYMiFteYLRYY9uvxGpBOX6wERmolYneo4uA0ftD5NR7pkJqRNHUbv2yYmOAaJ53fn26FWC6mfR04CoFrhUHjckLsrK+fOXP9Q3/1ecPCKEPPhtjJBvkR6wCTygUNdR8CyvP8wOrq77z3vdDuaEYCS/53QRyj4+w81CQoDBWv8DmW+CLd55OWmdQClE6v9DcFUcaaV+gdnngH9lQXLl2vUaNzrH3RzSfkNf/i7IgUIbQCjnbBWQlXxJVQ3IWYDRM//90l762e7oDsvjVb67LMYevAp/+D7eJ6FFbIC7l6mZX3/+p7VpYa1uZDzYaf/hyNOc0C+eo+GGNarc033XXXG++8q3P+vMlMTwCFB2/FoDBxTmrdGCyUiHwbrdT0slUDuJp4Tvo1PJXn14py50QIW4LcYAQUVjVGr5munzCdm0Z+ShERaX2KEoQ+FpctXvTJJZQFg6Zp+tKPRIAQebOvFHDYHPdJKLNwu1SUybL2+fM/9uNvuvOWW1qbW8bQCF1g03STBnKBeh3h1azItk0wIzhOzNxsLn3jW9/6gR+6aUsUll+4TwkiG5yQ+FwsKBWU55sjFHjYgSnejaSKVwUQYIwdPKlRUsKIgLgONWnGZLo424DBcEG8hxVISGCmipr8M0za0jqxG/qUThBMR4oUU1KY7Fi0TpomAiBjwJW0JIW46w1NUrp27fwu6o37bABz2zm4su8fvviVa48f73Q6kxqcPkcWYPqhDBG1Wq2TL3zRb/76++zTT4MxaWYwPa2lKAd1h7TURLeJ3VCmUXckS+EIjd9XivUEKGOH4j05GQxXFCzftcMJjtiP94CoNlK5SvYH01qBSGhzCdN5g1kEqJm6Gb9O0TkspBmqFkyi5Szc2ZB95tkP/MZvv/Caa9rt9vxL/ygWYGaBC0PWbNzxlrd+8Qt/0zhyqe12A7jKxWeAtX5RcM1DQSBNRFZDW20SwNp0Z8qMRBjCDgNYuwnp/3WtiZ77xUHrBBT46U+jJDzF8iyzsLY488aX2oKPE/AZ4SCwSVxLCbdSEYuWVMorhRHXoVZIDCRUoB5YmjUa7SeefOvb7v7kn36otbml7abTvEbkLpmUAuwwiy8KcyMzjz/51Gtvv+Pb3/mfxv79bG0a6mHocCxl8WOLfFxcFUWXVtPAp4xU0AuJEYlI+XBXCqOw6tr2gwK4tYn2nrhxGpwIOvlyLCHlwLWQAQZPDwxCQCmoThxhnu9ICV8k4oikdDTE2D0YB6nnlqK0TiKcnEuIACZrdJ595tTLXvHQ5+7b12h22RrCaYp+CVs6AwWYwmWtXV1d/frDD9/8Iz+6vtUyyys5WxRb6mfpP7mMQ7ammMMpkW05TIt+3psXNJQ23QdGhsJNvLUJA7q9/10otEVuOfIdai7xGy1P4JxijI3XCUuADhDBBLkAWI15ElyEm/nqodEuqrZMhlyzi9T4xFjxjpwu+X3IyHS3tg5dcuArn/ncqZec3NraMsbM6uwfVgHm2ksr+aPGmI2NjTOnT9/7kY+RcCdvZWQ0WyJJDgigjJ+p8dEHeTp4wg/vWTi8I0f3N6VHdu5yyNiUkUKFcaIBPUFIVVen8F2SA949kUOGNEFxsqQRTshUsnXtjVAXP+hfsWU3zKsu8CgBaUOLsLCAlQaZztbGWnPpLz9+78tPvnRzc3PK0n8xp0GramCM2Vjf+OGbfvCej35kmSXf2jJZVvPOeqDZ0kFipURTKZdFsV/MyZOCkz1CvybZX60V1oatUjy0ooSBFNoP0pROGgSHxKUWChQxqql9jU19yhJYdGiXWjNtGIDwIwIsOm/Stb0Ui7vKuheLzUnFHTw7VpaZ9vr64f0HPv3JT73++us3NzaybAYtVuNEnnPtAvWKKHLurq3uv/+hr775HW9/5umnlw4ezLtdqIB86qMUjICw2rqvfsYPCQbRonIRD1K7sFIiEv3siMD6W1khBDIsfwc3pxGKVEjiKHZAwM/iUmpgl28VZXpJUgKRroeKOeNgfThGHRxuUuI/9jSKCH76r95Uq9xZo9F+6qnjL3jeZz7xF9edfOmFjfWlrDEnojJiDLDT42jGl/7wxfJuvm9t3788/Mjd7/zZb/7HvzeOHEbX3uqobkmgNhgtHPy4zYlSiwBNpbzan5kqUm2WTEQErBtvTEqpXvNESXLtGNz4HrQaxXbHHjuZrAl9HscrjERqf9dPIyBiEnIAFGICEDEWyCATdp966obXvuHPP/Rn1564ZmNjI2tkEyQ+nFrDJJU8AZ6/GR61V9bINjY3XnX6FV+9/4t3v+Mnu+fPdzo5LTUEwAiYHnsa3NltS28uqdLjHUhtPaFoTHpZiejG+GE2PV2+4k2w+NwYFYQMjyRI/WoBobSexOEJHhGwkDg0IaYrYUAF4YlQw7Tbne73L/ziL/3y/Z/77POOX725uZllGQjsxmt+Y4BtD4DMZJubm5eu7bvnwx/++Mc+euXlRzrfezIjNMZ4Gucala6qQS1QQnl4ejXccJF+a0DbFQth2r4IHr9RlOzYpZ88i/1VMkSpemBSosIYbUOYWc3WBuB+qJ2Fv9J/0U5f7+7HhmB2Y2eh/cRT1151/NOfuPdPfu8PGsJb7dZORL2zgUJME4U37C70OrZZBJmXV1f/7/HH3v+B3//oPfewzbNLDhpAm+eFDEwpnY8gPeIEdzYUKR9TMkYZoAgYEAdYwVcbB+UXBGQ3zr3iqpEffRmz9Qgc85jpo0WEwoBS38KOvZPlHnyhRNquN8AXp2u+FxFZFH7m+0sr+37+Z971vvf82mWHD2+tb0mGBhF287UjQfAIkwHGVDyb583lZWPM3z7w0O/+0R9+5YEHQaSx/wAhWuWy8dMkIAFFpwFfrAon1dYSjCIQLouIhR5Fpbqw2MkVM4JApUUzKVQlaxAL6GoFoaEHlBe9KNsc6Z29nSGME059IFulmo+l8Wq85I0HGWPzrr3wLBi87bbbf+u977v+7Jm8m3e6nd2S7uwPVNsRBRhEoMfvK6jzTPLV1TUGuO9L9//xBz94/4MPSKsFa6um2fT5Oy0kYQndAAn5FKCDJ1SFhhIUECP0UYCasrwbT8AoDKUFePZPhATcARJRRckKScr3L/fypg1pwlXhLqxQxB8MESGLhEAkInmrDevrjbX9t9980y+861233XQzAmxsbBmDw7YB1vbZTSeBXsuWOQ0F6C/ZoyE3tn2ytZaQlldWBODBv//axz/1yfu+/KXHv/MoAMLqSqPZTBM45TWIDlYhRihhZtxZzlEr2LcoeukHgL52z82ylzBUGomg2G8e1+brxEqgzqljBilBVf0ArIJCFt2/erSSxNKHsO20WrC5CSa78uoTd95+29vf9hOvOXsWAFqbW56Id3R5mLICbCuHE1aA/rnLnd4UFNJ+GWtzAlxeXQGAR8+d+/IDf/fXn//C1/7pH7977jFod6CRQbOJjYbJMgrTfyPHYMrBVmDCIonAInFIttjXG1us6hJ5qjqpAgAEVwyC8QmtilzKnPr/SJ4jMTnFC13SIJLmRBmiAoS2OGVdVyR0bq10c+h2odsFEVxZufbENa+/8cY33nzL619z49GjhwFga3NDAI0xfhTS3lOAQfKy/QdITn87NIhsNpvqrT567twjj/zbV//56//68CP//Z3/Pffdx9cvrEOnDdYCEhgDRNpW64Zgu8S71dksTvY5RMFJnOnGeKH7fIi8MWHejYMDkrhcfE9jCt1zhacU00HJQyXeMxH6QmTO4OfbiOMHCsDtyFyCQAhZwyw319bWjh+74tSLX3LmuleefeXpU6dedvDAAQCwuW2320i4K4DNO64Afah4hlKA0QLl8WIDRoBms0k+bltf3zj33ce//dhjjz527oknvnf+/PkLGxvrF9Y3Nze3Wlsdtt1uN+kW0NSkGzTm1EJjWeW9YvE0PF6WHTWXAIAxOmUMREk63YAP3y3DLAImM46AH5CMQRBiEOs4fdhQEHSlMNHxGfoIZZC3SiPnsKveOoFQ7hLBS0tLS0tLy8vL+/bt279//+FDlxw9fPjYsSuuPHbFsSNHnnPZZUsry7o53W632+1CQhi8q68JBMGjndnzllR1FQBgIjQmazQaCAR74xLpBwMUsZ1uN7dWRAyaOSFumE4xeAcVYN6PhYi6dL5JyBa4EUoFPz2JDxIfBpNOYM8RxGk8IRB8FsYQkUq5ldZ9JsHQcxKXYCE5n9DZJSFEYZXp72MkHJDM+j/HRoqAYAjj/FeZk5czHT3sqQB9qFC2XdZcYYqGWk8kyaq9j5e6co2pxydhu4/1W3PfP8ey/G+zhgI1L+Ccn2UjI9tGuLI+EeTIz57s1LCJRMMDrmeQiYU4mLjDqB8b7bk42EGAsksxO1NXgD5x7ZyMNhj2pB+tPDc/1mniJ+tcra3/GmamAOMEuCkSZn5O+nkLzefNWs5qbdVTdTrPzcY5Kvqbgv5Y/MmG/7XTo6qthgN6mfOmJBM5R4c6yGdy6u+QZ9E/DZrBnrnmLTTfLTt2cT83G1zva0+RAnlq76UPpdxVSR0w7zTUzWcCz5rhy66l+J0fF3Gnn9jr/tlkF7dbztc+rb179kTfm7Yxq92gXm7TyEKDI40In8mOzL8cTPyQ3qExcFCpI035nVajvuoCMlhci2sHrtGay6fvgA1RB+jvMfcxDnObTumF0uuFs5+fZfcfND1IuL9tzWSc7z6aSSl1n/Ykthm8oj++AiyuPls8wzB62wrMtp/fLfQf1TX3D98nYwFGe6NJe1S6lN2HuBzwpKllgZ6VQegvBCN44RP/UoOk8gY83fub7qH+NtuZk2m+4sjR3iXN8Xzzqi2a/wNlPi+a7GuY5zcx7PIG//AMAfRDfakRFjlm0m/YnSkxvmxr0Eb4gqW/zSbyDvZgDHAxASW29bxH0PBBcLVjuqADvpdtkgFjNsXPeeZn8Cb9qbnCg6x2EGzSUPIxrFhMU/mnsMN9xGCRBZqjqGMvW6rpY4f1HWUTV6z+ofqcSOew2KEp+IR9EjX9kx69HIYRELUlEZxCK2zpW09fbBYWYBfbgcneucp9Up2hdvFd2bAvb8CNmCsyiPl3A/pXdme74Tsq+ttWtSf4lO1jgMFPrEF4m+fhqrqVO73a/m7J4OvcO7HBbJG52baKMuBWzpAAFYbvB5iOYO2dVOn8+401/NjDBsHbArAW73tx7Tptyfr7fNXe2YWUL64So/XEHcvR8lejRTK7Pgu0UMjZXpNijhincjyxGGAhaotrVpJQrTkMAu0cfz2LOsDiGl1kdyh9OU0+IhpQuXciKh/5nvMPAJ6VOE5536YP4KnGISMgQNP1Z72+1U5L2CBdS4trce207mXjPGAE/MmY6NFew+EW1zT3pBdGqFoEHLm1cCIu1iAmcXRu0CnL38LnmX+npfaQmnMLn012H0fGJFbnlo6whlmBkOcB/DysCR1ttb04Vbf11wd0DXrNWh7BekBvZEN6wxlngTT7q/HAIGf8wufZLUYmfZvTnLHXK4M0FjVir+/ZX88Gcfqrd9iNIn5xq2Xqke+cX7rt8MWhwsvBxWksCzAab8Jo4jKrSuEiAAj5uj7znqv/abe8r3E7wiZCSTCIvg7oIElx9vquiAR2RTpr2ALR+KI/bDZpBFJxmKtK8O5ibL74hmhcHLZ32NXSIEI55rm+raCEp0xwl3f6hZXy39tys812tePb+VnxPg2LGBh2kdloMfXgunhxX7VKvgcnD+zeKxvk7Q4yC2xWJ1nVFZn+zJUxuy5n4kftHRduqjHAzP3FKRN67nYBWqjBRTIiaZCKxOKqNV8DqsTFqiTZxXE2LEz5YicnrAAL0d+zRmChAItrcd4vFGBxLa49oPy02IjFtZev/wfjdaXWu+gG3gAAAABJRU5ErkJggg==`}
      width={size}
      height={size}
      alt="Flourish"
      style={{ flexShrink: 0, display: "block", borderRadius: size > 30 ? Math.round(size * 0.28) : 0, ...style }}
    />
  );
}) {
  const id = `fg_${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: "block", ...style }}>
      <defs>
        <linearGradient id={id} x1="4" y1="36" x2="36" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00D68F"/>
          <stop offset="100%" stopColor="#00EFA0"/>
        </linearGradient>
      </defs>
      {/* Stem */}
      <path d="M20 34 C20 34 20 18 20 14" stroke={`url(#${id})`} strokeWidth="2.8" strokeLinecap="round"/>
      {/* Left branch */}
      <path d="M20 22 C20 22 13 20 10 14 C13 14 18 16 20 22Z" fill={`url(#${id})`} opacity="0.85"/>
      {/* Right branch */}
      <path d="M20 18 C20 18 27 16 30 10 C27 10 22 12 20 18Z" fill={`url(#${id})`}/>
      {/* Top leaf */}
      <path d="M20 14 C20 14 20 8 20 6 C23 8 24 12 20 14Z" fill={`url(#${id})`} opacity="0.7"/>
      {/* Upward tick mark (trend) */}
      <path d="M12 30 L18 24 L22 27 L30 19" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
    </svg>
  );
}
// ─── LEGACY IMG REMOVED ───────────────────────────────────────────────────────
function _FlourishMarkOld({ size = 24, style = {} }) {
  return (
    <img
      src="data:image/png;base64,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"
      width={size}
      height={size}
      alt="Flourish"
      style={{ flexShrink: 0, display: "block", borderRadius: size > 30 ? Math.round(size * 0.28) : 0, ...style }}
    />
  );
}
// ─────────────────────────────────────────────────────────────────────────────


function useWindowSize(){
  const [size,setSize]=useState({w:typeof window!=="undefined"?window.innerWidth:480,h:typeof window!=="undefined"?window.innerHeight:800});
  useEffect(()=>{
    const h=()=>setSize({w:window.innerWidth,h:window.innerHeight});
    window.addEventListener("resize",h);
    return()=>window.removeEventListener("resize",h);
  },[]);
  return size;
}

function computeStats(txns) {
  const sp = txns.filter(t=>t.amount>0);
  const byCat={}, byDow={0:0,1:0,2:0,3:0,4:0,5:0,6:0};
  let coffee=0,coffeeCount=0,delivery=0,subs=0;
  sp.forEach(t=>{
    byCat[t.cat]=(byCat[t.cat]||0)+t.amount;
    byDow[t.dow]=(byDow[t.dow]||0)+t.amount;
    if(t.icon==="☕"){coffee+=t.amount;coffeeCount++;}
    if(t.name.toLowerCase().includes("uber eats")||t.name.toLowerCase().includes("doordash"))delivery+=t.amount;
    if(t.cat==="Subscriptions")subs+=t.amount;
  });
  const totalSpent=sp.reduce((a,t)=>a+t.amount,0);
  const topCats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const busiest=days[Object.entries(byDow).sort((a,b)=>b[1]-a[1])[0][0]];
  return{totalSpent,topCats,busiest,coffee,coffeeCount,delivery,subs,byCat};
}

// ─── ATOMS ────────────────────────────────────────────────────────────────────
function Card({children,style={},glow,onClick}){
  const [h,setH]=useState(false);
  return <div onClick={onClick} onMouseEnter={()=>onClick&&setH(true)} onMouseLeave={()=>onClick&&setH(false)}
    style={{background:C.card,borderRadius:24,padding:"18px 20px",
    border:`1px solid ${h&&onClick?C.borderHi:C.border}`,
    boxShadow:glow?`0 0 0 1px ${glow}18, 0 8px 40px ${glow}20, 0 2px 12px rgba(0,0,0,0.5)`:h&&onClick?"0 10px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)":"0 4px 24px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.02)",
    transform:h&&onClick?"translateY(-2px)":"none",
    transition:"all .25s cubic-bezier(.16,1,.3,1)",cursor:onClick?"pointer":"default",
    backdropFilter:"blur(16px)",...style}}>{children}</div>;
}
function Bar({v,max,color=C.green,h=7}){
  const pct=Math.min(v/max*100,100);
  const barColor=v>max?`linear-gradient(90deg,${C.red},${C.redBright})`:color===C.green?`linear-gradient(90deg,${C.green},${C.greenBright})`:color;
  return <div style={{background:C.isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)",borderRadius:99,height:h,overflow:"hidden",position:"relative"}}>
    <div style={{width:`${pct}%`,height:"100%",borderRadius:99,background:barColor,
    transition:"width 1.2s cubic-bezier(.16,1,.3,1)",
    boxShadow:`0 0 ${h*1.5}px ${v>max?C.red:color}55`}}/>
  </div>;
}
function Chip({label,color,size=11,icon}){
  return <span style={{background:color+"18",color,borderRadius:99,padding:"4px 11px",fontSize:size,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"inline-flex",alignItems:"center",gap:4,border:`1px solid ${color}30`,letterSpacing:0.1}}>{icon&&<span style={{fontSize:size}}>{icon}</span>}{label}</span>;
}
function Toggle({on,onChange}){
  return <div onClick={()=>onChange(!on)} style={{width:48,height:28,borderRadius:99,cursor:"pointer",
    background:on?C.green:C.isDark?"rgba(255,255,255,0.10)":"rgba(0,0,0,0.10)",position:"relative",
    transition:"background .3s",flexShrink:0,
    boxShadow:on?`0 0 12px ${C.green}44`:"none"}}>
    <div style={{position:"absolute",top:4,left:on?24:4,width:20,height:20,borderRadius:"50%",
    background:on?"#fff":C.isDark?"rgba(237,233,226,0.55)":"rgba(26,32,53,0.40)",transition:"left .28s cubic-bezier(.4,0,.2,1)",
    boxShadow:"0 1px 6px rgba(0,0,0,0.6)"}}/>
  </div>;
}
function Btn({label,onClick,color=C.green,outline,small,disabled,full=true,icon}){
  return <button onClick={onClick} disabled={disabled}
    style={{background:outline?"transparent":`linear-gradient(135deg,${color} 0%,${color}dd 100%)`,
    border:`1.5px solid ${outline?color+"99":C.isDark?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.12)"}`,
    color:outline?color:C.isDark?"#021208":"#FFFFFF",
    borderRadius:16,padding:small?"9px 20px":"14px 28px",
    fontWeight:800,fontSize:small?12:14,letterSpacing:0.2,
    cursor:disabled?"not-allowed":"pointer",opacity:disabled?.35:1,
    display:"flex",alignItems:"center",gap:7,justifyContent:"center",
    width:full?"100%":"auto",
    fontFamily:"'Plus Jakarta Sans',sans-serif",
    boxShadow:!outline&&!disabled?`0 0 0 1px ${color}22, 0 6px 24px ${color}44, inset 0 1px 0 rgba(255,255,255,0.22)`:"none",
    transition:"all .25s cubic-bezier(.16,1,.3,1)"}}
    onMouseEnter={e=>{if(!disabled){e.currentTarget.style.transform="translateY(-2px) scale(1.01)";e.currentTarget.style.boxShadow=outline?"none":`0 0 0 1px ${color}33, 0 10px 32px ${color}55, inset 0 1px 0 rgba(255,255,255,0.22)`;}}}
    onMouseLeave={e=>{if(!disabled){e.currentTarget.style.transform="translateY(0) scale(1)";e.currentTarget.style.boxShadow=!outline?`0 0 0 1px ${color}22, 0 6px 24px ${color}44, inset 0 1px 0 rgba(255,255,255,0.22)`:"none";}}}>
    {icon&&<span>{icon}</span>}{label}
  </button>;
}
function Inp({label,value,onChange,type="text",prefix,placeholder,note,sm}){
  const [focused,setFocused]=useState(false);
  return <div style={{marginBottom:sm?10:16}}>
    {label&&<div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:6,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</div>}
    <div style={{display:"flex",alignItems:"center",background:C.isDark?`rgba(255,255,255,${focused?0.07:0.04})`:focused?C.surface:C.cardAlt,border:`1.5px solid ${focused?C.green+"77":C.border}`,borderRadius:16,overflow:"hidden",transition:"all .2s cubic-bezier(.16,1,.3,1)",boxShadow:focused?`0 0 0 3px ${C.green}18`:""}}>
      {prefix&&<div style={{padding:"0 14px",color:focused?C.mutedHi:C.muted,fontSize:14,borderRight:`1px solid ${C.border}`,transition:"color .2s"}}>{prefix}</div>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        style={{flex:1,background:"none",border:"none",outline:"none",color:C.cream,fontSize:sm?13:15,padding:sm?"10px 13px":"13px 15px",fontFamily:"inherit"}}/>
    </div>
    {note&&<div style={{color:C.muted,fontSize:10,marginTop:5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{note}</div>}
  </div>;
}
function Sel({label,value,onChange,options}){
  return <div style={{marginBottom:16}}>
    {label&&<div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,marginBottom:6,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</div>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:C.isDark?`rgba(255,255,255,0.04)`:C.cardAlt,border:`1.5px solid ${C.border}`,borderRadius:16,color:C.cream,fontSize:14,padding:"13px 15px",fontFamily:"inherit",outline:"none",cursor:"pointer",transition:"border .2s"}}
      onFocus={e=>e.target.style.borderColor=C.green+"77"} onBlur={e=>e.target.style.borderColor=C.border}>
      {options.map(o=><option key={o.value} value={o.value} style={{background:C.bg}}>{o.label}</option>)}
    </select>
  </div>;
}
function CountUp({to,prefix="",decimals=0,dur=900}){
  const [v,setV]=useState(0);
  useEffect(()=>{let s=0;const step=to/(dur/16);const t=setInterval(()=>{s=Math.min(s+step,to);setV(s);if(s>=to)clearInterval(t);},16);return()=>clearInterval(t);},[to]);
  return <span>{prefix}{v.toFixed(decimals)}</span>;
}


// ═══════════════════════════════════════════════════════════════════════════════
// ██ FLOURISH FINANCIAL ENGINES — Modular calculation layer                   ██
// ██ All financial intelligence lives here.                                   ██
// ██ Architecture: Data Layer → Calc Engine → Forecast → Behavior → AI       ██
// ═══════════════════════════════════════════════════════════════════════════════

// ── ENGINE 1: FINANCIAL CALCULATION ENGINE ────────────────────────────────────
// Computes all core financial metrics from raw user data.

const FinancialCalcEngine = {
  /** Net Worth = all assets − all liabilities */
  netWorth(data) {
    const accounts = data.accounts || [];
    const debts    = data.debts    || [];
    const assets      = accounts.reduce((s,a) => s + parseFloat(a.balance||0), 0);
    const liabilities = debts.reduce((s,d) => s + parseFloat(d.balance||0), 0);
    return { assets, liabilities, netWorth: assets - liabilities };
  },

  /** Monthly cash flow = income − (bills + avg transaction spend) */
  cashFlow(data) {
    const incomes = (data.incomes || []).filter(i => parseFloat(i.amount) > 0);
    const bills   = data.bills || [];
    const txns    = (data.transactions || MOCK_TXN).filter(t => t.amount < 0);
    const monthlyIncome   = incomes.reduce((s,i) => s + parseFloat(i.amount||0), 0) || 4200;
    const monthlyBills    = bills.reduce((s,b) => s + parseFloat(b.amount||0), 0);
    const monthlySpend    = txns.reduce((s,t) => s + Math.abs(t.amount), 0) || monthlyIncome * 0.68;
    const totalExpenses   = Math.max(monthlyBills, monthlySpend);
    return { monthlyIncome, monthlyBills, monthlySpend, totalExpenses,
             cashFlow: monthlyIncome - totalExpenses };
  },

  /** Savings rate = (income − expenses) / income */
  savingsRate(data) {
    const { monthlyIncome, totalExpenses } = FinancialCalcEngine.cashFlow(data);
    return monthlyIncome > 0 ? Math.max(0, (monthlyIncome - totalExpenses) / monthlyIncome) : 0;
  },

  /** Debt ratio = total debt / annual income */
  debtRatio(data) {
    const { monthlyIncome } = FinancialCalcEngine.cashFlow(data);
    const totalDebt = (data.debts||[]).reduce((s,d) => s + parseFloat(d.balance||0), 0);
    return monthlyIncome > 0 ? totalDebt / (monthlyIncome * 12) : 0;
  },

  /** Emergency fund months = liquid savings / monthly expenses */
  emergencyFundMonths(data) {
    const accounts = data.accounts || [];
    const { totalExpenses } = FinancialCalcEngine.cashFlow(data);
    const liquidSavings = accounts
      .filter(a => ["savings","checking"].includes(a.type))
      .reduce((s,a) => s + parseFloat(a.balance||0), 0) || 1243;
    return totalExpenses > 0 ? liquidSavings / totalExpenses : 0;
  },

  /** Average daily spend from transaction history */
  avgDailySpend(data) {
    const txns = (data.transactions || MOCK_TXN).filter(t => t.amount < 0);
    const total = txns.reduce((s,t) => s + Math.abs(t.amount), 0);
    return total / 30; // assume 30-day window
  },
};

// ── ENGINE 2: SAFE-SPEND ENGINE ───────────────────────────────────────────────
// Core feature: What is truly safe to spend right now?
// Formula: Balance − UpcomingBills − DebtPayments − SavingsAllocation − SafetyBuffer

const SafeSpendEngine = {
  calculate(data) {
    const accounts = data.accounts || [];
    const bills    = data.bills    || [];
    const debts    = data.debts    || [];
    const today    = new Date().getDate();

    const balance  = accounts
      .filter(a => ["checking","savings"].includes(a.type))
      .reduce((s,a) => s + parseFloat(a.balance||0), 0) ||
      parseFloat((accounts[0]?.balance||1243.88).toString().replace(/,/g,""));

    // Bills due in the next 10 days
    const upcomingBills = bills
      .filter(b => { const d = parseInt(b.date); return d >= today && d <= today + 10; })
      .reduce((s,b) => s + parseFloat(b.amount||0), 0);

    // Minimum debt payments due this month
    const debtPayments = debts
      .reduce((s,d) => s + parseFloat(d.min||0), 0);

    // Safety buffer: 10 days of average daily spend
    const avgDaily   = FinancialCalcEngine.avgDailySpend(data);
    const safetyBuf  = Math.round(avgDaily * 10);

    // Savings allocation: 10% of monthly income
    const { monthlyIncome } = FinancialCalcEngine.cashFlow(data);
    const savingsAlloc = Math.round(monthlyIncome * 0.10 / 30 * 10); // 10 days' worth

    const safeAmount = Math.max(0, balance - upcomingBills - debtPayments - safetyBuf - savingsAlloc);
    const riskLevel  = safeAmount <= 0 ? "critical" :
                       safeAmount < balance * 0.15 ? "high" :
                       safeAmount < balance * 0.30 ? "medium" : "low";

    return {
      balance, upcomingBills, debtPayments, safetyBuf, savingsAlloc,
      safeAmount, riskLevel,
      overdraft: upcomingBills > balance,
      soonBills: bills.filter(b => { const d = parseInt(b.date); return d >= today && d <= today + 10; }),
    };
  }
};

// ── ENGINE 3: 90-DAY CASH FLOW FORECAST ENGINE ────────────────────────────────
// Projects daily balance for 90 days with overdraft risk detection.

const ForecastEngine = {
  generate(data, days = 90) {
    const { balance }       = SafeSpendEngine.calculate(data);
    const { monthlyIncome } = FinancialCalcEngine.cashFlow(data);
    const avgDaily          = FinancialCalcEngine.avgDailySpend(data);
    const bills             = data.bills || [];
    const today             = new Date();
    const todayNum          = today.getDate();

    let running = balance;
    const forecast = [];
    const overdraftRisk = [];
    const lowBalanceWarnings = [];

    for (let i = 0; i <= days; i++) {
      const d = new Date(today); d.setDate(todayNum + i);
      const dayNum  = d.getDate();
      // Payday: assume twice-monthly (1st and 15th)
      const isPayday = (dayNum === 1 || dayNum === 15) && i > 0;
      const dayBills = bills.filter(b => parseInt(b.date) === dayNum);
      const inc  = isPayday ? monthlyIncome / 2 : 0;
      const out  = dayBills.reduce((s,b) => s + parseFloat(b.amount||0), 0) + (isPayday ? 0 : avgDaily * 0.8);
      running = running + inc - out;

      const entry = { day: i, date: d, balance: running, income: inc, expenses: out,
                      isPayday, bills: dayBills };
      forecast.push(entry);

      if (running < 0)  overdraftRisk.push({ day: i, date: d, balance: running });
      if (running < balance * 0.12 && running >= 0 && !isPayday)
        lowBalanceWarnings.push({ day: i, date: d, balance: running });
    }

    return { forecast, overdraftRisk, lowBalanceWarnings,
             willGoNegative: overdraftRisk.length > 0,
             firstNegativeDay: overdraftRisk[0] || null };
  }
};

// ── ENGINE 4: BEHAVIOR ANALYSIS ENGINE ────────────────────────────────────────
// Detects spending patterns: payday spikes, subscription creep, impulse clusters.

const BehaviorEngine = {
  analyze(data) {
    const txns   = (data.transactions || MOCK_TXN).filter(t => t.amount < 0);
    const income = FinancialCalcEngine.cashFlow(data).monthlyIncome;
    const insights = [];

    // ① Payday spending spike: compare spend in days 1-3 vs rest of month
    const earlyMonthSpend = txns.filter(t => {
      const d = new Date(t.date); return d.getDate() <= 5;
    }).reduce((s,t) => s + Math.abs(t.amount), 0);
    const restSpend = txns.filter(t => {
      const d = new Date(t.date); return d.getDate() > 5;
    }).reduce((s,t) => s + Math.abs(t.amount), 0);
    const restDailyAvg = (restSpend / 25) || 1;
    const earlyDailyAvg = (earlyMonthSpend / 5) || 0;
    const spikeRatio = earlyDailyAvg / restDailyAvg;
    if (spikeRatio > 1.35) {
      insights.push({
        type:"pattern", icon:"📈", priority:"high", color: C.orange,
        title:"Payday spending spike detected",
        body:`Your daily spend is ${Math.round((spikeRatio-1)*100)}% higher in the first 5 days of the month. This pattern is responsible for most cash shortfalls later.`,
        saving: `$${Math.round((earlyDailyAvg - restDailyAvg) * 5 * 0.6)}/mo if corrected`
      });
    }

    // ② Subscription creep: count + total subscription transactions
    const subTxns  = txns.filter(t => t.cat === "Subscriptions");
    const subTotal = subTxns.reduce((s,t) => s + Math.abs(t.amount), 0);
    if (subTxns.length >= 3 && subTotal > 35) {
      insights.push({
        type:"warning", icon:"📱", priority:"medium", color: C.teal,
        title:"Subscription creep detected",
        body:`${subTxns.length} recurring subscriptions totalling $${subTotal.toFixed(0)}/mo. That's ${Math.round(subTotal/income*100)}% of your income.`,
        saving: `$${Math.round(subTotal * 0.35)}/mo potential saving`
      });
    }

    // ③ Dining / delivery inflation
    const diningTxns  = txns.filter(t => ["Food","Coffee","Dining"].includes(t.cat));
    const diningTotal = diningTxns.reduce((s,t) => s + Math.abs(t.amount), 0);
    if (diningTotal > income * 0.18) {
      insights.push({
        type:"pattern", icon:"🍔", priority:"medium", color: C.gold,
        title:"Food spending above benchmark",
        body:`Food & dining is $${diningTotal.toFixed(0)}/mo — ${Math.round(diningTotal/income*100)}% of income. Benchmark is under 15%.`,
        saving: `$${Math.round(diningTotal * 0.25)}/mo by cooking 3x more/week`
      });
    }

    // ④ Spending stability (variance) — low variance = better score
    const daily = {};
    txns.forEach(t => {
      const k = t.date?.slice(0,10) || "na";
      daily[k] = (daily[k]||0) + Math.abs(t.amount);
    });
    const vals = Object.values(daily);
    const mean = vals.reduce((s,v)=>s+v,0) / (vals.length||1);
    const variance = vals.reduce((s,v)=>s+Math.pow(v-mean,2),0) / (vals.length||1);
    const cv = Math.sqrt(variance) / (mean||1); // coefficient of variation

    return { insights, spikeRatio, subTotal, diningTotal, spendingStability: Math.max(0, 1 - cv) };
  }
};

const AutopilotEngine = {
  /**
   * ADAPTIVE AUTOPILOT ENGINE
   * Continuously adjusts the daily money plan based on:
   *   1. Behavior patterns (spikeRatio, stability)
   *   2. Forecast risk (upcoming low-balance events)
   *   3. Income schedule (detects payday from onboarding data)
   *   4. Risk mode (Low / Medium / High) that gates all allocations
   */
  generate(data) {
    const { safeAmount, balance, soonBills, riskLevel: rawRisk } = SafeSpendEngine.calculate(data);
    const { monthlyIncome, cashFlow, totalExpenses } = FinancialCalcEngine.cashFlow(data);
    const { forecast, overdraftRisk, lowBalanceWarnings } = ForecastEngine.generate(data, 30);
    const { spendingStability, spikeRatio } = BehaviorEngine.analyze(data);
    const debts = (data.debts || []).sort((a,b) => parseFloat(b.rate||0) - parseFloat(a.rate||0));
    const goals  = data.goals || [];
    const today  = new Date();
    const todayNum = today.getDate();

    // ── ADAPTIVE: Detect payday from income frequency data ───────────────────
    const incomes = (data.incomes || []).filter(i => parseFloat(i.amount) > 0);
    const freq = incomes[0]?.freq || "monthly";
    let daysLeft;
    if (freq === "biweekly") {
      // Approximate: next biweekly is in 7–14 days
      daysLeft = 14 - (todayNum % 14);
    } else if (freq === "weekly") {
      daysLeft = 7 - (todayNum % 7);
    } else {
      // Monthly: 1st or 15th
      daysLeft = todayNum < 15 ? (15 - todayNum) :
        Math.ceil((new Date(today.getFullYear(), today.getMonth()+1, 1) - today) / 86400000);
    }
    daysLeft = Math.max(1, daysLeft);

    // ── ADAPTIVE: Base safeDaily, then adjust for behavior ───────────────────
    let safeDaily = daysLeft > 0 ? Math.floor(safeAmount / daysLeft) : safeAmount;

    // Behavior adjustment ①: spike ratio → tighten daily limit
    if (spikeRatio > 1.4) {
      const reduction = Math.round(safeDaily * 0.15);
      safeDaily = Math.max(0, safeDaily - reduction);
    }
    // Behavior adjustment ②: consistent underspend → loosen daily limit
    if (spendingStability > 0.85 && spikeRatio < 1.1) {
      safeDaily = Math.round(safeDaily * 1.08);
    }

    // ── ADAPTIVE: Forecast-driven pre-emptive tightening ─────────────────────
    // If balance will drop dangerously within 7 days, reduce today's limit now
    const nearTermLow = lowBalanceWarnings.find(w => w.day <= 7);
    if (nearTermLow) {
      const daysUntilLow = nearTermLow.day;
      const urgency = 1 - (daysUntilLow / 7); // 0 = 7 days away, 1 = tomorrow
      safeDaily = Math.round(safeDaily * (1 - urgency * 0.30));
    }

    // ── ADAPTIVE: Risk mode gates all downstream allocations ─────────────────
    // Derived from SafeSpendEngine risk + forecast signals
    const forecastDanger = overdraftRisk.length > 0;
    const mode = forecastDanger ? "high" :
                 rawRisk === "critical" || rawRisk === "high" ? "high" :
                 rawRisk === "medium" || nearTermLow ? "medium" : "low";

    const modeMultipliers = {
      low:    { savings: 0.40, debt: 0.40, goal: 0.50 },
      medium: { savings: 0.20, debt: 0.30, goal: 0.25 },
      high:   { savings: 0,    debt: 0,    goal: 0    },
    };
    const mult = modeMultipliers[mode];

    // ── Safe floor & surplus ──────────────────────────────────────────────────
    const safeFloor = monthlyIncome * 0.15;
    const surplus = Math.max(0,
      balance
      - soonBills.reduce((s,b) => s + parseFloat(b.amount||0), 0)
      - (totalExpenses / 30 * daysLeft)   // forecast remaining spend this period
      - safeFloor
    );

    // ── ① Daily spend limit (adaptive) ───────────────────────────────────────
    const dailySpendLimit = Math.max(0, safeDaily);

    // ── ② Savings transfer (mode-gated, adaptive amount) ─────────────────────
    let savingsTransfer = 0;
    let savingsTarget = "Emergency Fund";
    if (mode !== "high" && surplus > monthlyIncome * 0.12) {
      const efMonths = typeof FinancialCalcEngine.emergencyFundMonths === 'function' ? FinancialCalcEngine.emergencyFundMonths(data) : 0;
      const invAcct  = (data.accounts||[]).find(a => a.type === "investment");
      savingsTarget  = efMonths < 3 ? "Emergency Fund" : invAcct ? "TFSA / Investment" : "Savings";
      // Adaptive: reduce savings amount if spending is volatile
      const volatilityFactor = spendingStability > 0.7 ? 1.0 : 0.7;
      savingsTransfer = Math.round(surplus * mult.savings * volatilityFactor);
    }

    // ── ③ Debt acceleration (mode-gated) ─────────────────────────────────────
    let debtPayment = 0;
    let debtTarget  = null;
    const remainAfterSavings = surplus - savingsTransfer;
    if (mode !== "high" && remainAfterSavings > 30 && debts.length > 0 && parseFloat(debts[0].rate||0) > 8) {
      debtPayment = Math.round(Math.min(remainAfterSavings * mult.debt, 200));
      debtTarget  = debts[0];
    }

    // ── ④ Goal contribution (mode-gated) ─────────────────────────────────────
    let goalContribution = 0;
    let goalTarget = null;
    const remainAfterDebt = remainAfterSavings - debtPayment;
    if (mode === "low" && remainAfterDebt > 20 && goals.length > 0) {
      goalContribution = Math.round(remainAfterDebt * mult.goal);
      goalTarget = goals[0];
    }

    // ── ⑤ Buffer ─────────────────────────────────────────────────────────────
    const buffer = Math.max(0, balance - dailySpendLimit - savingsTransfer - debtPayment - goalContribution);

    // ── ⑥ Adaptive alerts (contextual, not generic) ──────────────────────────
    const alerts = [];
    if (mode === "high") {
      const msg = forecastDanger
        ? `Balance projected to go negative in ${overdraftRisk[0]?.day} days. Hold all non-essential spending.`
        : "Cash is critically low. Bills protection mode active — savings and extras paused.";
      alerts.push({ type:"danger", msg });
    } else if (nearTermLow) {
      alerts.push({ type:"warning", msg:`Balance drops near your safety floor in ${nearTermLow.day} days — daily limit tightened by 15% as a precaution.` });
    }
    if (spikeRatio > 1.4 && mode !== "high") {
      alerts.push({ type:"tip", msg:`Payday spike habit detected (+${Math.round((spikeRatio-1)*100)}%). Daily limit reduced by 15% to smooth your cash flow.` });
    }

    // ── ⑦ Adherence — based on spending stability (0-100) ────────────────────
    const adherence = Math.min(100, Math.round(spendingStability * 100));

    // ── ⑧ Mode label for UI ──────────────────────────────────────────────────
    const modeLabel = mode === "low" ? "On Track" : mode === "medium" ? "Monitor" : "At Risk";
    const adaptations = [
      spikeRatio > 1.4 && `Limit -15% (payday spike habit)`,
      nearTermLow && `Limit tightened (low balance in ${nearTermLow.day}d)`,
      spendingStability > 0.85 && `Limit +8% (consistent spending)`,
      mode === "high" && `Extras paused (protect bills first)`,
    ].filter(Boolean);

    return {
      dailySpendLimit, savingsTransfer, savingsTarget,
      debtPayment, debtTarget, goalContribution, goalTarget,
      buffer, alerts, mode, modeLabel,
      daysLeft, adherence, surplus, adaptations,
      riskLevel: rawRisk,
    };
  }
};


// ── ENGINE 5: FINANCIAL HEALTH SCORE ENGINE (spec-compliant weights) ──────────
// Weights from Flourish spec: Savings 25%, Debt 20%, Emergency 20%,
// Spending Stability 15%, Investments 10%, Credit 10%

// ── ENGINE 5: FINANCIAL HEALTH SCORE (spec-compliant: Savings 25%, Debt 20%, Emergency 20%, Stability 15%, Investments 10%, Credit 10%) ──
function calcHealthScore(data) {
  // Pull from engines for consistency
  const { monthlyIncome, totalExpenses, monthlySpend } = FinancialCalcEngine.cashFlow(data);
  const efMonths      = FinancialCalcEngine.emergencyFundMonths(data);
  const debtRatio     = FinancialCalcEngine.debtRatio(data);
  const savingsRate   = FinancialCalcEngine.savingsRate(data);
  const { spendingStability } = BehaviorEngine.analyze(data);
  const accounts      = data.accounts || [];
  const debts         = data.debts    || [];

  // ① Savings Rate — 25 pts
  // 20%+ savings rate = full score; 0% = 0 pts
  const srScore = Math.min(25, Math.round(savingsRate * 125));

  // ② Debt Ratio — 20 pts
  // No debt = 20; debt > 1× annual income = 0
  const drScore = Math.max(0, Math.round(20 * (1 - Math.min(1, debtRatio * 1.25))));

  // ③ Emergency Fund — 20 pts
  // 3 months = 15 pts; 6 months = full 20 pts
  const efScore = efMonths >= 6 ? 20 : efMonths >= 3 ? 15 : efMonths >= 1 ? 9 : Math.round(efMonths * 6);

  // ④ Spending Stability — 15 pts
  // Low variance in daily spend = higher score
  const ssScore = Math.round(spendingStability * 15);

  // ⑤ Investments — 10 pts
  const hasInv = accounts.some(a => a.type === "investment");
  const invBal = accounts.filter(a => a.type === "investment").reduce((s,a) => s + parseFloat(a.balance||0), 0);
  const ivScore = hasInv ? Math.min(10, 5 + Math.round(Math.min(5, invBal / (monthlyIncome * 3)))) : 0;

  // ⑥ Credit Health — 10 pts
  const rawCredit = data.profile?.creditScore ? parseFloat(data.profile.creditScore) : 680;
  const crScore = rawCredit >= 760 ? 10 : rawCredit >= 720 ? 8 : rawCredit >= 670 ? 6 : rawCredit >= 620 ? 4 : 2;

  const score = Math.min(100, Math.max(8, srScore + drScore + efScore + ssScore + ivScore + crScore));

  const pillars = [
    {label:"Savings Rate",    pts:srScore, max:25, detail:`${Math.round(savingsRate*100)}% savings rate`},
    {label:"Debt Ratio",      pts:drScore, max:20, detail:`${Math.round(debtRatio*100)}% of annual income`},
    {label:"Emergency Fund",  pts:efScore, max:20, detail:`${efMonths.toFixed(1)} months covered`},
    {label:"Stability",       pts:ssScore, max:15, detail:`Spending consistency`},
    {label:"Investments",     pts:ivScore, max:10, detail:hasInv?`$${invBal.toFixed(0)} invested`:`Not started`},
    {label:"Credit",          pts:crScore, max:10, detail:`Score ~${rawCredit}`},
  ];
  return { score, pillars, breakdown:{ srScore, drScore, efScore, ssScore, ivScore, crScore } };
}

function HealthScoreRing({score, size=110, strokeW=9, bonus=0}) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.ceil(score / 40);
    const t = setInterval(() => {
      start = Math.min(start + step, score);
      setDisplayed(start);
      if (start >= score) clearInterval(t);
    }, 22);
    return () => clearInterval(t);
  }, [score]);
  const r = (size - strokeW * 2) / 2;
  const circ = 2 * Math.PI * r;
  const progress = (displayed / 100) * circ;
  const grade = score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 50 ? "Fair" : score >= 35 ? "Needs Work" : "Critical";
  const gradeColor = score >= 80 ? C.greenBright : score >= 65 ? C.tealBright : score >= 50 ? C.goldBright : score >= 35 ? C.orangeBright : C.redBright;
  const gId = "hsr" + size + score;
  return (
    <div style={{position:"relative", width:size, height:size, flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)", display:"block"}}>
        <defs>
          <linearGradient id={gId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={score>=65?C.green:C.gold}/>
            <stop offset="100%" stopColor={gradeColor}/>
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={"url(#"+gId+")"}
          strokeWidth={strokeW} strokeDasharray={`${progress} ${circ}`}
          strokeLinecap="round" style={{transition:"stroke-dasharray 0.05s linear"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0}}>
        <div style={{fontSize:Math.round(size*0.27),fontWeight:900,color:gradeColor,fontFamily:"'Playfair Display',serif",lineHeight:1}}>{displayed}</div>
        <div style={{fontSize:Math.round(size*0.094),color:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,lineHeight:1.3}}>{grade}</div>
        {bonus>0&&<div style={{fontSize:Math.round(size*0.082),color:C.greenBright,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,marginTop:1}}>+{bonus} ✦</div>}
      </div>
    </div>
  );
}

function WeeklyCheckInModal({data, onClose, onComplete}) {
  const [step, setStep] = useState(0);
  const [mood, setMood] = useState(null);
  const [surprise, setSurprise] = useState("");
  const [win, setWin] = useState("");
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);

  const moods = [
    {emoji:"😰", label:"Stressed", val:1},
    {emoji:"😕", label:"Uneasy",   val:2},
    {emoji:"😐", label:"Neutral",  val:3},
    {emoji:"🙂", label:"Okay",     val:4},
    {emoji:"😄", label:"Great",    val:5},
  ];

  const surpriseOpts = ["Eating out","Subscriptions","Shopping","Fuel / Transit","Impulse buy","Medical","Entertainment","Other"];
  const winOpts = ["Skipped a purchase","Paid a bill early","Saved something","Stuck to budget","Paid extra on debt","Nothing yet"];

  const fetchInsight = async () => {
    setLoading(true);
    const txns = (data.transactions || MOCK_TXN).slice(0, 15).map(t=>`${t.name||t.merchant||"Purchase"} $${Math.abs(t.amount)}`).join(", ");
    const {score} = calcHealthScore(data);
    const prompt = `You are a warm financial coach. The user just completed their weekly money check-in. Their current Financial Health Score is ${score}/100. Their money mood this week: ${moods.find(m=>m.val===mood)?.label||"Neutral"}. Biggest spending surprise: ${surprise||"none"}. Financial win: ${win||"none"}. Recent transactions: ${txns}. Give ONE specific, encouraging action they can take this week to improve their Financial Health Score by 2-5 points. Keep it to 2 sentences max. Be warm and concrete.`;
    try {
      const r = await fetch("/api/coach", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ type:"checkin", payload:{ prompt } })
      });
      const d = await r.json();
      setInsight(d.content?.[0]?.text || "Great job checking in! Keep tracking your spending this week and look for one subscription you can pause.");
    } catch { setInsight("Great job checking in! Focus on one small win this week — even saving $20 moves your score forward."); }
    setLoading(false);
    setStep(4);
  };

  const steps = [
    // Step 0: Mood
    <div key={0} style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>💚</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:C.cream,lineHeight:1.2}}>How do you feel about money this week?</div>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
        {moods.map(m=>(
          <button key={m.val} onClick={()=>setMood(m.val)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"14px 12px",borderRadius:18,border:`2px solid ${mood===m.val?C.green+"88":C.border}`,background:mood===m.val?C.greenDim:C.card,cursor:"pointer",minWidth:60,transition:"all .15s"}}>
            <span style={{fontSize:28}}>{m.emoji}</span>
            <span style={{fontSize:10,color:mood===m.val?C.green:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{m.label}</span>
          </button>
        ))}
      </div>
      <button onClick={()=>mood&&setStep(1)} style={{background:mood?`linear-gradient(135deg,${C.green},${C.greenBright})`:"#e0e0e0",color:mood?"#fff":C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:15,padding:"14px",borderRadius:99,border:"none",cursor:mood?"pointer":"default",transition:"all .2s"}}>Next →</button>
    </div>,

    // Step 1: Surprise
    <div key={1} style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>💸</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:C.cream,lineHeight:1.3}}>What was your biggest spending surprise?</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {surpriseOpts.map(o=>(
          <button key={o} onClick={()=>setSurprise(o)} style={{padding:"12px 10px",borderRadius:14,border:`1.5px solid ${surprise===o?C.orange+"99":C.border}`,background:surprise===o?C.orangeDim:C.card,color:surprise===o?C.orange:C.mutedHi,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,fontSize:12,cursor:"pointer",transition:"all .15s"}}>{o}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>setStep(0)} style={{flex:1,padding:"13px",borderRadius:99,border:`1px solid ${C.border}`,background:"none",color:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,cursor:"pointer"}}>← Back</button>
        <button onClick={()=>setStep(2)} style={{flex:2,background:`linear-gradient(135deg,${C.green},${C.greenBright})`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:15,padding:"13px",borderRadius:99,border:"none",cursor:"pointer"}}>Next →</button>
      </div>
    </div>,

    // Step 2: Win
    <div key={2} style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>🏆</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:C.cream,lineHeight:1.3}}>Share one financial win this week</div>
        <div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:6}}>Every small step counts.</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {winOpts.map(o=>(
          <button key={o} onClick={()=>setWin(o)} style={{padding:"12px 16px",borderRadius:14,border:`1.5px solid ${win===o?C.green+"99":C.border}`,background:win===o?C.greenDim:C.card,color:win===o?C.green:C.mutedHi,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer",textAlign:"left",transition:"all .15s"}}>
            {win===o?"✓ ":""}{o}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>setStep(1)} style={{flex:1,padding:"13px",borderRadius:99,border:`1px solid ${C.border}`,background:"none",color:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,cursor:"pointer"}}>← Back</button>
        <button onClick={fetchInsight} style={{flex:2,background:`linear-gradient(135deg,${C.green},${C.greenBright})`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:15,padding:"13px",borderRadius:99,border:"none",cursor:"pointer"}}>{loading?"Getting your coaching...":"Get My Insight →"}</button>
      </div>
    </div>,

    // Step 4: Result (loading is step 3, handled inline)
    insight && <div key={4} style={{display:"flex",flexDirection:"column",gap:20,textAlign:"center"}}>
      <div style={{fontSize:48,animation:"fadeUp 0.4s ease both"}}>✦</div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:C.green,lineHeight:1.2}}>Check-In Complete!</div>
      <div style={{background:C.greenDim,border:`1.5px solid ${C.green}33`,borderRadius:20,padding:"18px 20px",textAlign:"left"}}>
        <div style={{color:C.green,fontSize:10,textTransform:"uppercase",letterSpacing:1.6,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,marginBottom:8}}>Your AI Coach Says</div>
        <div style={{color:C.cream,fontSize:14,lineHeight:1.7,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{insight}</div>
      </div>
      <div style={{background:`linear-gradient(135deg,${C.green}18,${C.greenDim})`,border:`1px solid ${C.green}33`,borderRadius:18,padding:"16px"}}>
        <div style={{fontSize:28,marginBottom:4}}>🎯</div>
        <div style={{color:C.green,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:16}}>Financial Health Score</div>
        <div style={{color:C.greenBright,fontWeight:900,fontFamily:"'Playfair Display',serif",fontSize:32,marginTop:4}}>+3 points this week ✦</div>
        <div style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4}}>Check in every week to keep growing</div>
      </div>
      <button onClick={()=>onComplete(3)} style={{background:`linear-gradient(135deg,${C.green},${C.greenBright})`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:15,padding:"16px",borderRadius:99,border:"none",cursor:"pointer",boxShadow:`0 6px 20px ${C.green}40`}}>Done — See My Score ✦</button>
    </div>,
  ];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:999,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0 0 0 0"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.bg,borderRadius:"28px 28px 0 0",padding:"28px 24px 40px",width:"100%",maxWidth:520,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 -20px 60px rgba(0,0,0,0.2)"}}>
        {/* Step indicator */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
          <div style={{display:"flex",gap:6}}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{width:i<=(step===4?3:step)?28:8,height:8,borderRadius:99,background:i<=(step===4?3:step)?C.green:C.border,transition:"all .3s"}}/>
            ))}
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer",padding:"4px 8px",lineHeight:1}}>×</button>
        </div>
        {loading
          ? <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:40,marginBottom:16,animation:"spin 1s linear infinite"}}>💚</div>
              <div style={{color:C.cream,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:16,fontWeight:600}}>Analyzing your week...</div>
              <div style={{color:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,marginTop:8}}>Building your personalized insight</div>
            </div>
          : steps[step===4?3:step]
        }
      </div>
    </div>
  );
}




// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function Onboarding({onComplete}){
  const [step,setStep]=useState(0);
  const [p,setP]=useState({name:"",country:"CA",province:"ON",status:"single",hasKids:false,partnerName:"",creditScore:680,creditKnown:false});
  const [incomes,setIncomes]=useState([{id:1,label:"Primary Income",amount:"",freq:"biweekly",type:"employment"}]);
  const [bills,setBills]=useState([{name:"Rent/Mortgage",amount:"",date:"1"},{name:"Hydro/Electric",amount:"",date:"11"},{name:"Phone",amount:"",date:"15"}]);
  const [debts,setDebts]=useState([{name:"Credit Card",balance:"3420",rate:"19.99",min:"68"}]);
  const [bankStage,setBankStage]=useState("select");
  const [bankProg,setBankProg]=useState(0);
  const [bankError,setBankError]=useState(null);
  const [connAccts,setConnAccts]=useState([]);
  const [plaidTxns,setPlaidTxns]=useState([]);
  const [linkToken,setLinkToken]=useState(null);
  const [detectedBills,setDetectedBills]=useState(null); // null=not yet detected, []=detected but empty

  // Fetch Plaid link_token as soon as user hits the bank step
  const [linkTokenLoading, setLinkTokenLoading] = useState(false);

  const fetchLinkToken = useCallback(()=>{
    if(linkToken) return; // already have one
    setLinkTokenLoading(true);
    setBankError(null);
    callPlaid("create_link_token",{country:p.country})
      .then(d=>{ setLinkToken(d.link_token); setLinkTokenLoading(false); })
      .catch(()=>{ setBankError("Could not reach Plaid — check your connection and try again."); setLinkTokenLoading(false); });
  },[linkToken, p.country]); // eslint-disable-line

  useEffect(()=>{ if(step===3) fetchLinkToken(); },[step]); // eslint-disable-line

  // Called by Plaid Link after user authenticates
  const onPlaidSuccess=useCallback(async(publicToken,metadata)=>{
    setBankStage("loading");setBankProg(0);setBankError(null);
    // Bug fix: declare timer outside try so catch can always clear it
    let progTimer=null;
    try{
      progTimer=setInterval(()=>setBankProg(v=>Math.min(v+7,88)),220);
      const ex=await callPlaid("exchange_token",{
        public_token:publicToken,
        institution_name:metadata?.institution?.name||"Your Bank",
      });
      const [acctData,txnData]=await Promise.all([
        callPlaid("get_accounts",{access_token:ex.access_token}),
        // Bug fix: guard against undefined transactions array from backend
        callPlaid("get_transactions",{access_token:ex.access_token,days:90}),
      ]);
      clearInterval(progTimer);setBankProg(100);
      setTimeout(()=>{
        setConnAccts(acctData.accounts.map(a=>({
          id:a.id,
          name:`${ex.institution_name} ••${a.mask||"????"}`,
          type:a.subtype||a.type,
          balance:a.type==="credit"?-(a.balance.current||0):(a.balance.available??a.balance.current??0),
          institution:ex.institution_name,
        })));
        // Bug fix: guard txnData.transactions — backend may return undefined on error
        const normalised = normaliseTxns(txnData.transactions||[]);
        setPlaidTxns(normalised);
        // Auto-detect recurring bills from real transaction data
        const detected = detectRecurringBills(normalised);
        setDetectedBills(detected);
        // Pre-fill the bills array — user can confirm/edit/remove on step 4
        if (detected.length > 0) {
          setBills(detected.map(b=>({name:b.name,amount:b.amount,date:b.date,auto:b.auto,avgNote:b.avgNote})));
        }
        setBankStage("done");
      },400);
    }catch(err){
      // Bug fix: always clear the progress interval even if exchange fails
      if(progTimer) clearInterval(progTimer);
      // Bug fix: surface needs_reconnect errors distinctly
      const msg = err.message?.includes("needs_reconnect") || err.needs_reconnect
        ? "Your bank session expired. Please reconnect your bank."
        : "Connection failed: "+err.message;
      setBankError(msg);
      setBankStage("select");
    }
  },[]);

  const {openPlaidLink,plaidReady,plaidSdkError}=usePlaidLinkSDK(linkToken,onPlaidSuccess);
  const isLinkReady = plaidReady && !linkTokenLoading;
  const initError   = plaidSdkError ? "Plaid SDK failed to load — try refreshing the page." : null;

  const skipBank=()=>{setConnAccts([{id:"m1",name:"Chequing",type:"checking",balance:DEMO.balance,institution:"Manual"}]);setBankStage("done");};
  const addBill=()=>setBills([...bills,{name:"",amount:"",date:"1"}]);
  const rmBill=i=>setBills(bills.filter((_,x)=>x!==i));
  const upBill=(i,f,v)=>setBills(bills.map((b,x)=>x===i?{...b,[f]:v}:b));
  const addDebt=()=>setDebts([...debts,{name:"",balance:"",rate:"",min:""}]);
  const rmDebt=i=>setDebts(debts.filter((_,x)=>x!==i));
  const upDebt=(i,f,v)=>setDebts(debts.map((d,x)=>x===i?{...d,[f]:v}:d));
  const finish=()=>onComplete({profile:p,incomes:incomes.filter(i=>i.amount),bills:bills.filter(b=>b.name&&b.amount),debts:debts.filter(d=>d.name&&d.balance),accounts:connAccts,transactions:plaidTxns.length?plaidTxns:MOCK_TXN,bankConnected:connAccts.some(a=>a.institution!=="Manual")});

  const banks=(CC[p.country]?.banks||CC.CA.banks);

  const screens=[
    // 0: Welcome
    <div style={{minHeight:"70vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"20px 0",position:"relative"}}>
      {/* Background decorative rings */}
      <div style={{position:"absolute",top:"42%",left:"50%",transform:"translate(-50%,-50%)",width:340,height:340,borderRadius:"50%",border:`1px solid ${C.green}12`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:"42%",left:"50%",transform:"translate(-50%,-50%)",width:250,height:250,borderRadius:"50%",border:`1px solid ${C.green}1C`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:"42%",left:"50%",transform:"translate(-50%,-50%)",width:170,height:170,borderRadius:"50%",border:`1px solid ${C.green}2B`,pointerEvents:"none"}}/>
      {/* Ambient glow */}
      <div style={{position:"absolute",top:"42%",left:"50%",transform:"translate(-50%,-60%)",width:300,height:300,borderRadius:"50%",background:`radial-gradient(circle,${C.green}15 0%,transparent 70%)`,pointerEvents:"none",animation:"breathe 7s ease-in-out infinite"}}/>

      {/* Logo mark */}
      <div style={{position:"relative",marginBottom:32,animation:"logoFloat 5s ease-in-out infinite"}}>
        <div style={{width:96,height:96,borderRadius:30,background:C.isDark?"linear-gradient(145deg,rgba(0,204,133,0.14) 0%,rgba(0,204,133,0.06) 100%)":"linear-gradient(145deg,rgba(0,147,95,0.10) 0%,rgba(0,147,95,0.04) 100%)",border:`1.5px solid ${C.green}44`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 0 0 1px rgba(255,255,255,0.04), 0 12px 48px rgba(0,204,133,0.18), 0 4px 16px rgba(0,0,0,0.30)",backdropFilter:"blur(12px)"}}><FlourishMark size={58}/></div>
      </div>

      {/* Wordmark */}
      <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,fontSize:50,color:C.cream,lineHeight:0.95,letterSpacing:-2,marginBottom:10,background:`linear-gradient(160deg,${C.cream} 40%,rgba(237,233,226,0.65) 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
        Flourish
      </div>
      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,color:C.green,letterSpacing:3.5,textTransform:"uppercase",fontWeight:700,marginBottom:22,opacity:0.9}}>
        Money coaching that grows with you
      </div>

      {/* Tagline */}
      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",color:C.muted,fontSize:15,lineHeight:1.85,maxWidth:300,marginBottom:34}}>
        Know exactly where you stand.<br/>
        <span style={{color:C.cream,fontWeight:600}}>Before you spend. Not after.</span>
      </div>

      {/* Feature pills */}
      <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginBottom:36,maxWidth:340}}>
        {[["","Overdraft warnings"],["","Cash flow forecast"],["","AI coaching"],["","Credit score"],["","Tax credits"],["","Family tools"]].map(([icon,text],i)=>(
          <div key={i} style={{background:C.isDark?"rgba(255,255,255,0.05)":C.surface,border:`1px solid ${C.border}`,borderRadius:99,padding:"7px 15px",color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:6,animation:`fadeUp 0.4s ease ${100+i*60}ms both`,backdropFilter:"blur(8px)"}}>
            <span style={{fontSize:14}}>{icon}</span>{text}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button onClick={()=>setStep(1)} style={{background:`linear-gradient(135deg,${C.green} 0%,${C.greenBright} 100%)`,color:C.isDark?"#041810":"#FFFFFF",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:16,padding:"17px 44px",borderRadius:99,border:"1.5px solid rgba(255,255,255,0.18)",cursor:"pointer",boxShadow:`0 0 0 1px ${C.green}22, 0 10px 40px ${C.green}44, inset 0 1px 0 rgba(255,255,255,0.30)`,letterSpacing:0.3,transition:"all .25s cubic-bezier(.16,1,.3,1)"}}
        onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px) scale(1.02)";e.currentTarget.style.boxShadow=`0 0 0 1px ${C.green}33, 0 16px 52px ${C.green}55, inset 0 1px 0 rgba(255,255,255,0.30)`;}}
        onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0) scale(1)";e.currentTarget.style.boxShadow=`0 0 0 1px ${C.green}22, 0 10px 40px ${C.green}44, inset 0 1px 0 rgba(255,255,255,0.30)`;}}>
        Build My Financial Plan →
      </button>

      {/* Demo mode — required for App Store review */}
      <button onClick={()=>onComplete({
        profile:{name:"Alex",country:"CA",province:"ON",status:"couple",hasKids:true,partnerName:"Jordan",creditScore:718,creditKnown:true},
        incomes:[{id:1,label:"Full-time Job",amount:"2840",freq:"biweekly",type:"employment"},{id:2,label:"Canada Child Benefit",amount:"560",freq:"monthly",type:"ccb"}],
        bills:[{name:"Rent",amount:"1650",date:"1"},{name:"Hydro",amount:"95",date:"11"},{name:"Phone",amount:"65",date:"15"},{name:"Netflix",amount:"18.99",date:"22"}],
        debts:[{name:"TD Visa",balance:"3420",rate:"19.99",min:"68"},{name:"Car Loan",balance:"8200",rate:"6.99",min:"280"}],
        accounts:MOCK_ACCOUNTS,transactions:MOCK_TXN,bankConnected:true,
      })} style={{marginTop:12,background:"none",border:`1px solid ${C.border}`,borderRadius:99,padding:"11px 28px",color:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,cursor:"pointer",fontWeight:600,transition:"all .2s"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.borderHi;e.currentTarget.style.color=C.cream;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}>
        👀 Try Demo (no account needed)
      </button>

      <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:14}}>Free to start · Available in 🇨🇦 Canada & 🇺🇸 USA</div>

      {/* PIPEDA consent notice */}
      <div style={{marginTop:20,padding:"12px 16px",background:C.card,borderRadius:14,border:`1px solid ${C.border}`,maxWidth:320,textAlign:"left"}}>
        <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.7}}>
          By continuing you agree to our{" "}
          <a href="https://flourishmoney.app/terms" target="_blank" rel="noopener noreferrer" style={{color:C.green,textDecoration:"none",fontWeight:600}}>Terms of Service</a>{" "}and{" "}
          <a href="https://flourishmoney.app/privacy" target="_blank" rel="noopener noreferrer" style={{color:C.green,textDecoration:"none",fontWeight:600}}>Privacy Policy</a>
          , and consent to the collection and processing of your financial data in accordance with PIPEDA (Canada) and applicable US privacy laws.
        </div>
      </div>
    </div>,

    // 1: Profile
    <div>
      <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,fontSize:30,color:C.cream,marginBottom:6,letterSpacing:-0.5}}>About you</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:20,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Just the basics. Everything stays on your device.</div>
      <Inp label="First Name" value={p.name} onChange={v=>setP({...p,name:v})} placeholder="e.g. Amanda"/>
      <Sel label="Country" value={p.country} onChange={v=>setP({...p,country:v,province:v==="CA"?"ON":"CA"})} options={[{value:"CA",label:"🇨🇦 Canada"},{value:"US",label:"🇺🇸 United States"}]}/>
      <Sel label={p.country==="CA"?"Province":"State"} value={p.province} onChange={v=>setP({...p,province:v})}
        options={p.country==="CA"?[{value:"ON",label:"Ontario"},{value:"BC",label:"British Columbia"},{value:"AB",label:"Alberta"},{value:"QC",label:"Quebec"},{value:"MB",label:"Manitoba"},{value:"OTHER",label:"Other"}]:[{value:"CA",label:"California"},{value:"TX",label:"Texas"},{value:"NY",label:"New York"},{value:"FL",label:"Florida"},{value:"OTHER",label:"Other"}]}/>
      <Sel label="Relationship Status" value={p.status} onChange={v=>setP({...p,status:v})} options={[{value:"single",label:"Single"},{value:"couple",label:"Married"},{value:"cohabit",label:"Common Law"}]}/>
      {p.status!=="single"&&<Inp label="Partner's Name (optional)" value={p.partnerName} onChange={v=>setP({...p,partnerName:v})} placeholder="e.g. James"/>}
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:8,fontWeight:700}}>Do you have kids?</div>
        <div style={{display:"flex",gap:10}}>
          {["Yes","No"].map(opt=><button key={opt} onClick={()=>setP({...p,hasKids:opt==="Yes"})} style={{flex:1,background:(opt==="Yes"?p.hasKids:!p.hasKids)?C.green+"33":C.cardAlt,border:`1px solid ${(opt==="Yes"?p.hasKids:!p.hasKids)?C.green:C.border}`,color:(opt==="Yes"?p.hasKids:!p.hasKids)?C.greenBright:C.muted,borderRadius:12,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit"}}>{opt}</button>)}
        </div>
      </div>
      <Btn label="Continue →" onClick={()=>setStep(2)} disabled={!p.name}/>
    </div>,

    // 2: Income
    <div>
      <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,fontSize:30,color:C.cream,marginBottom:6,letterSpacing:-0.5}}>Your income</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:16,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Add every source of income — employment, freelance, benefits, rental, your partner's pay. We map it all.</div>
      {incomes.map((inc,i)=>(
        <div key={inc.id} style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.border}`,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{color:C.cream,fontWeight:700,fontSize:14}}>{inc.label||`Income Source ${i+1}`}</div>
            {incomes.length>1&&<button onClick={()=>setIncomes(incomes.filter(x=>x.id!==inc.id))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:0}}>×</button>}
          </div>
          <div style={{marginBottom:10}}>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>Label</div>
            <input value={inc.label} onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,label:e.target.value}:x))}
              placeholder="e.g. Full-time job, Freelance, Child tax benefit"
              style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.cream,fontSize:14,fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:10}}>
            <div style={{flex:1}}>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>Take-Home Amount</div>
              <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                <span style={{color:C.muted,padding:"0 10px",fontSize:14}}>$</span>
                <input value={inc.amount} onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,amount:e.target.value}:x))}
                  type="number" placeholder="0.00"
                  style={{flex:1,background:"none",border:"none",padding:"10px 12px 10px 0",color:C.cream,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>Frequency</div>
              <select value={inc.freq} onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,freq:e.target.value}:x))}
                style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.cream,fontSize:13,fontFamily:"inherit"}}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="semimonthly">Twice a month</option>
                <option value="monthly">Monthly</option>
                <option value="irregular">Variable</option>
              </select>
            </div>
          </div>
          <div>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>Type</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {(CC[p.country]?.incomeTypes||CC.CA.incomeTypes).map(([val,lbl])=>(
                <button key={val} onClick={()=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,type:val}:x))}
                  style={{background:inc.type===val?C.green+"22":C.cardAlt,border:`1px solid ${inc.type===val?C.green:C.border}`,color:inc.type===val?C.greenBright:C.muted,borderRadius:99,padding:"5px 10px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{lbl}</button>
              ))}
            </div>
          </div>
        </div>
      ))}
      <button onClick={()=>setIncomes([...incomes,{id:Date.now(),label:"",amount:"",freq:"biweekly",type:"employment"}])}
        style={{width:"100%",background:"none",border:`1px dashed ${C.green}`,borderRadius:14,padding:"12px",color:C.green,fontSize:14,cursor:"pointer",fontFamily:"inherit",marginBottom:14,fontWeight:600}}>
        + Add Another Income Source
      </button>
      <div style={{background:C.goldDim,border:`1px solid ${C.gold}44`,borderRadius:16,padding:"14px 16px",marginBottom:14}}>
        <div style={{color:C.goldBright,fontSize:13,lineHeight:1.6}}>💡 Include every source — even irregular ones. Flourish maps all income vs. bills to warn you <strong>before</strong> you hit zero.</div>
      </div>
      <Btn label="Continue →" onClick={()=>setStep(3)} disabled={!incomes.some(i=>i.amount)}/>
    </div>,

    // 3: Bank Connection
    <div>
      <div style={{fontSize:28,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5,marginBottom:6}}>Connect your bank</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:16}}>Live transactions unlock AI coaching and real overdraft warnings.</div>
      {bankStage==="select"&&<>
        {/* Trust bar */}
        <div style={{background:C.tealDim,border:`1px solid ${C.teal}44`,borderRadius:16,padding:"14px 16px",marginBottom:14}}>
          <div style={{color:C.tealBright,fontWeight:700,marginBottom:8}}>🔒 Powered by Plaid</div>
          {[["✅","Read-only. We can never move your money"],["✅","256-bit encryption, bank-level security"],["✅","Live balances + 90 days of transactions"],["✅","Disconnect any time from settings"]].map(([ico,t],i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"3px 0",color:C.cream,fontSize:13}}><span>{ico}</span><span>{t}</span></div>
          ))}
        </div>

        {/* Error state with retry */}
        {(bankError||initError)&&(
          <div style={{background:"#ff444422",border:"1px solid #ff444466",borderRadius:12,padding:"12px 16px",marginBottom:12}}>
            <div style={{color:"#ff8888",fontSize:13,marginBottom:8}}>{bankError||initError}</div>
            {!initError&&<button onClick={()=>{setLinkToken(null);fetchLinkToken();}} style={{background:"none",border:"1px solid #ff888844",borderRadius:8,padding:"6px 14px",color:"#ff8888",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>↺ Retry</button>}
          </div>
        )}

        {/* Main CTA button */}
        <button
          onClick={isLinkReady?openPlaidLink:undefined}
          disabled={!isLinkReady||!!initError}
          style={{width:"100%",background:isLinkReady&&!initError?`linear-gradient(135deg,${C.teal},${C.tealBright})`:"rgba(255,255,255,0.06)",border:isLinkReady&&!initError?"none":`1px solid ${C.border}`,borderRadius:14,padding:"15px 18px",color:"white",fontSize:15,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:10,cursor:isLinkReady&&!initError?"pointer":"default",fontFamily:"inherit",marginBottom:10,transition:"all .3s",opacity:isLinkReady&&!initError?1:0.55}}>
          {linkTokenLoading?(
            <><span style={{width:18,height:18,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",display:"inline-block",animation:"pulse 0.8s linear infinite"}}/><span>Connecting to Plaid…</span></>
          ):(
            <><span style={{fontSize:20}}>🏦</span><span>{isLinkReady?"Connect My Bank Securely →":initError?"SDK unavailable":"Ready"}</span></>
          )}
        </button>

        <div style={{color:C.muted,fontSize:11,textAlign:"center",marginBottom:14}}>
          {initError?"Please refresh and try again":linkTokenLoading?"Preparing secure connection…":"Supports TD, RBC, Chase, BoA, and 11,000+ more"}
        </div>

        <div style={{marginTop:6}}><Btn label="Skip — enter manually" onClick={skipBank} outline color={C.muted} small/></div>
      </>}

      {bankStage==="loading"&&<div style={{textAlign:"center",padding:"40px 0"}}>
        <div style={{marginBottom:14,display:"flex",justifyContent:"center",filter:"drop-shadow(0 0 20px #3CB54A55)"}}><FlourishMark size={54}/></div>
        <div style={{color:C.greenBright,fontWeight:700,fontSize:18,marginBottom:8}}>
          {bankProg<35?"Exchanging credentials…":bankProg<70?"Fetching your accounts…":"Importing transactions…"}
        </div>
        <div style={{color:C.muted,fontSize:13,marginBottom:22}}>Securely syncing 90 days of history</div>
        <div style={{background:C.isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)",borderRadius:99,height:6,overflow:"hidden",margin:"0 10px"}}>
          <div style={{width:`${bankProg}%`,height:"100%",background:`linear-gradient(90deg,${C.green},${C.teal})`,borderRadius:99,transition:"width .4s ease-out"}}/>
        </div>
        <div style={{color:C.muted,fontSize:12,marginTop:8}}>{Math.round(bankProg)}%</div>
      </div>}

      {bankStage==="done"&&<div>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{width:80,height:80,borderRadius:"50%",background:C.green+"22",border:`1px solid ${C.green}44`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}><Icon id="check" size={40} color={C.greenBright} strokeWidth={1.9}/></div>
          <div style={{fontSize:20,fontWeight:800,color:C.greenBright,fontFamily:"Georgia,serif"}}>Connected!</div>
          <div style={{color:C.mutedHi,fontSize:13,marginTop:4}}>
            {connAccts.length} account{connAccts.length!==1?"s":""} · {plaidTxns.length||MOCK_TXN.length} transactions imported
          </div>
        </div>
        {connAccts.map((a,i)=>(
          <div key={i} style={{background:C.cardAlt,border:`1px solid ${C.green}44`,borderRadius:14,padding:"13px 16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:C.cream,fontWeight:700}}>{a.name}</div>
              <div style={{color:C.muted,fontSize:12}}>{a.institution} · {a.type}{a.pending?" · ⏳ pending":""}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:a.balance>=0?C.greenBright:C.red,fontWeight:800}}>${Math.abs(a.balance).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              <Chip label={a.balance>=0?"Asset":"Credit"} color={a.balance>=0?C.green:C.red}/>
            </div>
          </div>
        ))}
        <Btn label="Let's go →" onClick={()=>setStep(4)}/>
      </div>}
    </div>,

    // 4: Bills
    <div>
      <div style={{fontSize:28,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5,marginBottom:6}}>Your bills</div>
      {detectedBills&&detectedBills.length>0?(
        <div style={{color:C.muted,fontSize:14,marginBottom:14}}>
          We found <span style={{color:C.tealBright,fontWeight:700}}>{detectedBills.length} recurring bills</span> from your transactions. Amounts are averaged — edit anything that looks off.
        </div>
      ):(
        <div style={{color:C.muted,fontSize:14,marginBottom:14}}>Everything that comes out monthly.</div>
      )}
      {detectedBills===null&&<div style={{background:C.tealDim,border:`1px solid ${C.teal}33`,borderRadius:14,padding:"12px 16px",marginBottom:14,color:C.tealBright,fontSize:13}}>
        💡 Connect your bank to auto-detect recurring bills from your transactions.
      </div>}
      {bills.map((b,i)=>(
        <div key={i} style={{background:C.cardAlt,borderRadius:16,padding:"14px 16px",border:`1px solid ${b.auto?C.teal+"66":C.border}`,marginBottom:10}}>
          {b.auto&&<div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{background:C.teal+"22",border:`1px solid ${C.teal}44`,borderRadius:99,padding:"2px 10px",color:C.tealBright,fontSize:11,fontWeight:700}}>✦ Auto-detected</span>
            {b.avgNote&&<span style={{color:C.muted,fontSize:11}}>{b.avgNote}</span>}
          </div>}
          <div style={{display:"flex",gap:8}}>
            <div style={{flex:1}}>
              <Inp label="Bill Name" value={b.name} onChange={v=>upBill(i,"name",v)} placeholder="Netflix, Hydro, Rent…" sm/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <Inp label="Amount $" value={b.amount} onChange={v=>upBill(i,"amount",v)} type="number" sm/>
                <Inp label="Day Due" value={b.date} onChange={v=>upBill(i,"date",v)} type="number" placeholder="1–28" sm/>
              </div>
            </div>
            {bills.length>1&&<button onClick={()=>rmBill(i)} style={{background:C.redDim,border:"none",color:C.red,borderRadius:8,padding:"6px 10px",cursor:"pointer",alignSelf:"flex-start",marginTop:18}}>✕</button>}
          </div>
        </div>
      ))}
      <Btn label="+ Add Bill" onClick={addBill} outline color={C.green} small/>
      <div style={{marginTop:10}}><Btn label="Continue →" onClick={()=>setStep(5)}/></div>
    </div>,

    // 5: Debts
    <div>
      <div style={{fontSize:28,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5,marginBottom:6}}>Any debt?</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:20}}>No judgment — we'll build a real payoff plan with a simulator.</div>
      {debts.map((d,i)=>(
        <div key={i} style={{background:C.cardAlt,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.border}`,marginBottom:10}}>
          <div style={{display:"flex",gap:8}}>
            <div style={{flex:1}}>
              <Inp label="Name" value={d.name} onChange={v=>upDebt(i,"name",v)} placeholder="Visa, Car Loan…" sm/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <Inp label="Balance $" value={d.balance} onChange={v=>upDebt(i,"balance",v)} type="number" sm/>
                <Inp label="Rate %" value={d.rate} onChange={v=>upDebt(i,"rate",v)} type="number" sm/>
              </div>
              <Inp label="Min Payment $" value={d.min} onChange={v=>upDebt(i,"min",v)} type="number" sm/>
            </div>
            {debts.length>1&&<button onClick={()=>rmDebt(i)} style={{background:C.redDim,border:"none",color:C.red,borderRadius:8,padding:"6px 10px",cursor:"pointer",alignSelf:"flex-start",marginTop:18}}>✕</button>}
          </div>
        </div>
      ))}
      <Btn label="+ Add Debt" onClick={addDebt} outline color={C.green} small/>
      <div style={{marginTop:6}}><Btn label="No debt — skip" onClick={()=>setStep(6)} outline color={C.muted} small/></div>
      <div style={{marginTop:8}}><Btn label="Continue →" onClick={()=>setStep(6)}/></div>
    </div>,

    // 6: Credit Score
    <div>
      <div style={{fontSize:28,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5,marginBottom:6}}>Your credit score</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:16}}>Optional — but unlocks personalised coaching on how to improve it.</div>
      <div style={{background:C.tealDim,border:`1px solid ${C.teal}44`,borderRadius:16,padding:"14px 16px",marginBottom:20}}>
        <div style={{color:C.tealBright,fontWeight:700,marginBottom:6}}>🔒 How Flourish uses this</div>
        {[["✅","Soft pull only — never affects your score"],["✅","Personalized tips tied to your real balances"],["✅","Tracks improvement over time"],["❌","Never shared with lenders or third parties"]].map(([ico,t],i)=><div key={i} style={{display:"flex",gap:8,padding:"3px 0",color:ico==="✅"?C.cream:C.muted,fontSize:13}}><span>{ico}</span><span>{t}</span></div>)}
      </div>
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:8,fontWeight:700}}>Do you know your current score?</div>
        <div style={{display:"flex",gap:10}}>
          {["Yes, I know it","Not sure / skip"].map(opt=><button key={opt} onClick={()=>setP({...p,creditKnown:opt.startsWith("Yes")})} style={{flex:1,background:((opt.startsWith("Yes")?p.creditKnown:!p.creditKnown))?C.teal+"33":C.cardAlt,border:`1px solid ${(opt.startsWith("Yes")?p.creditKnown:!p.creditKnown)?C.teal:C.border}`,color:(opt.startsWith("Yes")?p.creditKnown:!p.creditKnown)?C.tealBright:C.muted,borderRadius:12,padding:"12px 8px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>{opt}</button>)}
        </div>
      </div>
      {p.creditKnown&&<>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:12,fontWeight:700}}>Drag to your score</div>
        <div style={{background:`linear-gradient(135deg,${C.tealDim} 0%,${C.card} 100%)`,borderRadius:20,padding:"20px 22px",border:`1px solid ${C.teal}44`,marginBottom:16}}>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:52,fontWeight:900,fontFamily:"Georgia,serif",color:p.creditScore>=750?C.greenBright:p.creditScore>=700?C.teal:p.creditScore>=650?C.goldBright:p.creditScore>=600?C.orange:C.redBright}}>{p.creditScore}</div>
            <Chip label={p.creditScore>=750?"Excellent 🌟":p.creditScore>=700?"Very Good 👍":p.creditScore>=650?"Good ✓":p.creditScore>=600?"Fair ⚠️":"Needs Work 🔧"} color={p.creditScore>=750?C.green:p.creditScore>=700?C.teal:p.creditScore>=650?C.gold:p.creditScore>=600?C.orange:C.red} size={13}/>
          </div>
          <input type="range" min={300} max={900} step={5} value={p.creditScore} onChange={e=>setP({...p,creditScore:Number(e.target.value)})} style={{width:"100%",accentColor:C.teal,height:6,cursor:"pointer",marginBottom:8}}/>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.red,fontSize:10}}>300 Poor</span><span style={{color:C.gold,fontSize:10}}>650 Good</span><span style={{color:C.greenBright,fontSize:10}}>900 Excellent</span></div>
        </div>
        <div style={{color:C.muted,fontSize:12,textAlign:"center",marginBottom:16}}>Check your score free at Borrowell (CA) or Credit Karma (US/CA) — soft pull only.</div>
      </>}
      {!p.creditKnown&&<div style={{background:C.cardAlt,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.border}`,marginBottom:16}}>
        <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.6}}>No problem. Flourish will estimate your score range from your debt utilization and payment patterns once you're connected. You can add it later in Settings.</div>
      </div>}
      <Btn label="Continue →" onClick={()=>setStep(7)}/>
    </div>,
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:68,marginBottom:16,filter:"drop-shadow(0 0 20px #3CB54A44)"}}>🎉</div>
      <div style={{fontSize:30,fontWeight:900,color:C.greenBright,fontFamily:"Georgia,serif",marginBottom:10}}>You're all set{p.name?`, ${p.name}`:""}!</div>
      <div style={{color:C.mutedHi,fontSize:15,lineHeight:1.7,marginBottom:22}}>Here's what Flourish has ready:</div>
      {[
        ["check",`${connAccts.length} account${connAccts.length!==1?"s":""} connected`],
        ["📅",`${bills.filter(b=>b.name&&b.amount).length} bills in your 2-week forecast`],
        ["📉",debts.filter(d=>d.name&&d.balance).length>0?"Debt payoff simulator built — drag to see your date":"No debt tracked — incredible!"],
        ["💳",p.creditKnown?`Credit score ${p.creditScore} tracked — coaching personalised`:"Credit score estimated from your data"],
        ["🧠",`AI coach ready to analyze your ${plaidTxns.length||MOCK_TXN.length} transactions`],
        ["🔔","Overdraft alerts and coach notifications on"],
        [p.status==="single"?"🧘":"💑",p.status==="single"?"Weekly solo check-in ready":"Couples money meeting ready"],
        [p.hasKids?"👧":"🎓",p.hasKids?"Kids Zone unlocked":"Money School unlocked"],
      ].map(([icon,text],i)=>(
        <div key={i} style={{background:`linear-gradient(135deg,${C.greenDim} 0%,${C.cardAlt} 100%)`,borderRadius:16,padding:"13px 16px",display:"flex",gap:12,alignItems:"center",border:`1px solid rgba(0,204,133,0.18)`,marginBottom:8,textAlign:"left",animation:`fadeUp 0.4s cubic-bezier(.16,1,.3,1) ${i*60}ms both`}}>
          <div style={{width:28,height:28,borderRadius:99,background:C.greenDim,border:`1px solid ${C.green}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon id="check" size={14} color={C.greenBright} strokeWidth={2.5}/></div><span style={{color:C.cream,fontSize:14,flex:1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{text}</span>
        </div>
      ))}
      <div style={{marginTop:20}}><Btn label="Open My Dashboard →" onClick={finish}/></div>
    </div>,
  ];

  return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",justifyContent:"center",fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"background .4s"}}>
      <div style={{width:"100%",maxWidth:430,padding:"28px 20px 60px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><FlourishMark size={22} style={{borderRadius:6}}/><span style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,fontSize:18,background:`linear-gradient(130deg,${C.cream} 30%,rgba(237,233,226,0.65) 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-0.4}}>flourish</span></div>
          {step>0&&step<7&&<button onClick={()=>setStep(s=>s-1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>← Back</button>}
        </div>
        {step>0&&step<7&&<div style={{display:"flex",gap:3,marginBottom:28}}>{Array.from({length:7}).map((_,i)=><div key={i} style={{height:3,borderRadius:99,flex:i===step-1?3:1,background:i<step?`linear-gradient(90deg,${C.green},${C.greenBright})`:C.border,transition:"all .45s cubic-bezier(.16,1,.3,1)",boxShadow:i<step?`0 0 8px ${C.green}44`:"none"}}/>)}</div>}
        {screens[step]}
      </div>
    </div>
  );
}


// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
const INIT_NOTIFS=[
  {id:1,icon:"💡",title:"Today's safe spend: $47",body:"Based on your balance, bills, and forecast. Stay on track!",read:false,time:"9:01 AM",type:"autopilot"},
  {id:2,icon:"📅",title:"Rent due in 3 days",body:"$1,850 → Landlord. Your balance covers it — you're good.",read:false,time:"8:30 AM",type:"bill"},
  {id:3,icon:"🎯",title:"Debt payoff milestone!",body:"You're 68% through your Visa. At this rate, done by Oct 2025.",read:true,time:"Yesterday",type:"win"},
  {id:4,icon:"📈",title:"Score improved +2 this week",body:"Your Financial Health Score is now 74. Keep it up!",read:true,time:"Yesterday",type:"score"},
  {id:5,icon:"🧠",title:"Spending spike detected",body:"You spent 38% more in the 3 days after payday. Move $200 to savings now?",read:true,time:"Mar 6",type:"behavior"},
  {id:6,icon:"💰",title:"You could save $47/mo",body:"3 subscriptions you haven't used this month total $47. Review them in Spend.",read:true,time:"Mar 5",type:"opportunity"},
];

function Notifications({onClose}){
  const [notifs,setNotifs]=useState(INIT_NOTIFS);
  const unread=notifs.filter(n=>!n.read).length;
  return <div style={{color:C.cream}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
      <div>
        <div style={{fontSize:24,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>Notifications</div>
        {unread>0&&<div style={{color:C.red,fontSize:12,fontWeight:700}}>{unread} unread</div>}
      </div>
      <div style={{display:"flex",gap:8}}>
        {unread>0&&<button onClick={()=>setNotifs(ns=>ns.map(n=>({...n,read:true})))} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Mark all read</button>}
        <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:13}}>← Back</button>
      </div>
    </div>
    {notifs.map(n=>(
      <div key={n.id} onClick={()=>setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,read:true}:x))}
        style={{background:n.read?C.card:n.color+"12",borderRadius:20,padding:"15px 17px",border:`1px solid ${n.read?C.border:n.color+"44"}`,marginBottom:10,cursor:"pointer",position:"relative",transition:"all .2s"}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
          <div style={{width:40,height:40,borderRadius:12,background:n.color+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon id={n.icon||"bell"} size={18} color={n.color} strokeWidth={1.5}/></div>
          <div style={{flex:1}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <div style={{color:n.read?C.cream:n.color,fontWeight:700,fontSize:14}}>{n.title}</div>
              <button onClick={e=>{e.stopPropagation();setNotifs(ns=>ns.filter(x=>x.id!==n.id));}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:"0 0 0 8px",fontSize:14}}>✕</button>
            </div>
            <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.55,marginTop:4}}>{n.body}</div>
            <div style={{color:C.muted,fontSize:11,marginTop:6}}>{n.time}</div>
          </div>
        </div>
        {!n.read&&<div style={{position:"absolute",top:15,right:42,width:8,height:8,borderRadius:"50%",background:n.color}}/>}
      </div>
    ))}
  </div>;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({data,setScreen,setShowNotifs,onUpgrade,checkInBonus=0,onCheckIn,onWhatIf,onWrapped,isDesktop=false}){
  const [mounted,setMounted]=useState(false);
  const [expandedTile,setExpandedTile]=useState(null);
  useEffect(()=>{const t=setTimeout(()=>setMounted(true),60);return()=>clearTimeout(t);},[]);

  // ── Engines ──────────────────────────────────────────────────────────────────
  const _ss         = SafeSpendEngine.calculate(data);
  const bal         = _ss.balance;
  const safe        = _ss.safeAmount;
  const overdraft   = _ss.overdraft;
  const soonBills   = _ss.soonBills;
  const soonTotal   = _ss.upcomingBills;
  const today       = new Date().getDate();
  const monthlyIncome = FinancialCalcEngine.cashFlow(data).monthlyIncome;
  const totalDebt=(data.debts||[]).reduce((a,d)=>a+parseFloat(d.balance||0),0);
  const netWorth=bal+DEMO.netWorthAdd-totalDebt;
  const unread=INIT_NOTIFS.filter(n=>!n.read).length;
  const spark=[-4200,-3800,-3100,-2600,-1900,netWorth];
  const sMin=Math.min(...spark),sMax=Math.max(...spark);
  const sN=spark.map(v=>90-((v-sMin)/(sMax-sMin)||0)*70);
  const heroColor=overdraft?C.red:C.green;
  const heroColorBright=overdraft?C.redBright:C.greenBright;
  const {score:healthScore,pillars}=calcHealthScore(data);
  const adjScore=Math.min(100,healthScore+(checkInBonus||0));
  const scoreColor=adjScore>=80?C.greenBright:adjScore>=65?C.tealBright:adjScore>=50?C.goldBright:adjScore>=35?C.orangeBright:C.redBright;
  const scoreBase=adjScore>=80?C.green:adjScore>=65?C.teal:adjScore>=50?C.gold:adjScore>=35?C.orange:C.red;
  const scoreGrade=adjScore>=80?"Excellent":adjScore>=65?"Good":adjScore>=50?"Fair":adjScore>=35?"Needs Work":"Critical";
  const topPillar=pillars.reduce((a,b)=>((b.max-b.pts)>=(a.max-a.pts)?b:a),pillars[0]);
  const scoreInsight=topPillar.label==="Emergency Fund"?`Build a 3-month emergency fund → +5 pts`:topPillar.label==="Debt Ratio"?`Pay $150/mo extra on highest-rate debt → +4 pts`:topPillar.label==="Budget"?`Cut discretionary 10% this month → +3 pts`:`Improve ${topPillar.label.toLowerCase()} to boost your score`;

  // ── Generative priority logic ────────────────────────────────────────────────
  const urgentBill = soonBills.find(b=>parseInt(b.date)-today<=2);
  const isPayday   = today===15||today===1; // simple heuristic

  // ── Style helpers ────────────────────────────────────────────────────────────
  const anim=(delay=0,extra={})=>mounted?{animation:`fadeUp 0.55s cubic-bezier(.16,1,.3,1) ${delay}ms both`,...extra}:{opacity:0,...extra};
  const glass=(tint="",border="")=>({
    background: tint?`linear-gradient(145deg,${tint}14 0%,${C.glass} 60%)`:C.glass,
    backdropFilter:"blur(20px)",
    WebkitBackdropFilter:"blur(20px)",
    border:`1px solid ${border||C.glassEdge}`,
    boxShadow:"0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
  });
  const label11=(color=C.muted)=>({
    color,fontSize:9,textTransform:"uppercase",letterSpacing:1.8,
    fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,
  });

  // ── Streak data ──────────────────────────────────────────────────────────────
  const streak=(data.streak||0);
  const streakMax=7;
  const streakColor=streak>=7?C.goldBright:streak>=4?C.greenBright:streak>=2?C.tealBright:C.muted;

  // ── Net worth invest ─────────────────────────────────────────────────────────
  const invAccts=(data.accounts||[]).filter(a=>a.type==="investment");

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* ── Top status bar ───────────────────────────────────────────────── */}
      <div style={{...anim(0),display:"flex",alignItems:"center",justifyContent:"space-between",paddingBottom:2}}>
        <div style={{display:"flex",alignItems:"center",gap:7,background:"rgba(0,204,133,0.06)",border:"1px solid rgba(0,204,133,0.12)",borderRadius:99,padding:"4px 10px"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:C.green,boxShadow:`0 0 8px ${C.green}`,animation:"pulse 2.8s ease-in-out infinite",flexShrink:0}}/>
          <span style={{color:C.green,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,letterSpacing:0.4}}>Live</span>
          <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>· 6 engines</span>
        </div>
        <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:0.2}}>{new Date().toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"})}</span>
      </div>

      {/* ── Greeting + Bell ──────────────────────────────────────────────── */}
      <div style={{...anim(30),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:27,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",lineHeight:1.15,letterSpacing:-0.5}}>
            Hey {data.profile.name} 👋
          </div>
          <div style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>
            {urgentBill?`⚠️ ${urgentBill.name} due in ${parseInt(urgentBill.date)-today} day${parseInt(urgentBill.date)-today===1?"":"s"}`:isPayday?"🎉 Payday — great time to save":"Here's your financial pulse"}
          </div>
        </div>
        <button onClick={()=>setShowNotifs(true)} style={{position:"relative",...glass(unread>0?C.red:""),borderRadius:14,width:44,height:44,cursor:"pointer",color:C.cream,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",flexShrink:0}}>
          <Icon id="bell" size={18} color={C.cream} strokeWidth={1.5}/>
          {unread>0&&<>
            <div style={{position:"absolute",top:-3,right:-3,width:16,height:16,borderRadius:"50%",background:C.red,color:"#fff",fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{unread}</div>
            <div style={{position:"absolute",top:-3,right:-3,width:16,height:16,borderRadius:"50%",background:C.red,animation:"ringPulse 1.5s ease-out infinite"}}/>
          </>}
        </button>
      </div>

      {/* ── Sample data banner — before bento so it reads as a context setter ── */}
      {(!data.transactions||data.transactions.length===0)&&(
        <div style={{...anim(50),...glass(C.gold,C.gold+"28"),borderRadius:16,padding:"11px 16px",display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:16,flexShrink:0}}>🔗</span>
          <div style={{flex:1}}>
            <span style={{color:C.goldBright,fontWeight:700,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Sample data shown</span>
            <span style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginLeft:6}}>Connect your bank in Settings</span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          BENTO GRID — 2-column base, items span as needed
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>

        {/* ── HERO: Safe to Spend ── full width ─────────────────────────── */}
        <div style={{...anim(60),gridColumn:"1 / -1",cursor:"pointer",position:"relative",overflow:"hidden",borderRadius:28,
          background:overdraft
            ?(C.isDark?"linear-gradient(155deg,rgba(24,6,16,0.92) 0%,rgba(32,8,16,0.85) 45%,rgba(12,5,10,0.90) 100%)":"linear-gradient(155deg,rgba(255,240,244,0.96) 0%,rgba(255,232,238,0.94) 45%,rgba(244,241,235,0.96) 100%)")
            :(C.isDark?"linear-gradient(155deg,rgba(5,21,9,0.92) 0%,rgba(8,30,13,0.85) 45%,rgba(6,10,14,0.90) 100%)":"linear-gradient(155deg,rgba(236,252,244,0.96) 0%,rgba(228,250,238,0.94) 45%,rgba(244,241,235,0.96) 100%)"),
          backdropFilter:"blur(24px)",
          WebkitBackdropFilter:"blur(24px)",
          border:`1px solid ${heroColor}28`,
          boxShadow:`0 20px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.025), inset 0 1px 0 ${heroColor}20`,
        }} onClick={()=>setScreen("plan")}>
          {/* Ambient orbs */}
          <div style={{position:"absolute",top:-60,right:-60,width:280,height:280,borderRadius:"50%",background:`radial-gradient(circle,${heroColor}16 0%,transparent 65%)`,pointerEvents:"none"}}/>
          <div style={{position:"absolute",bottom:-40,left:-40,width:200,height:200,borderRadius:"50%",background:`radial-gradient(circle,${heroColor}09 0%,transparent 70%)`,pointerEvents:"none"}}/>
          {/* Dot grid texture */}
          <div style={{position:"absolute",inset:0,backgroundImage:`radial-gradient(circle,${heroColor}18 1px,transparent 1px)`,backgroundSize:"24px 24px",pointerEvents:"none",opacity:0.45,maskImage:"radial-gradient(ellipse 100% 80% at 50% 50%,black 40%,transparent 100%)"}}/>
          <div style={{position:"relative",padding:"24px 24px 20px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:heroColorBright,boxShadow:`0 0 10px ${heroColor}`}}/>
              <span style={{color:heroColorBright+"99",fontSize:9,textTransform:"uppercase",letterSpacing:2.5,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>Today's Safe Limit</span>
            </div>
            <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,lineHeight:0.88,marginBottom:18}}>
              <span style={{fontSize:24,color:heroColorBright+"77",verticalAlign:"top",marginTop:11,display:"inline-block",fontWeight:700}}>$</span>
              <span style={{fontSize:76,color:heroColorBright,letterSpacing:-4,textShadow:`0 0 60px ${heroColor}${C.isDark?"40":"30"}`}}>
                <CountUp to={safe} decimals={2} dur={1200}/>
              </span>
            </div>
            {/* Balance + actions row */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Balance </span>
                <span style={{color:C.cream,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>${bal.toFixed(2)}</span>
                <span style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}> · bills out</span>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {onWhatIf&&<button onClick={e=>{e.stopPropagation();onWhatIf();}} style={{background:C.teal+"22",border:`1px solid ${C.teal}44`,color:C.tealBright,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:10,padding:"5px 11px",borderRadius:99,cursor:"pointer"}}>What if? →</button>}
                <span style={{color:heroColor,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>Forecast →</span>
              </div>
            </div>
            {overdraft&&<div style={{marginTop:12,padding:"10px 14px",background:C.red+"18",borderRadius:14,border:`1px solid ${C.red}33`,color:C.cream,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              <strong style={{color:C.redBright}}>Overdraft risk</strong> — bills exceed your balance. Hold non-essential spending.
            </div>}
          </div>
        </div>

        {/* ── BENTO ROW 1: 3 mini stat tiles inside 2-col span ──────────── */}
        <div style={{...anim(110),gridColumn:"1 / -1",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[
            {label:"Due Soon",value:`$${soonTotal.toFixed(0)}`,sub:`next 10 days`,color:C.gold,icon:"calendar",screen:"plan"},
            {label:totalDebt>0?"Total Debt":"Debt Free!",value:totalDebt>0?`$${(totalDebt/1000).toFixed(1)}k`:"🎉",sub:totalDebt>0?`${(data.debts||[]).length} accounts`:"Amazing!",color:C.red,icon:"trendUp",screen:"goals"},
            {label:"Net Worth",value:`${netWorth>=0?"+":""}$${(Math.abs(netWorth)/1000).toFixed(1)}k`,sub:"↑ trending",color:C.teal,icon:"chartUp",screen:"plan"},
          ].map((s,i)=>(
            <div key={i} onClick={()=>setScreen(s.screen)} style={{...glass(s.color),borderRadius:20,padding:"14px 12px 12px",textAlign:"center",position:"relative",overflow:"hidden",cursor:"pointer",transition:"transform .2s, box-shadow .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)`;}}
              onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)";}}>
              <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 0%,${s.color}14 0%,transparent 70%)`,pointerEvents:"none"}}/>
              <div style={{position:"relative"}}>
                <div style={{marginBottom:5,display:"flex",justifyContent:"center"}}><Icon id={s.icon} size={16} color={s.color} strokeWidth={1.5}/></div>
                <div style={{...label11(C.muted),marginBottom:2}}>{s.label}</div>
                <div style={{fontSize:18,fontWeight:800,color:s.color,fontFamily:"'Playfair Display',Georgia,serif",lineHeight:1.1,marginTop:2}}>{s.value}</div>
                <div style={{color:C.muted,fontSize:9,marginTop:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── HEALTH SCORE — left tile ───────────────────────────────────── */}
        <div style={{...anim(140),...glass(scoreBase),borderRadius:24,padding:"18px 16px 16px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 0% 100%,${scoreBase}18 0%,transparent 65%)`,pointerEvents:"none"}}/>
          <div style={{position:"relative"}}>
            <div style={{...label11(C.muted),marginBottom:10}}>Health Score</div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <HealthScoreRing score={adjScore} size={68} strokeW={7} bonus={checkInBonus}/>
              <div>
                <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                  <span style={{fontSize:34,fontWeight:900,color:scoreColor,fontFamily:"'Playfair Display',serif",lineHeight:1,letterSpacing:-1.5,textShadow:`0 0 24px ${scoreColor}55`}}>{adjScore}</span>
                  <span style={{color:C.muted,fontSize:11}}>/100</span>
                </div>
                <div style={{color:scoreColor,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,marginTop:3}}>{scoreGrade}</div>
                <div style={{color:C.mutedHi,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2,lineHeight:1.4}}>{scoreInsight}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {onCheckIn&&<button onClick={onCheckIn} style={{flex:1,background:`linear-gradient(135deg,${C.green},${C.greenBright})`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:9,padding:"8px 6px",borderRadius:99,border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>Check-In ✦</button>}
              <button onClick={()=>setScreen("coach")} style={{flex:1,background:"none",border:`1px solid ${scoreBase}44`,color:scoreBase,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,fontSize:9,padding:"8px 6px",borderRadius:99,cursor:"pointer",whiteSpace:"nowrap"}}>Coach →</button>
            </div>
          </div>
        </div>

        {/* ── STREAK + GOALS — right tile ───────────────────────────────── */}
        <div style={{...anim(140),...glass(C.gold),borderRadius:24,padding:"18px 16px 16px",position:"relative",overflow:"hidden",cursor:"pointer"}} onClick={()=>setScreen("goals")}>
          <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 100% 0%,${C.gold}14 0%,transparent 60%)`,pointerEvents:"none"}}/>
          <div style={{position:"relative"}}>
            <div style={{...label11(C.muted),marginBottom:10}}>Savings Streak</div>
            {/* Streak flame + count */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <div style={{fontSize:38,lineHeight:1}}>{streak>=7?"🏆":streak>=4?"🔥":streak>=1?"⚡":"💤"}</div>
              <div>
                <div style={{fontSize:36,fontWeight:900,color:streakColor,fontFamily:"'Playfair Display',serif",lineHeight:1,letterSpacing:-1}}>{streak}</div>
                <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:1}}>day{streak===1?"":"s"} strong</div>
              </div>
            </div>
            {/* Streak dots */}
            <div style={{display:"flex",gap:5,marginBottom:10}}>
              {Array.from({length:streakMax},(_,i)=>(
                <div key={i} style={{flex:1,height:8,borderRadius:99,background:i<streak?`linear-gradient(90deg,${C.gold},${C.goldBright})`:C.glassEdge,transition:"background 0.3s",boxShadow:i<streak?`0 0 8px ${C.gold}55`:"none"}}/>
              ))}
            </div>
            <div style={{color:C.mutedHi,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              {streak>=7?"🎉 Weekly goal crushed!":streak>=4?`${streakMax-streak} more to goal`:streak>0?`${streak}-day streak · keep going`:"Start your streak today"}
            </div>
          </div>
        </div>

        {/* ── GENERATIVE TILE: urgent bill warning if needed ─────────────── */}
        {urgentBill&&(
          <div style={{...anim(170),gridColumn:"1 / -1",...glass(C.red,C.red+"33"),borderRadius:20,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>setScreen("plan")}>
            <div style={{width:44,height:44,borderRadius:14,background:C.red+"20",border:`1px solid ${C.red}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>⚠️</div>
            <div style={{flex:1}}>
              <div style={{color:C.redBright,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{urgentBill.name} due in {parseInt(urgentBill.date)-today} day{parseInt(urgentBill.date)-today===1?"":"s"}</div>
              <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>${urgentBill.amount} will be deducted · Tap to see full forecast</div>
            </div>
            <span style={{color:C.red,fontSize:18}}>→</span>
          </div>
        )}

        {/* ── PAYDAY SAVINGS NUDGE: generative, only on payday ─────────── */}
        {isPayday&&!urgentBill&&(
          <div style={{...anim(170),gridColumn:"1 / -1",...glass(C.green,C.green+"33"),borderRadius:20,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>setScreen("goals")}>
            <div style={{width:44,height:44,borderRadius:14,background:C.green+"20",border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>💸</div>
            <div style={{flex:1}}>
              <div style={{color:C.greenBright,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Payday! Save before you spend</div>
              <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>Transfer ${(safe*0.2).toFixed(0)} to savings first · See your goals</div>
            </div>
            <span style={{color:C.green,fontSize:18}}>→</span>
          </div>
        )}

        {/* ── NET WORTH SPARKLINE — full width ──────────────────────────── */}
        <div style={{...anim(190),gridColumn:"1 / -1",...glass(C.teal),borderRadius:22,padding:"18px 20px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{...label11(C.muted),marginBottom:4}}>Net Worth Trend</div>
              <div style={{color:C.tealBright,fontWeight:900,fontSize:26,fontFamily:"'Playfair Display',Georgia,serif",lineHeight:1,letterSpacing:-1}}>{netWorth>=0?"+":""}<span style={{fontSize:14,verticalAlign:"super",marginRight:1}}>$</span><CountUp to={Math.abs(netWorth)} decimals={0}/></div>
            </div>
            <div style={{background:C.teal+"20",border:`1px solid ${C.teal}33`,borderRadius:99,padding:"4px 12px",color:C.tealBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>↑ +$2,300 / mo</div>
          </div>
          <svg width="100%" height="52" viewBox={`0 0 ${spark.length*50} 100`} preserveAspectRatio="none" style={{display:"block",overflow:"visible"}}>
            <defs>
              <linearGradient id="sgv5" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.teal} stopOpacity="0.4"/>
                <stop offset="100%" stopColor={C.teal} stopOpacity="0"/>
              </linearGradient>
              <filter id="gfv5"><feGaussianBlur stdDeviation="1.5"/></filter>
            </defs>
            <polyline points={sN.map((y,i)=>`${i*50},${y}`).join(" ")} fill="none" stroke={C.teal+"40"} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" filter="url(#gfv5)"/>
            <polyline points={sN.map((y,i)=>`${i*50},${y}`).join(" ")} fill="none" stroke={C.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <polygon points={`0,100 ${sN.map((y,i)=>`${i*50},${y}`).join(" ")} ${(spark.length-1)*50},100`} fill="url(#sgv5)"/>
            {sN.map((y,i)=><circle key={i} cx={i*50} cy={y} r={i===sN.length-1?5:2.5} fill={i===sN.length-1?C.tealBright:C.teal} style={i===sN.length-1?{filter:`drop-shadow(0 0 5px ${C.teal})`}:{}}/>)}
          </svg>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            {["Oct","Nov","Dec","Jan","Feb","Now"].map((m,i)=><span key={i} style={{color:i===5?C.tealBright:C.muted,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:i===5?700:400}}>{m}</span>)}
          </div>
        </div>

        {/* ── DECISION ENGINE ───────────────────────────────────────────── */}
        <div style={{...anim(210),gridColumn:"1 / -1",...glass(C.purple),borderRadius:22,overflow:"hidden"}}>
          <DecisionEngine data={data} safe={safe} bal={bal} monthlyIncome={monthlyIncome} soonBills={soonBills} todayDate={today} setScreen={setScreen}/>
        </div>

        {/* ── AUTOPILOT ─────────────────────────────────────────────────── */}
        <div style={{...anim(225),gridColumn:"1 / -1",...glass(C.blue),borderRadius:22,overflow:"hidden"}}>
          <AutopilotCard data={data} setScreen={setScreen}/>
        </div>

        {/* ── TIME MACHINE — forecast graph ─────────────────────────────── */}
        <div style={{...anim(240),gridColumn:"1 / -1",...glass(C.green),borderRadius:22,padding:"18px 18px 14px"}}>
          <TimeMachine data={data}/>
        </div>

        {/* ── OPPORTUNITY DETECTOR ─────────────────────────────────────── */}
        <div style={{...anim(255),gridColumn:"1 / -1",...glass(C.gold),borderRadius:22,overflow:"hidden"}}>
          <OpportunityDetector data={data} setScreen={setScreen}/>
        </div>

        {/* ── HEALTH SCORE PILLARS: progressive disclosure ───────────────── */}
        <div style={{...anim(270),gridColumn:"1 / -1",...glass(scoreBase),borderRadius:22,padding:"14px 18px",cursor:"pointer",transition:"border-color .2s"}}
          onClick={()=>setExpandedTile(expandedTile==="pillars"?null:"pillars")}
          onMouseEnter={e=>e.currentTarget.style.borderColor=scoreBase+"33"}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.glassEdge}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{...label11(C.muted)}}>Score Breakdown</div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{expandedTile==="pillars"?"collapse":"tap to expand"}</span>
              <span style={{color:scoreBase,fontSize:14,display:"inline-block",transform:expandedTile==="pillars"?"rotate(180deg)":"none",transition:"transform .25s"}}>▾</span>
            </div>
          </div>
          {expandedTile==="pillars"&&(
            <div style={{marginTop:14,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px 14px"}}>
              {pillars.map(p=>{
                const pct=p.pts/p.max;
                const pc=pct>=0.75?C.green:pct>=0.5?C.teal:pct>=0.25?C.gold:C.red;
                return <div key={p.label}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{color:C.mutedHi,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{p.label}</span>
                    <span style={{color:pc,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>{p.pts}/{p.max}</span>
                  </div>
                  <div style={{height:5,borderRadius:99,background:C.glassEdge,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct*100}%`,background:pc,borderRadius:99,transition:"width 1s ease"}}/>
                  </div>
                </div>;
              })}
            </div>
          )}
        </div>

        {/* ── CREDIT SCORE ──────────────────────────────────────────────── */}
        {data.profile?.creditKnown&&(()=>{
          const score=data.profile.creditScore||720;
          const sc=score>=750?C.greenBright:score>=700?C.tealBright:score>=650?C.goldBright:score>=600?C.orangeBright:C.redBright;
          const scBase=score>=750?C.green:score>=700?C.teal:score>=650?C.gold:score>=600?C.orange:C.red;
          const lbl=score>=750?"Excellent":score>=700?"Good":score>=650?"Fair":score>=600?"Poor":"Very Poor";
          return <div style={{...anim(285),gridColumn:"1 / -1",...glass(scBase),borderRadius:22,padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,overflow:"hidden",position:"relative"}} onClick={()=>setScreen("goals")}>
            <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 0% 50%,${scBase}14 0%,transparent 60%)`,pointerEvents:"none"}}/>
            <div style={{width:52,height:52,borderRadius:16,background:scBase+"20",border:`1.5px solid ${scBase}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:22,fontWeight:900,color:sc,fontFamily:"'Playfair Display',serif"}}>{score>=750?"A":score>=700?"B":score>=650?"C":"D"}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{...label11(C.muted),marginBottom:2}}>Credit Score</div>
              <div style={{display:"flex",alignItems:"baseline",gap:8,marginTop:2}}>
                <span style={{fontSize:28,fontWeight:900,color:sc,fontFamily:"'Playfair Display',serif",letterSpacing:-1}}>{score}</span>
                <span style={{fontSize:13,color:scBase,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{lbl}</span>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <span style={{color:scBase,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>Coach →</span>
              <div style={{background:C.glassEdge,borderRadius:99,width:5,height:38,overflow:"hidden"}}>
                <div style={{height:`${Math.round((score-300)/6)}%`,background:`linear-gradient(to top,${sc},${scBase})`,borderRadius:99,transition:"height 1s"}}/>
              </div>
            </div>
          </div>;
        })()}

        {/* ── PREMIUM UPGRADE ───────────────────────────────────────────── */}
        {!data.isPremium&&onUpgrade&&(
          <div onClick={onUpgrade} style={{...anim(300),gridColumn:"1 / -1",...glass(C.purple,C.purple+"33"),borderRadius:20,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple+"55"}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.purple+"22"}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:24}}>✨</div>
              <div>
                <div style={{color:C.purpleBright,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Unlock Flourish Plus</div>
                <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>AI Coach · Tax Tips · Credit Coaching</div>
              </div>
            </div>
            <div style={{color:C.purple,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Try Free →</div>
          </div>
        )}

        {/* ── QUICK NAV BENTO ───────────────────────────────────────────── */}
        <div style={{...anim(320),gridColumn:"1 / -1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {label:"2-Week Forecast",icon:"calendar",screen:"plan",color:C.teal,sub:"Cash flow ahead"},
            {label:"Debt Simulator",icon:"trendUp",screen:"goals",color:C.purple,sub:"Drag to freedom date"},
            {label:"AI Coach",icon:"sparkles",screen:"coach",color:C.green,sub:"Ask anything · powered by Claude",hero:true},
            {label:data.profile.status==="single"?"Solo Check-In":"Money Meeting",icon:data.profile.status==="single"?"🧘":"💑",screen:"family",color:C.pink,sub:"Weekly ritual"},
          ].concat(onWhatIf?[{label:"What If?",icon:"sparkles",screen:null,color:C.teal,sub:"Simulate any decision",whatIf:true}]:[]).map((a,i)=>(
            <button key={a.label} onClick={()=>a.whatIf?onWhatIf():setScreen(a.screen)}
              style={{...glass(a.color,a.hero?C.green+"44":a.color+"1A"),borderRadius:20,padding:"18px 16px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all .25s",position:"relative",overflow:"hidden"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=a.color+"66";e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 14px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=a.hero?C.green+"44":a.color+"1A";e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)";}}>
              <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:`radial-gradient(circle,${a.color}14 0%,transparent 70%)`,pointerEvents:"none"}}/>
              {a.hero&&<div style={{position:"absolute",top:10,right:12,background:C.green,color:"#fff",fontSize:8,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"3px 7px",borderRadius:99,letterSpacing:0.5}}>✦ AI</div>}
              <div style={{marginBottom:8,fontSize:22}}>{typeof a.icon==="string"&&a.icon.length<=2?a.icon:<Icon id={typeof a.icon==="string"&&a.icon.length>2?a.icon:"sparkles"} size={22} color={a.hero?C.green:a.color} strokeWidth={1.6}/>}</div>
              <div style={{color:a.hero?C.green:a.color,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:3}}>{a.label}</div>
              <div style={{color:C.mutedHi,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{a.sub}</div>
            </button>
          ))}
        </div>

        {/* ── URGENT ALERT ──────────────────────────────────────────────── */}
        {INIT_NOTIFS.filter(n=>!n.read&&n.type==="urgent").slice(0,1).map(n=>(
          <div key={n.id} style={{...anim(340),gridColumn:"1 / -1",...glass(C.red,C.red+"33"),borderRadius:18,padding:"14px 16px",display:"flex",gap:12,alignItems:"flex-start",cursor:"pointer"}} onClick={()=>setShowNotifs(true)}>
            <span style={{fontSize:22,flexShrink:0}}>{n.icon}</span>
            <div style={{flex:1}}>
              <div style={{color:C.redBright,fontWeight:700,fontSize:13,marginBottom:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{n.title}</div>
              <div style={{color:C.mutedHi,fontSize:12,lineHeight:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{n.body}</div>
            </div>
            <span style={{color:C.red,fontSize:16,flexShrink:0}}>→</span>
          </div>
        ))}

      </div>{/* end bento grid */}
    </div>
  );
}

// ─── PLAN AHEAD ───────────────────────────────────────────────────────────────
function PlanAhead({data}){
  const [range,setRange]=useState(14);
  const [connected,setConnected]=useState(["Netflix","Hydro One"]);
  const [showConnect,setShowConnect]=useState(false);
  const [connecting,setConnecting]=useState(null);
  const PROVIDERS=[
    {name:"Netflix",icon:"🎬",color:"#E50914",amount:"18.99"},{name:"Spotify",icon:"🎵",color:C.green,amount:"11.99"},
    {name:"Amazon Prime",icon:"📦",color:"#FF9900",amount:"9.99"},{name:"Hydro One",icon:"⚡",color:C.gold,amount:"124.00"},
    {name:"Bell / Rogers",icon:"📱",color:C.blue,amount:"65.00"},{name:"Disney+",icon:"✨",color:"#113CCF",amount:"13.99"},
    {name:"Apple iCloud",icon:"☁️",color:"#888",amount:"3.99"},{name:"Planet Fitness",icon:"💪",color:C.purple,amount:"25.00"},
    {name:"Enbridge Gas",icon:"🔥",color:C.orange,amount:"89.00"},
  ];
  const doConnect=p=>{setConnecting(p.name);setTimeout(()=>{setConnected(c=>[...c,p.name]);setConnecting(null);},1400);};
  // ── ForecastEngine powers the plan ahead view
  const { forecast: _forecast, willGoNegative: willGoNeg, overdraftRisk, lowBalanceWarnings } = ForecastEngine.generate(data, Math.max(range, 30));
  const days = _forecast.slice(0, range).map(f => ({
    d: f.date, dayNum: f.date.getDate(),
    isPayday: f.isPayday, bills: f.bills,
    income: f.income, balance: f.balance, idx: f.day
  }));
  const { balance: bal } = SafeSpendEngine.calculate(data);
  const income = FinancialCalcEngine.cashFlow(data).monthlyIncome / 2; // bi-monthly
  const minBalance = Math.min(...days.map(d => d.balance));

  const hasBills = (data.bills||[]).length > 0;
  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    {!hasBills&&<EmptyState icon="📅" title="No bills tracked yet" body="Add your recurring bills in Settings to see a personalized cash-flow forecast." action={null} color={C.teal}/>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{fontSize:24,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>2-Week Forecast</div><div style={{color:C.muted,fontSize:12,marginTop:3}}>Your financial crystal ball</div></div>
      <div style={{display:"flex",gap:6,background:C.surface,borderRadius:12,padding:3}}>{[7,14].map(r=><button key={r} onClick={()=>setRange(r)} style={{background:range===r?C.teal+"28":"transparent",border:`1px solid ${range===r?C.teal+"55":"transparent"}`,color:range===r?C.tealBright:C.muted,borderRadius:10,padding:"6px 16px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",transition:"all .22s"}}>{r}d</button>)}</div>
    </div>
    <div style={{background:C.isDark?"rgba(255,255,255,0.03)":C.surface,borderRadius:14,padding:"10px 14px",border:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"flex-start"}}>
      <span style={{fontSize:12,flexShrink:0,marginTop:1}}>ℹ️</span>
      <span style={{color:C.muted,fontSize:10.5,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>Forecast is based on your income schedule and bill data. Actual balances may differ. Not financial advice.</span>
    </div>
    {willGoNeg&&<div style={{background:C.redDim,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.red}55`}}>
      <div style={{color:C.redBright,fontWeight:800,marginBottom:4}}>Projected Overdraft</div>
      <div style={{color:C.cream,fontSize:13,lineHeight:1.5}}>Balance hits <strong style={{color:C.red}}>${minBalance.toFixed(2)}</strong> before your next deposit. Reduce spending now.</div>
    </div>}
    <Card style={{border:`1px solid ${C.teal}33`,background:`linear-gradient(135deg,rgba(0,200,224,0.05) 0%,${C.card} 100%)`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:connected.length>0?10:0}}>
        <div><div style={{color:C.tealBright,fontWeight:700,fontSize:14}}>🔌 Connected Providers</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{connected.length} live · auto-update</div></div>
        <button onClick={()=>setShowConnect(s=>!s)} style={{background:C.teal+"28",border:`1px solid ${C.teal}55`,color:C.tealBright,borderRadius:99,padding:"6px 15px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",transition:"all .2s"}}>{showConnect?"Done":"+ Connect"}</button>
      </div>
      {connected.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:showConnect?10:0}}>
        {connected.map(name=>{const p=PROVIDERS.find(x=>x.name===name);return p?<div key={name} style={{background:(p.color||C.teal)+"22",border:`1px solid ${(p.color||C.teal)}44`,borderRadius:99,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:12}}>{p.icon}</span><span style={{color:C.cream,fontSize:11,fontWeight:600}}>{name}</span><span style={{color:C.green,fontSize:10}}>✓</span></div>:null;})}
      </div>}
      {showConnect&&<div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4}}>
        {PROVIDERS.filter(p=>!connected.includes(p.name)).map(p=>(
          <button key={p.name} onClick={()=>doConnect(p)} disabled={connecting===p.name} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px",color:C.cream,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=p.color||C.teal} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            <span style={{fontSize:16}}>{p.icon}</span><span style={{flex:1}}>{p.name}</span><span style={{color:C.muted,fontSize:11}}>${p.amount}/mo</span>
            <span style={{color:connecting===p.name?C.gold:C.teal,fontSize:11}}>{connecting===p.name?"…":"Connect"}</span>
          </button>
        ))}
      </div>}
    </Card>
    <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.8,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Day-by-Day Cash Flow</div>
    {days.filter((d,i)=>i===0||d.income>0||d.bills.length>0).map((day,i)=>{
      const isToday=day.idx===0,neg=day.balance<0,low=day.balance<150&&day.balance>=0;
      return <div key={i} style={{background:isToday?C.greenDim:neg?C.redDim:C.card,borderRadius:20,padding:"16px 18px",border:`1px solid ${isToday?C.green+"55":neg?C.red+"55":low?C.gold+"44":C.border}`,boxShadow:isToday?`0 0 24px ${C.green}18`:neg?`0 0 24px ${C.red}18`:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div>
            <div style={{color:isToday?C.greenBright:C.mutedHi,fontWeight:isToday?700:500,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{isToday?"Today ✦":day.d.toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"})}</div>
            {day.income>0&&<div style={{color:C.green,fontWeight:700,fontSize:14,marginTop:3}}>{`+$${day.income.toLocaleString()} deposited`}</div>}
            {day.bills.map((b,j)=><div key={j} style={{color:C.red,fontSize:13,marginTop:3}}>📤 {b.name}: –${parseFloat(b.amount).toFixed(2)}</div>)}
            {isToday&&!day.income&&!day.bills.length&&<div style={{color:C.muted,fontSize:12,marginTop:2}}>No scheduled activity</div>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:18,fontWeight:800,fontFamily:"Georgia,serif",color:neg?C.redBright:low?C.goldBright:C.greenBright}}>{`$${day.balance.toFixed(2)}`}</div>
            <div style={{color:C.muted,fontSize:10}}>balance</div>
          </div>
        </div>
        <Bar v={Math.max(0,day.balance)} max={bal+income} color={neg?C.red:low?C.gold:C.green} h={5}/>
        {neg&&<div style={{marginTop:8,color:C.redBright,fontSize:12,fontWeight:600}}>⚠️ Projected overdraft — NSF fees cost $45–48. Move money now.</div>}
        {low&&!neg&&<div style={{marginTop:8,color:C.goldBright,fontSize:12}}>Getting low — hold non-essential spending until next deposit.</div>}
      </div>;
    })}
  </div>;
}

// ─── SPEND ────────────────────────────────────────────────────────────────────
function SpendScreen({data}){
  const [tab,setTab]=useState("txn");
  const [catFilter,setCatFilter]=useState("All");
  const [dismissed,setDismissed]=useState([]);
  const isDemo=!(data.transactions&&data.transactions.length>0);
  const txns=isDemo?MOCK_TXN:data.transactions;
  const stats=computeStats(txns);
  const cats=["All",...Array.from(new Set(txns.map(t=>t.cat)))];
  const filtered=catFilter==="All"?txns:txns.filter(t=>t.cat===catFilter);
  const totalSpent=txns.filter(t=>t.amount>0).reduce((a,t)=>a+t.amount,0);
  const totalIn=txns.filter(t=>t.amount<0).reduce((a,t)=>a+Math.abs(t.amount),0);

  const cuts=[
    {id:1,icon:"☕",title:"Coffee is adding up",body:`${stats.coffeeCount} coffee runs this month totalling $${stats.coffee.toFixed(2)}. That's $${(stats.coffee*12).toFixed(0)}/year. Making coffee at home 4 days a week cuts this by 60%.`,saving:`$${Math.round(stats.coffee*0.6)}/mo`,effort:"Low",color:C.orange},
    {id:2,icon:"🍕",title:"Food delivery every week",body:`$${stats.delivery.toFixed(2)} on delivery this month. One fewer order per week saves $40–60/month reliably. Your wallet will notice in 30 days.`,saving:"$50/mo",effort:"Low",color:C.orange},
    {id:3,icon:"📦",title:"Amazon impulse purchases",body:"3 Amazon orders this month. Try the 48-hour rule: add to cart, wait 2 days. Most impulse buys get removed without regret.",saving:"$40–70/mo",effort:"Low",color:C.pink},
    {id:4,icon:"calendar",title:"Subscriptions creeping up",body:`$${stats.subs.toFixed(2)}/mo in subscriptions. Go through each one — did you use it last month? Most households find 1–2 to cancel painlessly.`,saving:"$15–35/mo",effort:"Low",color:C.purple},
    {id:5,icon:"chartUp",title:`${stats.busiest} is your expensive day`,body:`You spend significantly more on ${stats.busiest}s than any other day. Knowing this is half the battle — awareness alone cuts it 20–30%.`,saving:"$30–60/mo",effort:"Very Low",color:C.blue},
  ].filter(s=>!dismissed.includes(s.id));

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{fontSize:24,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>Spending</div><div style={{color:C.muted,fontSize:12,marginTop:3}}>Live from your bank</div></div>
      <div style={{textAlign:"right"}}><div style={{color:C.red,fontWeight:800,fontSize:15}}>–${totalSpent.toFixed(0)}</div><div style={{color:C.green,fontSize:11}}>+${totalIn.toFixed(0)} in</div></div>
    </div>
    <div style={{display:"flex",gap:6,background:C.surface,borderRadius:16,padding:4}}>
      {["txn","breakdown","cuts"].map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?C.orange+"28":"transparent",border:`1px solid ${tab===t?C.orange+"55":"transparent"}`,color:tab===t?C.orangeBright:C.muted,borderRadius:12,padding:"9px 0",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",transition:"all .22s cubic-bezier(.16,1,.3,1)"}}>
        {t==="txn"?"Transactions":t==="breakdown"?"Breakdown":"Smart Cuts"}
      </button>)}
    </div>
    {tab==="txn"&&<>
      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
        {cats.map(c=><button key={c} onClick={()=>setCatFilter(c)} style={{background:catFilter===c?C.orange+"28":"rgba(255,255,255,0.04)",border:`1px solid ${catFilter===c?C.orange+"66":"rgba(255,255,255,0.08)"}`,color:catFilter===c?C.orangeBright:C.muted,borderRadius:99,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap",fontFamily:"inherit",transition:"all .2s",flexShrink:0}}>{c}</button>)}
      </div>
      {filtered.map(txn=>(
        <div key={txn.id} style={{background:C.card,borderRadius:18,padding:"14px 16px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:13,transition:"all .2s",cursor:"default"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.borderHi;e.currentTarget.style.background=C.isDark?C.cardAlt:C.surface;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.card;}}>
          <div style={{width:42,height:42,borderRadius:14,background:txn.color+"18",border:`1px solid ${txn.color}28`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon id={txnIcon(txn)} size={19} color={txn.color} strokeWidth={1.5}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:C.cream,fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{txn.name}</div>
            <div style={{display:"flex",gap:6,marginTop:3,alignItems:"center"}}><Chip label={txn.cat} color={txn.color} size={10}/><span style={{color:C.muted,fontSize:10}}>{txn.date}</span>{txn.pending&&<Chip label="Pending" color={C.gold} size={9}/>}</div>
          </div>
          <div style={{color:txn.amount<0?C.greenBright:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',serif",flexShrink:0}}>{txn.amount<0?"+":"–"}${Math.abs(txn.amount).toFixed(2)}</div>
        </div>
      ))}
    </>}
    {tab==="breakdown"&&<>
      <Card style={{background:`linear-gradient(135deg,${C.orangeDim} 0%,${C.card} 100%)`,border:`1px solid ${C.orange}44`}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Total Spent This Month</div>
        <div style={{fontSize:38,fontWeight:900,color:C.orangeBright,fontFamily:"Georgia,serif"}}>{`$${totalSpent.toFixed(0)}`}</div>
      </Card>
      {stats.topCats.map(([cat,amt],i)=>{
        const colors=[C.orange,C.pink,C.green,C.blue,C.purple,C.gold];
        const catTxns=txns.filter(t=>t.cat===cat&&t.amount>0);
        return <Card key={i}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{color:C.cream,fontSize:14,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>{catTxns[0]?.icon||"💰"}</span>{cat}</span>
            <span style={{color:colors[i%6],fontWeight:700}}>${amt.toFixed(0)} <span style={{color:C.muted,fontSize:11}}>({catTxns.length}×)</span></span>
          </div>
          <Bar v={amt} max={totalSpent} color={colors[i%6]}/>
          <div style={{color:C.muted,fontSize:11,marginTop:4}}>{Math.round(amt/totalSpent*100)}% of spending</div>
        </Card>;
      })}
    </>}
    {tab==="cuts"&&<>
      <Card style={{background:`linear-gradient(135deg,${C.orangeDim} 0%,${C.card} 100%)`,border:`1px solid ${C.orange}44`}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Potential Monthly Savings</div>
        <div style={{fontSize:32,fontWeight:900,color:C.goldBright,fontFamily:"Georgia,serif"}}>$200–350</div>
        <div style={{color:C.muted,fontSize:12}}>from {cuts.length} suggestions based on your real transactions</div>
      </Card>
      {cuts.length===0?<Card style={{textAlign:"center",padding:"30px 20px"}}><div style={{fontSize:40}}>🎉</div><div style={{color:C.greenBright,fontWeight:700,marginTop:10}}>All suggestions reviewed!</div></Card>
        :cuts.map(s=><Card key={s.id} glow={s.color}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}><Icon id={s.icon||"card"} size={20} color={C.mutedHi} strokeWidth={1.5}/><span style={{color:s.color,fontWeight:800,fontSize:14}}>{s.title}</span></div>
            <button onClick={()=>setDismissed(d=>[...d,s.id])} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
          <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.6,marginBottom:10}}>{s.body}</div>
          <div style={{display:"flex",gap:8}}><Chip label={`Save ${s.saving}`} color={C.green}/><Chip label={`Effort: ${s.effort}`} color={s.effort.includes("Very")?C.teal:C.green}/></div>
        </Card>)}
    </>}
  </div>;
}


// ─── GOALS ────────────────────────────────────────────────────────────────────
function Goals({data}){
  const [tab,setTab]=useState("sim");
  const [selDebt,setSelDebt]=useState(0);
  const [extra,setExtra]=useState(50);
  const [method,setMethod]=useState("avalanche");
  const debts=data.debts||[];
  const debt=debts.length>0?debts[selDebt]:{name:"Credit Card",balance:"3420",rate:"19.99",min:"68"};
  const noDebts = debts.length === 0;
  const bal=parseFloat(debt.balance||0),rate=parseFloat(debt.rate||0),minPay=parseFloat(debt.min||68);
  const mRate=rate/100/12;
  const calc=(xtra)=>{
    const pay=minPay+xtra;if(pay<=bal*mRate)return{months:999,interest:999999};
    let b=bal,m=0,int=0;while(b>0&&m<600){const i=b*mRate;int+=i;b=b+i-pay;m++;}
    return{months:m,interest:Math.max(0,int)};
  };
  const base=calc(0),curr=calc(extra);
  const saved=base.months-curr.months,intSaved=base.interest-curr.interest;
  const toYM=(m)=>{if(m>=600)return"Never";const y=Math.floor(m/12),mo=m%12;return y>0?`${y}y ${mo}m`:`${mo}mo`;};
  const payoffDate=()=>{const d=new Date();d.setMonth(d.getMonth()+curr.months);return d.toLocaleDateString("en",{month:"long",year:"numeric"});};
  const totalDebt=debts.reduce((a,d)=>a+parseFloat(d.balance||0),0);
  const netWorth=1243.88+DEMO.netWorthAdd-totalDebt;

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:22,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>Goals & Wealth</div><div style={{background:CC[data?.profile?.country||"CA"]?.currency==="USD"?C.blue+"22":C.green+"22",border:`1px solid ${CC[data?.profile?.country||"CA"]?.currency==="USD"?C.blue:C.green}33`,borderRadius:99,padding:"4px 12px",color:CC[data?.profile?.country||"CA"]?.currency==="USD"?C.blueBright:C.greenBright,fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{CC[data?.profile?.country||"CA"]?.flag} {CC[data?.profile?.country||"CA"]?.currency}</div></div>
    <div style={{display:"flex",gap:6}}>
      {[["sim","Simulator"],["worth","Net Worth"],["retire","Retirement"],["forecast","Wealth"],["personality","Personality"],["tax","Tax Tips"],["learn","Learn"]].map(([key,lbl])=>(
        <button key={key} onClick={()=>setTab(key)} style={{flex:1,background:tab===key?C.purple+"22":C.cardAlt,border:`1px solid ${tab===key?C.purple:C.border}`,color:tab===key?C.purpleBright:C.muted,borderRadius:10,padding:"8px 0",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>{lbl}</button>
      ))}
    </div>
    {tab==="sim"&&<>
      {noDebts&&<EmptyState icon="🎯" title="No debts tracked yet" body="Add debts during setup to simulate payoff strategies and see how much interest you can save." action="Go back to Setup" onAction={()=>{}} color={C.purple}/>}
      {!noDebts&&debts.length>1&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{debts.map((d,i)=><button key={i} onClick={()=>setSelDebt(i)} style={{background:selDebt===i?C.purple+"33":C.cardAlt,border:`1px solid ${selDebt===i?C.purple:C.border}`,color:selDebt===i?C.purpleBright:C.muted,borderRadius:10,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>{d.name}</button>)}</div>}
      {!noDebts&&<div style={{background:`linear-gradient(135deg,${C.purpleDim} 0%,${C.card} 100%)`,borderRadius:20,padding:"20px 22px",border:`1px solid ${C.purple}44`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4}}>{debt.name}</div>
            <div style={{fontSize:36,fontWeight:900,color:C.purpleBright,fontFamily:"Georgia,serif",letterSpacing:-1}}>{`$${bal.toLocaleString()}`}</div>
            <div style={{color:C.muted,fontSize:12}}>{rate}% interest · ${minPay}/mo minimum</div>
          </div>
          <div style={{textAlign:"right",background:C.green+"18",borderRadius:12,padding:"8px 12px",border:`1px solid ${C.green}33`}}>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase"}}>Paid off</div>
            <div style={{color:C.greenBright,fontWeight:800,fontSize:15}}>{payoffDate()}</div>
            <div style={{color:C.muted,fontSize:11}}>{toYM(curr.months)}</div>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <div style={{color:C.cream,fontSize:13,fontWeight:600}}>Extra monthly payment</div>
            <div style={{color:C.purpleBright,fontWeight:800,fontSize:20}}>+{extra}<span style={{color:C.muted,fontSize:12}}>/mo</span></div>
          </div>
          <input type="range" min={0} max={500} step={10} value={extra} onChange={e=>setExtra(Number(e.target.value))} style={{width:"100%",accentColor:C.purple,height:6,cursor:"pointer","--thumb-color":C.purple}}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{color:C.muted,fontSize:10}}>+$0 (min only)</span><span style={{color:C.muted,fontSize:10}}>+$500/mo</span></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{background:C.green+"15",borderRadius:12,padding:"12px 14px",border:`1px solid ${C.green}33`}}>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase"}}>Time saved</div>
            <div style={{color:C.greenBright,fontWeight:800,fontSize:20,fontFamily:"Georgia,serif"}}>{saved>0?toYM(saved):"—"}</div>
          </div>
          <div style={{background:C.gold+"15",borderRadius:12,padding:"12px 14px",border:`1px solid ${C.gold}33`}}>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase"}}>Interest saved</div>
            <div style={{color:C.goldBright,fontWeight:800,fontSize:20,fontFamily:"Georgia,serif"}}>{intSaved>0?`$${Math.round(intSaved).toLocaleString()}`:"—"}</div>
          </div>
        </div>
        {extra>0&&<div style={{marginTop:12,padding:"12px 14px",background:C.purple+"15",borderRadius:12,border:`1px solid ${C.purple}44`}}>
          <div style={{color:C.cream,fontSize:13,lineHeight:1.55}}>💡 Adding <strong style={{color:C.purpleBright}}>+{extra}/month</strong> frees you <strong style={{color:C.greenBright}}>{toYM(saved)} earlier</strong> and saves <strong style={{color:C.goldBright}}>{`$${Math.round(intSaved).toLocaleString()}`}</strong> in interest.</div>
        </div>}
      </div>}
      <Card>
        <div style={{color:C.cream,fontWeight:700,marginBottom:12}}>Payoff Method</div>
        <div style={{display:"flex",gap:8}}>
          {[["avalanche","Avalanche","Highest rate first · saves the most"],["snowball","Snowball","Smallest balance first · fastest wins"]].map(([key,lbl,desc])=>(
            <button key={key} onClick={()=>setMethod(key)} style={{flex:1,background:method===key?C.purple+"22":C.cardAlt,border:`1px solid ${method===key?C.purple:C.border}`,borderRadius:12,padding:"12px 10px",cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
              <div style={{color:method===key?C.purpleBright:C.cream,fontWeight:700,fontSize:13}}>{lbl}</div>
              <div style={{color:C.muted,fontSize:11,marginTop:4,lineHeight:1.4}}>{desc}</div>
            </button>
          ))}
        </div>
      </Card>
      {debts.length>0&&<Card>
        <div style={{color:C.cream,fontWeight:700,marginBottom:12}}>All Debts ({debts.length})</div>
        {[...debts].sort((a,b)=>parseFloat(b.rate||0)-parseFloat(a.rate||0)).map((d,i)=>{
          const colors=[C.red,C.gold,C.blue,C.purple];
          return <div key={i} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:C.cream,fontSize:13}}>{d.name}</span><span style={{color:colors[i%4],fontWeight:700}}>${parseFloat(d.balance).toLocaleString()} · {d.rate}%</span></div>
            <Bar v={parseFloat(d.balance)} max={totalDebt} color={colors[i%4]}/>
          </div>;
        })}
      </Card>}
    </>}
    {tab==="worth"&&(()=>{
      const country=data.profile?.country||"CA";
      const allAccts=data.accounts||[];
      const investments=allAccts.filter(a=>a.type==="investment");
      const totalInvested=investments.reduce((s,a)=>s+(a.balance||0),0);
      const totalGain=investments.reduce((s,a)=>s+(a.gain||0),0);
      const checking=allAccts.filter(a=>a.type==="checking").reduce((s,a)=>s+(a.balance||0),1243.88);
      const savings=allAccts.filter(a=>a.type==="savings").reduce((s,a)=>s+(a.balance||0),1840);
      const totalAssets=checking+savings+totalInvested;
      const totalDebt2=(data.debts||[]).reduce((a,d)=>a+parseFloat(d.balance||0),0);
      const realNetWorth=totalAssets-totalDebt2;
      const savLabel=country==="US"?"Savings / HYSA":"Savings / TFSA";
      const allItems=[
        {label:"Chequing / Checking",value:checking,type:"asset",color:C.green,icon:"🏦"},
        {label:savLabel,value:savings,type:"asset",color:C.teal,icon:"🛡️"},
        ...investments.map(inv=>({label:inv.name,value:inv.balance||0,type:"investment",color:C.purple,icon:"chartUp",gain:inv.gain,gainPct:inv.gainPct,ticker:inv.ticker})),
        ...(data.debts||[]).map(d=>({label:d.name,value:parseFloat(d.balance||0),type:"debt",color:C.red,icon:"💳"})),
      ];
      return <>
      <div style={{background:`linear-gradient(135deg,${C.tealDim} 0%,${C.card} 100%)`,borderRadius:20,padding:"22px",border:`1px solid ${C.teal}44`}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:4,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>Your Net Worth</div>
        <div style={{fontSize:44,fontWeight:900,color:C.tealBright,fontFamily:"'Playfair Display',serif",letterSpacing:-1}}>{realNetWorth>=0?"+":""}$<CountUp to={Math.abs(realNetWorth)} decimals={0}/></div>
        <div style={{color:C.muted,fontSize:12,marginTop:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Assets minus liabilities · includes investments</div>
        {totalInvested>0&&<div style={{marginTop:12,display:"flex",gap:10}}>
          <div style={{flex:1,background:C.purple+"15",borderRadius:12,padding:"10px 14px",border:`1px solid ${C.purple}22`}}>
            <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Invested</div>
            <div style={{color:C.purpleBright,fontWeight:800,fontSize:18,fontFamily:"'Playfair Display',serif"}}>${totalInvested.toLocaleString()}</div>
          </div>
          <div style={{flex:1,background:C.green+"15",borderRadius:12,padding:"10px 14px",border:`1px solid ${C.green}22`}}>
            <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Total Gain</div>
            <div style={{color:C.greenBright,fontWeight:800,fontSize:18,fontFamily:"'Playfair Display',serif"}}>+${totalGain.toLocaleString()}</div>
          </div>
        </div>}
      </div>
      {allItems.map((item,i)=>(
        <div key={i} style={{background:C.card,borderRadius:16,padding:"14px 16px",border:`1px solid ${item.type==="investment"?C.purple+"33":C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{fontSize:20,width:32,textAlign:"center"}}>{item.icon}</div>
            <div>
              <div style={{color:C.cream,fontWeight:600,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{item.label}</div>
              {item.ticker&&<div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{item.ticker}{item.gainPct?` · +${item.gainPct}%`:""}</div>}
              <Chip label={item.type==="investment"?"Investment 📈":item.type==="asset"?"Asset ↑":"Liability ↓"} color={item.color}/>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:item.color,fontWeight:800,fontSize:15}}>{item.type==="debt"?"–":"+"}${item.value.toLocaleString()}</div>
            {item.gain&&<div style={{color:C.greenBright,fontSize:11,fontWeight:600}}>+${item.gain.toLocaleString()}</div>}
          </div>
        </div>
      ))}</>; })()}

    {tab==="tax"&&(()=>{
      const cfg=CC[data.profile?.country||"CA"];
      const tips=cfg.taxTips;
      const highPriority=tips.filter(t=>t.priority==="high");
      const other=tips.filter(t=>t.priority!=="high");
      return <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:C.goldDim,border:`1px solid ${C.gold}33`,borderRadius:16,padding:"14px 16px"}}>
          <div style={{color:C.goldBright,fontWeight:700,fontSize:13,marginBottom:4}}>{cfg.flag} {cfg.name}-specific tax opportunities</div>
          <div style={{color:C.muted,fontSize:12,lineHeight:1.6}}>Based on your country. Many people leave thousands unclaimed each year. Review each one.</div>
        </div>
        {highPriority.length>0&&<div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,paddingLeft:2}}>🔥 High Priority</div>}
        {tips.map((tip,i)=>(
          <div key={i} style={{background:C.card,borderRadius:18,padding:"18px",border:`1px solid ${tip.priority==="high"?C.gold+"44":C.border}`,position:"relative",overflow:"hidden"}}>
            {tip.priority==="high"&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${C.gold},${C.goldBright})`}}/>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{flex:1,paddingRight:12}}>
                <div style={{color:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',serif",lineHeight:1.3,marginBottom:6}}>{tip.title}</div>
                <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.65}}>{tip.body}</div>
              </div>
              <div style={{textAlign:"center",flexShrink:0}}>
                <div style={{fontSize:20}}>{tip.flag}</div>
                {tip.priority==="high"&&<div style={{color:C.goldBright,fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginTop:2}}>Priority</div>}
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:`1px solid ${C.border}`}}>
              <div>
                <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1}}>Potential savings</div>
                <div style={{color:C.goldBright,fontWeight:800,fontSize:15}}>{tip.savings}</div>
              </div>
              <div style={{background:C.gold+"18",border:`1px solid ${C.gold}33`,borderRadius:99,padding:"6px 14px",color:C.goldBright,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {tip.action} →
              </div>
            </div>
          </div>
        ))}
        {/* Benefits checker */}
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,paddingLeft:2,marginTop:4}}>🎁 Benefits You May Not Be Claiming</div>
        {cfg.benefitsChecker.map((b,i)=>(
          <div key={i} style={{background:C.card,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.teal}22`,display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{fontSize:24,flexShrink:0}}>{b.icon}</div>
            <div style={{flex:1}}>
              <div style={{color:C.cream,fontWeight:700,fontSize:13,marginBottom:2}}>{b.name}</div>
              <div style={{color:C.muted,fontSize:12,marginBottom:4}}>{b.eligible}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:C.tealBright,fontWeight:700,fontSize:13}}>{b.amount}</span>
                <span style={{color:C.teal,fontSize:11,fontWeight:600}}>{b.apply} →</span>
              </div>
            </div>
          </div>
        ))}
      </div>;
    })()}

    {tab==="retire"&&(()=>{
      const cfg=CC[data.profile?.country||"CA"];
      const accts=cfg.retirementAccounts;
      return <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{background:C.blueDim,border:`1px solid ${C.blue}33`,borderRadius:16,padding:"14px 16px"}}>
          <div style={{color:C.blueBright,fontWeight:700,fontSize:13,marginBottom:4}}>{cfg.flag} Registered & Tax-Advantaged Accounts</div>
          <div style={{color:C.muted,fontSize:12,lineHeight:1.6}}>These accounts are legal ways to keep more of your money. Most people don't maximize them.</div>
        </div>
        {accts.map((a,i)=>(
          <div key={i} style={{background:C.card,borderRadius:18,padding:"18px",border:`1px solid ${a.color}33`,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${a.color},${a.color}88)`}}/>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{width:46,height:46,borderRadius:14,background:a.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{a.icon}</div>
              <div>
                <div style={{color:a.color,fontWeight:900,fontSize:18,fontFamily:"'Playfair Display',serif"}}>{a.name}</div>
                <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{a.fullName}</div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
              <div style={{background:C.cardAlt,borderRadius:10,padding:"10px 12px"}}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.2,marginBottom:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Annual Limit</div>
                <div style={{color:C.cream,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{a.annualLimit}</div>
              </div>
              <div style={{background:C.cardAlt,borderRadius:10,padding:"10px 12px"}}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.2,marginBottom:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Tax Treatment</div>
                <div style={{color:C.mutedHi,fontSize:12,lineHeight:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{a.taxNote}</div>
              </div>
            </div>
            <div style={{background:a.color+"12",border:`1px solid ${a.color}33`,borderRadius:12,padding:"10px 14px"}}>
              <span style={{color:a.color,fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>💡 Pro tip: </span>
              <span style={{color:C.cream,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{a.tip}</span>
            </div>
          </div>
        ))}
        {/* Emergency fund target */}
        <div style={{background:C.card,borderRadius:18,padding:"18px",border:`1px solid ${C.orange}33`}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <span style={{fontSize:24}}>🆘</span>
            <div style={{color:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',serif"}}>Emergency Fund Target</div>
          </div>
          <div style={{color:C.orangeBright,fontSize:28,fontWeight:900,fontFamily:"'Playfair Display',serif",marginBottom:6}}>{cfg.emergencyMonths} months</div>
          <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{cfg.healthcareNote}</div>
        </div>
      </div>;
    })()}
    {tab==="forecast"&&<WealthForecast data={data}/>}
    {tab==="personality"&&<MoneyPersonality data={data}/>}
        {tab==="learn"&&(()=>{
      const cfg=CC[data.profile?.country||"CA"];
      return <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:C.greenDim,border:`1px solid ${C.green}33`,borderRadius:16,padding:"12px 16px",marginBottom:4}}>
          <div style={{color:C.greenBright,fontWeight:700,fontSize:13}}>{cfg.flag} {cfg.name} Financial Essentials</div>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>Country-specific concepts that directly affect your money.</div>
        </div>
        {cfg.learnCards.concat([{emoji:"📈",title:"Compound interest: your best friend",body:"$100 at 7% for 30 years becomes $761. The same math works in reverse with debt. Start investing early. Pay debt fast.",key:"Time is the most powerful financial tool."}]).map((l,i)=>(
          <Card key={i}>
            <div style={{fontSize:28,marginBottom:8}}>{l.emoji}</div>
            <div style={{color:C.cream,fontWeight:900,fontSize:16,fontFamily:"'Playfair Display',Georgia,serif",marginBottom:8,lineHeight:1.3}}>{l.title}</div>
            <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.65,marginBottom:12}}>{l.body}</div>
            <div style={{background:C.green+"18",border:`1px solid ${C.green}33`,borderRadius:12,padding:"10px 14px"}}>
              <span style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Key takeaway · </span>
              <span style={{color:C.cream,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{l.key}</span>
            </div>
          </Card>
        ))}
      </div>;
    })()}
  </div>;
}


// ─── FAMILY ───────────────────────────────────────────────────────────────────
function Family({data,household,setHousehold}){
  const [tab,setTab]=useState("meeting");
  const isCouple=data.profile.status!=="single";
  const [householdTab,setHouseholdTab]=useState("join"); // join | manage
  const [started,setStarted]=useState(false);
  const [checks,setChecks]=useState({});
  const [notes,setNotes]=useState({});
  const [mood,setMood]=useState(null);
  const [done2,setDone2]=useState(false);
  const [kidAge,setKidAge]=useState("8-12");
  const [chores,setChores]=useState([
    {id:1,task:"Make bed",reward:.50,done:true},{id:2,task:"Set the table",reward:.50,done:false},
    {id:3,task:"Take out garbage",reward:1.00,done:true},{id:4,task:"Vacuum living room",reward:2.00,done:false},
    {id:5,task:"Wash dishes",reward:1.50,done:false},{id:6,task:"Tidy bedroom",reward:1.00,done:false},
  ]);

  const agenda=isCouple?[
    {id:"bills",icon:"calendar",title:"Review upcoming bills together",desc:"Open Plan Ahead. Any surprises? Anything to prepare for?"},
    {id:"spend",icon:"chartUp",title:"Check where you each spent",desc:"No blame — just awareness. Anything consistently over budget?"},
    {id:"debt",icon:"trendUp",title:"Celebrate debt progress",desc:"Even $1 less is a win. Acknowledge the effort. If you missed a payment, figure out why without judgment."},
    {id:"goal",icon:"🎯",title:"Check in on your shared goal",desc:"Emergency fund? Vacation? House? How close? Does the goal still feel right?"},
    {id:"wins",icon:"star",title:"Name one win each",desc:"Both name one money win from this week. It rewires how you both feel about money."},
    {id:"next",icon:"📌",title:"One change for next week",desc:"Together pick ONE thing. Not ten. One achievable change. That's the habit loop."},
  ]:[
    {id:"bills",icon:"calendar",title:"What's coming up this week?",desc:"Open Plan Ahead. Any bill or expense you need to plan around?"},
    {id:"spend",icon:"chartUp",title:"How was your spending?",desc:"Honestly. No judgment. Anything feel out of control?"},
    {id:"mood",icon:"💭",title:"How do you feel about money right now?",desc:"Anxious? Calm? Overwhelmed? Your emotional state affects every decision."},
    {id:"win",icon:"star",title:"Name one win",desc:"Something you did right. Cooked at home? Resisted a sale? Put $20 away? Say it."},
    {id:"goal",icon:"🎯",title:"Check in on your goal",desc:"Emergency fund? Debt payoff? Even 1% closer is worth acknowledging."},
    {id:"next",icon:"📌",title:"One intention for next week",desc:"Not a list. One intention. Small wins build into lasting change."},
  ];

  const doneCount=Object.values(checks).filter(Boolean).length;
  const earned=chores.filter(c=>c.done).reduce((a,c)=>a+c.reward,0);

  const kidLessons={
    "4-7":[
      {emoji:"🪙",title:"Money is for trading",body:"When you want something at the store, you give money and get the thing. Money is just a trade ticket!",key:"Money is how we trade for things we want."},
      {emoji:"🐷",title:"Saving means waiting",body:"If a toy costs $10 and you have $3, you need to save $7 more. Saving means keeping money safe until you have enough.",key:"Waiting for something makes it even better."},
    ],
    "8-12":[
      {emoji:"🏦",title:"What banks do",body:"A bank keeps your money safe and pays you interest to use it. Like a super-safe piggy bank that rewards patience.",key:"Banks keep money safe AND pay you to use them."},
      {emoji:"💳",title:"Credit cards are loans",body:"A credit card lets you buy now, pay later. If you don't pay it ALL back quickly, they charge you extra — that's how people get into trouble.",key:"Pay your credit card in full every month, always."},
      {emoji:"📈",title:"Money can grow",body:"$100 at 7% becomes $386 in 20 years without doing anything. This is compound interest — money making more money.",key:"Start saving young. Time is the secret ingredient."},
    ],
    "13+":[
      {emoji:"💰",title:"Budget like a boss",body:"50% needs, 30% wants, 20% savings. Without a budget, money just disappears. A budget is a plan for the life you actually want.",key:"A budget gives your money direction."},
      {emoji:"🚫",title:"Debt borrows from your future self",body:"When you go into debt, you're spending money you haven't earned yet — and paying extra for the privilege.",key:"Debt is expensive. Use it wisely or not at all."},
      {emoji:"📊",title:"Start investing at your first job",body:"$50/month at 7% starting at 16 = $245,000 at retirement. Starting at 30 = $68,000. Starting early nearly triples your outcome.",key:"Invest with your very first paycheck."},
    ],
  };

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div><div style={{fontSize:24,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>Family</div><div style={{color:C.muted,fontSize:12}}>Money is a team sport</div></div>
    <div style={{display:"flex",gap:6}}>
      {[["meeting",isCouple?"Money Meeting":"Check-In"],["kids","Kids Zone"],["household","Household"]].map(([t,lbl])=>(
        <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?C.purple+"22":C.cardAlt,border:`1px solid ${tab===t?C.purple:C.border}`,color:tab===t?C.purpleBright:C.muted,borderRadius:12,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>
          {lbl}
        </button>
      ))}
    </div>
    {tab==="meeting"&&<>
      {!started&&!done2&&<>
        <Card style={{background:C.purpleDim,border:`1px solid ${C.purple}44`}}>
          <div style={{color:C.purpleBright,fontWeight:800,fontSize:16,marginBottom:8}}>{isCouple?"💑 Weekly Money Meeting":"🧘 Weekly Check-In"}</div>
          <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.65}}>{isCouple?`The #1 habit of couples who build wealth: a 15-minute weekly money talk. No fights, no blame — just a structured check-in.${data.profile.partnerName?` Ready to go with ${data.profile.partnerName}?`:""}`:
            "10 minutes a week. Honest reflection on where your money went and where you're heading."}</div>
        </Card>
        <Card>
          <div style={{color:C.cream,fontWeight:700,marginBottom:10}}>Today's agenda</div>
          {agenda.map((a,i)=><div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:i<agenda.length-1?`1px solid ${C.border}`:"none"}}><span style={{fontSize:16}}>{a.icon}</span><span style={{color:C.mutedHi,fontSize:13}}>{a.title}</span></div>)}
        </Card>
        <Btn label={isCouple?"Start Meeting ▶":"Start Check-In ▶"} onClick={()=>setStarted(true)} color={C.purple}/>
      </>}
      {started&&!done2&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Chip label={`${doneCount}/${agenda.length} done`} color={doneCount===agenda.length?C.green:C.purple}/>
          <div style={{display:"flex",gap:3}}>{agenda.map((a,i)=><div key={i} style={{width:28,height:3,borderRadius:99,background:checks[a.id]?C.purple:C.border,transition:"background .3s"}}/>)}</div>
        </div>
        {agenda.map(item=>(
          <div key={item.id} style={{background:checks[item.id]?C.purpleDim:C.card,borderRadius:16,padding:"16px 18px",border:`1px solid ${checks[item.id]?C.purple+"66":C.border}`,transition:"all .3s"}}>
            <div style={{display:"flex",gap:12}}>
              <div onClick={()=>setChecks(c=>({...c,[item.id]:!c[item.id]}))} style={{width:22,height:22,borderRadius:6,border:`2px solid ${checks[item.id]?C.purple:C.border}`,background:checks[item.id]?C.purple:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2,transition:"all .2s"}}>
                {checks[item.id]&&<span style={{color:C.bg,fontSize:12,fontWeight:900}}>✓</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{color:C.cream,fontWeight:700,fontSize:14,marginBottom:4}}>{item.icon} {item.title}</div>
                <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.55,marginBottom:10}}>{item.desc}</div>
                <textarea value={notes[item.id]||""} onChange={e=>setNotes(n=>({...n,[item.id]:e.target.value}))} placeholder="Notes…"
                  style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,color:C.cream,padding:"9px 12px",fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",height:56,boxSizing:"border-box"}}/>
              </div>
            </div>
          </div>
        ))}
        {!isCouple&&<Card>
          <div style={{color:C.cream,fontWeight:700,marginBottom:10}}>How do you feel right now?</div>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            {["😰","😟","😐","🙂","😊","🤩"].map(e=><button key={e} onClick={()=>setMood(e)} style={{fontSize:28,background:mood===e?C.purple+"33":"none",border:`2px solid ${mood===e?C.purple:"transparent"}`,borderRadius:12,padding:6,cursor:"pointer",transition:"all .2s"}}>{e}</button>)}
          </div>
        </Card>}
        <Btn label={doneCount===agenda.length?"Complete ✓":`Finish (${doneCount}/${agenda.length} done)`} onClick={()=>setDone2(true)} color={doneCount===agenda.length?C.purple:C.muted}/>
      </>}
      {done2&&<div style={{textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:6}}><Icon id="sparkles" size={48} color={C.green} strokeWidth={1.3}/></div>
        <div style={{fontSize:22,fontWeight:800,color:C.purpleBright,fontFamily:"Georgia,serif",marginTop:12,marginBottom:8}}>{isCouple?"Meeting complete!":"Check-in done!"}</div>
        <div style={{color:C.mutedHi,fontSize:14,lineHeight:1.7,marginBottom:20}}>{isCouple?"You just did what most couples never do: talked openly about money. That's the habit that builds wealth.":"10 minutes every week. This is the habit."}</div>
        <Btn label="Start New" onClick={()=>{setStarted(false);setDone2(false);setChecks({});setNotes({});setMood(null);}} outline color={C.purple}/>
      </div>}
    </>}
    {tab==="kids"&&<>
      <div style={{display:"flex",gap:6}}>
        {["4-7","8-12","13+"].map(age=><button key={age} onClick={()=>setKidAge(age)} style={{flex:1,background:kidAge===age?C.pink+"22":C.cardAlt,border:`1px solid ${kidAge===age?C.pink:C.border}`,color:kidAge===age?C.pinkBright:C.muted,borderRadius:10,padding:"9px 0",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>
          {age==="4-7"?"🐣 4–7":age==="8-12"?"🌱 8–12":"🌳 13+"}
        </button>)}
      </div>
      {kidLessons[kidAge].map((l,i)=>(
        <Card key={i} style={{border:`1px solid ${C.pink}22`}}>
          <div style={{fontSize:30,marginBottom:8}}>{l.emoji}</div>
          <div style={{color:C.cream,fontWeight:800,fontSize:15,fontFamily:"Georgia,serif",marginBottom:8}}>{l.title}</div>
          <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.65,marginBottom:10}}>{l.body}</div>
          <Chip label={l.key} color={C.pink} size={12}/>
        </Card>
      ))}
      <Card style={{background:`linear-gradient(135deg,${C.goldDim} 0%,${C.card} 100%)`,border:`1px solid ${C.gold}33`}}>
        <div style={{color:C.gold,fontWeight:800,marginBottom:8}}>🫙 The 3 Jar Method</div>
        <div style={{color:C.mutedHi,fontSize:13,marginBottom:12}}>Split every dollar your child earns into 3 jars.</div>
        <div style={{display:"flex",gap:8}}>
          {[{name:"Spend",emoji:"🎮",color:C.orange,desc:"Fun now"},{name:"Save",emoji:"🏦",color:C.blue,desc:"Big goals"},{name:"Give",emoji:"❤️",color:C.pink,desc:"Others"}].map((j,i)=>(
            <div key={i} style={{flex:1,background:j.color+"18",border:`1px solid ${j.color}33`,borderRadius:12,padding:"12px 8px",textAlign:"center"}}>
              <div style={{fontSize:22}}>{j.emoji}</div>
              <div style={{color:j.color,fontWeight:700,fontSize:13,marginTop:4}}>{j.name}</div>
              <div style={{color:C.muted,fontSize:10,marginTop:2}}>{j.desc}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{color:C.greenBright,fontWeight:700}}>🏡 Chore Chart</div>
          <div style={{color:C.greenBright,fontWeight:800}}>${earned.toFixed(2)} earned this week</div>
        </div>
        <Bar v={earned} max={chores.reduce((a,c)=>a+c.reward,0)} color={C.green} h={6}/>
        <div style={{marginTop:12}}>
          {chores.map(ch=>(
            <div key={ch.id} onClick={()=>setChores(c=>c.map(x=>x.id===ch.id?{...x,done:!x.done}:x))} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
              <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${ch.done?C.green:C.border}`,background:ch.done?C.green:"none",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
                {ch.done&&<span style={{color:C.bg,fontSize:12,fontWeight:900}}>✓</span>}
              </div>
              <span style={{flex:1,color:C.cream,fontSize:14,textDecoration:ch.done?"line-through":"none"}}>{ch.task}</span>
              <span style={{color:C.gold,fontWeight:700}}>+${ch.reward.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Card>

    {tab==="household"&&(()=>{
      const [householdCode,setHouseholdCode]=useState("");
      const genCode=()=>Math.random().toString(36).substring(2,8).toUpperCase();
      if(household){return(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:`linear-gradient(135deg,${C.green}18,${C.greenDim})`,borderRadius:20,padding:"22px",border:`1px solid ${C.green}33`,textAlign:"center"}}>
            <div style={{marginBottom:10,display:"flex",justifyContent:"center"}}><Icon id="house2" size={34} color={C.muted} strokeWidth={1.4}/></div>
            <div style={{color:C.greenBright,fontWeight:900,fontSize:20,fontFamily:"'Playfair Display',serif",marginBottom:6}}>Household Connected</div>
            <div style={{background:C.bg,borderRadius:14,padding:"14px 20px",display:"inline-block",marginBottom:12}}>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:2,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4}}>Household Code</div>
              <div style={{color:C.greenBright,fontWeight:900,fontSize:28,fontFamily:"'Playfair Display',serif",letterSpacing:4}}>{household.code}</div>
            </div>
            <div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>Share this code with your partner. They enter it in their Flourish app to join.</div>
          </div>
          {household.partnerName&&<div style={{background:C.card,borderRadius:16,padding:"16px 20px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:99,background:C.pink+"22",border:`1px solid ${C.pink}33`,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon id="user" size={18} color={C.mutedHi} strokeWidth={1.5}/></div>
            <div>
              <div style={{color:C.cream,fontWeight:700,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{household.partnerName}</div>
              <div style={{color:C.green,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>✓ Connected to your household</div>
            </div>
          </div>}
          <div style={{background:C.card,borderRadius:16,padding:"16px 20px",border:`1px solid ${C.border}`}}>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:12,fontWeight:600}}>Shared Goals</div>
            {(household.sharedGoals||["Emergency fund: $5,000","Vacation: $2,000","Pay off credit card"]).map((g,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<2?`1px solid ${C.border}`:"none"}}>
                <div style={{width:8,height:8,borderRadius:99,background:C.green,flexShrink:0}}/>
                <div style={{color:C.cream,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{g}</div>
              </div>
            ))}
          </div>
          <button onClick={()=>setHousehold(null)} style={{background:"none",border:`1px solid ${C.red}33`,borderRadius:12,padding:"10px",color:C.red,fontSize:13,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Leave Household</button>
        </div>
      );}
      return(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.purpleDim,borderRadius:20,padding:"20px",border:`1px solid ${C.purple}33`,textAlign:"center"}}>
            <div style={{marginBottom:10,display:"flex",justifyContent:"center"}}><Icon id="house2" size={38} color={C.green} strokeWidth={1.4}/></div>
            <div style={{color:C.purpleBright,fontWeight:900,fontSize:20,fontFamily:"'Playfair Display',serif",marginBottom:8}}>Household Sharing</div>
            <div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.7,marginBottom:0}}>Connect with a partner. See combined net worth, track shared goals, and run Money Meetings together — each person keeps their own account.</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {[["join","Join Existing"],["create","Create New"]].map(([t,lbl])=>(
              <button key={t} onClick={()=>setHouseholdTab(t)} style={{flex:1,background:householdTab===t?C.purple+"22":C.cardAlt,border:`1px solid ${householdTab===t?C.purple:C.border}`,color:householdTab===t?C.purpleBright:C.muted,borderRadius:10,padding:"10px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>{lbl}</button>
            ))}
          </div>
          {householdTab==="create"&&<>
            <div style={{background:C.card,borderRadius:16,padding:"20px",border:`1px solid ${C.border}`,textAlign:"center"}}>
              <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:8}}>Your household code:</div>
              <div style={{color:C.greenBright,fontWeight:900,fontSize:34,fontFamily:"'Playfair Display',serif",letterSpacing:5,marginBottom:8}}>FLRSH1</div>
              <div style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Share with your partner to connect</div>
            </div>
            <div>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Partner Name (optional)</div>
              <input value={householdCode} onChange={e=>setHouseholdCode(e.target.value)} placeholder="e.g. Jordan" style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.cream,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",boxSizing:"border-box"}}/>
            </div>
            <button onClick={()=>setHousehold({code:"FLRSH1",partnerName:householdCode||"Partner",sharedGoals:["Emergency fund: $5,000","Vacation: $2,000","Pay off credit card"]})}
              style={{background:`linear-gradient(135deg,${C.green},${C.greenBright})`,color:"#FFFFFF",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:15,padding:"14px",borderRadius:99,border:"none",cursor:"pointer",boxShadow:`0 6px 24px ${C.green}35`}}>
              Create Household →
            </button>
          </>}
          {householdTab==="join"&&<>
            <div>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Enter Household Code</div>
              <input value={householdCode} onChange={e=>setHouseholdCode(e.target.value.toUpperCase())} placeholder="e.g. FLRSH1" maxLength={6} style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.cream,fontSize:18,fontFamily:"'Playfair Display',serif",letterSpacing:4,boxSizing:"border-box",textTransform:"uppercase",textAlign:"center"}}/>
            </div>
            <button onClick={()=>setHousehold({code:householdCode||"FLRSH1",partnerName:data.profile?.partnerName||"Partner",sharedGoals:["Emergency fund: $5,000","Vacation: $2,000","Pay off credit card"]})}
              style={{background:`linear-gradient(135deg,${C.purple},${C.purpleBright})`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:15,padding:"14px",borderRadius:99,border:"none",cursor:"pointer",boxShadow:`0 6px 24px ${C.purple}35`}}>
              Join Household →
            </button>
          </>}
        </div>
      );
    })()}
    </>}
  </div>;
}


// ─── AI COACH ─────────────────────────────────────────────────────────────────
function AICoach({data, isOnline=true}){ // Obsidian dark
  const [insights,setInsights]=useState([]);
  const [loading,setLoading]=useState(false);
  const [chatMode,setChatMode]=useState(false);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);
  const [generated,setGenerated]=useState(false);
  const chatRef=useRef(null);
  const txns=data.transactions||MOCK_TXN;
  const stats=computeStats(txns);

  // BehaviorEngine powers rich context for AI
  const behaviorData = BehaviorEngine.analyze(data);
  const { score: healthScore, pillars: healthPillars } = calcHealthScore(data);
  const { safeAmount, riskLevel } = SafeSpendEngine.calculate(data);
  const { cashFlow: cf, monthlyIncome: mi } = FinancialCalcEngine.cashFlow(data);

  const buildCtx=()=>{
    const txSummary=txns.slice(0,20).map(t=>`${t.date}: ${t.name} ${t.amount>0?`$${t.amount} (${t.cat})`:`INCOME $${Math.abs(t.amount)}`}`).join("\n");
    const accts=(data.accounts||MOCK_ACCOUNTS).map(a=>`- ${a.name}: $${a.balance} (${a.type})`).join("\n");
    const cfg=CC[data.profile?.country||"CA"];
    const profileCtx=`PROFILE:\n- Name: ${data.profile?.name||"User"}\n- Country: ${cfg.name} (${cfg.currency})\n- Province/State: ${data.profile?.province||""}\n- Relationship: ${data.profile?.status||"single"}\n- Children: ${data.profile?.hasKids?"Yes":"No"}\n- Credit Score: ${data.profile?.creditScore||"Unknown"}`;
    const incomeCtx=data.incomes?.length>0?`INCOME SOURCES:\n${data.incomes.map(i=>`- ${i.label}: $${i.amount} ${i.freq} (${i.type})`).join("\n")}`:"INCOME: Not specified";
    const behaviorCtx=`BEHAVIOR PATTERNS:\n${behaviorData.insights.map(i=>`- [${i.type.toUpperCase()}] ${i.title}: ${i.body}`).join("\n")||"- No significant patterns detected"}\n- Spending stability score: ${Math.round(behaviorData.spendingStability*100)}%\n- Payday spike ratio: ${behaviorData.spikeRatio?.toFixed(2)||"N/A"}x`;
    const engineCtx=`FINANCIAL ENGINES OUTPUT:\n- Financial Health Score: ${healthScore}/100\n- Safe to Spend Today: $${safeAmount.toFixed(0)} (risk: ${riskLevel})\n- Monthly Cash Flow: ${cf>=0?"+":""}$${cf.toFixed(0)}\n- Savings Rate: ${Math.round(FinancialCalcEngine.savingsRate(data)*100)}%\n- Debt Ratio: ${Math.round(FinancialCalcEngine.debtRatio(data)*100)}% of annual income\n- Emergency Fund: ${FinancialCalcEngine.emergencyFundMonths(data).toFixed(1)} months\n\nHEALTH PILLARS:\n${healthPillars.map(p=>`- ${p.label}: ${p.pts}/${p.max} pts (${p.detail})`).join("\n")}`;
    return `${profileCtx}\n\n${incomeCtx}\n\nACCOUNTS:\n${accts}\n\nSPENDING SUMMARY (last 30 days):\n- Total spent: $${stats.totalSpent.toFixed(2)} ${cfg.currency}\n- Coffee: ${stats.coffeeCount} times, $${stats.coffee.toFixed(2)}\n- Food delivery: $${stats.delivery.toFixed(2)}\n- Subscriptions: $${stats.subs.toFixed(2)}/mo\n- Busiest day: ${stats.busiest}\n\nTOP CATEGORIES:\n${stats.topCats.map(([c,a])=>`- ${c}: $${a.toFixed(2)}`).join("\n")}\n\n${behaviorCtx}\n\n${engineCtx}\n\nRECENT TRANSACTIONS:\n${txSummary}`;
  };

  const generateInsights=async()=>{
    if(!isOnline){setInsights([{type:"warning",icon:"📡",title:"You're offline",body:"AI coaching requires an internet connection. Your data is saved locally and will be ready when you reconnect.",saving:"—",priority:"low"}]);return;}
    setLoading(true);setInsights([]);
    try{
      const _sys = `You are Flourish, a warm non-judgmental financial coach. The user is in ${CC[data.profile?.country||"CA"]?.name||"Canada"} using ${CC[data.profile?.country||"CA"]?.currency||"CAD"}. Give country-specific advice — reference ${data.profile?.country==="US"?"401k/IRA/HSA/EITC":"RRSP/TFSA/FHSA/CCB/GST credit"} where relevant. Analyze real transaction data. Use exact numbers and merchant names. Be conversational and specific. Respond ONLY with valid JSON:\n{"insights":[{"type":"pattern|warning|win|opportunity","icon":"emoji","title":"short title","body":"insight with specific numbers and country-specific advice","saving":"estimated monthly saving in ${CC[data.profile?.country||"CA"]?.currency||"CAD"}","priority":"high|medium|low"}]}\nGenerate exactly 5 insights.`;
      const r=await fetch("/api/coach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        type:"insights",
        payload:{ system:_sys, prompt:`Analyze this user's real financial data and give 5 specific insights:\n\n${buildCtx()}` }
      })});
      const d=await r.json();
      const text=d.content?.[0]?.text||"{}";
      const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
      setInsights(parsed.insights||[]);setGenerated(true);
    }catch(e){
      setInsights([{type:"warning",icon:"⚠️",title:"Connection issue",body:"Couldn't reach the AI right now. Your data is safe. Tap \"Analyze My Spending\" to retry.",saving:"—",priority:"low",canRetry:true}]);
    }
    setLoading(false);
  };

  const sendChat=async()=>{
    if(!input.trim()||chatLoading)return;
    const userMsg=input.trim();setInput("");
    const newMessages=[...messages,{role:"user",content:userMsg}];
    setMessages(newMessages);setChatLoading(true);
    try{
      const _chatSys = `You are Flourish — a warm, direct financial coach with access to this user's real bank data.\n\n${buildCtx()}\n\nBe conversational. Use specific numbers from their data. Keep responses concise — 2–4 sentences unless they ask for detail. Sound like a smart friend, not a financial advisor. Never be preachy.`;
      const r=await fetch("/api/coach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        type:"chat",
        payload:{ system:_chatSys, messages:newMessages }
      })});
      const d=await r.json();
      const reply=d.content?.[0]?.text||"Connection issue — try again.";
      setMessages([...newMessages,{role:"assistant",content:reply}]);
    }catch{setMessages([...newMessages,{role:"assistant",content:isOnline?"I had trouble connecting — tap to try again.":"You're offline right now. I'll be ready when you reconnect 📡"}]);}
    setChatLoading(false);
    setTimeout(()=>chatRef.current?.scrollTo({top:99999,behavior:"smooth"}),100);
  };

  const typeColors={pattern:C.blue,warning:C.red,win:C.green,opportunity:C.gold};

  if(chatMode)return(
    <div style={{display:"flex",flexDirection:"column",height:"70vh"}}>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
        <button onClick={()=>setChatMode(false)} style={{background:C.isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)",border:`1px solid ${C.border}`,color:C.mutedHi,borderRadius:12,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all .2s",letterSpacing:0.2}}>← Back</button>
        <div><div style={{fontSize:20,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.3}}>Ask Your Coach</div><div style={{color:C.muted,fontSize:11}}>Has full access to your transaction data</div></div>
      </div>
      <div ref={chatRef} style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:12,marginBottom:14}}>
        <div style={{background:C.greenDim,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.green}44`,alignSelf:"flex-start",maxWidth:"85%"}}>
          <div style={{color:C.cream,fontWeight:700,fontSize:13,marginBottom:4,display:"flex",alignItems:"center",gap:5}}><FlourishMark size={16}/><span>Flourish</span></div>
          <div style={{color:C.cream,fontSize:14,lineHeight:1.6}}>I've read through all your transactions. Ask me anything — your biggest patterns, where to cut, what your habits look like, anything.</div>
        </div>
        {messages.map((msg,i)=>(
          <div key={i} style={{background:msg.role==="user"?C.purpleDim:C.greenDim,borderRadius:16,padding:"12px 16px",border:`1px solid ${msg.role==="user"?C.purple+"44":C.green+"44"}`,alignSelf:msg.role==="user"?"flex-end":"flex-start",maxWidth:"85%"}}>
            {msg.role==="assistant"&&<div style={{color:C.cream,fontWeight:700,fontSize:12,marginBottom:4,display:"flex",alignItems:"center",gap:5}}><FlourishMark size={16}/><span>Flourish</span></div>}
            <div style={{color:C.cream,fontSize:14,lineHeight:1.6}}>{msg.content}</div>
          </div>
        ))}
        {chatLoading&&<div style={{background:C.greenDim,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.green}44`,alignSelf:"flex-start"}}>
          <div style={{color:C.cream,fontWeight:700,fontSize:12,marginBottom:8,display:"flex",alignItems:"center",gap:5}}><FlourishMark size={16}/><span>Flourish</span></div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.green,animation:`pulse 1.4s ease-in-out ${i*0.22}s infinite`}}/>)}</div>
        </div>}
      </div>
      <div style={{display:"flex",gap:10,background:C.cardAlt,borderRadius:14,padding:"10px 14px",border:`1px solid ${C.border}`}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&isOnline&&sendChat()} placeholder={isOnline?"Ask about your spending, debt, savings…":"You're offline — reconnect to chat"} disabled={!isOnline}
          style={{flex:1,background:"none",border:"none",outline:"none",color:isOnline?C.cream:C.muted,fontSize:14,fontFamily:"inherit"}}/>
        <button onClick={sendChat} disabled={!input.trim()||chatLoading} style={{background:input.trim()?C.green:C.border,border:"none",borderRadius:10,padding:"8px 14px",color:C.bg,fontWeight:700,cursor:input.trim()?"pointer":"not-allowed",fontSize:14,transition:"all .2s"}}>→</button>
      </div>
      <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
        {["Where can I cut spending?","Why is my balance low?","How fast can I pay off my debt?","What's my worst habit?"].map(q=>(
          <button key={q} onClick={()=>setInput(q)} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:99,padding:"5px 12px",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
        ))}
      </div>
    </div>
  );

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div><div style={{fontSize:22,fontWeight:800,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif"}}>AI Coach 🧠</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>Powered by your real transactions</div></div>
      <button onClick={()=>setChatMode(true)} style={{background:C.greenDim,border:`1px solid ${C.green}44`,borderRadius:12,padding:"8px 14px",color:C.greenBright,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>💬 Chat</button>
    </div>
    <Card style={{background:`linear-gradient(135deg,${C.tealDim} 0%,${C.card} 100%)`,border:`1px solid ${C.teal}44`}}>
      <div style={{color:C.tealBright,fontWeight:700,marginBottom:10}}>What the AI can see</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[["card",`${txns.length} transactions`,"30 days imported"],["coffee",`${stats.coffeeCount} coffee runs`,`$${stats.coffee.toFixed(2)} total`],["bag","Food delivery",`$${stats.delivery.toFixed(2)} total`],["calendar","Busiest day",stats.busiest]].map(([iconId,label,sub],i)=>(
          <div key={i} style={{background:C.cardAlt,borderRadius:12,padding:"10px 12px",border:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:18}}>{icon}</span>
            <div><div style={{color:C.cream,fontWeight:600,fontSize:13}}>{label}</div><div style={{color:C.muted,fontSize:11}}>{sub}</div></div>
          </div>
        ))}
      </div>
    </Card>
    <Card>
      <div style={{color:C.cream,fontWeight:700,marginBottom:12}}>Spending by Category</div>
      {stats.topCats.map(([cat,amt],i)=>{
        const colors=[C.orange,C.pink,C.green,C.blue,C.purple,C.gold];
        return <div key={i} style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:C.cream,fontSize:13}}>{cat}</span><span style={{color:colors[i%6],fontWeight:700,fontSize:12}}>${amt.toFixed(2)}</span></div>
          <Bar v={amt} max={stats.totalSpent} color={colors[i%6]}/>
        </div>;
      })}
    </Card>
    {!generated&&!loading&&(
      <>
      {/* ── BEHAVIOR INSIGHTS from BehaviorEngine ── */}
      {behaviorData.insights.length>0&&!chatMode&&(
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:4}}>
          <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.8,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginBottom:2}}>Detected Patterns</div>
          {behaviorData.insights.slice(0,3).map((ins,i)=>(
            <div key={i} style={{background:C.card,border:`1.5px solid ${ins.color}33`,borderRadius:16,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:18,flexShrink:0}}>{ins.icon}</span>
              <div style={{flex:1}}>
                <div style={{color:ins.color,fontWeight:700,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:3}}>{ins.title}</div>
                <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.55}}>{ins.body}</div>
                {ins.saving&&<div style={{color:C.greenBright,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,marginTop:4}}>💡 {ins.saving}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Financial disclaimer */}
      <div style={{background:C.cardAlt,borderRadius:12,padding:"10px 14px",border:`1px solid ${C.border}`,marginBottom:4,display:"flex",gap:8,alignItems:"flex-start"}}>
        <span style={{fontSize:13,flexShrink:0,marginTop:1}}>ℹ️</span>
        <span style={{color:C.muted,fontSize:10.5,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>Flourish provides <strong style={{color:C.mutedHi}}>financial education and coaching</strong>, not regulated financial advice. Always verify decisions with a qualified advisor for major financial choices.</span>
      </div>
            <button onClick={generateInsights} style={{background:`linear-gradient(135deg,${C.green},${C.teal})`,border:"none",borderRadius:16,padding:"18px 24px",color:C.bg,fontWeight:800,fontSize:17,cursor:"pointer",fontFamily:"Georgia,serif",letterSpacing:.3,boxShadow:`0 0 30px ${C.green}33`,transition:"opacity .2s"}}
        onMouseEnter={e=>e.currentTarget.style.opacity=".88"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        Analyze My Spending
      </button>
      </>
    )}
    {loading&&<Card style={{textAlign:"center",padding:"30px 20px"}}>
      <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><Icon id="sparkles" size={38} color={C.green} strokeWidth={1.3}/></div>
      <div style={{color:C.greenBright,fontWeight:700,fontSize:16,marginBottom:8}}>Reading your transactions…</div>
      <div style={{color:C.muted,fontSize:13,lineHeight:1.6}}>Looking for patterns and opportunities specific to your spending. Takes a few seconds.</div>
      <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:16}}>{[0,1,2,3].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:C.green,opacity:.3+i*.2}}/>)}</div>
    </Card>}
    {insights.length>0&&<>
      <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.8,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Your Personalized Insights</div>
      {insights.map((ins,i)=>{
        const tc=typeColors[ins.type]||C.blue;
        return <Card key={i} glow={tc} style={{border:`1px solid ${tc}33`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:40,height:40,borderRadius:12,background:tc+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon id={txnIcon(ins)} size={18} color={tc} strokeWidth={1.5}/></div>
              <div style={{color:tc,fontWeight:800,fontSize:15}}>{ins.title}</div>
            </div>
            <Chip label={ins.priority} color={{high:C.red,medium:C.gold,low:C.green}[ins.priority]||C.green}/>
          </div>
          <div style={{color:C.mutedHi,fontSize:14,lineHeight:1.65,marginBottom:12}}>{ins.body}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <Chip label={ins.type} color={tc}/>
            {ins.saving!=="—"&&<Chip label={`💰 ${ins.saving}`} color={C.green}/>}
          </div>
        </Card>;
      })}
      <button onClick={generateInsights} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:13,padding:"12px 24px",color:C.muted,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}
        onMouseEnter={e=>e.currentTarget.style.borderColor=C.green} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
        🔄 Refresh Analysis
      </button>
    </>}
  </div>;
}

// ─── CREDIT SCORE ─────────────────────────────────────────────────────────────
function CreditScreen({data}){
  const [tab,setTab]=useState("overview");
  const rawScore=data.profile?.creditScore||680;
  const known=data.profile?.creditKnown;
  const totalDebt=(data.debts||[]).reduce((a,d)=>a+parseFloat(d.balance||0),0);
  const creditLimit=totalDebt>0?totalDebt/0.74:4600; // back-calculate from ~74% util
  const utilPct=totalDebt>0?Math.round(totalDebt/creditLimit*100):0;
  // Estimate score from utilization if not known
  const score=known?rawScore:Math.max(580,750-Math.round(utilPct*1.2));
  const scoreColor=score>=750?C.green:score>=700?C.teal:score>=650?C.gold:score>=600?C.orange:C.red;
  const scoreTier=score>=750?"Excellent":score>=700?"Very Good":score>=650?"Good":score>=600?"Fair":"Needs Work";
  const scoreIcon=score>=750?"🌟":score>=700?"👍":score>=650?"✓":score>=600?"⚠️":"🔧";
  const pct=Math.round((score-300)/600*100);
  // Credit factors
  const factors=[
    {name:"Payment History",weight:"35%",status:score>=700?"Good":"Fair",tip:"No missed payments detected from your connected accounts.",color:score>=700?C.green:C.gold,icon:"calendar"},
    {name:"Credit Utilization",weight:"30%",status:utilPct>70?"High":utilPct>30?"Fair":"Good",tip:utilPct>30?`Your ${data.debts?.[0]?.name||"credit card"} is at ${utilPct}% utilization. Pay it to $${Math.round(creditLimit*0.29).toLocaleString()} to drop below 30% and potentially gain 20–40 points.`:"You're under 30% utilization — this factor is helping your score.",color:utilPct>70?C.red:utilPct>30?C.gold:C.green,icon:"💳"},
    {name:"Credit Age",weight:"15%",status:"Good",tip:"Longer account history helps. Avoid closing old accounts even if unused.",color:C.teal,icon:"🕐"},
    {name:"Credit Mix",weight:"10%",status:"Good",tip:"Having both revolving (cards) and installment (loans) credit helps.",color:C.blue,icon:"🔀"},
    {name:"New Credit",weight:"10%",status:"Good",tip:"No recent hard inquiries detected. Every application causes a small temporary dip.",color:C.green,icon:"🆕"},
  ];
  // Score history (simulated trend)
  const history=[
    {month:"Oct",score:score-45},{month:"Nov",score:score-28},{month:"Dec",score:score-15},
    {month:"Jan",score:score-8},{month:"Feb",score:score-3},{month:"Now",score},
  ];
  const hMin=Math.min(...history.map(h=>h.score))-10;
  const hMax=Math.max(...history.map(h=>h.score))+10;
  const hNorm=history.map(h=>80-((h.score-hMin)/(hMax-hMin))*60);
  // Improvement tips
  const tips=[
    utilPct>30&&{icon:"card",title:`Lower your ${data.debts?.[0]?.name||"credit card"} utilization`,body:`You're at ${utilPct}% utilization. Pay it down to $${Math.round(creditLimit*0.29).toLocaleString()} (29%) to potentially gain 20–40 points within 30–60 days. This is the single fastest improvement you can make.`,impact:"High",points:"+20–40 pts"},
    {icon:"calendar",title:"Keep paying on time",body:"Payment history is 35% of your score. One missed payment can drop your score 80–100 points and takes 2 years to fully recover. Set up autopay for at least the minimum on every account.",impact:"Critical",points:"Protect +100"},
    {icon:"shield",title:"Don't apply for new credit right now",body:"Every credit application is a hard pull. Each one temporarily drops your score 5–10 points. Space applications at least 6 months apart.",impact:"Medium",points:"Prevent –10"},
    {icon:"bank",title:"Don't close old accounts",body:"Closing an account reduces your available credit (raises utilization) and shortens your average account age. Keep old cards open even if unused.",impact:"Medium",points:"Prevent –15"},
    score<720&&{icon:"chartUp",title:"Consider a credit builder product",body:"If you're rebuilding, a secured card or credit builder loan from a credit union reports positive payment history every month. Some people add 50–80 points in a year.",impact:"High",points:"+50–80 pts in 1yr"},
  ].filter(Boolean);

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{fontSize:24,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>Credit Score</div>
    <div style={{display:"flex",gap:6,background:C.surface,borderRadius:16,padding:4}}>
      {["overview","factors","improve","connect"].map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?scoreColor+"28":"transparent",border:`1px solid ${tab===t?scoreColor+"55":"transparent"}`,color:tab===t?scoreColor:C.muted,borderRadius:12,padding:"9px 0",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",transition:"all .22s cubic-bezier(.16,1,.3,1)"}}>
        {t==="overview"?"Score":t==="factors"?"Factors":t==="improve"?"Improve":"Connect"}
      </button>)}
    </div>

    {tab==="overview"&&<>
      {!known&&<div style={{background:C.goldDim,borderRadius:14,padding:"12px 16px",border:`1px solid ${C.gold}44`}}>
        <div style={{color:C.goldBright,fontWeight:700,fontSize:13,marginBottom:4}}>📊 Estimated score</div>
        <div style={{color:C.mutedHi,fontSize:12,lineHeight:1.5}}>Based on your debt utilization. Add your real score in Settings for precise coaching.</div>
      </div>}
      <div style={{background:`linear-gradient(135deg,${scoreColor}18 0%,${C.card} 100%)`,borderRadius:20,padding:"24px 22px",border:`1px solid ${scoreColor}44`,textAlign:"center"}}>
        <div style={{fontSize:64,fontWeight:900,fontFamily:"Georgia,serif",color:scoreColor,lineHeight:1}}>{score}</div>
        <Chip label={`${scoreIcon} ${scoreTier}`} color={scoreColor} size={14}/>
        <div style={{color:C.muted,fontSize:12,marginTop:10,marginBottom:20}}>Out of 900 · {known?"Entered by you":"Estimated"}</div>
        <div style={{background:C.isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)",borderRadius:99,height:10,overflow:"hidden",position:"relative",marginBottom:8}}>
          {[{pct:16.7,color:C.red},{pct:16.7,color:C.orange},{pct:16.7,color:C.gold},{pct:16.7,color:C.teal},{pct:16.6,color:C.greenBright},{pct:16.6,color:C.green}].reduce((acc,seg)=>{
            const segments=[...acc.segs,<div key={acc.pos} style={{position:"absolute",left:`${acc.pos}%`,width:`${seg.pct}%`,height:"100%",background:seg.color,opacity:.35}}/>];
            return{pos:acc.pos+seg.pct,segs:segments};
          },{pos:0,segs:[]}).segs}
          <div style={{position:"absolute",left:`${pct-1}%`,top:-2,width:4,height:14,borderRadius:99,background:scoreColor,boxShadow:`0 0 8px ${scoreColor}`,transition:"left 1s cubic-bezier(.4,0,.2,1)"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between"}}>{["300","Poor","Fair","Good","V.Good","Excel","900"].map((l,i)=><span key={i} style={{color:C.muted,fontSize:9}}>{l}</span>)}</div>
      </div>
      <Card>
        <div style={{color:C.cream,fontWeight:700,marginBottom:12}}>6-Month Trend</div>
        <svg width="100%" height="50" viewBox={`0 0 ${history.length*50} 100`} preserveAspectRatio="none" style={{display:"block"}}>
          <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={scoreColor} stopOpacity="0.3"/><stop offset="100%" stopColor={scoreColor} stopOpacity="0"/></linearGradient></defs>
          <polyline points={hNorm.map((y,i)=>`${i*50},${y}`).join(" ")} fill="none" stroke={scoreColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polygon points={`0,100 ${hNorm.map((y,i)=>`${i*50},${y}`).join(" ")} ${(history.length-1)*50},100`} fill="url(#cg)"/>
          {hNorm.map((y,i)=><circle key={i} cx={i*50} cy={y} r={i===hNorm.length-1?5:2.5} fill={i===hNorm.length-1?scoreColor:scoreColor}/>)}
        </svg>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>{history.map((h,i)=><div key={i} style={{textAlign:"center"}}><div style={{color:C.muted,fontSize:9}}>{h.month}</div><div style={{color:i===history.length-1?scoreColor:C.muted,fontSize:9,fontWeight:i===history.length-1?700:400}}>{h.score}</div></div>)}</div>
      </Card>
      <Card style={{background:C.greenDim,border:`1px solid ${C.green}33`}}>
        <div style={{color:C.greenBright,fontWeight:700,marginBottom:6}}>What your score unlocks</div>
        {[[750,"Prime mortgage rates (save $100s/mo)","🏠"],[720,"Best credit card rewards & 0% offers","💳"],[700,"Low-rate car loans","🚗"],[680,"Most approvals, standard rates","✓"],[650,"Limited options, higher rates","⚠️"]].map(([sc,txt,icon],i)=>(
          <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:i<4?`1px solid ${C.border}`:"none",opacity:score>=sc?1:.45}}>
            <span style={{fontSize:14}}>{icon}</span>
            <span style={{flex:1,color:score>=sc?C.cream:C.muted,fontSize:13}}>{txt}</span>
            <span style={{color:score>=sc?C.green:C.muted,fontWeight:700,fontSize:12}}>{sc}+</span>
          </div>
        ))}
      </Card>
    </>}

    {tab==="factors"&&factors.map((f,i)=>(
      <Card key={i} style={{border:`1px solid ${f.color}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{width:40,height:40,borderRadius:12,background:f.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{f.icon}</div>
            <div><div style={{color:C.cream,fontWeight:700,fontSize:14}}>{f.name}</div><div style={{color:C.muted,fontSize:11}}>Weight: {f.weight}</div></div>
          </div>
          <Chip label={f.status} color={f.color}/>
        </div>
        <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.6}}>{f.tip}</div>
      </Card>
    ))}

    {tab==="improve"&&<>
      <Card style={{background:`linear-gradient(135deg,${scoreColor}18 0%,${C.card} 100%)`,border:`1px solid ${scoreColor}44`}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2}}>Your score today</div>
        <div style={{fontSize:32,fontWeight:900,color:scoreColor,fontFamily:"Georgia,serif"}}>{score} <span style={{color:C.muted,fontSize:14,fontWeight:400}}>→</span> <span style={{color:C.greenBright}}>750+</span></div>
        <div style={{color:C.muted,fontSize:12,marginTop:4}}>Estimated with consistent action: 6–18 months</div>
      </Card>
      {tips.map((tip,i)=>(
        <Card key={i} style={{border:`1px solid ${tip.impact==="Critical"?C.red:tip.impact==="High"?C.gold:C.blue}33`}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
            <span style={{fontSize:24}}>{tip.icon}</span>
            <div style={{flex:1}}><div style={{color:C.cream,fontWeight:700,fontSize:14}}>{tip.title}</div></div>
            <Chip label={tip.points} color={tip.impact==="Critical"?C.green:tip.impact==="High"?C.gold:C.blue}/>
          </div>
          <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.6}}>{tip.body}</div>
          <div style={{marginTop:8}}><Chip label={`Priority: ${tip.impact}`} color={tip.impact==="Critical"?C.red:tip.impact==="High"?C.gold:C.blue}/></div>
        </Card>
      ))}
    </>}

    {tab==="connect"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
      <Card style={{background:C.tealDim,border:`1px solid ${C.teal}44`}}>
        <div style={{color:C.tealBright,fontWeight:700,marginBottom:8}}>🔗 Live Credit Monitoring</div>
        <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.6,marginBottom:12}}>Connect a credit monitoring service to get your real score updated monthly, with automatic coaching when it changes.</div>
        <div style={{color:C.muted,fontSize:11}}>All connections are soft-pull only. Your score will not be affected.</div>
      </Card>
      {[
        {name:"Borrowell",flag:"🇨🇦",bureau:"Equifax",freq:"Weekly updates",desc:"Canada's most popular free credit score service. Uses Equifax. Free AI-powered product recommendations.",color:"#2E8B57",available:true},
        {name:"Credit Karma",flag:"🇨🇦🇺🇸",bureau:"TransUnion + Equifax",freq:"Weekly updates",desc:"Available in both Canada and the US. Uses TransUnion primarily. Free with detailed factor breakdown.",color:"#00D672",available:true},
        {name:"Experian",flag:"🇺🇸",bureau:"Experian",freq:"Monthly updates",desc:"US only. Provides your FICO Score directly from Experian. Most lenders use FICO for approval decisions.",color:"#3F4DE0",available:true},
        {name:"Plaid (via bank)",flag:"🏦",bureau:"Auto-detected",freq:"Real-time",desc:"If your bank shares credit data via Plaid, Flourish can pull your score directly. Already connected if your bank supports it.",color:C.blue,available:false},
      ].map(provider=>(
        <div key={provider.name} style={{background:C.card,borderRadius:16,padding:"16px 18px",border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:44,height:44,borderRadius:12,background:provider.color+"22",border:`1px solid ${provider.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{provider.flag}</div>
              <div><div style={{color:C.cream,fontWeight:700}}>{provider.name}</div><div style={{color:C.muted,fontSize:11}}>{provider.bureau} · {provider.freq}</div></div>
            </div>
            {provider.available?<Chip label="Free" color={C.green}/>:<Chip label="Coming soon" color={C.muted}/>}
          </div>
          <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.55,marginBottom:12}}>{provider.desc}</div>
          <Btn label={provider.available?`Connect ${provider.name} →`:"Notify me when available"} onClick={()=>{}} color={provider.available?provider.color:C.muted} small disabled={!provider.available}/>
        </div>
      ))}
      <Card style={{background:C.goldDim,border:`1px solid ${C.gold}44`}}>
        <div style={{color:C.gold,fontWeight:700,marginBottom:6}}>💡 Why connect?</div>
        <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.65}}>Right now, Flourish estimates your score from your debt data. A live connection means: real score, real alerts when it changes, and coaching that triggers automatically when your utilization spikes or a payment is missed.</div>
      </Card>
    </div>}
  </div>;
}


// ─── WIDGET SCREEN ────────────────────────────────────────────────────────────
function WidgetScreen({data,onBack}){
  const _ss=SafeSpendEngine.calculate(data);
  const safe=_ss.safeAmount;
  const bal=_ss.balance;
  const overdraft=_ss.overdraft;
  const soonBills=_ss.soonBills||[];
  const nextBill=soonBills[0];
  const {score:healthScore}=calcHealthScore(data);
  const heroColor=overdraft?C.red:C.green;
  const heroColorBright=overdraft?C.redBright:C.greenBright;
  const today=new Date().toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"});

  // Shared widget shell
  const WShell=({w,h,children})=>(
    <div style={{width:w,height:h,borderRadius:22,overflow:"hidden",
      boxShadow:"0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.10)",
      position:"relative",flexShrink:0}}>
      {children}
    </div>
  );

  // ── Small 2×2 Widget ──────────────────────────────────────────
  const SmallWidget=()=>(
    <WShell w={158} h={158}>
      <div style={{width:"100%",height:"100%",background:overdraft
        ?"linear-gradient(145deg,#1A040C,#120208)"
        :"linear-gradient(145deg,#051810,#090F18)",
        padding:"18px 16px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <FlourishMark size={24}/>
          <div style={{width:8,height:8,borderRadius:"50%",background:heroColorBright,boxShadow:`0 0 8px ${heroColor}`}}/>
        </div>
        <div>
          <div style={{color:heroColorBright+"88",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:3}}>Safe to Spend</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:32,color:heroColorBright,letterSpacing:-1,lineHeight:1}}>${Math.round(safe)}</div>
          <div style={{color:"rgba(237,233,226,0.55)",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4}}>{today}</div>
        </div>
      </div>
    </WShell>
  );

  // ── Medium 2×4 Widget ──────────────────────────────────────────
  const MediumWidget=()=>(
    <WShell w={338} h={158}>
      <div style={{width:"100%",height:"100%",background:overdraft
        ?"linear-gradient(145deg,#1A040C,#120208)"
        :"linear-gradient(145deg,#051810,#090F18)",
        padding:"18px 20px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}><FlourishMark size={20}/><span style={{color:"rgba(237,233,226,0.6)",fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>flourish</span></div>
          <div style={{color:"rgba(237,233,226,0.4)",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{today}</div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div>
            <div style={{color:heroColorBright+"88",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:3}}>Safe to Spend</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:38,color:heroColorBright,letterSpacing:-1,lineHeight:1}}>${Math.round(safe)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:"rgba(237,233,226,0.4)",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",textTransform:"uppercase",letterSpacing:1}}>Balance</div>
            <div style={{color:"rgba(237,233,226,0.85)",fontSize:16,fontWeight:700,fontFamily:"'Playfair Display',serif"}}>${bal.toFixed(0)}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {nextBill&&<div style={{flex:1,background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"6px 10px"}}>
            <div style={{color:"rgba(237,233,226,0.4)",fontSize:8,fontFamily:"'Plus Jakarta Sans',sans-serif",textTransform:"uppercase",letterSpacing:1}}>Next bill</div>
            <div style={{color:DARK_C.goldBright,fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:1}}>{nextBill.name} · ${parseFloat(nextBill.amount).toFixed(0)}</div>
          </div>}
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"6px 10px",minWidth:56,textAlign:"center"}}>
            <div style={{color:"rgba(237,233,226,0.4)",fontSize:8,fontFamily:"'Plus Jakarta Sans',sans-serif",textTransform:"uppercase",letterSpacing:1}}>Health</div>
            <div style={{color:"rgba(237,233,226,0.9)",fontSize:14,fontWeight:800,fontFamily:"'Playfair Display',serif",marginTop:1}}>{healthScore}</div>
          </div>
        </div>
      </div>
    </WShell>
  );

  // ── Large 4×4 Widget ──────────────────────────────────────────
  const LargeWidget=()=>(
    <WShell w={338} h={338}>
      <div style={{width:"100%",height:"100%",background:overdraft
        ?"linear-gradient(165deg,#1A040C,#120208,#0A0510)"
        :"linear-gradient(165deg,#051810,#080D18,#050810)",
        padding:"20px",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}><FlourishMark size={20}/><span style={{color:"rgba(237,233,226,0.65)",fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>flourish</span></div>
          <div style={{background:`rgba(${overdraft?"255,79,106":"0,204,133"},0.15)`,borderRadius:99,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:heroColorBright}}/><span style={{color:heroColorBright,fontSize:9,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{overdraft?"Overdraft risk":"Looking good"}</span>
          </div>
        </div>
        <div style={{background:`rgba(${overdraft?"255,79,106":"0,204,133"},0.08)`,borderRadius:16,padding:"14px 16px",border:`1px solid ${heroColor}28`}}>
          <div style={{color:heroColorBright+"77",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Safe to Spend Today</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:46,color:heroColorBright,letterSpacing:-2,lineHeight:1}}>${Math.round(safe)}</div>
          <div style={{color:"rgba(237,233,226,0.45)",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4}}>Balance: ${bal.toFixed(2)}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{background:"rgba(0,204,133,0.08)",border:"1px solid rgba(0,204,133,0.15)",borderRadius:14,padding:"11px 12px"}}>
            <div style={{color:"rgba(0,232,154,0.5)",fontSize:8,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>Health Score</div>
            <div style={{color:"rgba(0,232,154,0.95)",fontWeight:900,fontSize:24,fontFamily:"'Playfair Display',serif",marginTop:3,letterSpacing:-0.5}}>{healthScore}</div>
          </div>
          <div style={{background:"rgba(232,184,75,0.08)",border:"1px solid rgba(232,184,75,0.15)",borderRadius:14,padding:"11px 12px"}}>
            <div style={{color:"rgba(245,204,106,0.5)",fontSize:8,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>Due Soon</div>
            <div style={{color:"rgba(245,204,106,0.95)",fontWeight:900,fontSize:24,fontFamily:"'Playfair Display',serif",marginTop:3,letterSpacing:-0.5}}>${Math.round(_ss.upcomingBills)}</div>
          </div>
        </div>
        <div>
          {soonBills.slice(0,2).map((b,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i===0?`1px solid rgba(255,255,255,0.06)`:"none"}}>
              <span style={{color:"rgba(237,233,226,0.55)",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{b.name}</span>
              <span style={{color:DARK_C.goldBright,fontSize:10,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>${parseFloat(b.amount).toFixed(0)}</span>
            </div>
          ))}
          {soonBills.length===0&&<div style={{color:"rgba(237,233,226,0.3)",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",textAlign:"center",paddingTop:4}}>No bills due soon ✓</div>}
        </div>
      </div>
    </WShell>
  );

  const [wSize,setWSize]=useState("medium");
  const sizes=[["small","Small"],["medium","Medium"],["large","Large"]];

  // Phone frame mockup wrapping the widget preview
  const PhoneFrame=({children,wW,wH})=>{
    const frameW=Math.max(wW+40,200);
    const frameH=wH+100;
    return (
      <div style={{position:"relative",width:frameW,margin:"0 auto"}}>
        {/* Phone shell */}
        <div style={{background:"linear-gradient(145deg,#1C1C1E,#2C2C2E)",borderRadius:40,padding:"16px 12px",boxShadow:"0 20px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
          {/* Notch */}
          <div style={{width:80,height:6,background:"#000",borderRadius:99,opacity:0.8}}/>
          {/* Home screen bg */}
          <div style={{borderRadius:24,overflow:"hidden",background:"linear-gradient(145deg,#0D1117,#161B22,#0D1117)",padding:8,width:"100%",display:"flex",justifyContent:"center",alignItems:"center",minHeight:wH+16}}>
            {/* Grid dots simulating other home screen icons */}
            <div style={{position:"absolute",opacity:0.08,display:"grid",gridTemplateColumns:"repeat(4,40px)",gap:18,pointerEvents:"none"}}>
              {Array(12).fill(0).map((_,i)=><div key={i} style={{width:40,height:40,borderRadius:12,background:"rgba(255,255,255,0.8)"}}/>)}
            </div>
            {children}
          </div>
          {/* Home indicator */}
          <div style={{width:100,height:4,background:"rgba(255,255,255,0.3)",borderRadius:99}}/>
        </div>
      </div>
    );
  };

  return <div style={{display:"flex",flexDirection:"column",gap:20}}>
    <div style={{display:"flex",gap:10,alignItems:"center"}}>
      <button onClick={onBack} style={{background:C.isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.05)",border:`1px solid ${C.border}`,color:C.mutedHi,borderRadius:12,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>← Back</button>
      <div>
        <div style={{fontSize:24,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>Home Screen Widget</div>
        <div style={{color:C.muted,fontSize:12,marginTop:2}}>Live data on your home screen</div>
      </div>
    </div>

    {/* Size selector tabs */}
    <div style={{display:"flex",gap:6,background:C.surface,borderRadius:16,padding:4}}>
      {sizes.map(([s,label])=>(
        <button key={s} onClick={()=>setWSize(s)}
          style={{flex:1,background:wSize===s?C.green+"28":"transparent",border:`1px solid ${wSize===s?C.green+"55":"transparent"}`,
          color:wSize===s?C.greenBright:C.muted,borderRadius:12,padding:"9px 0",cursor:"pointer",fontSize:12,fontWeight:700,
          fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all .22s cubic-bezier(.16,1,.3,1)"}}>
          {label}
        </button>
      ))}
    </div>

    {/* Widget preview in phone frame */}
    <div style={{background:C.card,borderRadius:24,padding:"32px 20px",border:`1px solid ${C.border}`,overflow:"hidden",position:"relative"}}>
      {/* Ambient bg */}
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 80% 60% at 50% 50%,${C.green}08 0%,transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{position:"relative"}}>
        {wSize==="small"&&<PhoneFrame wW={158} wH={158}><SmallWidget/></PhoneFrame>}
        {wSize==="medium"&&<PhoneFrame wW={338} wH={158}><MediumWidget/></PhoneFrame>}
        {wSize==="large"&&<PhoneFrame wW={338} wH={338}><LargeWidget/></PhoneFrame>}
      </div>
    </div>

    {/* iOS setup */}
    <div style={{background:C.isDark?`linear-gradient(135deg,${C.greenDim} 0%,${C.card} 100%)`:C.card,borderRadius:22,border:`1px solid ${C.green}33`,padding:"20px"}}>
      <div style={{fontWeight:700,fontSize:15,color:C.cream,marginBottom:3,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>🍎</span> Add to iPhone Home Screen</div>
      <div style={{color:C.muted,fontSize:12,marginBottom:14,marginLeft:26}}>iOS 16+ · Safari required</div>
      {[["1","Open flourishmoney.app in Safari"],["2","Tap the Share button (⬆️) at the bottom"],["3","Scroll and tap "Add to Home Screen""],["4","Tap Add — the app icon appears instantly"],["5","Long-press the icon → "Edit Home Screen" → add as widget"]].map(([n,step])=>(
        <div key={n} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
          <div style={{width:22,height:22,borderRadius:99,background:C.greenDim,border:`1px solid ${C.green}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{color:C.greenBright,fontSize:10,fontWeight:800}}>{n}</span>
          </div>
          <span style={{color:C.mutedHi,fontSize:13,lineHeight:1.5,paddingTop:1}}>{step}</span>
        </div>
      ))}
    </div>

    {/* Android setup */}
    <div style={{background:C.isDark?`linear-gradient(135deg,${C.blueDim} 0%,${C.card} 100%)`:C.card,borderRadius:22,border:`1px solid ${C.blue}33`,padding:"20px"}}>
      <div style={{fontWeight:700,fontSize:15,color:C.cream,marginBottom:3,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>🤖</span> Add to Android Home Screen</div>
      <div style={{color:C.muted,fontSize:12,marginBottom:14,marginLeft:26}}>Chrome · Android 8+</div>
      {[["1","Open flourishmoney.app in Chrome"],["2","Tap the three-dot menu (⋮) top right"],["3","Tap "Add to Home screen""],["4","Confirm — icon appears on your home screen"],["5","On Samsung: long-press icon → "Add widget" in Home screen editor"]].map(([n,step])=>(
        <div key={n} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
          <div style={{width:22,height:22,borderRadius:99,background:C.blueDim,border:`1px solid ${C.blue}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{color:C.blueBright,fontSize:10,fontWeight:800}}>{n}</span>
          </div>
          <span style={{color:C.mutedHi,fontSize:13,lineHeight:1.5,paddingTop:1}}>{step}</span>
        </div>
      ))}
    </div>

    {/* Native widget roadmap note */}
    <div style={{background:C.surface,borderRadius:16,padding:"14px 18px",border:`1px solid ${C.border}`,display:"flex",gap:12,alignItems:"flex-start"}}>
      <span style={{fontSize:16,flexShrink:0}}>⚡</span>
      <div>
        <div style={{color:C.cream,fontWeight:600,fontSize:13,marginBottom:3}}>True native widgets coming soon</div>
        <div style={{color:C.muted,fontSize:12,lineHeight:1.6}}>Full iOS WidgetKit and Android Glance widgets are on our roadmap — showing live balance and safe-spend right on your lock screen without opening the app.</div>
      </div>
    </div>
  </div>;
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function Settings({data,onClose,onReset,theme,toggleTheme,onOpenWidget}){
  const [notifToggles,setNotifToggles]=useState({overdraft:true,bills:true,coach:true,meeting:false,patterns:true});
  const handleShare=()=>{
    const url="https://flourishmoney.app";
    const text="I've been using Flourish to track my spending and it actually tells me exactly how much I can spend today. Worth checking out.";
    if(navigator.share){navigator.share({title:"Flourish Money",text,url}).catch(()=>{});}
    else{navigator.clipboard?.writeText(url).then(()=>alert("Link copied! Share it with a friend 🌱")).catch(()=>window.open(url,"_blank"));}
  };
  return <div style={{color:C.cream}}>
    <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:20}}>
      <button onClick={onClose} style={{background:C.isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.05)",border:`1px solid ${C.border}`,color:C.mutedHi,borderRadius:12,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all .2s",letterSpacing:0.2}}>← Back</button>
      <div style={{fontSize:24,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>Settings</div>
    </div>
    {/* ── Appearance ─────────────────────────────────────────── */}
    <div style={{background:C.card,borderRadius:20,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:10}}>
      <div style={{padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:11,background:theme==="dark"?"rgba(155,125,255,0.15)":"rgba(255,200,60,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{theme==="dark"?"🌙":"☀️"}</div>
          <div>
            <div style={{color:C.cream,fontWeight:600,fontSize:14}}>{theme==="dark"?"Dark Mode":"Light Mode"}</div>
            <div style={{color:C.muted,fontSize:11,marginTop:1}}>Follows system · manual override</div>
          </div>
        </div>
        <Toggle on={theme==="dark"} onChange={()=>toggleTheme&&toggleTheme()}/>
      </div>
      <button onClick={onOpenWidget} style={{width:"100%",padding:"13px 18px",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"inherit"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:11,background:C.greenDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📱</div>
          <div style={{textAlign:"left"}}>
            <div style={{color:C.cream,fontWeight:600,fontSize:14}}>Home Screen Widget</div>
            <div style={{color:C.muted,fontSize:11,marginTop:1}}>Preview & install your widget</div>
          </div>
        </div>
        <span style={{color:C.muted,fontSize:18}}>›</span>
      </button>
    </div>
    <button onClick={handleShare} style={{background:`linear-gradient(135deg,${C.green},#1A3D2A)`,borderRadius:18,padding:"16px 20px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"inherit",width:"100%",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:26}}>🌱</span>
        <div style={{textAlign:"left"}}>
          <div style={{color:"#fff",fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15}}>Share Flourish</div>
          <div style={{color:"rgba(255,255,255,0.55)",fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>Invite a friend · help them thrive</div>
        </div>
      </div>
      <span style={{background:"rgba(255,255,255,0.15)",borderRadius:99,padding:"6px 14px",color:"#fff",fontSize:11,fontWeight:700}}>Share ↗</span>
    </button>
    {[
      {icon:"user",  color:C.purple, label:"Profile & Income",    sub:`${data.profile.name} · ${data.profile.country}`},
      {icon:"bank",  color:C.blue,   label:"Connected Accounts",  sub:`${data.accounts?.length||0} accounts`},
      {icon:"calendar",color:C.teal, label:"Manage Bills",        sub:`${data.bills?.length||0} tracked`},
      {icon:"trendUp",color:C.orange,label:"Manage Debts",        sub:`${data.debts?.length||0} in plan`},
      {icon:"target", color:C.gold,  label:"Savings Goals",       sub:"Emergency fund & more"},
      {icon:"users",  color:C.pink,  label:"Family Settings",     sub:`${data.profile.status} · ${data.profile.hasKids?"has kids":"no kids"}`},
    ].map((item,i)=>(
      <div key={i} style={{background:C.card,borderRadius:18,padding:"13px 16px",marginBottom:8,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:13,cursor:"pointer",transition:"all .22s cubic-bezier(.16,1,.3,1)"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=item.color+"55";e.currentTarget.style.transform="translateX(2px)";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.transform="none";}}>
        <div style={{width:38,height:38,borderRadius:12,background:item.color+"18",border:`1px solid ${item.color}28`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <Icon id={item.icon} size={18} color={item.color} strokeWidth={1.6}/>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.cream,fontWeight:600,fontSize:14}}>{item.label}</div>
          <div style={{color:C.muted,fontSize:12,marginTop:1}}>{item.sub}</div>
        </div>
        <span style={{color:C.muted,fontSize:20,fontWeight:300}}>›</span>
      </div>
    ))}
    <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.8,fontWeight:700,marginTop:20,marginBottom:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Notifications</div>
    {[
      ["overdraft","zap",    C.red,   "Overdraft warnings"],
      ["bills",   "calendar",C.gold,  "Bill due soon alerts"],
      ["coach",   "sparkles",C.green, "AI coach insights"],
      ["meeting", "users",   C.teal,  "Money meeting reminders"],
      ["patterns","chartUp", C.blue,  "Spending pattern alerts"],
    ].map(([key,icon,color,label])=>(
      <div key={key} style={{background:C.card,borderRadius:16,padding:"13px 16px",marginBottom:8,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:13}}>
        <div style={{width:36,height:36,borderRadius:11,background:color+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <Icon id={icon} size={16} color={color} strokeWidth={1.6}/>
        </div>
        <div style={{flex:1}}>
          <div style={{color:C.cream,fontSize:14,fontWeight:600}}>{label}</div>
        </div>
        <Toggle on={notifToggles[key]} onChange={v=>setNotifToggles(t=>({...t,[key]:v}))}/>
      </div>
    ))}
    <div style={{marginTop:24,padding:"16px",background:C.redDim,borderRadius:16,border:`1px solid ${C.red}33`}}>
      <div style={{color:C.red,fontWeight:700,marginBottom:4}}>Delete All Data</div>
      <div style={{color:C.mutedHi,fontSize:13,marginBottom:12}}>Remove all your financial data from Flourish. This cannot be undone.</div>
      <Btn label="Delete My Data" onClick={()=>{if(window.confirm("Delete all your data? This cannot be undone.")){clearState();window.location.reload();}}} color={C.red} small/>
    </div>
    {onReset&&(
      <button onClick={()=>{if(window.confirm("Reset app and go back to setup?"))onReset();}} style={{width:"100%",marginTop:8,background:"none",border:`1px solid ${C.border}`,borderRadius:14,padding:"11px",fontFamily:"inherit",fontWeight:600,color:C.muted,cursor:"pointer",fontSize:12}}>
        🔄 Reset to onboarding
      </button>
    )}
    <div style={{textAlign:"center",color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:12,letterSpacing:0.3}}>
      Flourish v1.0 · flourishmoney.app · © 2026 GrowSmart Inc.
    </div>
  </div>;
}



// ─── DESKTOP SIDEBAR PANEL ────────────────────────────────────────────────────
function DesktopSidebar({data,setScreen}){
  const txns=data.transactions||MOCK_TXN;
  const today=new Date().getDate();
  const soonBills=(data.bills||[]).filter(b=>{const d=parseInt(b.date);return d>=today&&d<=today+10;});
  const investments=(data.accounts||[]).filter(a=>a.type==="investment");
  const totalInvested=investments.reduce((a,i)=>a+(i.balance||0),0);
  const totalGain=investments.reduce((a,i)=>a+(i.gain||0),0);

  return <>
    {/* Investment Portfolio Card */}
    {investments.length>0&&<div style={{background:C.card,borderRadius:20,padding:"20px",border:`1px solid ${C.teal}22`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>Investment Portfolio</div>
          <div style={{color:C.tealBright,fontWeight:900,fontSize:26,fontFamily:"'Playfair Display',serif",marginTop:3}}>${totalInvested.toLocaleString()}</div>
        </div>
        <div style={{background:C.teal+"18",border:`1px solid ${C.teal}33`,borderRadius:99,padding:"5px 12px",color:C.tealBright,fontSize:11,fontWeight:700}}>+${totalGain.toLocaleString()} total</div>
      </div>
      {investments.map((inv,i)=>(
        <div key={i} style={{background:C.cardAlt,borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:C.cream,fontWeight:600,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{inv.name}</div>
            <div style={{color:C.muted,fontSize:11,marginTop:2}}>{inv.ticker}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:C.cream,fontWeight:700,fontSize:14}}>${inv.balance?.toLocaleString()}</div>
            <div style={{color:C.greenBright,fontSize:11,fontWeight:600}}>+{inv.gainPct}%</div>
          </div>
        </div>
      ))}
    </div>}

    {/* Upcoming bills */}
    <div style={{background:C.card,borderRadius:20,padding:"20px",border:`1px solid ${C.border}`}}>
      <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginBottom:12}}>Upcoming Bills</div>
      {soonBills.length===0&&<div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>No bills due in the next 10 days 🎉</div>}
      {soonBills.map((b,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<soonBills.length-1?`1px solid ${C.border}`:"none"}}>
          <div>
            <div style={{color:C.cream,fontSize:13,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{b.name}</div>
            <div style={{color:C.muted,fontSize:11}}>Due the {b.date}{b.date==="1"?"st":b.date==="2"?"nd":b.date==="3"?"rd":"th"}</div>
          </div>
          <div style={{color:C.gold,fontWeight:700,fontSize:14}}>${b.amount}</div>
        </div>
      ))}
    </div>

    {/* Recent transactions */}
    <div style={{background:C.card,borderRadius:20,padding:"20px",border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>Recent Activity</div>
        <button onClick={()=>setScreen("spend")} style={{background:"none",border:"none",color:C.green,fontSize:11,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>See all →</button>
      </div>
      {txns.filter(t=>t.amount>0).slice(0,5).map((t,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<4?`1px solid ${C.border}`:"none"}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{width:32,height:32,borderRadius:10,background:t.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{t.icon}</div>
            <div>
              <div style={{color:C.cream,fontSize:13,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{t.name}</div>
              <div style={{color:C.muted,fontSize:11}}>{t.date}</div>
            </div>
          </div>
          <div style={{color:C.cream,fontWeight:700,fontSize:13}}>${t.amount.toFixed(2)}</div>
        </div>
      ))}
    </div>

    {/* AI Coach quick prompt */}
    <div onClick={()=>setScreen("coach")} style={{background:`linear-gradient(135deg,${C.greenDim},${C.card})`,borderRadius:20,padding:"20px",border:`1px solid ${C.green}22`,cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.green+"44";e.currentTarget.style.transform="translateY(-2px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.green+"22";e.currentTarget.style.transform="none";}}>
      <div style={{marginBottom:10,display:"flex",justifyContent:"center"}}><Icon id="sparkles" size={26} color={C.green} strokeWidth={1.35}/></div>
      <div style={{color:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',serif",marginBottom:6}}>Ask your AI Coach</div>
      <div style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>Get personalized advice based on your real transactions and {data.profile?.country==="US"?"401k/IRA":"RRSP/TFSA"} situation.</div>
      <div style={{color:C.green,fontSize:12,fontWeight:700,marginTop:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Start coaching session →</div>
    </div>
  </>;
}


// ─── PREMIUM GATE ─────────────────────────────────────────────────────────────
function PremiumGate({feature,desc,onUpgrade}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"60px 20px",gap:20,minHeight:400}}>
      <div style={{width:72,height:72,borderRadius:24,background:`linear-gradient(135deg,${C.purple}30,${C.purple}08)`,border:`1px solid ${C.purple}44`,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon id="sparkles" size={32} color={C.purpleBright} strokeWidth={1.35}/></div>
      <div>
        <div style={{color:C.cream,fontWeight:900,fontSize:22,fontFamily:"'Playfair Display',serif",marginBottom:8}}>{feature}</div>
        <div style={{color:C.muted,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.7,maxWidth:280}}>{desc}</div>
      </div>
      <div style={{background:C.purpleDim,borderRadius:16,padding:"14px 20px",border:`1px solid ${C.purple}33`,maxWidth:280}}>
        <div style={{color:C.purpleBright,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Flourish Plus includes:</div>
        <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
          {["AI Coach with real data","Full credit coaching","Tax tips & benefits checker","Investment tracking","Household sharing","Debt simulator"].map((f,i)=>(
            <div key={i} style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",textAlign:"left",display:"flex",alignItems:"center",gap:7}}><Icon id="check" size={14} color={C.green} strokeWidth={2.0}/>{f}</div>
          ))}
        </div>
      </div>
      <button onClick={onUpgrade} style={{background:`linear-gradient(135deg,${C.purple},${C.purpleBright})`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:15,padding:"14px 36px",borderRadius:99,border:"none",cursor:"pointer",boxShadow:`0 6px 24px ${C.purple}40`}}>
        Unlock Flourish Plus →
      </button>
      <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>7-day free trial · Cancel anytime</div>
    </div>
  );
}

// ─── PAYWALL ──────────────────────────────────────────────────────────────────
function Paywall({onClose,onUpgrade,country}){
  const [selected,setSelected]=useState("annual");
  const isCA=country==="CA";
  const plans={
    annual:{label:"Annual",price:isCA?"$79.99/yr":"$59.99/yr",monthly:isCA?"$6.67/mo":"$5.00/mo",save:"Save 33%",badge:"Best Value"},
    monthly:{label:"Monthly",price:isCA?"$9.99/mo":"$7.99/mo",monthly:null,save:null,badge:null},
  };
  const features=[
    {icon:"sparkles",title:"AI Coach",desc:"Personalized advice from your real transaction data"},
    {icon:"target",title:"Tax Tips & Benefits",desc:isCA?"RRSP, TFSA, CCB, GST credit, Trillium and more":"EITC, Child Tax Credit, 401k, HSA and more"},
    {icon:"shield",title:"Credit Coaching",desc:"Full factor breakdown + improvement plan"},
    {icon:"chartUp",title:"Investment Tracking",desc:isCA?"RRSP, TFSA, Questrade, Wealthsimple":"401k, IRA, Fidelity, Vanguard"},
    {icon:"house2",title:"Household Sharing",desc:"Connect with a partner, track shared goals"},
    {icon:"target",title:"Debt Simulator",desc:"See exactly when you'll be debt-free"},
    {icon:"chartUp",title:"Spending Insights",desc:"AI-powered pattern detection & smart cut suggestions"},
  ];

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif",color:C.cream,display:"flex",justifyContent:"center",transition:"background .35s,color .35s"}}>
      <div style={{width:"100%",maxWidth:430,padding:"24px 20px 60px"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28}}>
          <div style={{fontSize:20,fontWeight:800,color:C.cream,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:7}}><FlourishMark size={21}/><span>Flourish Plus</span></div>
          <button onClick={onClose} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 14px",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✕ Maybe Later</button>
        </div>

        {/* Hero */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{marginBottom:10,display:"flex",justifyContent:"center"}}><Icon id="sparkles" size={40} color={C.purpleBright} strokeWidth={1.3}/></div>
          <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:28,color:C.cream,marginBottom:8,lineHeight:1.2}}>Unlock your full financial picture</div>
          <div style={{color:C.muted,fontSize:14,lineHeight:1.7}}>Everything in free, plus the tools that actually change your finances.</div>
        </div>

        {/* Plan selector */}
        <div style={{display:"flex",gap:10,marginBottom:20}}>
          {Object.entries(plans).map(([key,plan])=>(
            <button key={key} onClick={()=>setSelected(key)} style={{flex:1,background:selected===key?C.purple+"22":C.card,border:`2px solid ${selected===key?C.purple:C.border}`,borderRadius:16,padding:"14px 12px",cursor:"pointer",textAlign:"center",position:"relative",transition:"all .2s"}}>
              {plan.badge&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:C.purple,color:"#fff",fontSize:9,fontWeight:800,borderRadius:99,padding:"3px 10px",whiteSpace:"nowrap"}}>{plan.badge}</div>}
              <div style={{color:selected===key?C.purpleBright:C.muted,fontWeight:700,fontSize:12,marginBottom:4,fontFamily:"inherit"}}>{plan.label}</div>
              <div style={{color:selected===key?C.cream:C.mutedHi,fontWeight:900,fontSize:18,fontFamily:"'Playfair Display',serif"}}>{plan.price}</div>
              {plan.monthly&&<div style={{color:C.muted,fontSize:11,marginTop:2}}>{plan.monthly} · billed annually</div>}
              {plan.save&&<div style={{color:C.greenBright,fontSize:10,fontWeight:700,marginTop:4}}>{plan.save}</div>}
            </button>
          ))}
        </div>

        {/* Features list */}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
          {features.map((f,i)=>(
            <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",background:C.card,borderRadius:14,padding:"13px 14px",border:`1px solid ${C.border}`}}>
              <div style={{flexShrink:0,marginTop:2}}><Icon id={f.icon||"sparkles"} size={20} color={C.purpleBright} strokeWidth={1.5}/></div>
              <div>
                <div style={{color:C.cream,fontWeight:700,fontSize:13}}>{f.title}</div>
                <div style={{color:C.muted,fontSize:12,marginTop:2,lineHeight:1.5}}>{f.desc}</div>
              </div>
              <div style={{color:C.green,fontSize:16,flexShrink:0,marginTop:2}}>✓</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button onClick={onUpgrade} style={{width:"100%",background:`linear-gradient(135deg,${C.purple} 0%,${C.purpleBright} 100%)`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:16,padding:"16px",borderRadius:99,border:"none",cursor:"pointer",boxShadow:`0 8px 32px ${C.purple}40`,marginBottom:12}}>
          Start Free 7-Day Trial →
        </button>
        <div style={{textAlign:"center",color:C.muted,fontSize:11,lineHeight:1.7}}>
          7 days free, then {plans[selected].price}. Cancel anytime.<br/>
          Payment processed securely. No hidden fees.
        </div>

        {/* Trust footer */}
        <div style={{marginTop:20,display:"flex",justifyContent:"center",gap:16}}>
          {["🔒 Bank-level security","🇨🇦🇺🇸 Canada & USA","✓ PIPEDA compliant"].map((t,i)=>(
            <div key={i} style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:4}}>{t}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const NAV=[
  {id:"home",  icon:"home",     label:"Home"},
  {id:"plan",  icon:"calendar", label:"Plan"},
  {id:"spend", icon:"card",     label:"Spend"},
  {id:"coach", icon:"sparkles", label:"Coach"},
  {id:"family",icon:"users",    label:"Family"},
];

// ── PERSISTENCE HELPERS ───────────────────────────────────────────────────────
const STORAGE_KEY = "flourish_v1";
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveState(patch) {
  try {
    const cur = loadState() || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({...cur, ...patch}));
  } catch {}
}
function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export default function FlourishApp(){
  // ── Hydrate from localStorage on first render ──────────────────
  const saved = loadState();
  const [onboarded,setOnboarded]=useState(()=>saved?.onboarded||false);
  const [appData,setAppData]=useState(()=>saved?.appData||null);
  const [screen,setScreen]=useState("home");
  const [showNotifs,setShowNotifs]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [household,setHousehold]=useState(()=>saved?.household||null);
  const [isPremium,setIsPremium]=useState(()=>saved?.isPremium||false);
  const [showPaywall,setShowPaywall]=useState(false);
  const [checkInBonus,setCheckInBonus]=useState(()=>saved?.checkInBonus||0);
  const [showCheckIn,setShowCheckIn]=useState(false);
  const [showWhatIf,setShowWhatIf]=useState(false);
  const [showWrapped,setShowWrapped]=useState(false);
  const [isOnline,setIsOnline]=useState(()=>navigator.onLine);
  // ── Theme ───────────────────────────────────────────────────────
  const [theme,setTheme]=useState(()=>{
    try{ const t=localStorage.getItem("flourish_theme"); if(t==="light"||t==="dark")return t; }catch{}
    return window.matchMedia?.("(prefers-color-scheme: light)").matches?"light":"dark";
  });
  const {w}=useWindowSize();
  const isDesktop=w>=960;

  // ── Persist state changes to localStorage ──────────────────────
  useEffect(()=>{ saveState({onboarded,appData,household,isPremium,checkInBonus}); },
    [onboarded,appData,household,isPremium,checkInBonus]);
  useEffect(()=>{ try{localStorage.setItem("flourish_theme",theme);}catch{} },[theme]);

  // ── System dark/light preference listener ──────────────────────
  useEffect(()=>{
    const mq=window.matchMedia?.("(prefers-color-scheme: light)");
    if(!mq)return;
    const handler=e=>{
      try{ if(!localStorage.getItem("flourish_theme_manual"))setTheme(e.matches?"light":"dark"); }catch{}
    };
    mq.addEventListener("change",handler);
    return()=>mq.removeEventListener("change",handler);
  },[]);

  // ── Online/offline detection ────────────────────────────────────
  useEffect(()=>{
    const on=()=>setIsOnline(true);
    const off=()=>setIsOnline(false);
    window.addEventListener("online",on);
    window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);

  // ── Apply theme palette BEFORE any render ───────────────────────
  C = theme==="light" ? LIGHT_C : DARK_C;
  const toggleTheme=()=>{
    const next=theme==="dark"?"light":"dark";
    setTheme(next);
    try{localStorage.setItem("flourish_theme_manual","1");}catch{}
  };

  if(showWrapped)return <MoneyWrapped data={appData||{}} onClose={()=>setShowWrapped(false)}/>;
  if(showWhatIf)return <WhatIfSimulator data={appData||{}} onClose={()=>setShowWhatIf(false)}/>;
  if(showCheckIn)return <WeeklyCheckInModal data={appData||{}} onClose={()=>setShowCheckIn(false)} onComplete={(pts)=>{setCheckInBonus(prev=>Math.min(20,prev+pts));setShowCheckIn(false);}}/>;
  if(!onboarded)return <Onboarding onComplete={d=>{setAppData(d);setOnboarded(true);}}/>;
  if(showPaywall)return <Paywall onClose={()=>setShowPaywall(false)} onUpgrade={()=>{setIsPremium(true);setShowPaywall(false);}} country={appData?.profile?.country||"CA"}/>;

  const unread=INIT_NOTIFS.filter(n=>!n.read).length;
  const dataWithHousehold={...appData,household,isPremium};

  // ── Pass isOnline down to AICoach + reset helper ──────────────
  const handleReset = () => { clearState(); window.location.reload(); };

  const content=()=>{
    if(showNotifs)return <Notifications onClose={()=>setShowNotifs(false)}/>;
    if(showSettings)return <Settings data={appData} onClose={()=>setShowSettings(false)} onReset={handleReset} theme={theme} toggleTheme={toggleTheme} onOpenWidget={()=>{setShowSettings(false);setScreen("widget");}}/>;
    if(screen==="home")return <Dashboard data={dataWithHousehold} setScreen={setScreen} setShowNotifs={setShowNotifs} isDesktop={isDesktop} onUpgrade={()=>setShowPaywall(true)} checkInBonus={checkInBonus} onCheckIn={()=>setShowCheckIn(true)} onWhatIf={()=>setShowWhatIf(true)} onWrapped={()=>setShowWrapped(true)}/>;
    if(screen==="plan")return <PlanAhead data={dataWithHousehold}/>;
    if(screen==="spend")return <SpendScreen data={dataWithHousehold}/>;
    if(screen==="coach")return isPremium?<AICoach data={dataWithHousehold} isOnline={isOnline}/>:<PremiumGate feature="AI Coach" desc="Get personalized coaching from your real transaction data." onUpgrade={()=>setShowPaywall(true)}/>;
    if(screen==="family")return <Family data={dataWithHousehold} household={household} setHousehold={setHousehold}/>;
    if(screen==="goals")return <Goals data={dataWithHousehold} onUpgrade={()=>setShowPaywall(true)}/>;
    if(screen==="credit")return isPremium?<CreditScreen data={dataWithHousehold}/>:<PremiumGate feature="Credit Coaching" desc="Full credit score breakdown, factor analysis, and a personalized improvement plan." onUpgrade={()=>setShowPaywall(true)}/>;
    if(screen==="widget")return <WidgetScreen data={dataWithHousehold} onBack={()=>setScreen("home")}/>;
    return <Dashboard data={dataWithHousehold} setScreen={setScreen} setShowNotifs={setShowNotifs} isDesktop={isDesktop} onUpgrade={()=>setShowPaywall(true)} checkInBonus={checkInBonus} onCheckIn={()=>setShowCheckIn(true)} onWhatIf={()=>setShowWhatIf(true)} onWrapped={()=>setShowWrapped(true)}/>;
  };

  const ALL_NAV=[
    {id:"home",icon:"◈",label:"Home"},
    {id:"plan",icon:"🗓",label:"Plan"},
    {id:"spend",icon:"💳",label:"Spend"},
    {id:"coach",icon:"sparkles",label:"Coach"},
    {id:"family",icon:"👪",label:"Family"},
    {id:"goals",icon:"chartUp",label:"Goals"},
  ];

  const globalStyles=`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
@keyframes fadeUp    { from{opacity:0;transform:translateY(22px)}  to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn    { from{opacity:0}                              to{opacity:1} }
@keyframes slideUp   { from{opacity:0;transform:translateY(10px)}  to{opacity:1;transform:translateY(0)} }
@keyframes slideIn   { from{opacity:0;transform:translateX(-14px)} to{opacity:1;transform:translateX(0)} }
@keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.45} }
@keyframes shimmer   { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes mintGlow  { 0%,100%{box-shadow:0 0 0 0 rgba(0,214,143,0)} 50%{box-shadow:0 0 60px 8px rgba(0,214,143,0.12)} }
@keyframes goldGlow  { 0%,100%{box-shadow:0 0 0 0 rgba(240,196,66,0)} 50%{box-shadow:0 0 60px 8px rgba(240,196,66,0.10)} }
@keyframes ringPulse { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.4);opacity:0} }
@keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes floatUp   { 0%{transform:translateY(0)} 50%{transform:translateY(-4px)} 100%{transform:translateY(0)} }
@keyframes numberIn  { from{opacity:0;transform:translateY(8px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes gradShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
* { -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; box-sizing:border-box; }
::-webkit-scrollbar { width:0; background:transparent; }
input,button,select,textarea { font-family:inherit; }
    input[type=range]{-webkit-appearance:none;appearance:none;background:transparent}
    input[type=range]::-webkit-slider-runnable-track{background:rgba(255,255,255,0.08);border-radius:99px;height:6px}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;margin-top:-4px;width:16px;height:16px;border-radius:50%;background:var(--thumb-color,#00D68F);cursor:pointer;box-shadow:0 0 8px var(--thumb-color,#00D68F)66}
    input[type=range]:focus{outline:none}
    ::selection{background:rgba(0,214,143,0.25);color:#EDE8E1}
    body{background:#060A0E}
`
  if(isDesktop) return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif",color:C.cream,display:"flex"}}>
      <style dangerouslySetInnerHTML={{__html:globalStyles}}/>

      {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────── */}
      <div style={{width:240,minHeight:"100vh",background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",position:"sticky",top:0,height:"100vh",flexShrink:0}}>
        {/* Logo */}
        <div style={{padding:"28px 24px 20px"}}>
          <button onClick={()=>{setShowNotifs(false);setShowSettings(false);setScreen("home");}} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:12,background:"rgba(0,214,143,0.10)",border:"1px solid rgba(0,214,143,0.25)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.12)"}}><FlourishMark size={24}/></div>
            <span style={{fontSize:22,fontWeight:800,color:C.cream,fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:-0.3}}>flourish</span>
          </button>
          {appData&&<div style={{color:C.muted,fontSize:11,marginTop:8,fontFamily:"'Plus Jakarta Sans',sans-serif",paddingLeft:2}}>{CC[appData.profile?.country||"CA"]?.flag} {CC[appData.profile?.country||"CA"]?.name} · {CC[appData.profile?.country||"CA"]?.currency}</div>}
        </div>

        {/* Nav items */}
        <div style={{flex:1,padding:"0 12px",display:"flex",flexDirection:"column",gap:2}}>
          {ALL_NAV.map(n=>{
            const active=(screen===n.id||(n.id==="goals"&&screen==="credit"))&&!showNotifs&&!showSettings;
            return(
              <button key={n.id} className="nav-item" onClick={()=>{setShowNotifs(false);setShowSettings(false);setScreen(n.id);}}
                style={{background:active?C.green+"18":"transparent",border:`1px solid ${active?C.green+"33":"transparent"}`,borderRadius:12,padding:"11px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,color:active?C.greenBright:C.muted,fontWeight:active?700:400,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all .18s",textAlign:"left",width:"100%"}}>
                <Icon id={n.icon} size={17} color={active?C.greenBright:C.muted} strokeWidth={active?1.9:1.4}/>
                {n.label}
                {n.id==="home"&&unread>0&&<div style={{marginLeft:"auto",width:18,height:18,borderRadius:99,background:C.red,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</div>}
              </button>
            );
          })}
        </div>

        {/* Sidebar footer */}
        <div style={{padding:"16px 12px",borderTop:`1px solid ${C.border}`}}>
          {appData&&<div style={{background:C.card,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,borderRadius:99,background:C.green+"22",border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}><Icon id="user" size={15} color={C.green} strokeWidth={1.5}/></div>
              <div>
                <div style={{color:C.cream,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{appData.profile?.name||"User"}</div>
                {household&&<div style={{color:C.green,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>🏠 Household connected</div>}
              </div>
            </div>
          </div>}
          <button onClick={()=>{setShowNotifs(false);setShowSettings(true);}}
            style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 14px",cursor:"pointer",color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:8,transition:"all .18s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.borderHi;e.currentTarget.style.color=C.cream;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}>
            Settings
          </button>
        </div>
      </div>

      {/* ── DESKTOP MAIN CONTENT ────────────────────────────────────── */}
      <div style={{flex:1,minHeight:"100vh",display:"flex",flexDirection:"column",maxWidth:"calc(100vw - 240px)"}}>
        {/* Top bar */}
        <div style={{padding:"20px 36px 16px",background:C.isDark?`${C.bg}F8`:`${C.bg}EE`,backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:20,display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.border}`}}>
          <div>
            <div style={{color:C.cream,fontWeight:700,fontSize:18,fontFamily:"'Playfair Display',serif"}}>
              {showNotifs?"Notifications":showSettings?"Settings":screen==="home"?"Dashboard":screen==="plan"?"Plan Ahead":screen==="spend"?"Spending":screen==="coach"?"AI Coach":screen==="family"?"Family":screen==="goals"||screen==="credit"?"Goals & Wealth":"Dashboard"}
            </div>
            <div style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>{new Date().toLocaleDateString(CC[appData?.profile?.country||"CA"]?.locale||"en-CA",{weekday:"long",month:"long",day:"numeric"})}</div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            {household&&<div style={{background:C.green+"18",border:`1px solid ${C.green}33`,borderRadius:99,padding:"6px 14px",color:C.greenBright,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>🏠 Household #{household.code}</div>}
            <button onClick={()=>{setShowSettings(false);setShowNotifs(true);}} style={{position:"relative",background:C.card,border:`1px solid ${unread>0?C.red+"55":C.border}`,borderRadius:12,padding:"10px 14px",cursor:"pointer",fontSize:18,transition:"all .18s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.borderHi} onMouseLeave={e=>e.currentTarget.style.borderColor=unread>0?C.red+"55":C.border}>
              <Icon id="bell" size={18} color={C.mutedHi} strokeWidth={1.5}/>
              {unread>0&&<div style={{position:"absolute",top:-4,right:-4,width:18,height:18,borderRadius:99,background:C.red,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</div>}
            </button>
          </div>
        </div>

        {/* Two-column for home, single for others */}
        {screen==="home"&&!showNotifs&&!showSettings?(
          <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:28,padding:"28px 36px 40px",overflowY:"auto",flex:1}}>
            <div><Dashboard data={dataWithHousehold} setScreen={setScreen} setShowNotifs={setShowNotifs} isDesktop={true} checkInBonus={checkInBonus} onCheckIn={()=>setShowCheckIn(true)} onWhatIf={()=>setShowWhatIf(true)} onWrapped={()=>setShowWrapped(true)}/></div>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <DesktopSidebar data={dataWithHousehold} setScreen={setScreen}/>
            </div>
          </div>
        ):(
          <div style={{flex:1,padding:"28px 36px 40px",overflowY:"auto",maxWidth:860}}>
            {content()}
          </div>
        )}
      </div>
    </div>
  );

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────────
  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif",color:C.cream,display:"flex",justifyContent:"center",transition:"background .35s,color .35s"}}>
      <style dangerouslySetInnerHTML={{__html:globalStyles}}/>
      {/* Ambient mesh background */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
        <div style={{position:"absolute",top:-220,left:-180,width:640,height:640,borderRadius:"50%",background:C.isDark?"radial-gradient(circle,rgba(0,204,133,0.055) 0%,transparent 68%)":"radial-gradient(circle,rgba(0,147,95,0.07) 0%,transparent 68%)",animation:"breathe 8s ease-in-out infinite"}}/>
        <div style={{position:"absolute",bottom:-160,right:-160,width:540,height:540,borderRadius:"50%",background:C.isDark?"radial-gradient(circle,rgba(155,125,255,0.045) 0%,transparent 68%)":"radial-gradient(circle,rgba(88,64,188,0.05) 0%,transparent 68%)",animation:"breathe 10s ease-in-out infinite 2s"}}/>
        <div style={{position:"absolute",top:"40%",right:-100,width:360,height:360,borderRadius:"50%",background:C.isDark?"radial-gradient(circle,rgba(77,168,255,0.025) 0%,transparent 70%)":"radial-gradient(circle,rgba(36,114,200,0.04) 0%,transparent 70%)",animation:"breathe 12s ease-in-out infinite 4s"}}/>
      </div>
      <div style={{width:"100%",maxWidth:430,minHeight:"100vh",display:"flex",flexDirection:"column",position:"relative",zIndex:1}}>
        {/* ── OFFLINE BANNER ─────────────────────────── */}
        {!isOnline&&(
          <div style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,zIndex:9999,background:"#180800",borderBottom:`2px solid ${C.orange}44`,padding:"9px 20px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:14}}>📡</span>
            <span style={{color:C.goldBright,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,fontWeight:700}}>Offline — AI features paused. Your data is saved.</span>
          </div>
        )}
        <div style={{padding:"14px 20px 12px",background:C.isDark?"rgba(5,8,16,0.90)":"rgba(244,241,235,0.92)",backdropFilter:"blur(32px)",WebkitBackdropFilter:"blur(32px)",position:"sticky",top:0,zIndex:30,display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,0.06)",boxShadow:"0 1px 0 rgba(255,255,255,0.025)"}}>
          <button onClick={()=>{setShowNotifs(false);setShowSettings(false);setScreen("home");}} style={{display:"flex",alignItems:"center",gap:9,background:"none",border:"none",cursor:"pointer",padding:0}}>
            <FlourishMark size={24} style={{borderRadius:7}}/>
            <span style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,fontSize:19,color:C.cream,letterSpacing:-0.5,background:`linear-gradient(130deg,${C.cream} 40%,rgba(237,233,226,0.7) 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>flourish</span>
          </button>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setShowSettings(false);setShowNotifs(true);}} style={{position:"relative",background:"rgba(255,255,255,0.07)",border:`1px solid ${unread>0?C.red+"55":C.border}`,borderRadius:12,padding:"8px 12px",cursor:"pointer"}}>
              <Icon id="bell" size={17} color={unread>0?C.redBright:C.mutedHi} strokeWidth={1.5}/>
              {unread>0&&<div style={{position:"absolute",top:-4,right:-4,width:17,height:17,borderRadius:99,background:C.red,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 8px ${C.red}88`}}>{unread}</div>}
            </button>
            <button onClick={()=>{setShowNotifs(false);setShowSettings(true);}} style={{background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:12,padding:"8px 12px",cursor:"pointer"}}><Icon id="settings" size={17} color={C.mutedHi} strokeWidth={1.5}/></button>
          </div>
        </div>
        <div style={{flex:1,padding:"16px 18px 120px",overflowY:"auto",overscrollBehavior:"contain"}}>{content()}</div>
        {!showNotifs&&!showSettings&&(
          <>
          {/* Floating pill nav */}
          <div style={{position:"fixed",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:50,width:"calc(100% - 40px)",maxWidth:390}}>
            <div style={{background:C.isDark?"rgba(10,16,24,0.94)":"rgba(253,252,250,0.95)",backdropFilter:"blur(32px)",WebkitBackdropFilter:"blur(32px)",borderRadius:30,border:`1px solid ${C.border}`,boxShadow:"0 12px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.06)",padding:"8px 8px",display:"flex",justifyContent:"space-around"}}>
            {ALL_NAV.map(n=>{
              const active=(screen===n.id||(n.id==="goals"&&screen==="credit"))&&!showNotifs&&!showSettings;
              return(
                <button key={n.id} onClick={()=>{setShowNotifs(false);setShowSettings(false);setScreen(n.id);}} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"5px 8px",borderRadius:22,transition:"all .28s cubic-bezier(.16,1,.3,1)"}}>
                  <div style={{width:40,height:30,borderRadius:16,
                    background:active?`linear-gradient(135deg,rgba(0,204,133,0.22) 0%,rgba(0,232,154,0.12) 100%)`:"transparent",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    transition:"all .28s cubic-bezier(.16,1,.3,1)",
                    boxShadow:active?`0 2px 12px rgba(0,204,133,0.30), inset 0 1px 0 rgba(0,232,154,0.20)`:"none"}}>
                    <Icon id={n.icon} size={18} color={active?C.greenBright:C.muted} strokeWidth={active?2.2:1.4}/>
                  </div>
                  <span style={{fontSize:9.5,fontWeight:active?800:500,fontFamily:"'Plus Jakarta Sans',sans-serif",color:active?C.greenBright:C.muted,letterSpacing:active?0.3:0,transition:"all .28s cubic-bezier(.16,1,.3,1)"}}>{n.label}</span>
                </button>
              );
            })}
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
