import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Home, Calendar, CreditCard, Sparkles, Users, User,
  Bell, Settings as LucideSettings, ShoppingCart, Coffee,
  Zap, Package, Film, Music, Pill, Shirt,
  TrendingUp, Shield, CheckCircle,
  Target, PiggyBank, DollarSign,
  ShoppingBag, Flame, Star, Car, BarChart2,
  Navigation, Cpu, Grid, Heart, LayoutGrid
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);


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
      {title:"RRSP Contribution",body:"Every RRSP dollar reduces your taxable income. At a 30% marginal rate, putting in $5,000 gets you ~$1,500 back at tax time. Deadline is the first 60 days of the following year (typically early March — check CRA for the exact date).",savings:"Up to 33%",flag:"🇨🇦",priority:"high",action:"Check My RRSP Room"},
      {title:"TFSA — You're Probably Under-Using It",body:"Your TFSA isn't just for savings — it's for investing. Any growth inside is 100% tax-free forever. If you opened one at 18, you may have $75,000+ of contribution room sitting unused.",savings:"Tax-free growth",flag:"🇨🇦",priority:"high",action:"Calculate My Room"},
      {title:"FHSA (First Home Savings Account)",body:"If you've never owned a home, you can contribute up to $8,000/year and get a tax deduction — like an RRSP. Unused room carries forward. Withdraw tax-free to buy your first home.",savings:"Up to $8,000/yr",flag:"🇨🇦",priority:"high",action:"Open an FHSA"},
      {title:"GST/HST Credit",body:"Filing your taxes means CRA automatically checks if you qualify for quarterly GST/HST credits. 2025–26 maximum: $533/yr single, $698/yr couple. Under ~$55k income? You likely qualify and may not know it. File every year even if you owe nothing.",savings:"Up to $533/yr",flag:"🇨🇦",priority:"medium",action:"File Your Taxes"},
      {title:"Canada Child Benefit (CCB)",body:"Tax-free monthly payments for children under 18. Maximum 2025–26: $7,997/yr per child under 6 ($666/mo) and $6,748/yr per child aged 6–17 ($562/mo). A family with two kids under 6 at modest income can receive nearly $16,000/year tax-free. Apply on CRA My Account or at birth registration.",savings:"Up to $7,997/child under 6",flag:"🇨🇦",priority:"high",action:"Apply on CRA"},
      {title:"Home Office Deduction",body:"Work from home? Employees must use the detailed method with a signed T2200 from their employer (the $2/day flat rate ended after 2022). Claim your workspace percentage of rent, utilities, and internet. Self-employed? Claim actual rent, internet, hydro proportionally.",savings:"Varies — % of home expenses",flag:"🇨🇦",priority:"medium",action:"Track Home Office Days"},
      {title:"Ontario Trillium Benefit",body:"Ontario residents: combines the Ontario Sales Tax Credit, Ontario Energy Credit, and Northern Ontario Energy Credit into one monthly payment. Low-to-mid income earners often miss this.",savings:"Up to $1,654/yr (OEPTC+OSTC)",flag:"🏙️ ON",priority:"medium",action:"Apply on CRA"},
      {title:"Disability Tax Credit (DTC)",body:"If you or a dependent has a severe disability, the DTC provides up to ~$1,470/year in federal tax reduction (14.5% × $10,138 base amount for 2025), plus retroactive claims. Often missed — a doctor fills out T2201.",savings:"~$1,470 federal tax reduction",flag:"🇨🇦",priority:"medium",action:"Get T2201 Form"},
      {title:"Child Care Expense Deduction",body:"Daycare, after-school programs, summer camp — most childcare costs are deductible from the lower-income spouse's return. CRA limits: $8,000/child under 7, $5,000/child aged 7–16. Claimed at a 30% rate, one toddler in daycare saves ~$2,400.",savings:"$1,200–$4,000",flag:"🇨🇦",priority:"high",action:"Gather Receipts"},
      {title:"RESP — Free Government Money",body:"Open an RESP for your child and the government adds 20% on the first $2,500/year = $500 free per child. Canada Learning Bond adds another $500 for lower-income families.",savings:"$500–$1,000/yr free",flag:"🇨🇦",priority:"high",action:"Open an RESP"},
      {title:"Working Income Tax Benefit (CWB)",body:"Working but earning under ~$37,742 (single) or ~$49,393 (family)? CRA owes you a refundable tax credit just for filing. Many low-income workers miss this entirely.",savings:"Up to $1,633 single / $2,813 family",flag:"🇨🇦",priority:"medium",action:"Check Eligibility"},
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
      {id:"rrsp",name:"RRSP",fullName:"Registered Retirement Savings Plan",icon:"🏦",color:"#2E8B2E",annualLimit:"18% of income (max $32,490 for 2025)",taxNote:"Contributions deductible. Withdrawals taxed as income.",tip:"Contribute in high-income years. Use spousal RRSP for income splitting."},
      {id:"tfsa",name:"TFSA",fullName:"Tax-Free Savings Account",icon:"🛡️",color:"#2FADA6",annualLimit:"$7,000 (2025 & 2026). Unused room accumulates.",taxNote:"No deduction on contribution. All growth and withdrawals tax-free.",tip:"Invest in ETFs inside your TFSA — don't just park cash."},
      {id:"fhsa",name:"FHSA",fullName:"First Home Savings Account",icon:"🏠",color:"#CFA03E",annualLimit:"$8,000/yr (max $40,000 lifetime)",taxNote:"Deductible going in. Tax-free withdrawal for first home purchase.",tip:"Best account for first-time buyers. Open even if you're not buying immediately — room accumulates."},
      {id:"resp",name:"RESP",fullName:"Registered Education Savings Plan",icon:"👶",color:"#8A5FC8",annualLimit:"$2,500/yr to maximize CESG grant",taxNote:"No deduction. Government adds 20% (CESG) on first $2,500/yr.",tip:"Even $2,500/yr gets $500 free from government. Start at birth."},
    ],
    benefitsChecker:[
      {name:"Canada Child Benefit",icon:"👶",eligible:"Has children under 18",amount:"Up to $7,997/child under 6",apply:"CRA My Account",url:"https://canada.ca/ccb"},
      {name:"GST/HST Credit",icon:"🛒",eligible:"Under ~$50k income",amount:"Up to $533/yr",apply:"File your taxes",url:"https://canada.ca/gst-credit"},
      {name:"Ontario Trillium Benefit",icon:"🏙️",eligible:"Ontario residents, low-mid income",amount:"Up to $1,654/yr",apply:"ON-BEN form with taxes",url:"https://canada.ca/trillium"},
      {name:"Canada Workers Benefit",icon:"💼",eligible:"Working, under ~$37,742 single",amount:"Up to $1,633 single / $2,813 family",apply:"Schedule 6 with taxes",url:"https://canada.ca/cwb"},
      {name:"Canada Disability Benefit (CDB)",icon:"♿",eligible:"DTC-approved, age 18–64, low income",amount:"Up to $200/mo ($2,400/yr)",apply:"Service Canada online",url:"https://canada.ca/cdb"},
      {name:"Disability Tax Credit",icon:"♿",eligible:"Severe disability",amount:"~$1,470 federal credit",apply:"T2201 with doctor",url:"https://canada.ca/dtc"},
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
      {title:"Earned Income Tax Credit (EITC)",body:"One of the most under-claimed credits in America. Under $61,555 (single) or $68,675 (married) with qualifying children? You could get up to $8,046 back (2025, 3 or more children) — even if you owe nothing. Must file to claim.",savings:"Up to $8,046 (2025, 3+ children)",flag:"🇺🇸",priority:"high",action:"Check EITC Eligibility"},
      {title:"Child Tax Credit",body:"Up to $2,200 per qualifying child under 17 (increased by OBBBA, July 2025). Partially refundable up to $1,700 — meaning you can get money back even if you owe nothing. File even if your income is low.",savings:"$2,200/child (2025)",flag:"🇺🇸",priority:"high",action:"Claim on Schedule 8812"},
      {title:"401(k) — Get the Full Match First",body:"If your employer matches 401(k) contributions, not contributing enough to get the full match is leaving free money on the table. A 4% match on $50k = $2,000/year you're giving up.",savings:"Up to $23,500/yr (2025)",flag:"🇺🇸",priority:"high",action:"Increase 401k Contributions"},
      {title:"HSA: The Triple Tax Advantage",body:"If you have a high-deductible health plan, an HSA lets you contribute pre-tax, grow tax-free, and withdraw tax-free for medical expenses. It's legally the most tax-advantaged account available.",savings:"Up to $4,300/yr (2025)",flag:"🇺🇸",priority:"high",action:"Open an HSA"},
      {title:"Roth IRA: Tax-Free Retirement",body:"Under $150k single / $236k married? You can contribute $7,000/year to a Roth IRA (2025 income limits). You pay tax now, but all growth and withdrawals are 100% tax-free in retirement.",savings:"$7,000/yr tax-free",flag:"🇺🇸",priority:"high",action:"Open a Roth IRA"},
      {title:"Student Loan Interest Deduction",body:"Paying student loans? You may be able to deduct up to $2,500 of interest per year, reducing taxable income directly — even without itemizing.",savings:"Up to $2,500",flag:"🇺🇸",priority:"medium",action:"Find 1098-E Form"},
      {title:"Child & Dependent Care Credit",body:"Paying for daycare, after-school, or a caregiver while you work? You can claim 20–35% of up to $3,000 (1 child) or $6,000 (2+ children) in care expenses as a tax credit.",savings:"$600–$2,100 (1–2 children)",flag:"🇺🇸",priority:"medium",action:"Track Care Receipts"},
      {title:"Saver's Credit",body:"Low-to-mid income and contributing to a 401k or IRA? The Saver's Credit gives you up to 50% of your contribution back as a tax credit. Under $39,500 single? You likely qualify.",savings:"Up to $1,000",flag:"🇺🇸",priority:"medium",action:"Check Form 8880"},
      {title:"American Opportunity Tax Credit",body:"Paying for the first 4 years of college? You can claim up to $2,500/year per student — and 40% is refundable even if you owe nothing.",savings:"Up to $2,500/yr",flag:"🇺🇸",priority:"medium",action:"Claim on Form 8863"},
      {title:"Medical Expense Deduction",body:"Medical expenses exceeding 7.5% of your AGI are deductible if you itemize. For Americans with significant medical debt, this can mean thousands back.",savings:"Varies",flag:"🇺🇸",priority:"low",action:"Track Medical Receipts"},
      {title:"Home Office Deduction",body:"Self-employed and work from home? The simplified method allows $5 per square foot (up to 300 sq ft = $1,500). No complex calculations needed.",savings:"Up to $1,500",flag:"🇺🇸",priority:"medium",action:"Measure Your Office"},
      {title:"No Tax on Tips (2025–2028)",body:"Work in a tipped occupation — restaurant, salon, hotel, rideshare, personal trainer? Deduct up to $25,000 of qualified tips from your federal income. No itemizing required. Phases out above $150k MAGI. Expires after 2028 unless extended.",savings:"Up to $25,000 deduction",flag:"🇺🇸",priority:"high",action:"Track Tips — Form 4137"},
      {title:"No Tax on Overtime (2025–2028)",body:"Earn FLSA-required overtime (time-and-a-half)? You can deduct the premium 'half' portion — up to $12,500 ($25,000 if married filing jointly). Phases out above $150k MAGI. Expires after 2028. Salary-exempt workers generally don't qualify.",savings:"Up to $12,500 deduction",flag:"🇺🇸",priority:"medium",action:"Check Your W-2 Overtime"},
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
      {id:"401k",name:"401(k)",fullName:"Employer Retirement Plan",icon:"🏦",color:"#2E8B2E",annualLimit:"$23,500/yr (2025; $31,000 if 50+)",taxNote:"Traditional: contributions pre-tax, withdrawals taxed. Roth 401k: after-tax contributions, tax-free withdrawals.",tip:"Always contribute enough to get the full employer match — it's free money."},
      {id:"roth",name:"Roth IRA",fullName:"Individual Retirement Account",icon:"🛡️",color:"#2FADA6",annualLimit:"$7,000/yr ($8,000 if 50+). Phaseout at $150k single/$236k MFJ (2025)",taxNote:"After-tax contributions. All growth and qualified withdrawals 100% tax-free.",tip:"Open early — the tax-free compounding over decades is massive. Use Fidelity or Vanguard."},
      {id:"hsa",name:"HSA",fullName:"Health Savings Account",icon:"🏥",color:"#CFA03E",annualLimit:"$4,300 single / $8,550 family (2025)",taxNote:"Triple tax advantage: pre-tax in, tax-free growth, tax-free for medical expenses.",tip:"After 65, HSA funds can be used for anything (taxed like a 401k). Best account in the US tax code."},
      {id:"529",name:"529 Plan",fullName:"Education Savings Account",icon:"🎓",color:"#8A5FC8",annualLimit:"No annual limit. $19,000/yr gift tax exclusion (2025).",taxNote:"State deduction varies. Federal tax-free growth and withdrawals for education.",tip:"Start when kids are young. Some states give immediate tax deductions."},
    ],
    benefitsChecker:[
      {name:"Earned Income Tax Credit",icon:"💰",eligible:"Working, under $61,555 (single) / $68,675 (MFJ)",amount:"Up to $8,046 (2025, 3+ children)",apply:"File taxes (IRS Free File)",url:"https://irs.gov/eitc"},
      {name:"SNAP (Food Stamps)",icon:"🛒",eligible:"Low income households",amount:"~$191/mo per person (USDA FY2025)",apply:"Benefits.gov",url:"https://benefits.gov"},
      {name:"Medicaid / CHIP",icon:"🏥",eligible:"Low-income adults and children",amount:"Free/low-cost healthcare",apply:"Healthcare.gov",url:"https://healthcare.gov"},
      {name:"Child Tax Credit",icon:"👶",eligible:"Children under 17",amount:"Up to $2,200/child (2025)",apply:"File taxes",url:"https://irs.gov/ctc"},
      {name:"LIHEAP Energy Assistance",icon:"⚡",eligible:"Low income, utility hardship",amount:"Varies by state",apply:"Benefits.gov",url:"https://benefits.gov"},
      {name:"WIC Program",icon:"🍼",eligible:"Pregnant/postpartum, children under 5",amount:"Food + support",apply:"Local health dept",url:"https://wic.fns.usda.gov"},
    ],
    creditBureaus:["Equifax","Experian","TransUnion — all three count for FICO"],
    emergencyMonths:6,
    healthcareNote:"Medical emergencies are the #1 cause of US bankruptcy. 6 months of expenses is the minimum.",
  },
};

// ─── PERSONALIZED TAX CREDIT ENGINE ─────────────────────────────────────────
// Returns a filtered + enriched tax tip array based on profile.
// Surfaces only credits that apply to the user's life stage, province/state,
// income types, and family situation.
function getPersonalizedTaxCredits(profile) {
  const country   = profile?.country   || "CA";
  const province  = profile?.province  || "ON";
  const rawLifeStage = profile?.lifeStages || profile?.lifeStage || "employed";
  const lifeStages = Array.isArray(rawLifeStage) ? rawLifeStage : [rawLifeStage];
  const hasStage = (...stages) => stages.some(s => lifeStages.includes(s));
  const lifeStage = lifeStages[0] || "employed";
  const hasKids   = profile?.hasKids   || false;
  const status    = profile?.status    || "single";
  const isHomeowner = profile?.isHomeowner || false;
  const empType   = profile?.employmentType || "t4";
  const isSelfEmp = empType==="selfemployed"||empType==="incorporated";
  const birthYear = parseInt(profile?.birthYear||"0");
  const age       = birthYear>0 ? new Date().getFullYear()-birthYear : null;
  const isSenior  = (age&&age>=65)||hasStage("senior","retired");
  const isStudent = hasStage("student")||empType==="student";
  const incomeTypes = (profile?.incomeTypes || []).map(t => t.toLowerCase());
  const cfg = CC[country] || CC.CA;

  // Start with base country tips, then add life-stage + province specific ones
  let tips = [...(cfg.taxTips || [])];

  // ── FILTER: remove tips that clearly don't apply ──────────────────────────
  tips = tips.filter(tip => {
    const t = tip.title.toLowerCase();
    if ((t.includes("child") || t.includes("ccb") || t.includes("resp") || t.includes("dependent care") || t.includes("childcare") || t.includes("child care")) && !hasKids) return false;
    // FHSA only for non-homeowners
    if (t.includes("fhsa") && (isHomeowner || isSenior)) return false;
    if (t.includes("first home") && isHomeowner) return false;
    if (t.includes("resp") && !hasKids) return false;
    if (t.includes("student loan interest") && !isStudent) return false;
    if (t.includes("home office") && isStudent && !hasStage("employed","selfemployed") && !isSelfEmp) return false;
    if ((t.includes("working income") || t.includes("cwb")) && isSenior && !hasStage("employed","selfemployed") && !isSelfEmp) return false;
    // Self-employment tips — only for self-employed
    if ((t.includes("hst") || t.includes("gst registration") || t.includes("schedule c") || t.includes("quarterly estimated") || t.includes("sep-ira") || t.includes("solo 401")) && !isSelfEmp) return false;
    // Senior tips — only for seniors
    if ((t.includes("age amount") || t.includes("pension income split") || t.includes("oas") || t.includes("gis") || t.includes("rmd") || t.includes("social security taxation")) && !isSenior) return false;
    return true;
  });

  // ── ADD: Student-specific credits ────────────────────────────────────────
  if (hasStage("student")) {
    if (country === "CA") {
      tips.unshift(
        {title:"Tuition Tax Credit",body:"Your T2202 slip from your school lets you claim every dollar of tuition as a federal tax credit (15% federal rate). Unused amounts carry forward indefinitely — you can use them in future high-income years. Transfer up to $5,000 unused amount to a parent or spouse.",savings:"15% of tuition paid",flag:"🇨🇦",priority:"high",action:"Get Your T2202"},
        {title:"Canada Training Credit",body:"You accumulate $250/year in Canada Training Credit room (up to $5,000 lifetime). This is a refundable credit — you get money back even if you owe nothing. Claim on line 45350 of your return.",savings:"Up to $250/yr",flag:"🇨🇦",priority:"high",action:"Check CTC Room on CRA"},
        {title:"GST/HST Credit — Students Almost Always Qualify",body:"If your income is low (most students qualify), file your taxes and CRA automatically pays you quarterly GST/HST credits. No application needed — just file. Many students skip filing because they 'don't earn much' and miss hundreds.",savings:"Up to $533/yr",flag:"🇨🇦",priority:"high",action:"File Your Taxes"},
        {title:"Student Loan Interest Credit",body:"Paying interest on government student loans (OSAP, NSLSC)? That interest is 100% claimable as a non-refundable federal tax credit. Private loans don't qualify — only government loans. Keep your annual interest statement.",savings:"15% of interest paid",flag:"🇨🇦",priority:"medium",action:"Get NSLSC Statement"},
        {title:"Moving Expenses Deduction",body:"If you moved more than 40km to attend school full-time, you can deduct eligible moving expenses from your scholarship or research income. Keep your receipts — this is often missed.",savings:"Varies",flag:"🇨🇦",priority:"medium",action:"Track Moving Receipts"}
      );
      // Province-specific student credits
      if (province === "MB") {
        tips.push({title:"Manitoba Tuition Fee Income Tax Rebate",body:"Stay and work in Manitoba after graduating and you can recover up to 60% of your Manitoba tuition paid over your working years. Claim up to $2,500/year as a Manitoba resident.",savings:"Up to 60% of MB tuition",flag:"🏙️ MB",priority:"high",action:"Apply After Graduation"});
      }
      if (province === "SK") {
        tips.push({title:"Saskatchewan Graduate Retention Program",body:"Graduate and work in Saskatchewan to receive up to $20,000 in provincial tax credits over 7 years. One of the most generous graduate incentives in Canada.",savings:"Up to $20,000",flag:"🏙️ SK",priority:"high",action:"Apply After Graduation"});
      }
      if (province === "NB" || province === "NS" || province === "PEI" || province === "NL") {
        tips.push({title:"Atlantic Graduate Tax Credit",body:"Atlantic provinces offer graduate tax credits to encourage graduates to stay and work in the region. Specific amounts vary by province — check your provincial tax return.",savings:"Varies by province",flag:"🏙️ Atlantic",priority:"medium",action:"Check Provincial Return"});
      }
    }
    if (country === "US") {
      tips.unshift(
        {title:"American Opportunity Tax Credit (AOTC)",body:"In your first 4 years of college? Claim up to $2,500/year per eligible student. 40% is fully refundable — meaning you get up to $1,000 back even if you owe nothing. This is the most valuable education credit available.",savings:"Up to $2,500/yr",flag:"🇺🇸",priority:"high",action:"Claim on Form 8863"},
        {title:"Lifetime Learning Credit",body:"Beyond the first 4 years, or taking part-time courses? The Lifetime Learning Credit gives you 20% of up to $10,000 in tuition = $2,000/year. No limit on the number of years you can claim it.",savings:"Up to $2,000/yr",flag:"🇺🇸",priority:"high",action:"Claim on Form 8863"},
        {title:"Student Loan Interest Deduction",body:"Paying interest on student loans? Deduct up to $2,500 of interest per year — even without itemizing. Income phase-out starts at $75k single / $155k married. Check your 1098-E form from your loan servicer.",savings:"Up to $2,500",flag:"🇺🇸",priority:"high",action:"Find Your 1098-E"},
        {title:"Scholarship & Fellowship Exclusion",body:"Scholarships used for tuition, fees, and required course materials are tax-free. Amounts used for room, board, or stipends are taxable. Keep records of how scholarship funds are spent.",savings:"Potentially thousands",flag:"🇺🇸",priority:"medium",action:"Track Scholarship Use"},
        {title:"529 Plan Tax-Free Withdrawals",body:"If a parent or grandparent has a 529 plan for you, qualified withdrawals for tuition, fees, books, and room & board are 100% tax-free. Some states also let you deduct contributions.",savings:"Tax-free growth",flag:"🇺🇸",priority:"medium",action:"Confirm Qualified Expenses"}
      );
      // State-specific student credits
      if (province === "NY") {
        tips.push({title:"New York College Tuition Tax Credit",body:"New York residents can claim a tuition credit of up to $400 per student, or a tuition itemized deduction on your NY state return. Both can be worth claiming — compare which is larger for your situation.",savings:"Up to $400 credit",flag:"🗽 NY",priority:"medium",action:"Check IT-272 Form"});
      }
      if (province === "IL") {
        tips.push({title:"Illinois Education Expense Credit",body:"Illinois residents can claim a 25% credit on qualified K-12 education expenses up to $500 — and college expenses for dependent students may also qualify under certain conditions.",savings:"Up to $500",flag:"🏙️ IL",priority:"medium",action:"Check Schedule ICR"});
      }
      if (province === "MN") {
        tips.push({title:"Minnesota K-12 Education Credit",body:"Minnesota offers education credits and deductions that can apply to post-secondary expenses for dependents. Check Form M1ED for your specific eligibility.",savings:"Varies",flag:"🏙️ MN",priority:"medium",action:"Check Form M1ED"});
      }
    }
  }

  // ── ADD: Senior / Retired credits ─────────────────────────────────────────
  if (hasStage("senior", "retired")) {
    if (country === "CA") {
      tips.unshift(
        {title:"Age Amount Credit",body:"If you're 65 or older, you can claim the Age Amount — a federal non-refundable tax credit worth up to $8,396 (2024). It reduces if your income exceeds $42,335 and disappears above ~$98k. Even partial claims are worth thousands.",savings:"Up to $1,259 in tax saved",flag:"🇨🇦",priority:"high",action:"Claim on Line 30100"},
        {title:"Pension Income Splitting",body:"If you receive eligible pension income (RPP, RRIF, annuity), you can split up to 50% with your spouse. If your spouse is in a lower tax bracket, this can save your household thousands every year.",savings:"Potentially thousands",flag:"🇨🇦",priority:"high",action:"File Form T1032"},
        {title:"Pension Income Tax Credit",body:"The first $2,000 of eligible pension income qualifies for a 15% federal credit ($300 saved). Even if you're splitting pension income, your spouse can also claim this credit on the transferred amount.",savings:"Up to $300 federal",flag:"🇨🇦",priority:"high",action:"Claim on Line 31400"},
        {title:"OAS & GIS — Are You Getting Everything?",body:"Old Age Security ($727.67/mo at 65) is automatic, but the Guaranteed Income Supplement (GIS) is not — you must apply. Low-income seniors leave GIS unclaimed every year. If your income is under ~$21,624, apply immediately.",savings:"Up to $1,065/mo (GIS)",flag:"🇨🇦",priority:"high",action:"Apply at Service Canada"},
      {title:"CPP Maximum — Know What You're Entitled To",body:"The maximum CPP retirement pension is $1,364.60/mo (2025) at age 65. Your actual amount depends on contributions history. You can check your CPP Statement of Contributions at My Service Canada Account.",savings:"Up to $1,364.60/mo",flag:"🇨🇦",priority:"medium",action:"Check My Service Canada"},
        {title:"Medical Expense Tax Credit",body:"Seniors often have significant medical costs — prescriptions, dental, vision, hearing aids, home care. Expenses exceeding 3% of your net income (or $2,635 — whichever is less) are claimable. Keep every receipt.",savings:"15% of qualifying expenses",flag:"🇨🇦",priority:"high",action:"Gather Medical Receipts"},
        {title:"Home Accessibility Tax Credit",body:"Making your home safer and more accessible? Renovations like grab bars, wheelchair ramps, or walk-in tubs qualify for a 15% federal credit on up to $20,000 of expenses per year.",savings:"Up to $3,000",flag:"🇨🇦",priority:"medium",action:"Keep Renovation Receipts"}
      );
    }
    if (country === "US") {
      tips.unshift(
        {title:"Social Security Taxation — Know Your Threshold",body:"Up to 85% of Social Security benefits may be taxable depending on your 'combined income'. If you're near the threshold, strategic Roth conversions or timing of other income can reduce how much gets taxed.",savings:"Potentially thousands",flag:"🇺🇸",priority:"high",action:"Calculate Combined Income"},
        {title:"Higher Standard Deduction at 65+",body:"Americans 65 and older get an additional standard deduction ($1,950 single / $1,550 married per qualifying spouse in 2024) on top of the regular deduction. No action needed — it applies automatically when you file.",savings:"$1,550–$3,900 extra deduction",flag:"🇺🇸",priority:"high",action:"File Taxes — Applied Automatically"},
        {title:"Credit for the Elderly or Disabled",body:"Low-income seniors (under $17,500 single) may qualify for a tax credit of $3,750–$7,500. Often overlooked because Social Security recipients don't expect to owe tax, but this is a direct credit against taxes owed.",savings:"Up to $7,500",flag:"🇺🇸",priority:"high",action:"Check Schedule R"},
        {title:"Required Minimum Distributions (RMDs)",body:"At age 73, you must begin taking RMDs from traditional IRAs and 401(k)s. Missing an RMD triggers a 25% penalty on the missed amount. Plan withdrawals carefully — Roth IRAs have no RMD requirement.",savings:"Avoid 25% penalty",flag:"🇺🇸",priority:"high",action:"Calculate Your RMD"},
        {title:"Qualified Charitable Distribution (QCD)",body:"If you're 70½ or older, you can transfer up to $105,000/year directly from your IRA to charity. This counts toward your RMD and is excluded from taxable income — better than donating cash.",savings:"Up to $105,000 excluded",flag:"🇺🇸",priority:"medium",action:"Contact Your IRA Custodian"}
      );
    }
  }

  // ── ADD: Self-employed additions ─────────────────────────────────────────
  if (hasStage("selfemployed")) {
    if (country === "CA") {
      tips.push(
        {title:"Business Expenses — What You Can Actually Claim",body:"Vehicle (business km %), phone (business %), internet, software, accounting fees, professional dues, advertising, and meals (50%). Every legitimate expense reduces your taxable income dollar for dollar.",savings:"Varies — often $3,000–$15,000",flag:"🇨🇦",priority:"high",action:"Track All Receipts"},
        {title:"HST Registration Threshold",body:"Once your revenue exceeds $30,000 in a calendar quarter or over 4 quarters, you must register for HST. Register voluntarily earlier to claim Input Tax Credits on business purchases.",savings:"Claim back HST paid",flag:"🇨🇦",priority:"high",action:"Register on CRA Business"},
        {title:"CPP Contributions — Both Sides",body:"As self-employed, you pay both the employee (5.95%) and employer (5.95%) portions of CPP on net self-employment income. The employer portion is deductible. CPP2 contributions also apply above the second ceiling.",savings:"Employer portion is deductible",flag:"🇨🇦",priority:"high",action:"See Schedule 8"}
      );
    }
    if (country === "US") {
      tips.push(
        {title:"Self-Employment Tax Deduction",body:"You pay 15.3% self-employment tax on net earnings, but you can deduct half of it from your gross income. This reduces your taxable income before the standard deduction — often worth $1,000–$4,000.",savings:"Half of SE tax deducted",flag:"🇺🇸",priority:"high",action:"See Schedule SE"},
        {title:"Qualified Business Income (QBI) Deduction",body:"If you're a sole proprietor, partnership, or S-corp, you may deduct up to 20% of qualified business income from your taxable income. One of the largest deductions available to self-employed people.",savings:"Up to 20% of net income",flag:"🇺🇸",priority:"high",action:"Check Form 8995"},
        {title:"SEP-IRA or Solo 401(k)",body:"Self-employed? You can contribute up to 25% of net self-employment income to a SEP-IRA (max $69,000 in 2024) — fully deductible. Solo 401(k) allows even higher contributions plus a Roth option.",savings:"Up to $69,000/yr",flag:"🇺🇸",priority:"high",action:"Open SEP-IRA or Solo 401k"}
      );
    }
  }

  // ── ADD: Province-specific credits for all users ───────────────────────────
  if (country === "CA") {
    if (province === "ON" && !tips.find(t => t.title.includes("Trillium"))) {
      tips.push({title:"Ontario Trillium Benefit",body:"Ontario residents: combines the Ontario Sales Tax Credit, Ontario Energy Credit, and Northern Ontario Energy Credit into one monthly payment. Low-to-mid income earners often miss this.",savings:"Up to $1,654/yr (OEPTC+OSTC)",flag:"🏙️ ON",priority:"medium",action:"Apply on CRA"});
    }
    if (province === "QC") {
      tips.push(
        {title:"Quebec Solidarity Tax Credit",body:"Quebec's refundable solidarity tax credit combines housing, QST, and northern village components. Apply on your Quebec TP-1 return. Many Quebecers eligible for $300–$2,000+ per year.",savings:"$300–$2,000+",flag:"🏙️ QC",priority:"high",action:"Claim on TP-1 Return"},
        {title:"Quebec Child Assistance Payment",body:"Quebec provides a refundable tax credit for families with children — separate from the federal CCB. Amounts depend on income and number of children, paid quarterly.",savings:"Varies by family",flag:"🏙️ QC",priority:"high",action:"Apply via Revenu Québec"}
      );
    }
    if (province === "AB") {
      tips.push({title:"Alberta Has No Provincial Income Tax Credits",body:"Alberta has no provincial income tax on top of federal — your effective tax rate is already lower than most provinces. Focus on maximizing federal credits: RRSP, TFSA, FHSA, and GST/HST credit.",savings:"Lower baseline rate",flag:"🏙️ AB",priority:"medium",action:"Maximize Federal Credits"});
    }
    if (province === "BC") {
      tips.push({title:"BC Climate Action Tax Credit",body:"BC residents with moderate incomes receive a quarterly climate action tax credit — automatic when you file your taxes. Single individuals can receive up to $447/year.",savings:"Up to $447/yr",flag:"🏙️ BC",priority:"medium",action:"File Your Taxes"});
    }
  }

  // ── Deduplicate by title ──────────────────────────────────────────────────
  const seen = new Set();
  tips = tips.filter(t => {
    if (seen.has(t.title)) return false;
    seen.add(t.title);
    return true;
  });

  // ── Re-sort: high priority first ─────────────────────────────────────────
  tips.sort((a,b) => {
    const order = {high:0, medium:1, low:2};
    return (order[a.priority]??1) - (order[b.priority]??1);
  });

  return tips;
}

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

// Maps a category name → { emoji, color hex } at render time.
// Used so recategorizing a transaction immediately updates its icon & color
// without needing to mutate the original txn object.
const CAT_DISPLAY = {
  "Groceries":            { emoji:"🛒", color:"#00CC85" },
  "Coffee & Dining":      { emoji:"☕", color:"#FF8C42" },
  "Gas & Transport":      { emoji:"🚗", color:"#4DA8FF" },
  "Shopping":             { emoji:"🛍️", color:"#FF6B9D" },
  "Clothing":             { emoji:"👗", color:"#9B7DFF" },
  "Subscriptions":        { emoji:"📱", color:"#00C8E0" },
  "Health":               { emoji:"💊", color:"#00C8E0" },
  "Personal Care":        { emoji:"🧴", color:"#E8B84B" },
  "Entertainment":        { emoji:"🎬", color:"#FF6B9D" },
  "Hobbies & Sports":     { emoji:"🎯", color:"#4DA8FF" },
  "Kids & Extracurricular":{ emoji:"🧒", color:"#00CC85" },
  "Travel":               { emoji:"✈️", color:"#9B7DFF" },
  "Home":                 { emoji:"🏠", color:"#FF8C42" },
  "Education":            { emoji:"📚", color:"#4DA8FF" },
  "Utilities":            { emoji:"⚡", color:"#E8B84B" },
  "Bills":                { emoji:"📋", color:"#E8B84B" },
  "Housing":              { emoji:"🏠", color:"#FF8C42" },
  "Phone & Internet":     { emoji:"📡", color:"#00C8E0" },
  "Insurance":            { emoji:"🛡️", color:"#4DA8FF" },
  "Services":             { emoji:"⚙️", color:"#888888" },
  "Transfer":             { emoji:"↔️", color:"#888888" },
  "Income":               { emoji:"💰", color:"#00CC85" },
  "Fees":                 { emoji:"🏦", color:"#888888" },
  "Other":                { emoji:"📌", color:"#888888" },
};
function getCatDisplay(catName) {
  return CAT_DISPLAY[catName] || { emoji:"📌", color:"#888888" };
}

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
    // Signal the top-level app to show the reconnect banner
    if(data.needs_reconnect && typeof window.__flourishReconnect === "function") {
      window.__flourishReconnect();
    }
    throw err;
  }
  return data;
}

// Plaid Personal Finance Category (PFC) primary values → Flourish display meta
// Shared keyword list for detecting credit card payments in transactions.
// Used by income detection, spending calc, and transparency panel — single source of truth.
// Compound phrases only — single words like "payment","visa","amex" are too broad
// Real CC payments are caught by Transfer category. These catch non-Transfer settlements.
const CC_PAYMENT_KEYWORDS = [
  "credit card payment",
  "card payment",
  "minimum payment",
  "balance payment",
  "autopay",
  "amex payment",
  "visa payment",
  "mastercard payment",
  "credit card autopay",
];

// Canadian/US bank online payment names — catch BNS SCOTIAONLINE etc.
// NOT "bill payment" — too broad, catches Enbridge/Hydro One
const CC_INSTITUTION_PATTERNS = [
  "scotiaonline",
  "mb-credit card",
  "credit card/loc",
  "mb-visa",
  "mb-mastercard",
  "mb-amex",
  "online bill pay",
  "web payment",
  "telephone banking",
];

// Internal transfer patterns — Interac e-Transfer, wire, own-account moves
const INTERNAL_TRANSFER_PATTERNS = [
  "interac e-transfer",
  "interac etransfer",
  "e-transfer",
  "etransfer",
  "wire transfer",
  "online transfer",
  "account transfer",
  "transfer to savings",
  "transfer from savings",
  "transfer to chequing",
  "transfer from chequing",
  "transfer to checking",
  "transfer from checking",
  "internal transfer",
  "own transfer",
  "tfr to",
  "tfr from",
  "funds transfer",
  "swift transfer",
  "ach transfer",
];

function isInternalTransfer(txn) {
  if(!txn) return false;
  const name = (txn.name || "").toLowerCase();
  const cat  = (txn.cat  || "").toLowerCase();
  if(cat === "transfer") return true;
  return INTERNAL_TRANSFER_PATTERNS.some(p => name.includes(p));
}

// Categories that represent fixed/variable bill commitments — NOT discretionary spending.
// These are tracked via the Bills array and must be excluded from budget category suggestions
// and discretionary spend calculations to prevent double-counting.
const BILL_CATS = new Set([
  "Utilities","Housing","Bills","Phone & Internet","Insurance",
  "Other Bills","Rent","Mortgage","Transportation" // Transportation when it's a bill payment
]);

// Categories always excluded from spending breakdowns (non-expense flows)
const NON_SPEND_CATS = new Set(["Transfer","Income","Fees"]);

// ─── CC PAYMENT DETECTOR ──────────────────────────────────────────────────────
// Identifies transactions that are credit card payments (not spending).
// Plaid shows CC payments as: Transfer category OR matching CC keywords in name.
// Also detects by amount matching a known debt balance (±$5 tolerance).
function isCCPayment(txn, debts=[]) {
  if(!txn || txn.amount <= 0) return false;
  const name = (txn.name || "").toLowerCase();
  const cat  = (txn.cat  || "").toUpperCase();
  // Compound keyword match (safe — no broad single words)
  if(CC_PAYMENT_KEYWORDS.some(kw => name.includes(kw))) return true;
  // Institution-specific online banking payment names
  if(CC_INSTITUTION_PATTERNS.some(p => name.includes(p))) return true;
  // CC network name + payment verb — catches "MB-RBC ROYAL BANK MASTERCARD"
  if((name.includes("mastercard") || name.includes("amex") || name.includes("visa")) &&
     (name.includes("payment") || name.includes("/loc pay") || name.includes("credit card"))) return true;
  // Transfer category + debt amount match (specific, not broad)
  if(cat === "TRANSFER" || cat.includes("TRANSFER")) {
    if(debts.length > 0) {
      const matchesDet = debts.some(d => {
        const min = parseFloat(d.min||0);
        const bal = parseFloat(d.balance||0);
        return (min > 0 && Math.abs(txn.amount - min) < 5) ||
               (bal > 0 && Math.abs(txn.amount - bal) < 5);
      });
      if(matchesDet) return true;
    }
    // NOTE: round-amount heuristic removed — too aggressive, hid mortgage payments
  }
  return false;
}

function isCashAdvance(txn) {
  if(!txn) return false; // both directions — CC charge and bank transfer
  const name = (txn.name || "").toLowerCase();
  return name.includes("cash advance") ||
         name.includes("cash adv") ||
         name.includes("atm advance") ||
         name.includes("credit advance") ||
         (name.includes("advance") && (name.includes("credit") || name.includes("card")));
}

// Returns CC payment transactions from a list, with the likely debt they paid
function detectCCPayments(txns, debts=[]) {
  return txns
    .filter(t => t.amount > 0 && isCCPayment(t, debts))
    .map(t => {
      const matchedDebt = debts.find(d => {
        const min = parseFloat(d.min||0);
        const bal = parseFloat(d.balance||0);
        return (min > 0 && Math.abs(t.amount - min) < 5) ||
               (bal > 0 && Math.abs(t.amount - bal) < 50);
      });
      return { ...t, likelyCCPayment: true, matchedDebt: matchedDebt?.name || null };
    });
}

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
  TRANSFER_IN:               { cat:"Transfer",        icon:"↔️", color:"#888"    },
  TRANSFER_OUT:              { cat:"Transfer",        icon:"↔️", color:"#888"    },
  CREDIT_CARD_PAYMENT:       { cat:"Transfer",        icon:"💳", color:"#888"    },
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
// Detect income deposits from transactions — returns {monthlyAvg, low, high, typical, isVariable, label}
function detectIncomeFromTxns(txns) {
  if (!txns || txns.length === 0) return null;
  // Income = negative amounts (money in) with income-like categories
  // CRITICAL: TRANSFER is excluded — credit card payments show as TRANSFER_IN
  // and must never be counted as income. Only true payroll/direct deposits qualify.
  const incomeTxns = txns.filter(t => {
    if (t.amount >= 0) return false; // must be money IN (negative in Plaid convention)
    const name = (t.name || "").toLowerCase();
    const cat  = (t.cat  || "").toUpperCase();
    // Exclude anything that looks like a credit card payment
    if (CC_PAYMENT_KEYWORDS.some(kw => name.includes(kw))) return false;
    // Exclude pure transfers — these are account-to-account moves, not income
    if (cat.includes("TRANSFER")) return false;
    // Only count genuine income signals
    return (
      cat.includes("INCOME") ||
      cat.includes("PAYROLL") ||
      name.includes("payroll") ||
      name.includes("direct deposit") ||
      name.includes("salary") ||
      name.includes("pay ") ||
      name.includes("deposit")
    );
  });
  if (incomeTxns.length === 0) return null;

  // Group by month
  const byMonth = {};
  incomeTxns.forEach(t => {
    const month = t.date.substring(0, 7); // "YYYY-MM"
    byMonth[month] = (byMonth[month] || 0) + Math.abs(t.amount);
  });
  const monthlyTotals = Object.values(byMonth);
  if (monthlyTotals.length === 0) return null;

  const avg = monthlyTotals.reduce((a,b) => a+b, 0) / monthlyTotals.length;
  const low = Math.min(...monthlyTotals);
  const high = Math.max(...monthlyTotals);
  // Variable if spread > 15% of average
  const isVariable = monthlyTotals.length > 1 && (high - low) / avg > 0.15;

  // Detect most common deposit name
  const nameCount = {};
  incomeTxns.forEach(t => { nameCount[t.name] = (nameCount[t.name]||0)+1; });
  const topName = Object.entries(nameCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || "Employment";

  return {
    monthlyAvg: Math.round(avg),
    low: Math.round(low),
    high: Math.round(high),
    typical: Math.round(avg),
    isVariable,
    label: topName,
  };
}

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
      amount:  (avg||0).toFixed(2),
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
  {id:"t11",date:"2026-02-28",name:"Walmart",          amount:89.22,  cat:"Groceries",      icon:"🛒",color:"#2E8B2E",dow:5},
  {id:"t12",date:"2026-02-27",name:"Hydro One",        amount:124.00, cat:"Utilities",      icon:"⚡",color:"#CFA03E",dow:4},
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
  {id:"u1",name:"Chase Checking ••2891",type:"checking",balance:DEMO.balance,institution:"Chase"},
  {id:"u2",name:"Chase Savings ••5504",type:"savings",balance:1840.00,institution:"Chase"},
  {id:"u3",name:"Chase Sapphire ••4471",type:"credit",balance:-3420.00,institution:"Chase"},
  {id:"u4",name:"Fidelity Roth IRA ••0033",type:"investment",balance:14200.00,institution:"Fidelity",ticker:"FXAIX",gain:2980,gainPct:26.5},
  {id:"u5",name:"Fidelity 401(k) ••8812",type:"investment",balance:23400.00,institution:"Fidelity",ticker:"Target 2055",gain:3890,gainPct:19.9},
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
  const _toMo = (amt,freq) => { const a=parseFloat(amt||0); return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:a; };
  const incomeAmt = (data.incomes||[]).reduce((s,i)=>s+_toMo(i.amount,i.freq),0) || DEMO.income;

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
  const [showDrillDown, setShowDrillDown] = useState(false);
  const plan = AutopilotEngine.generate(data);
  const today = new Date().toLocaleDateString("en-CA", {weekday:"long", month:"long", day:"numeric"});
  const hasActions = plan.savingsTransfer > 0 || plan.debtPayment > 0 || plan.goalContribution > 0;

  // Build overdraft drill-down: which specific bills cause the shortfall
  const { forecast, overdraftRisk } = ForecastEngine.generate(data, 14);
  const overdraftCulprits = (() => {
    if (!overdraftRisk.length) return [];
    const items = [];
    const balance = SafeSpendEngine.calculate(data).balance;
    let running = balance;
    for (const ev of forecast) {
      if (ev.day === 0) continue;
      if (ev.bills.length > 0) {
        for (const b of ev.bills) {
          running -= parseFloat(b.amount || 0);
          items.push({
            name: b.name || "Bill",
            amount: parseFloat(b.amount || 0),
            date: ev.date.toLocaleDateString("en-CA", {month:"short", day:"numeric"}),
            runningBalance: running,
            danger: running < 0,
          });
        }
      }
      if (ev.day > 0) running -= (ev.expenses - ev.bills.reduce((s,b)=>s+parseFloat(b.amount||0),0));
    }
    return items.slice(0, 6);
  })();

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
      icon:"🔒", label:"Untouched buffer", amount:`$${(plan.buffer||0).toFixed(0)}`,
      color:C.muted, detail:"stays in your account",
    },
  ].filter(Boolean);

  const autoBg = C.isDark
    ? `linear-gradient(155deg,#061510 0%,#0B1E14 50%,#080D10 100%)`
    : `linear-gradient(155deg,rgba(0,204,133,0.06) 0%,rgba(0,180,115,0.04) 50%,rgba(0,147,95,0.05) 100%)`;
  const autoText      = C.isDark ? "rgba(255,255,255,0.85)"  : C.cream;
  const autoMuted     = C.isDark ? "rgba(255,255,255,0.40)"  : C.muted;
  const autoSubtle    = C.isDark ? "rgba(255,255,255,0.35)"  : C.muted;
  const autoDivider   = C.isDark ? "rgba(255,255,255,0.06)"  : C.border;
  const autoTrack     = C.isDark ? "rgba(255,255,255,0.08)"  : "rgba(0,0,0,0.07)";
  const autoChipBg    = C.isDark ? "rgba(255,255,255,0.07)"  : "rgba(0,0,0,0.05)";
  const autoChipText  = C.isDark ? "rgba(255,255,255,0.40)"  : C.muted;
  const autoAlertBg   = C.isDark ? "rgba(255,100,100,0.12)"  : "rgba(220,60,60,0.08)";
  const autoAlertBdr  = C.isDark ? "rgba(255,100,100,0.25)"  : "rgba(220,60,60,0.25)";
  const autoAlertText = C.isDark ? "rgba(255,160,160,0.9)"   : "#c0392b";
  const autoItemMuted = C.isDark ? "rgba(255,255,255,0.30)"  : C.muted;
  const autoBorder    = C.isDark ? `1px solid ${C.green}30`  : `1px solid ${C.green}40`;
  const autoShadow    = C.isDark ? `0 16px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(0,214,143,0.08)` : `0 4px 24px rgba(0,180,115,0.12), 0 1px 0 rgba(0,204,133,0.15)`;

  return (
    <div style={{background:autoBg,borderRadius:26,overflow:"hidden",border:autoBorder,boxShadow:autoShadow,backdropFilter:"blur(12px)"}}>
      {/* Header */}
      <div style={{padding:"18px 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{color:autoMuted,fontSize:9,textTransform:"uppercase",letterSpacing:3,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,marginBottom:5}}>Autopilot · {today}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:C.cream,lineHeight:1.2}}>Today's Money Plan</div>
            <span style={{background:C.teal+"33",color:C.tealBright,fontSize:8,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,letterSpacing:1,textTransform:"uppercase",padding:"3px 7px",borderRadius:99,border:`1px solid ${C.teal}44`}}>Adaptive</span>
          </div>
        </div>
        <div style={{background:plan.mode==="low"?"rgba(110,240,160,0.15)":plan.mode==="medium"?"rgba(255,193,69,0.15)":"rgba(255,100,100,0.15)",border:`1px solid ${plan.mode==="low"?C.green+"55":plan.mode==="medium"?C.gold+"55":C.red+"55"}`,borderRadius:99,padding:"4px 10px"}}>
          <span style={{color:plan.mode==="low"?C.greenBright:plan.mode==="medium"?C.goldBright:C.redBright,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>
            {plan.modeLabel}
          </span>
        </div>
      </div>

      {/* Alert banner — clickable to show drill-down */}
      {plan.alerts.length > 0 && (
        <div
          onClick={()=>setShowDrillDown(d=>!d)}
          style={{margin:"12px 20px 0",background:autoAlertBg,border:`1px solid ${autoAlertBdr}`,borderRadius:12,padding:"10px 14px",display:"flex",gap:8,alignItems:"flex-start",cursor:"pointer",userSelect:"none"}}
        >
          <span style={{fontSize:14,flexShrink:0}}>⚠️</span>
          <span style={{color:autoAlertText,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.5,flex:1}}>{plan.alerts[0].msg}</span>
          <span style={{color:autoAlertText,fontSize:11,fontWeight:700,flexShrink:0}}>{showDrillDown?"▲":"▼"}</span>
        </div>
      )}

      {/* Overdraft drill-down panel */}
      {showDrillDown && overdraftCulprits.length > 0 && (
        <div style={{margin:"8px 20px 0",background:"rgba(255,79,106,0.06)",border:`1px solid ${C.red}33`,borderRadius:14,padding:"14px 16px"}}>
          <div style={{color:C.redBright,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:10}}>📋 Upcoming charges causing this</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {overdraftCulprits.map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:7,borderBottom:i<overdraftCulprits.length-1?`1px solid ${C.red}18`:"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14}}>{item.danger?"🔴":"🟡"}</span>
                  <div>
                    <div style={{color:C.cream,fontSize:12,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{item.name}</div>
                    <div style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{item.date}</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:C.redBright,fontWeight:800,fontSize:13,fontFamily:"'Playfair Display',serif"}}>−${item.amount.toFixed(0)}</div>
                  <div style={{color:item.runningBalance<0?C.redBright:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:item.runningBalance<0?700:400}}>
                    {item.runningBalance<0?`$${Math.abs(item.runningBalance).toFixed(0)} overdrawn`:`$${item.runningBalance.toFixed(0)} left`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,padding:"8px 10px",background:"rgba(255,79,106,0.08)",borderRadius:10,color:C.redBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,textAlign:"center"}}>
            💡 Move money before these hit to avoid NSF fees ($45–$48 each)
          </div>
        </div>
      )}

      {/* Line items */}
      <div style={{padding:"14px 20px 6px",display:"flex",flexDirection:"column",gap:10}}>
        {lineItems.map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingBottom:10,borderBottom:i<lineItems.length-1?`1px solid ${autoDivider}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18,flexShrink:0}}>{item.icon}</span>
              <div>
                <div style={{color:autoText,fontWeight:600,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{item.label}</div>
                <div style={{color:autoSubtle,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:1}}>{item.detail}</div>
              </div>
            </div>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,color:item.color==="muted"?autoItemMuted:item.color,flexShrink:0}}>{item.amount}</div>
          </div>
        ))}
      </div>

      {/* Weekly adherence bar */}
      <div style={{margin:"0 20px",padding:"12px 0 16px",borderTop:`1px solid ${autoDivider}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{color:autoMuted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>Plan adherence</span>
          <span style={{color:plan.adherence>=75?C.greenBright:plan.adherence>=50?C.goldBright:C.redBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800}}>{plan.adherence}%</span>
        </div>
        <div style={{height:4,borderRadius:99,background:autoTrack,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${plan.adherence}%`,background:`linear-gradient(to right,${plan.adherence>=75?C.green:plan.adherence>=50?C.gold:C.red}88,${plan.adherence>=75?C.greenBright:plan.adherence>=50?C.goldBright:C.redBright})`,borderRadius:99,transition:"width 1.2s ease"}}/>
        </div>
      </div>
      {/* Adaptive adjustments made to this plan */}
      {plan.adaptations && plan.adaptations.length > 0 && (
        <div style={{margin:"0 0 4px",padding:"0 0 12px",display:"flex",gap:5,flexWrap:"wrap"}}>
          {plan.adaptations.map((a,i)=>(
            <span key={i} style={{background:autoChipBg,color:autoChipText,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,padding:"3px 8px",borderRadius:99,letterSpacing:0.3}}>⚙ {a}</span>
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
  const [expandedDay, setExpandedDay] = useState(null); // day index that is drilled into

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

            const isDrilled = expandedDay === ev.day;
            const avgDaily = FinancialCalcEngine.avgDailySpend(data);
            return (
              <div key={idx} style={{paddingBottom:6,position:"relative"}}>
                {/* Row — tappable */}
                <div
                  onClick={()=>setExpandedDay(isDrilled ? null : ev.day)}
                  style={{display:"flex",gap:14,paddingBottom:8,cursor:"pointer",borderRadius:12,padding:"8px 6px",background:isDrilled?"rgba(255,255,255,0.03)":"transparent",transition:"background .15s"}}
                >
                  <div style={{width:40,display:"flex",justifyContent:"center",flexShrink:0,paddingTop:3}}>
                    <div style={{width:14,height:14,borderRadius:"50%",background:dotColor,border:`3px solid ${C.bg}`,zIndex:1,boxShadow:ev.day===0||ev.isPayday?`0 0 8px ${dotColor}88`:"none",flexShrink:0}}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:ev.day===0?800:600,fontSize:13,color:ev.day===0?C.cream:C.mutedHi,marginBottom:ev.isPayday||ev.bills.length>0?3:0}}>
                          {ev.day===0?"Today":ev.day===1?"Tomorrow":ev.date.toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"})}
                          <span style={{color:C.muted,fontSize:10,marginLeft:6}}>{isDrilled?"▲":"▼"}</span>
                        </div>
                        {ev.isPayday && ev.income>0 && <div style={{color:C.greenBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>{`+$${(ev.income||0).toFixed(0)} paycheck`}</div>}
                        {ev.bills.map((b,bi)=><div key={bi} style={{color:C.gold,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{b.name} −${parseFloat(b.amount||0).toFixed(0)}</div>)}
                        {isLow && !ev.isPayday && <div style={{color:C.redBright,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginTop:2}}>⚠ Low balance</div>}
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,minWidth:80}}>
                        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:13,color:balColor}}>{`$${(baseBalance||0).toFixed(0)}`}</div>
                        {overlayBal !== null && (
                          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:11,color:overlayLow?C.redBright:C.purpleBright,marginTop:2}}>
                            → ${(overlayBal||0).toFixed(0)}
                            <span style={{color:overlaydiff<0?C.redBright:C.greenBright,fontSize:9,marginLeft:3}}>
                              ({overlaydiff>0?"+":""}{(overlaydiff||0).toFixed(0)})
                            </span>
                          </div>
                        )}
                        <div style={{color:C.muted,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>balance</div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Drill-down panel */}
                {isDrilled && (
                  <div style={{marginLeft:54,marginBottom:8,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px"}}>
                    <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:10}}>
                      {ev.day===0?"Today's snapshot":"Cash flow breakdown"}
                    </div>
                    {/* Previous balance */}
                    {ev.day>0&&(()=>{
                      const prevEv = forecast[ev.day-1];
                      return prevEv ? (
                        <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}>
                          <span style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Opening balance</span>
                          <span style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>${(prevEv.balance||0).toFixed(0)}</span>
                        </div>
                      ) : null;
                    })()}
                    {/* Income */}
                    {ev.isPayday&&(
                      <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}22`}}>
                        <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:5}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:C.green,display:"inline-block"}}/>💰 Paycheck
                        </span>
                        <span style={{color:C.greenBright,fontWeight:700,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>+${(ev.income||0).toFixed(0)}</span>
                      </div>
                    )}
                    {/* Bills */}
                    {ev.bills.length>0&&ev.bills.map((b,bi)=>(
                      <div key={bi} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}22`}}>
                        <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:5}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:C.gold,display:"inline-block"}}/>📅 {b.name}
                        </span>
                        <span style={{color:C.gold,fontWeight:700,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>−${parseFloat(b.amount||0).toFixed(0)}</span>
                      </div>
                    ))}
                    {/* Daily spend estimate */}
                    {ev.day>0&&(
                      <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}22`}}>
                        <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:5}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:C.muted,display:"inline-block"}}/>🛒 Est. daily spend
                          <span style={{color:C.muted,fontSize:9}}>(30d avg)</span>
                        </span>
                        <span style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>−${(avgDaily).toFixed(0)}</span>
                      </div>
                    )}
                    {/* Divider + balance result */}
                    <div style={{borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:C.cream,fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                        {ev.day===0?"Current balance":"Projected balance (est.)"}
                      </span>
                      <div style={{textAlign:"right"}}>
                        <span style={{color:isLow?C.redBright:baseBalance<0?C.redBright:C.greenBright,fontWeight:900,fontSize:15,fontFamily:"'Playfair Display',serif"}}>
                          {baseBalance<0?"−":""}${Math.abs(baseBalance||0).toFixed(0)}
                        </span>
                        {isLow&&baseBalance>=0&&<div style={{color:C.goldBright,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>below safety floor</div>}
                        {baseBalance<0&&<div style={{color:C.redBright,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>overdrawn</div>}
                      </div>
                    </div>
                    {isLow&&(
                      <div style={{marginTop:8,background:baseBalance<0?C.red+"18":C.gold+"11",borderRadius:8,padding:"7px 10px",color:baseBalance<0?C.redBright:C.goldBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.5}}>
                        {baseBalance<0
                          ? "⚠ Projected overdraft — NSF fees $45–48 each. Transfer funds before this date."
                          : "⚠ Balance near safety floor — hold non-essential spending until after this date."}
                      </div>
                    )}
                  </div>
                )}
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
  const [expandedDay, setExpandedDay] = useState(null);
  // ── Delegate to ForecastEngine — no duplicate forecasting logic ──
  const { forecast } = ForecastEngine.generate(data, 30);
  const safeFloor = SafeSpendEngine.calculate(data).balance * 0.12;
  const { monthlyIncome } = FinancialCalcEngine.cashFlow(data);
  const avgDaily = FinancialCalcEngine.avgDailySpend(data);

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
            const isDrilled = expandedDay === ev.day;
            return (
              <div key={idx} style={{paddingBottom:4,position:"relative"}}>
                <div onClick={()=>setExpandedDay(isDrilled?null:ev.day)}
                  style={{display:"flex",gap:14,padding:"8px 6px",cursor:"pointer",borderRadius:12,background:isDrilled?"rgba(255,255,255,0.03)":"transparent",transition:"background .15s"}}>
                  <div style={{width:40,display:"flex",justifyContent:"center",flexShrink:0,paddingTop:2}}>
                    <div style={{width:14,height:14,borderRadius:"50%",background:dotColor,border:`3px solid ${C.bg}`,zIndex:1,boxShadow:ev.day===0||ev.isPayday?`0 0 10px ${dotColor}88`:"none",flexShrink:0}}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:ev.day===0?800:600,fontSize:13,color:ev.day===0?C.cream:C.mutedHi,marginBottom:2}}>
                          {label}<span style={{color:C.muted,fontSize:10,marginLeft:6}}>{isDrilled?"▲":"▼"}</span>
                        </div>
                        {ev.isPayday && ev.income>0 && <div style={{color:C.greenBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>{`+$${(ev.income||0).toFixed(0)} paycheck`}</div>}
                        {ev.bills.map((b,bi)=><div key={bi} style={{color:C.gold,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{b.name} −${parseFloat(b.amount||0).toFixed(0)}</div>)}
                        {isLow && !ev.isPayday && <div style={{color:C.redBright,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginTop:2}}>⚠ Low balance</div>}
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:13,color:balColor}}>{`$${(ev.balance||0).toFixed(0)}`}</div>
                        <div style={{color:C.muted,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>balance</div>
                      </div>
                    </div>
                  </div>
                </div>
                {isDrilled&&(
                  <div style={{marginLeft:54,marginBottom:6,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px"}}>
                    <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:10}}>Day breakdown</div>
                    {ev.isPayday&&(
                      <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                        <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>💰 Paycheck</span>
                        <span style={{color:C.greenBright,fontWeight:700,fontSize:12}}>+${(monthlyIncome||0).toFixed(0)}</span>
                      </div>
                    )}
                    {ev.bills.map((b,bi)=>(
                      <div key={bi} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                        <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>📅 {b.name}</span>
                        <span style={{color:C.gold,fontWeight:700,fontSize:12}}>−${parseFloat(b.amount||0).toFixed(0)}</span>
                      </div>
                    ))}
                    {ev.day>0&&(
                      <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                        <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>🛒 Est. daily spend</span>
                        <span style={{color:C.muted,fontSize:12}}>−${(avgDaily).toFixed(0)}</span>
                      </div>
                    )}
                    <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0 0"}}>
                      <span style={{color:C.cream,fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Projected balance</span>
                      <span style={{color:isLow?C.redBright:C.greenBright,fontWeight:800,fontSize:13,fontFamily:"'Playfair Display',serif"}}>${(ev.balance||0).toFixed(0)}</span>
                    </div>
                    {isLow&&<div style={{marginTop:8,background:C.red+"11",borderRadius:8,padding:"6px 10px",color:C.redBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>⚠ Balance drops below safety floor here</div>}
                  </div>
                )}
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

  const _toMoSim = (amt,freq) => { const a=parseFloat(amt||0); return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="annually"?a/12:a; };
  const bal = (data.accounts||[])
    .filter(a => ["checking","savings","depository"].includes((a.type||"").toLowerCase()))
    .reduce((s,a) => s + parseFloat(a.balance||0), 0) || DEMO.balance;
  const monthlyIncome = (data.incomes||[]).filter(i=>parseFloat(i.amount||0)>0)
    .reduce((s,i) => s + _toMoSim(i.amount,i.freq), 0) || DEMO.income;
  const { liabilities: totalDebt } = FinancialCalcEngine.netWorth(data);
  const bills = (data.bills||[]).reduce((s,b) => s + parseFloat(b.amount||0), 0);
  const {score} = calcHealthScore(data);

  const simulate = async (q) => {
    const qText = q || inputVal;
    if (!qText.trim()) return;
    setQuery(qText);
    setLoading(true);
    setResult(null);

    const prompt = `You are a financial simulator. The user wants to know the impact of: "${qText}".
Current financial data: Balance $${(bal||0).toFixed(0)}, Monthly income ~$${(monthlyIncome||0).toFixed(0)}, Total debt $${totalDebt.toFixed(0)}, Monthly bills $${bills.toFixed(0)}, Financial Health Score ${score}/100.
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:999,display:"flex",alignItems:window.innerWidth>900?"center":"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
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
  const t = txns || [];
  const neg = t.filter(x => x.amount > 0);  // expenses are positive in Plaid
  const total = neg.reduce((s,x) => s + Math.abs(x.amount), 0) || 1;

  // Real Plaid/Flourish category names
  const FOOD_CATS  = ["Coffee & Dining","Groceries","Food & Drink","Food","Coffee","Dining"];
  const SHOP_CATS  = ["Shopping","Clothing","Online Shopping"];
  const SUB_CATS   = ["Subscriptions","Streaming"];
  const ENT_CATS   = ["Entertainment","Recreation","Hobbies","Sports"];
  const TRANS_CATS = ["Transport","Gas","Parking","Auto"];

  const food  = neg.filter(x=>FOOD_CATS.includes(x.cat)).reduce((s,x)=>s+Math.abs(x.amount),0);
  const shop  = neg.filter(x=>SHOP_CATS.includes(x.cat)).reduce((s,x)=>s+Math.abs(x.amount),0);
  const subs  = neg.filter(x=>SUB_CATS.includes(x.cat)).reduce((s,x)=>s+Math.abs(x.amount),0);
  const ent   = neg.filter(x=>ENT_CATS.includes(x.cat)).reduce((s,x)=>s+Math.abs(x.amount),0);
  const trans = neg.filter(x=>TRANS_CATS.includes(x.cat)).reduce((s,x)=>s+Math.abs(x.amount),0);

  // Builder score earned through REAL financial behaviour — not just income count
  const ret = data.profile?.retirement || {};
  const isCA = (data.profile?.country||"CA")==="CA";
  const hasRetirementSavings = parseFloat(ret[isCA?"rrspBalance":"401kBalance"]||0)>0 || parseFloat(ret[isCA?"rrspMonthly":"401kMonthly"]||0)>0;
  const hasGoals = (data.goals||[]).length > 0;
  const accts = data.accounts||[];
  const isOverdraft = accts.some(a=>a.type!=="credit"&&parseFloat(a.balance||0)<0);
  const hasSavings = accts.some(a=>a.type==="savings"&&parseFloat(a.balance||0)>500);
  const multiIncome = (data.incomes||[]).filter(i=>parseFloat(i.amount||0)>0).length > 1;
  const builderScore = (hasRetirementSavings?0.3:0)+(hasGoals?0.15:0)+(hasSavings?0.15:0)+(multiIncome&&!isOverdraft?0.1:0)-(isOverdraft?0.4:0);

  const scores = {
    convenience: food/total,
    lifestyle:   (shop+ent)/total,
    digital:     subs/total,
    mobile:      trans/total,
    builder:     Math.max(0, builderScore),
  };
  const top = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];


const personas = {
  convenience: {
    name:"The Convenience Spender", emoji:"🛍️", color:C.orange,
    traits:["High food & delivery spend","Values time over money","Subscription-heavy"],
    insight:"Replacing 3 food deliveries/week with home cooking saves ~$180/mo.",
    shareText:"I'm a Convenience Spender 🛍️ on @flourishmoney"
  },
  lifestyle: {
    name:"The Experience Collector", emoji:"✈️", color:C.purple,
    traits:["Prioritizes experiences","Shopping for quality","Social spending peaks"],
    insight:"You spend richly on life. Automating $200/mo to savings before spending keeps goals on track.",
    shareText:"I'm an Experience Collector ✈️ on @flourishmoney"
  },
  digital: {
    name:"The Digital Native", emoji:"💻", color:C.teal,
    traits:["Heavy subscription stack","Tech-first spending","Optimizes with apps"],
    insight:"Audit your subscriptions — cancelling unused ones often frees $50-100/mo instantly.",
    shareText:"I'm a Digital Native 💻 on @flourishmoney"
  },
  mobile: {
    name:"The Commuter", emoji:"🚗", color:C.gold,
    traits:["High transport spend","Life on the go","Gas & parking costs add up"],
    insight:"Transport is your biggest variable cost. Carpooling or transit 2x/week can save $150+/mo.",
    shareText:"I'm a Commuter 🚗 on @flourishmoney"
  },
  builder: {
    name:"The Wealth Builder", emoji:"🏗️", color:C.green,
    traits:["Saving for retirement","Goal-oriented mindset","Building long-term wealth"],
    insight:"You're building real wealth. Make sure your RRSP/TFSA are maximized each year.",
    shareText:"I'm a Wealth Builder 🏗️ on @flourishmoney"
  }
};
return {...personas[top], scores, topKey:top};
}

function MoneyPersonality({data}) {
const [revealed, setRevealed] = useState(false);
const txns = data.transactions || [];
const hasEnoughData = txns.filter(x=>x.amount>0).length >= 5;
const p = calcPersonality(txns, data);
const bars = [
  {label:"Convenience", pct:Math.round(p.scores.convenience*100), color:C.orange},
  {label:"Lifestyle",   pct:Math.round(p.scores.lifestyle*100),   color:C.purple},
  {label:"Digital",     pct:Math.round(p.scores.digital*100),     color:C.teal},
  {label:"Commuter",    pct:Math.round(p.scores.mobile*100),      color:C.gold},
  {label:"Builder",     pct:Math.round(p.scores.builder*100),     color:C.green},
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

  {!hasEnoughData ? (
    <div style={{textAlign:"center",padding:"24px 16px"}}>
      <div style={{fontSize:36,marginBottom:10}}>🔍</div>
      <div style={{color:C.cream,fontWeight:700,fontSize:13,marginBottom:8}}>Not enough data yet</div>
      <div style={{color:C.muted,fontSize:12,lineHeight:1.7}}>Connect your bank and use the app for a few days — your money personality is calculated from your real spending patterns.</div>
    </div>
  ) : !revealed ? (
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
  const toMonthlyAmt = (amt, freq) => { const a=parseFloat(amt||0); return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="annually"?a/12:a; };

  // Use REAL data from Retirement tab only — never invent savings rates
  const ret = data.profile?.retirement || {};
  const isCA = (data.profile?.country||"CA")==="CA";

  // Current balances from retirement tab
  const rrspBal   = parseFloat(ret[isCA?"rrspBalance":"401kBalance"]||0);
  const tfsaBal   = parseFloat(ret[isCA?"tfsaBalance":"iraBalance"]||0);
  const invBal    = (data.accounts||[]).filter(a=>a.type==="investment").reduce((s,a)=>s+parseFloat(a.balance||0),0);
  const startingBal = rrspBal + tfsaBal + invBal;

  // Monthly contributions using frequency
  const rrspMo    = toMonthlyAmt(ret[isCA?"rrspMonthly":"401kMonthly"]||0, ret[isCA?"rrspFreq":"401kFreq"]||"monthly");
  const tfsaMo    = toMonthlyAmt(ret[isCA?"tfsaMonthly":"iraMonthly"]||0, ret[isCA?"tfsaFreq":"iraFreq"]||"monthly");
  const pensionMo = toMonthlyAmt(ret[isCA?"pensionMonthly":"otherRetire"]||0, ret[isCA?"pensionFreq":"otherRetireFreq"]||"monthly");
  const monthlyContrib = rrspMo + tfsaMo + pensionMo;
  const monthlyInvest = monthlyContrib + extra;

  const totalDebt = (data.debts||[]).reduce((s,d)=>s+parseFloat(d.balance||0),0);
  const annualReturn = 0.07;
  const hasData = startingBal > 0 || monthlyContrib > 0;

  const project = (monthly, years) => {
    let val = startingBal;
    for (let y = 0; y < years; y++) {
      val = val * (1 + annualReturn) + monthly * 12;
    }
    return Math.max(0, Math.round(val));
  };

  const scenarios = [
    {label:"Current Path",        monthly:monthlyInvest,           color:C.teal,    icon:"📍"},
    {label:"+$200/mo saved",       monthly:monthlyInvest+200,       color:C.green,   icon:"📈"},
    {label:"+$500/mo invested",    monthly:monthlyInvest+500,       color:C.purple,  icon:"🚀"},
  ];

  const vals = scenarios.map(s => project(s.monthly, horizon));
  const maxVal = Math.max(...vals, 1);

  const fmt = n => { const v=n||0; return v >= 1000000 ? `$${(v/1000000).toFixed(2)}M` : `$${(v/1000).toFixed(0)}k`; };

  return (
    <div style={{background:C.card,borderRadius:20,padding:"20px",border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{color:C.cream,fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:16}}>🔭</span> Future Wealth Forecast
        </div>
        <div style={{display:"flex",gap:4}}>
          {[10,20,30].map(y=>(
            <button key={y} onClick={()=>setHorizon(y)} style={{background:horizon===y?C.purple+"33":C.cardAlt,border:`1px solid ${horizon===y?C.purple:C.border}`,color:horizon===y?C.purpleBright:C.muted,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{y}y</button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div style={{textAlign:"center",padding:"28px 20px"}}>
          <div style={{fontSize:36,marginBottom:12}}>📊</div>
          <div style={{color:C.cream,fontWeight:700,fontSize:14,marginBottom:8}}>No investment data yet</div>
          <div style={{color:C.muted,fontSize:12,lineHeight:1.7,marginBottom:16}}>
            Add your {isCA?"RRSP, TFSA":"401(k), IRA"} balances and monthly contributions in the <strong style={{color:C.tealBright}}>Retirement</strong> tab to see your wealth forecast.
          </div>
          <div style={{background:C.tealDim,border:`1px solid ${C.teal}33`,borderRadius:12,padding:"10px 14px",color:C.tealBright,fontSize:11,fontWeight:600}}>
            Tip: Even entering $50/month shows the power of compound growth over time.
          </div>
        </div>
      ) : (
        <>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{background:C.purple+"22",border:`1px solid ${C.purple}44`,borderRadius:99,padding:"2px 8px",color:C.purpleBright,fontSize:9,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:0.5}}>PROJECTED</span>
            <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              ${startingBal.toLocaleString()} balance · ${Math.round(monthlyContrib).toLocaleString()}/mo · 7% avg return
            </span>
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
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{background:C.purple+"18",border:`1px solid ${C.purple}33`,borderRadius:99,padding:"1px 6px",color:C.purpleBright,fontSize:8,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>PROJ.</span>
                      <span style={{color:s.color,fontWeight:900,fontFamily:"'Playfair Display',serif",fontSize:18}}>{fmt(vals[i])}</span>
                    </div>
                  </div>
                  <div style={{height:8,borderRadius:99,background:C.border,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(to right,${s.color}88,${s.color})`,borderRadius:99,transition:"width .5s ease"}}/>
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
        </>
      )}
    </div>
  );
}

// ── OPPORTUNITY DETECTION ──────────────────────────────────────────────────────
function OpportunityDetector({data, setScreen, setGoalsTab}) {
  const txns = data.transactions || [];
  const debts = data.debts || [];
  const cc = CC[data.profile?.country || "CA"];
  const opportunities = [];

  // Subscription audit
  const subTxns = txns.filter(t => t.cat === "Subscriptions" && t.amount > 0);  // expenses are positive
  const subTotal = subTxns.reduce((s,t) => s + Math.abs(t.amount), 0);
  if (subTotal > 40) {
    const dupes = subTxns.length > 3 ? subTxns.slice(-2).map(t=>t.merchant||t.name).join(", ") : subTxns.map(t=>t.merchant||t.name).join(", ");
    opportunities.push({
      id:"subs", icon:"📱", color:C.teal,
      title:`$${(subTotal||0).toFixed(0)}/mo in subscriptions`,
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
      action:"Debt Plan", screen:"goals", tab:"sim", badge:"Save $"+saving+"/yr"
    });
  }

  // Tax benefits (country-specific)
  if (cc.currency === "CAD") {
    opportunities.push({
      id:"tax", icon:"🍁", color:C.red,
      title:"Tax benefits you may qualify for",
      detail:`Based on your profile you may be eligible for the Canada Workers Benefit, GST/HST credit, or Ontario Trillium Benefit.`,
      action:"Tax Tips", screen:"goals", tab:"tax", badge:"Claim now"
    });
  } else {
    opportunities.push({
      id:"tax", icon:"🦅", color:C.blue,
      title:"US tax credits available",
      detail:`You may qualify for the Earned Income Tax Credit or Saver's Credit — worth up to $2,000/yr.`,
      action:"Tax Tips", screen:"goals", tab:"tax", badge:"Claim now"
    });
  }

  // Low-yield savings
  const savingsAcct = (data.accounts||[]).find(a => a.type==="savings");
  if (savingsAcct) {
    const bal = parseFloat(savingsAcct.balance||0);
    if (bal > 500) opportunities.push({
      id:"hisa", icon:"🏦", color:C.gold,
      title:`Earn more on your savings`,
      detail:`$${(bal||0).toFixed(0)} in savings at typical 0.3% earns $${(bal*0.003).toFixed(0)}/yr. A HISA at 4%+ earns $${(bal*0.04).toFixed(0)}/yr.`,
      action:"Learn More", screen:"goals", tab:"learn", badge:"+$"+(Math.round((bal*0.04)-(bal*0.003)))+"/yr"
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
          <button key={o.id} onClick={()=>{if(o.tab&&setGoalsTab)setGoalsTab(o.tab);setScreen(o.screen);}} style={{background:C.card,border:`1.5px solid ${o.color}28`,borderRadius:18,padding:"14px 16px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",gap:12,alignItems:"flex-start",transition:"all .18s",width:"100%"}}
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
  const txns = (data.transactions || []).filter(t => t.amount > 0);  // expenses are positive
  const _toMoW = (amt,freq) => { const a=parseFloat(amt||0); return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="annually"?a/12:freq==="monthly"?a:a*2.167; };
  const income = ((data.incomes||[]).reduce((s,i)=>s+_toMoW(i.amount,i.freq),0) || 4200) * 12;
  const totalSpent = txns.reduce((s,t)=>s+Math.abs(t.amount||0),0) || 0;
  const { netWorth: _wrappedNW } = FinancialCalcEngine.netWorth(data);
  const invBal = (data.accounts||[]).filter(a=>a.type==="investment").reduce((s,a)=>s+parseFloat(a.balance||0),0);
  const bal = (data.accounts||[]).filter(a=>["checking","savings","depository"].includes((a.type||"").toLowerCase())).reduce((s,a)=>s+parseFloat(a.balance||0),0);

  // Category analysis
  const cats = {};
  txns.forEach(t => { cats[t.cat||"Other"] = (cats[t.cat||"Other"]||0) + Math.abs(t.amount); });
  const topCat = Object.entries(cats).sort((a,b)=>b[1]-a[1])[0] || ["Food","340"];
  const lowestCat = Object.entries(cats).sort((a,b)=>a[1]-b[1])[0] || ["Transport","45"];
  const biggestTxn = txns.sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount))[0];
  const netWorthChange = Math.round(_wrappedNW);
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
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:64,fontWeight:900,color:netWorthChange>=0?"#6EF0A0":"#FF7070",letterSpacing:-2,lineHeight:1,marginBottom:8}}>{netWorthChange>=0?"+":""}{netWorthChange>=0?`$${((netWorthChange||0)/1000).toFixed(1)}k`:`-$${(Math.abs(netWorthChange||0)/1000).toFixed(1)}k`}</div>
          <div style={{color:"#ffffff88",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:24}}>{netWorthChange>=0?"You grew richer this year 🚀":"You're building the foundation 🏗️"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[
              {label:"Invested",   val:`$${((invBal||0)/1000).toFixed(1)}k`, icon:"📈"},
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
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:48,fontWeight:900,color:"#fff",letterSpacing:-1,marginBottom:6}}>{`$${((totalSpent||0)/1000).toFixed(1)}k`}</div>
          <div style={{color:"#ffffff88",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:20}}>spent across {txns.length} transactions</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[
              {label:"Biggest splurge", val:biggestTxn?`$${Math.abs(biggestTxn.amount||0).toFixed(0)} — ${biggestTxn.merchant||biggestTxn.name}`:"None", icon:"💸", color:"#FF9EBC"},
              {label:"Top category",    val:`${topCat[0]} ($${Number(topCat[1]||0).toFixed(0)})`, icon:"🏆", color:"#FFD166"},
              {label:"Lowest spend",    val:`${lowestCat[0]} ($${Number(lowestCat[1]||0).toFixed(0)})`, icon:"✨", color:"#6EF0A0"},
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
      src="/flourish-adult-app-icon-180"
      width={size}
      height={size}
      alt="Flourish"
      style={{ flexShrink: 0, display: "block", borderRadius: size > 30 ? Math.round(size * 0.28) : Math.round(size * 0.22), objectFit: "cover", ...style }}
    />
  );
}
function FlourishMarkKids({ size = 24, style = {} }) {
  return (
    <img
      src="/flourish-kids-app-icon-180"
      width={size}
      height={size}
      alt="Flourish Kids"
      style={{ flexShrink: 0, display: "block", borderRadius: size > 30 ? Math.round(size * 0.28) : Math.round(size * 0.22), objectFit: "cover", ...style }}
    />
  );
}
function FlourishGlyph({ size = 24, style = {} }) {
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
// ─── DIAMOND ONLY (no wordmark) — use at small sizes / next to text ──────────
function FlourishDiamond({ size = 24, style = {} }) {
  // Two rotated ellipses forming the Flourish diamond mark (no text)
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      style={{ flexShrink:0, display:"block", ...style }}>
      <ellipse cx="50" cy="50" rx="21" ry="45" transform="rotate(45 50 50)"  fill="#3CB87A"/>
      <ellipse cx="50" cy="50" rx="21" ry="45" transform="rotate(-45 50 50)" fill="#1A6B40" opacity="0.85"/>
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

function computeStats(txns, catOverrides={}) {
  // Skip non-expense categories AND bill categories (bills are tracked separately)
  const SKIP = new Set([...NON_SPEND_CATS, ...BILL_CATS]);
  // Use catOverrides so user-reassigned categories appear in breakdown
  const getC = (t) => catOverrides[t.id] || t.cat;
  const sp = txns.filter(t=>t.amount>0 && !SKIP.has(getC(t)));
  const byCat={}, byDow={0:0,1:0,2:0,3:0,4:0,5:0,6:0};
  let coffee=0,coffeeCount=0,delivery=0,subs=0;
  sp.forEach(t=>{
    const cat = getC(t);
    byCat[cat]=(byCat[cat]||0)+t.amount;
    byDow[t.dow]=(byDow[t.dow]||0)+t.amount;
    if(t.icon==="☕"){coffee+=t.amount;coffeeCount++;}
    if(t.name.toLowerCase().includes("uber eats")||t.name.toLowerCase().includes("doordash"))delivery+=t.amount;
    if(cat==="Subscriptions")subs+=t.amount;
  });
  const totalSpent=sp.reduce((a,t)=>a+t.amount,0); // excludes non-spend + bill categories
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
  return <span>{prefix}{(v||0).toFixed(decimals)}</span>;
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
    // Assets: only positive-balance accounts (checking, savings, investment)
    // Credit accounts have negative balances and are already captured in liabilities
    const ASSET_TYPES = new Set(["checking","savings","depository","investment","brokerage"]);
    const assets = accounts
      .filter(a => ASSET_TYPES.has(a.type))
      .reduce((s,a) => s + Math.max(0, parseFloat(a.balance||0)), 0);
    // Liabilities: bank credit accounts + manual debts not duplicated in bank
    const bankCreditAccounts = accounts.filter(a => {
      const t = (a.type||"").toLowerCase(), s = (a.subtype||"").toLowerCase();
      return t==="credit" || t==="credit card" || s==="credit card" || t==="line of credit";
    });
    const bankCreditLiabilities = bankCreditAccounts
      .reduce((s,a) => s + Math.abs(parseFloat(a.balance||0)), 0);
    // Deduplicate: exclude manual debts that are flagged fromBank or match a bank account name
    const bankCreditNames = new Set(bankCreditAccounts.map(a => (a.name||"").trim().toLowerCase()));
    const manualNonBankDebts = debts
      .filter(d => !d.fromBank && !bankCreditNames.has((d.name||"").trim().toLowerCase()))
      .reduce((s,d) => s + Math.max(0, parseFloat(d.balance||0)), 0);
    const liabilities = bankCreditLiabilities + manualNonBankDebts;
    return { assets, liabilities, netWorth: assets - liabilities, bankCreditLiabilities, manualNonBankDebts };
  },

  /** Monthly cash flow = income − bills − discretionary spend (no double-counting) */
  cashFlow(data) {
    const incomes = (data.incomes || []).filter(i => parseFloat(i.amount) > 0);
    const bills   = data.bills || [];
    // catOverrides: ensures user-recategorized transactions affect cash flow correctly
    const catOv = (()=>{ try{return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}")}catch{return{}} })();
    const getEffCat = (t) => catOv[t.id] || t.cat;
    // Filter to current month only
    const now = new Date();
    const txns = (data.transactions || []).filter(t => {
      if(t.amount <= 0) return false;
      if(!t.date) return false;
      if(t.pending) return false; // pending txns not yet settled — exclude from spending
      const d = new Date(t.date + "T12:00:00");
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const toMonthly = (amt, freq) => {
      const a = parseFloat(amt||0);
      switch(freq) {
        case "weekly":      return a * 4.333;
        case "biweekly":    return a * 2.167;
        case "semimonthly": return a * 2;
        case "monthly":     return a;
        default:            return a * 2.167;
      }
    };
    const monthlyIncome = incomes.reduce((s,i) => s + toMonthly(i.amount, i.freq), 0) || 4200;
    // Bills: committed expenses from bills array — source of truth
    const monthlyBills  = bills.reduce((s,b) => s + parseFloat(b.amount||0), 0);
    // Discretionary: excludes non-spend flows, bill categories (already in monthlyBills), CC payments
    const monthlySpend  = txns.filter(t => {
      const cat = getEffCat(t);
      return !NON_SPEND_CATS.has(cat) &&
             !BILL_CATS.has(cat) &&
             !isInternalTransfer(t) &&
             !CC_PAYMENT_KEYWORDS.some(kw => (t.name||"").toLowerCase().includes(kw));
    }).reduce((s,t) => s + t.amount, 0);
    // No fallback — zero spend is valid; fabricating spend for bank-connected users breaks cashFlow
    const totalExpenses = monthlyBills + monthlySpend;
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
      .filter(a => ["savings","checking","depository"].includes(a.type))
      .reduce((s,a) => s + parseFloat(a.balance||0), 0) || 0;
    return totalExpenses > 0 ? liquidSavings / totalExpenses : 0;
  },

  /** Average daily spend from transaction history */
  avgDailySpend(data) {
    const txns = (data.transactions || []).filter(t =>
      t.amount > 0 &&
      !t.pending &&
      !isInternalTransfer(t) &&
      t.cat !== "Income" &&
      t.cat !== "Fees" &&
      !BILL_CATS.has(t.cat) && // exclude recurring bills already in upcomingBills
      !CC_PAYMENT_KEYWORDS.some(kw => (t.name||"").toLowerCase().includes(kw))
    );
    if(txns.length === 0) return 0;
    const total = txns.reduce((s,t) => s + Math.abs(t.amount), 0);
    // Calculate actual date span from transaction history (max 90 days)
    const dates = txns.map(t => new Date(t.date)).filter(d => !isNaN(d));
    const daySpan = dates.length > 1
      ? Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / (1000*60*60*24)))
      : 30;
    const normalisedDays = Math.min(90, Math.max(14, daySpan));
    return total / normalisedDays;
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

    const balance  = accounts
      .filter(a => ["checking","savings","depository"].includes(a.type))
      .reduce((s,a) => s + parseFloat(a.balance||0), 0) ||
      0;

    // Bills due in the next 10 days — use real date arithmetic to handle month boundaries
    const todayDate = new Date();
    const in10Days  = new Date(todayDate); in10Days.setDate(todayDate.getDate() + 10);
    // Detect bills already paid this month by matching transactions
    const txnNames = (data.transactions||[])
      .filter(t => { try { const d=new Date(t.date+"T12:00:00"); return d.getMonth()===todayDate.getMonth()&&d.getFullYear()===todayDate.getFullYear(); } catch{return false;} })
      .map(t => (t.name||"").toLowerCase());
    const isBillPaid = (bill) => {
      const billName = (bill.vendorPattern||bill.name||"").toLowerCase().trim();
      if(billName.length < 3) return false;
      return txnNames.some(n => n.includes(billName.substring(0,Math.min(6,billName.length))) || billName.includes(n.substring(0,Math.min(6,n.length))));
    };
    const upcomingBills = bills
      .filter(b => {
        const dueDay = parseInt(b.date);
        if(!dueDay) return false;
        if(isBillPaid(b)) return false; // already paid this month — don't double-subtract
        // Build this month's due date
        const thisMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), dueDay);
        // Build next month's due date
        const nextMonth = new Date(todayDate.getFullYear(), todayDate.getMonth()+1, dueDay);
        return (thisMonth >= todayDate && thisMonth <= in10Days) ||
               (nextMonth >= todayDate && nextMonth <= in10Days);
      })
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
      soonBills: bills.filter(b => {
        const dueDay = parseInt(b.date);
        if(!dueDay) return false;
        if(isBillPaid(b)) return false;
        const thisMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), dueDay);
        const nextMonth = new Date(todayDate.getFullYear(), todayDate.getMonth()+1, dueDay);
        return (thisMonth >= todayDate && thisMonth <= in10Days) ||
               (nextMonth >= todayDate && nextMonth <= in10Days);
      }),
    };
  }
};

// ── ENGINE 3: 90-DAY CASH FLOW FORECAST ENGINE ────────────────────────────────
// Projects daily balance for 90 days with overdraft risk detection.

const ForecastEngine = {
generate(data, days = 90) {
  const { balance }  = SafeSpendEngine.calculate(data);
  const avgDaily     = FinancialCalcEngine.avgDailySpend(data);
  const bills        = data.bills || [];
  const today        = new Date();

  let running = balance;
  const forecast          = [];
  const overdraftRisk     = [];
  const lowBalanceWarnings = [];

  const incomes       = (data.incomes||[]).filter(i=>parseFloat(i.amount)>0);
  const primaryIncome = incomes[0];
  const primaryFreq   = primaryIncome?.freq || "biweekly";
  // income.amount is the per-deposit amount for all freq types
  const perDeposit    = (inc) => parseFloat(inc.amount||0);
  const paycheque     = primaryIncome ? perDeposit(primaryIncome) : 0;
  const hasIncome     = incomes.length > 0;
  const secondaryMo   = incomes.slice(1).filter(i=>i.freq==="monthly"||i.freq==="semimonthly");

  // ── Anchor-based payday projection ─────────────────────────────────────────
  // Problem with old code: i%14===0 puts the first payday 14 days from today,
  // completely ignoring that the next deposit might be 3 days away.
  // Fix: find the last real deposit from transactions, project forward from that date.
  const paydayDates = new Set(); // Set of "YYYY-MM-DD" strings that are paydays
  if(hasIncome && primaryIncome) {
    const txns      = data.transactions || [];
    const incAmt    = parseFloat(primaryIncome.amount||0);
    const incLabel  = (primaryIncome.label||"").toLowerCase();
    const freqDays  = primaryFreq==="weekly" ? 7 : primaryFreq==="biweekly" ? 14 : null;

    // Find last deposit matching this income source (within 8% amount tolerance OR name match)
    let anchor = null;
    if(freqDays) {
      const deposits = txns
        .filter(t => {
          if(t.amount >= 0) return false; // income is negative (money in)
          const name = (t.name||"").toLowerCase();
          const amtOk  = incAmt > 0 && Math.abs(Math.abs(t.amount)-incAmt)/incAmt < 0.08;
          const nameOk = incLabel.length > 3 && name.includes(incLabel.substring(0,6));
          const isInc  = t.cat==="Income" || name.includes("payroll") ||
                         name.includes("direct deposit") || name.includes("deposit");
          return (amtOk||nameOk) && isInc;
        })
        .map(t => new Date(t.date+"T12:00:00"))
        .filter(d => !isNaN(d.getTime()))
        .sort((a,b) => b-a);
      anchor = deposits[0] || null;
    }

    if(freqDays && anchor) {
      // Advance from last deposit until we pass today, then keep projecting forward
      let next = new Date(anchor);
      next.setDate(next.getDate() + freqDays);
      const horizon = new Date(today.getTime() + days*86400000);
      while(next <= horizon) {
        paydayDates.add(next.toISOString().substring(0,10));
        next = new Date(next); next.setDate(next.getDate() + freqDays);
      }
    } else if(freqDays) {
      // No anchor found — fallback: count forward from today at frequency
      for(let k = freqDays; k <= days; k += freqDays) {
        const d2 = new Date(today); d2.setDate(today.getDate()+k);
        paydayDates.add(d2.toISOString().substring(0,10));
      }
    } else if(primaryFreq==="monthly") {
      const payDay = primaryIncome.anchorDay || 1;
      for(let k = 1; k <= days; k++) {
        const d2 = new Date(today); d2.setDate(today.getDate()+k);
        if(d2.getDate()===payDay) paydayDates.add(d2.toISOString().substring(0,10));
      }
    } else if(primaryFreq==="semimonthly") {
      for(let k = 1; k <= days; k++) {
        const d2 = new Date(today); d2.setDate(today.getDate()+k);
        if(d2.getDate()===1||d2.getDate()===15) paydayDates.add(d2.toISOString().substring(0,10));
      }
    }
  }

  const getSecondary = (dayNum) =>
    secondaryMo.filter(i=>(i.freq==="monthly"?dayNum===1:(dayNum===1||dayNum===15)))
               .reduce((s,i)=>s+perDeposit(i),0);

  for(let i = 0; i <= days; i++) {
    const d       = new Date(today); d.setDate(today.getDate()+i);
    const dayNum  = d.getDate();
    const dateKey = d.toISOString().substring(0,10);
    const isPayday = i > 0 && paydayDates.has(dateKey);
    const dayBills = bills.filter(b=>parseInt(b.date)===dayNum&&parseInt(b.date)>0);
    const inc      = (isPayday ? paycheque : 0) + getSecondary(dayNum);
    const out      = dayBills.reduce((s,b)=>s+parseFloat(b.amount||0),0) + (i===0?0:avgDaily);
    running = running + inc - out;

    const entry = { day:i, date:d, balance:running, income:inc, expenses:out,
                    isPayday, bills:dayBills };
    forecast.push(entry);

    if(running < 0) overdraftRisk.push({ day:i, date:d, balance:running });
    if(running < balance*0.12 && running >= 0 && !isPayday)
      lowBalanceWarnings.push({ day:i, date:d, balance:running });
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
    const txns   = (data.transactions || []).filter(t => t.amount > 0);  // expenses are positive
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
        body:`${subTxns.length} recurring subscriptions totalling $${(subTotal||0).toFixed(0)}/mo. That's ${Math.round(subTotal/income*100)}% of your income.`,
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

    // ── ADAPTIVE: Derive payday from ForecastEngine (anchor-based, not modulo) ─
    const nextPayday = forecast.find(f => f.day > 0 && f.isPayday);
    const daysLeft   = Math.max(1, nextPayday ? nextPayday.day : 14);

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
    {label:"Emergency Fund",  pts:efScore, max:20, detail:`${(efMonths||0).toFixed(1)} months covered`},
    {label:"Stability",       pts:ssScore, max:15, detail:`Spending consistency`},
    {label:"Investments",     pts:ivScore, max:10, detail:hasInv?`$${(invBal||0).toFixed(0)} invested`:`Not started`},
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
    const txns = (data.transactions || []).slice(0, 15).map(t=>`${t.name||t.merchant||"Purchase"} $${Math.abs(t.amount)}`).join(", ");
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:999,display:"flex",alignItems:window.innerWidth>900?"center":"flex-end",justifyContent:"center",padding:"0 0 0 0"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
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




// ─── DASHBOARD TILE REGISTRY ──────────────────────────────────────────────────
const DASH_TILES = [
  // Core sections — always on dashboard, user can hide or reorder
  { id: 'hero',        label: 'Safe-to-Spend',       lucide:'dollar-sign',  alwaysVisible: true },
  { id: 'bento',       label: 'Stats Row',            lucide:'bar-chart-2'  },
  { id: 'healthrow',   label: 'Health & Streak',      lucide:'heart'        },
  { id: 'action',      label: 'Action Alert',         lucide:'zap'          },
  // Extended tiles
  { id: 'networth',    label: 'Net Worth Trend',      lucide:'trending-up'  },
  { id: 'forecast',    label: 'Cash Flow Forecast',   lucide:'calendar'     },
  { id: 'decision',    label: 'Decision Engine',      lucide:'cpu'          },
  { id: 'autopilot',   label: 'Autopilot',            lucide:'navigation'   },
  { id: 'opportunity', label: 'Opportunities',        lucide:'star'         },
  { id: 'health',      label: 'Health Score',         lucide:'shield'       },
  { id: 'credit',      label: 'Credit Score',         lucide:'credit-card'  },
  { id: 'quicknav',    label: 'Quick Navigation',     lucide:'grid'         },
];

// ─── STATEMENT PARSING HELPERS ────────────────────────────────────────────────
function parseCSVStatement(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const clean = s => s.trim().replace(/^["']|["']$/g,'');
  const headers = lines[0].split(sep).map(h => clean(h).toLowerCase());
  const dateIdx = headers.findIndex(h => /date|posted|trans/.test(h));
  const descIdx = headers.findIndex(h => /desc|merchant|narr|name|payee|detail|memo/.test(h));
  const amtIdx  = headers.findIndex(h => /^amount$|^amt$/.test(h));
  const debitIdx= headers.findIndex(h => /debit|withdrawal|out/.test(h));
  const creditIdx=headers.findIndex(h => /credit|deposit|^in$/.test(h));
  if (dateIdx < 0 || descIdx < 0) return null;
  return lines.slice(1).map((line, i) => {
    const cols = line.split(sep).map(clean);
    let amount = 0;
    if (amtIdx >= 0) {
      amount = parseFloat(cols[amtIdx]?.replace(/[$, ]/g,'') || 0);
    } else if (debitIdx >= 0 || creditIdx >= 0) {
      const d = parseFloat(cols[debitIdx]?.replace(/[$, ]/g,'') || 0);
      const c = parseFloat(cols[creditIdx]?.replace(/[$, ]/g,'') || 0);
      amount = d > 0 ? d : -c;
    }
    return { id:`csv_${i}`, date: cols[dateIdx]||'', name: cols[descIdx]||'Transaction', amount: isNaN(amount)?0:amount, category:'OTHER', pending:false };
  }).filter(t => t.date && t.name);
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function extractPdfText(file) {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 12); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

async function parseStatementWithAI(rawText) {
  const prompt = `You are a bank statement parser. Extract every transaction from the text below.
Return ONLY a valid JSON array — no markdown, no explanation — with this shape:
[{"date":"YYYY-MM-DD","name":"Merchant or description","amount":12.34}]
Rules: amount is positive for money spent/debited, negative for deposits/credits.
Skip header rows, balance summaries, and non-transaction lines.

STATEMENT TEXT:
${rawText.slice(0, 7000)}`;
  const r = await fetch('/api/coach', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ type:'simulator', payload:{ prompt } })
  });
  const d = await r.json();
  const raw = d.content?.[0]?.text || '[]';
  const clean = raw.replace(/```json|```/g,'').trim();
  const txns = JSON.parse(clean);
  return txns.map((t,i) => ({ id:`stmt_${i}`, date: t.date||'', name: t.name||'Transaction', amount: Number(t.amount)||0, category:'OTHER', pending:false })).filter(t=>t.date);
}

// ─── TILE ICON HELPER ────────────────────────────────────────────────────────
function TileIcon({id, size=18, color}){
  const props={size,color,strokeWidth:1.8};
  switch(id){
    case 'hero':        return <DollarSign {...props}/>;
    case 'bento':       return <BarChart2 {...props}/>;
    case 'healthrow':   return <Heart {...props}/>;
    case 'action':      return <Zap {...props}/>;
    case 'networth':    return <TrendingUp {...props}/>;
    case 'forecast':    return <Calendar {...props}/>;
    case 'decision':    return <Cpu {...props}/>;
    case 'autopilot':   return <Navigation {...props}/>;
    case 'opportunity': return <Star {...props}/>;
    case 'health':      return <Shield {...props}/>;
    case 'credit':      return <CreditCard {...props}/>;
    case 'quicknav':    return <LayoutGrid {...props}/>;
    default:            return <LayoutGrid {...props}/>;
  }
}
// ─── DASH CUSTOMIZE SHEET ─────────────────────────────────────────────────────
function DashCustomize({ layout, onChange, onClose }) {
  const isDesktop = window.innerWidth >= 960;
  const [items, setItems] = useState(layout);

  const save = () => { onChange(items); onClose(); };

  const toggle = (id) => {
    const tile = DASH_TILES.find(t=>t.id===id);
    if(tile?.alwaysVisible) return;
    setItems(prev => prev.map(t => t.id===id ? {...t, visible:!t.visible} : t));
  };

  const moveUp = (id) => {
    setItems(prev => {
      const idx = prev.findIndex(t=>t.id===id);
      if(idx <= 0) return prev;
      let target = idx - 1;
      while(target >= 0 && prev[target].locked) target--;
      if(target < 0) return prev;
      const next = [...prev];
      [next[target], next[idx]] = [next[idx], next[target]];
      return next;
    });
  };

  const moveDown = (id) => {
    setItems(prev => {
      const idx = prev.findIndex(t=>t.id===id);
      if(idx >= prev.length - 1) return prev;
      let target = idx + 1;
      while(target < prev.length && prev[target].locked) target++;
      if(target >= prev.length) return prev;
      const next = [...prev];
      [next[target], next[idx]] = [next[idx], next[target]];
      return next;
    });
  };

  const meta = id => DASH_TILES.find(t=>t.id===id)||{label:id};

  return (
    <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex',alignItems:isDesktop?'center':'flex-end',justifyContent:'center',background:'rgba(0,0,0,0.6)',backdropFilter:'blur(6px)'}} onClick={onClose}>
      <div style={{width:'100%',maxWidth:440,background:C.card,borderRadius:isDesktop?'24px':'24px 24px 0 0',maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 -8px 48px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
        {!isDesktop&&<div style={{width:36,height:4,borderRadius:99,background:C.border,margin:'12px auto 0',flexShrink:0}}/>}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 20px 0',flexShrink:0}}>
          <div style={{color:C.cream,fontWeight:800,fontSize:18,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Customize Dashboard</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.muted,fontSize:22,cursor:'pointer',padding:4,lineHeight:1,fontFamily:'inherit'}}>×</button>
        </div>
        <div style={{color:C.muted,fontSize:12,padding:'4px 20px 14px',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Use ↑↓ to reorder · toggle to show or hide</div>
        <div style={{overflowY:'auto',flex:1,padding:'0 16px 8px'}}>
          {items.map((tile, idx) => {
            const m = meta(tile.id);
            return (
              <div key={tile.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 12px',borderRadius:14,marginBottom:7,
                background:tile.locked?C.gold+'0A':C.cardAlt,
                border:`1px solid ${tile.locked?C.gold+'44':tile.visible!==false?C.green+'33':C.border}`,
                opacity:tile.visible!==false?1:0.5,transition:'all .15s'}}>
                <div style={{display:'flex',flexDirection:'column',gap:1,flexShrink:0}}>
                  <button onClick={()=>!tile.locked&&moveUp(tile.id)}
                    style={{background:'none',border:'none',color:idx===0||tile.locked?C.border:C.muted,cursor:idx===0||tile.locked?'default':'pointer',fontSize:13,lineHeight:1,padding:'3px 6px',borderRadius:6,transition:'color .15s',fontFamily:'inherit'}}>▲</button>
                  <button onClick={()=>!tile.locked&&moveDown(tile.id)}
                    style={{background:'none',border:'none',color:idx===items.length-1||tile.locked?C.border:C.muted,cursor:idx===items.length-1||tile.locked?'default':'pointer',fontSize:13,lineHeight:1,padding:'3px 6px',borderRadius:6,transition:'color .15s',fontFamily:'inherit'}}>▼</button>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',width:32,height:32,borderRadius:9,background:tile.visible!==false?C.green+'18':C.cardAlt,border:`1px solid ${tile.visible!==false?C.green+'33':C.border}`,flexShrink:0}}>
                  <TileIcon id={tile.id} size={16} color={tile.visible!==false?C.greenBright:C.muted}/>
                </div>
                <div style={{flex:1,color:C.cream,fontWeight:600,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.label}</span>
                  {m.alwaysVisible&&<span style={{color:C.gold,fontSize:10,fontWeight:700,flexShrink:0}}>always on</span>}
                  {tile.locked&&<span style={{color:C.gold,fontSize:10,fontWeight:700,flexShrink:0}}>pinned</span>}
                </div>
                <button onClick={()=>setItems(prev=>prev.map(t=>t.id===tile.id?{...t,locked:!t.locked}:t))}
                  style={{background:'none',border:`1px solid ${tile.locked?C.gold+'55':C.border}`,borderRadius:8,width:36,height:36,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0,color:tile.locked?C.gold:C.muted,transition:'all .15s'}}>
                  {tile.locked?'🔒':'🔓'}
                </button>
                {!m.alwaysVisible&&(
                  <div onClick={()=>toggle(tile.id)}
                    style={{width:44,height:26,borderRadius:99,background:tile.visible!==false?C.green:'rgba(255,255,255,0.09)',border:`1px solid ${tile.visible!==false?C.green:C.border}`,position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
                    <div style={{position:'absolute',top:3,left:tile.visible!==false?21:3,width:18,height:18,borderRadius:'50%',background:'white',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{padding:'12px 16px 20px',flexShrink:0,borderTop:`1px solid ${C.border}`,display:'flex',gap:10}}>
          <button onClick={()=>setItems(DASH_TILES.map(t=>({id:t.id,visible:true,locked:false})))}
            style={{flex:1,background:'none',border:`1px solid ${C.border}`,borderRadius:12,padding:'12px',color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:'pointer',fontWeight:600}}>
            Reset
          </button>
          <button onClick={save}
            style={{flex:2,background:`linear-gradient(135deg,${C.green},${C.greenBright})`,border:'none',borderRadius:12,padding:'12px',color:'#021208',fontWeight:800,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:'pointer'}}>
            Save Layout
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function Onboarding({onComplete,onViewLegal,userId}){
  const [step,setStep]=useState(0);
  const [p,setP]=useState({name:"",country:"CA",province:"ON",status:"single",hasKids:false,partnerName:"",creditScore:680,creditKnown:false,lifeStages:["employed"],birthYear:"",kids:[],isHomeowner:false,employmentType:"t4",rrspRoom:"",tfsaRoom:"",retirementRoom:""});
  const [incomes,setIncomes]=useState([{id:1,label:"",amount:"",freq:"biweekly",type:"employment",isVariable:false}]);
  const [bills,setBills]=useState([{name:"",amount:"",date:""}]);
  const [debts,setDebts]=useState([{name:"",balance:"",rate:"",min:""}]);
  // Pre-populate debts from connected credit card accounts when user reaches debt step
  useEffect(()=>{
    if(step !== 5) return;
    const creditAccts = connAccts.filter(a =>
      a.type === "credit" || a.type === "credit card" ||
      a.subtype === "credit card" || a.type === "line of credit"
    );
    if(creditAccts.length === 0) return;
    // Only pre-populate if user hasn't touched debts yet (all blank)
    const untouched = debts.every(d => !d.name && !d.balance);
    if(!untouched) return;
    const prePopulated = creditAccts.map(a => ({
      name: a.name || "Credit Card",
      balance: Math.abs(a.balance || 0).toFixed(2),
      rate: "",
      min: "",
      fromBank: true,
    }));
    setDebts(prePopulated);
  }, [step]);
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
    callPlaid("create_link_token",{country:p.country, user_id: userId || ("guest-" + Math.random().toString(36).slice(2))})
      .then(d=>{ setLinkToken(d.link_token); setLinkTokenLoading(false); })
      .catch(()=>{ setBankError("Could not connect to your bank — please check your connection and try again."); setLinkTokenLoading(false); });
  },[linkToken, p.country]); // eslint-disable-line

  useEffect(()=>{ if(step===2) fetchLinkToken(); },[step]); // eslint-disable-line

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
      // Persist access_token so we can re-launch update mode if session expires
      try{
        // Multi-bank: save to array
        const existing = JSON.parse(localStorage.getItem("flourish_plaid_tokens")||"[]");
        const instName = ex.institution_name||"Your Bank";
        // Replace existing token for this institution (prevents duplicate entries)
        const bankId = "bank_" + Date.now();
        const filtered = existing.filter(b => (b.institution||"").toLowerCase() !== instName.toLowerCase());
        const updated = [...filtered, {id:bankId, token:ex.access_token, institution:instName}];
        localStorage.setItem("flourish_plaid_tokens", JSON.stringify(updated));
        // Keep legacy key for backwards compatibility
        localStorage.setItem("flourish_plaid_token", ex.access_token);
      }catch{}
      // Fetch accounts only — fast (~1s). Transactions load silently on dashboard.
      const acctData = await callPlaid("get_accounts",{access_token:ex.access_token});
      clearInterval(progTimer);setBankProg(100);

      const mappedAccounts = acctData.accounts.map(a=>({
        id:a.id,
        name:`${ex.institution_name} ••${a.mask||"????"}`,
        type:a.subtype||a.type,
        balance:a.type==="credit"?-(a.balance.current||0):(a.balance.current??a.balance.available??0),
        institution:ex.institution_name,
      }));

      setTimeout(()=>{
        // Append to existing connected accounts (multi-bank support)
        setConnAccts(prev => {
          const existingIds = new Set(prev.map(a=>a.id));
          const newAccts = mappedAccounts.filter(a=>!existingIds.has(a.id));
          return [...prev, ...newAccts];
        });
        setPlaidTxns([]);
        setDetectedBills([]);
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

  const [stmtStatus, setStmtStatus] = useState(null); // null | 'parsing' | 'done' | 'error'
  const [stmtMsg, setStmtMsg] = useState('');
  const handleStatementUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStmtStatus('parsing');
    setStmtMsg('Reading your statement…');
    try {
      let txns = null;
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        txns = parseCSVStatement(text);
        if (!txns) throw new Error('Could not detect columns. Try a PDF instead.');
      } else {
        setStmtMsg('Extracting PDF text…');
        const text = await extractPdfText(file);
        setStmtMsg('AI is reading your transactions…');
        txns = await parseStatementWithAI(text);
      }
      if (!txns || txns.length === 0) throw new Error('No transactions found in this file.');
      setPlaidTxns(txns);
      setConnAccts([{id:'stmt1',name:`${file.name.replace(/\.[^.]+$/,'')}`,type:'checking',balance:DEMO.balance,institution:'Statement'}]);
      setStmtStatus('done');
      setStmtMsg(`${txns.length} transactions imported ✓`);
      setTimeout(() => setBankStage('done'), 900);
    } catch (err) {
      setStmtStatus('error');
      setStmtMsg(err.message || 'Could not read file. Try a different format.');
    }
  };

  const skipBank=()=>{setConnAccts([]);setBankStage("skipped");};
  const addBill=()=>setBills([...bills,{name:"",amount:"",date:"1"}]);
  const rmBill=i=>setBills(bills.filter((_,x)=>x!==i));
  const upBill=(i,f,v)=>setBills(bills.map((b,x)=>x===i?{...b,[f]:v}:b));
  const addDebt=()=>setDebts([...debts,{name:"",balance:"",rate:"",min:""}]);
  const rmDebt=i=>setDebts(debts.filter((_,x)=>x!==i));
  const upDebt=(i,f,v)=>setDebts(debts.map((d,x)=>x===i?{...d,[f]:v}:d));
  const finish=()=>onComplete({profile:p,incomes:incomes.filter(i=>i.amount),bills:bills.filter(b=>b.name&&b.amount),debts:debts.filter(d=>d.name&&d.balance),accounts:connAccts,transactions:plaidTxns.length?plaidTxns:[],bankConnected:connAccts.some(a=>a.institution!=="Manual")});

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
      <div style={{position:"relative",marginBottom:16,animation:"logoFloat 5s ease-in-out infinite"}}>
        <div style={{width:96,height:96,borderRadius:30,background:C.isDark?"linear-gradient(145deg,rgba(0,204,133,0.14) 0%,rgba(0,204,133,0.06) 100%)":"linear-gradient(145deg,rgba(0,147,95,0.10) 0%,rgba(0,147,95,0.04) 100%)",border:`1.5px solid ${C.green}44`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 0 0 1px rgba(255,255,255,0.04), 0 12px 48px rgba(0,204,133,0.18), 0 4px 16px rgba(0,0,0,0.30)",backdropFilter:"blur(12px)"}}><FlourishMark size={56} style={{borderRadius:16}}/></div>
      </div>
      <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,fontSize:38,letterSpacing:-1,marginBottom:24,lineHeight:1,background:`linear-gradient(130deg,${C.cream} 30%,rgba(237,233,226,0.65) 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>flourish</div>

      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,color:C.green,letterSpacing:3.5,textTransform:"uppercase",fontWeight:700,marginBottom:22,opacity:0.9}}>
        Stop guessing. Start knowing.
      </div>

      {/* Tagline */}
      <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:26,fontWeight:900,color:C.cream,lineHeight:1.2,maxWidth:300,marginBottom:8,letterSpacing:-0.5}}>
        Know before<br/>you spend.
      </div>
      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",color:C.muted,fontSize:14,lineHeight:1.7,maxWidth:280,marginBottom:34}}>
        One number. Updated daily. Based on your real accounts — not estimates.
      </div>

      {/* Feature pills */}
      <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginBottom:36,maxWidth:340}}>
        {[["✓","Know before you spend"],["✓","Overdraft warnings"],["✓","Cash flow forecast"],["✓","AI coaching"],["✓","Tax tips & credits"],["✓","Family tools"]].map(([icon,text],i)=>(
          <div key={i} style={{background:C.isDark?"rgba(255,255,255,0.05)":C.surface,border:`1px solid ${C.border}`,borderRadius:99,padding:"7px 15px",color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:6,animation:`fadeUp 0.4s ease ${100+i*60}ms both`,backdropFilter:"blur(8px)"}}>
            <span style={{fontSize:14}}>{icon}</span>{text}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button onClick={()=>setStep(1)} style={{background:`linear-gradient(135deg,${C.green} 0%,${C.greenBright} 100%)`,color:C.isDark?"#041810":"#FFFFFF",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:16,padding:"17px 44px",borderRadius:99,border:"1.5px solid rgba(255,255,255,0.18)",cursor:"pointer",boxShadow:`0 0 0 1px ${C.green}22, 0 10px 40px ${C.green}44, inset 0 1px 0 rgba(255,255,255,0.30)`,letterSpacing:0.3,transition:"all .25s cubic-bezier(.16,1,.3,1)"}}
        onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px) scale(1.02)";e.currentTarget.style.boxShadow=`0 0 0 1px ${C.green}33, 0 16px 52px ${C.green}55, inset 0 1px 0 rgba(255,255,255,0.30)`;}}
        onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0) scale(1)";e.currentTarget.style.boxShadow=`0 0 0 1px ${C.green}22, 0 10px 40px ${C.green}44, inset 0 1px 0 rgba(255,255,255,0.30)`;}}>
        See What I Can Spend Today →
      </button>

      {/* Demo mode — required for App Store review */}
      <button onClick={()=>onComplete({
        profile:{name:"Alex",country:"CA",province:"ON",status:"couple",hasKids:true,partnerName:"Jordan",creditScore:718,creditKnown:true,lifeStages:["employed"]},
        incomes:[{id:1,label:"Full-time Job",amount:"2840",freq:"biweekly",type:"employment"},{id:2,label:"Canada Child Benefit",amount:"560",freq:"monthly",type:"ccb"}],
        bills:[{name:"Rent",amount:"1650",date:"1"},{name:"Hydro",amount:"95",date:"11"},{name:"Phone",amount:"65",date:"15"},{name:"Netflix",amount:"18.99",date:"22"}],
        debts:[{name:"TD Visa",balance:"3420",rate:"19.99",min:"68"},{name:"Car Loan",balance:"8200",rate:"6.99",min:"280"}],
        accounts:MOCK_ACCOUNTS,transactions:MOCK_TXN,bankConnected:true,
      })} style={{marginTop:12,background:"none",border:`1px solid ${C.border}`,borderRadius:99,padding:"11px 28px",color:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,cursor:"pointer",fontWeight:600,transition:"all .2s"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.borderHi;e.currentTarget.style.color=C.cream;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}>
        👀 Try Demo (no account needed)
      </button>

      <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:14}}>Free to start · Canada & USA · No credit card</div>

      {/* PIPEDA consent notice */}
      <div style={{marginTop:20,padding:"12px 16px",background:C.card,borderRadius:14,border:`1px solid ${C.border}`,maxWidth:320,textAlign:"left"}}>
        <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.7}}>
          By continuing you agree to our{" "}
          <button onClick={()=>onViewLegal&&onViewLegal("terms")} style={{background:"none",border:"none",padding:0,color:C.green,textDecoration:"none",fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:"inherit"}}>Terms of Service</button>{" "}and{" "}
          <button onClick={()=>onViewLegal&&onViewLegal("privacy")} style={{background:"none",border:"none",padding:0,color:C.green,textDecoration:"none",fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:"inherit"}}>Privacy Policy</button>
          , and consent to the collection and processing of your financial data in accordance with PIPEDA (Canada) and applicable US privacy laws.
        </div>
      </div>
    </div>,

    // 1: Profile
    <div>
      <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,fontSize:30,color:C.cream,marginBottom:6,letterSpacing:-0.5}}>About you</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:20,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Helps us personalise your tax advice and financial coaching.</div>
      <Inp label="First Name" value={p.name} onChange={v=>setP({...p,name:v})} placeholder="First name"/>
      <Sel label="Country" value={p.country} onChange={v=>setP({...p,country:v,province:v==="CA"?"ON":"CA"})} options={[{value:"CA",label:"🇨🇦 Canada"},{value:"US",label:"🇺🇸 United States"}]}/>
      <Sel label={p.country==="CA"?"Province":"State"} value={p.province} onChange={v=>setP({...p,province:v})}
        options={p.country==="CA"?[{value:"ON",label:"Ontario"},{value:"BC",label:"British Columbia"},{value:"AB",label:"Alberta"},{value:"QC",label:"Quebec"},{value:"MB",label:"Manitoba"},{value:"SK",label:"Saskatchewan"},{value:"NS",label:"Nova Scotia"},{value:"NB",label:"New Brunswick"},{value:"OTHER",label:"Other"}]:[{value:"CA",label:"California"},{value:"TX",label:"Texas"},{value:"NY",label:"New York"},{value:"FL",label:"Florida"},{value:"WA",label:"Washington"},{value:"IL",label:"Illinois"},{value:"OTHER",label:"Other"}]}/>

      {/* Birth year */}
      <Sel label="Birth Year" value={p.birthYear} onChange={v=>setP({...p,birthYear:v})}
        options={[{value:"",label:"Select year…"},...Array.from({length:80},(_,i)=>{const y=new Date().getFullYear()-18-i;return{value:String(y),label:String(y)};})]}/>

      <Sel label="Relationship Status" value={p.status} onChange={v=>setP({...p,status:v})} options={[{value:"single",label:"Single"},{value:"couple",label:"Married"},{value:"cohabit",label:"Common Law"}]}/>
      {p.status!=="single"&&<Inp label="Partner's Name (optional)" value={p.partnerName} onChange={v=>setP({...p,partnerName:v})} placeholder="Partner's first name"/>}

      {/* Homeowner */}
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:8,fontWeight:700}}>Do you own your home?</div>
        <div style={{display:"flex",gap:10}}>
          {[["Yes",true],["No",false]].map(([label,val])=>(
            <button key={label} onClick={()=>setP({...p,isHomeowner:val})}
              style={{flex:1,background:p.isHomeowner===val?C.teal+"33":C.cardAlt,border:`1px solid ${p.isHomeowner===val?C.teal:C.border}`,color:p.isHomeowner===val?C.tealBright:C.muted,borderRadius:12,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit"}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Kids */}
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:8,fontWeight:700}}>Do you have children?</div>
        <div style={{display:"flex",gap:10,marginBottom:p.hasKids?12:0}}>
          {["Yes","No"].map(opt=>(
            <button key={opt} onClick={()=>setP({...p,hasKids:opt==="Yes",kids:opt==="No"?[]:p.kids})}
              style={{flex:1,background:(opt==="Yes"?p.hasKids:!p.hasKids)?C.pink+"33":C.cardAlt,border:`1px solid ${(opt==="Yes"?p.hasKids:!p.hasKids)?C.pink:C.border}`,color:(opt==="Yes"?p.hasKids:!p.hasKids)?C.pinkBright:C.muted,borderRadius:12,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit"}}>
              {opt}
            </button>
          ))}
        </div>
        {p.hasKids&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {(p.kids||[]).map((kid,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center"}}>
                <Inp label="" value={kid.name||""} onChange={v=>{const k=[...p.kids];k[i]={...k[i],name:v};setP({...p,kids:k});}} placeholder={`Child ${i+1} name`}/>
                <div style={{width:110,flexShrink:0}}>
                  <select value={kid.birthYear||""} onChange={e=>{const k=[...p.kids];k[i]={...k[i],birthYear:e.target.value};setP({...p,kids:k});}}
                    style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 10px",color:kid.birthYear?C.cream:C.muted,fontSize:13,fontFamily:"inherit",outline:"none"}}>
                    <option value="">Year born</option>
                    {Array.from({length:25},(_,i)=>{const y=new Date().getFullYear()-i;return<option key={y} value={String(y)}>{y}</option>;})}
                  </select>
                </div>
                <button onClick={()=>setP({...p,kids:p.kids.filter((_,j)=>j!==i)})}
                  style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 4px",flexShrink:0}}>×</button>
              </div>
            ))}
            <button onClick={()=>setP({...p,kids:[...(p.kids||[]),{name:"",birthYear:""}]})}
              style={{background:C.pink+"18",border:`1px solid ${C.pink}44`,borderRadius:10,padding:"10px",color:C.pinkBright,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              + Add child
            </button>
          </div>
        )}
      </div>

      {/* Employment type */}
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:8,fontWeight:700}}>Employment type</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {(p.country==="CA"
            ?[["🏢","t4","T4 Employee"],["🧾","selfemployed","Self-Employed"],["🏛️","incorporated","Incorporated"],["🎓","student","Student"],["🌅","retired","Retired"]]
            :[["🏢","w2","W-2 Employee"],["🧾","selfemployed","Self-Employed / 1099"],["🏛️","incorporated","Business Owner"],["🎓","student","Student"],["🌅","retired","Retired"]]
          ).map(([emoji,val,label])=>(
            <button key={val} onClick={()=>setP({...p,employmentType:val})}
              style={{background:p.employmentType===val?C.blue+"33":C.cardAlt,border:`1px solid ${p.employmentType===val?C.blue:C.border}`,color:p.employmentType===val?C.blueBright||"#4DA8FF":C.muted,borderRadius:12,padding:"10px 14px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
              <span>{emoji}</span>{label}
              {p.employmentType===val&&<span style={{fontSize:10}}>✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Life stages */}
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:4,fontWeight:700}}>Which else applies? <span style={{fontWeight:400}}>(optional)</span></div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {[["🏠","homeoffice","Home Office"],["🌐","contractor","Contractor"],["💰","investor","Investor"],["➕","other","Other"]].map(([emoji,val,label])=>{
            const selected=(p.lifeStages||[]).includes(val);
            return(
              <button key={val} onClick={()=>{const cur=p.lifeStages||[];const next=selected?cur.filter(v=>v!==val):[...cur,val];setP({...p,lifeStages:next});}}
                style={{background:selected?C.green+"33":C.cardAlt,border:`1px solid ${selected?C.green:C.border}`,color:selected?C.greenBright:C.muted,borderRadius:12,padding:"10px 14px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                <span>{emoji}</span>{label}{selected&&<span style={{fontSize:10}}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>


        {/* RRSP / TFSA contribution room — CA only, optional */}
        {p.country==="CA"&&(
          <div style={{marginBottom:14}}>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:4,fontWeight:700}}>
              Contribution Room <span style={{fontSize:9,fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional — personalises tax tips)</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1}}>
                <div style={{color:C.muted,fontSize:10,marginBottom:4}}>RRSP Room</div>
                <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                  <span style={{color:C.muted,padding:"0 8px",fontSize:12}}>$</span>
                  <input type="number" min="0" step="500" value={p.rrspRoom}
                    onChange={e=>setP({...p,rrspRoom:e.target.value})}
                    placeholder="e.g. 24000"
                    style={{flex:1,background:"none",border:"none",padding:"10px 6px",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{color:C.muted,fontSize:10,marginBottom:4}}>TFSA Room</div>
                <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                  <span style={{color:C.muted,padding:"0 8px",fontSize:12}}>$</span>
                  <input type="number" min="0" step="500" value={p.tfsaRoom}
                    onChange={e=>setP({...p,tfsaRoom:e.target.value})}
                    placeholder="e.g. 7000"
                    style={{flex:1,background:"none",border:"none",padding:"10px 6px",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                </div>
              </div>
            </div>
            <div style={{color:C.muted,fontSize:10,marginTop:5}}>
              Find your room on <strong style={{color:C.mutedHi}}>CRA MyAccount</strong> or last year's NOA. Leave blank if unsure.
            </div>
          </div>
        )}

      <Btn label="Continue →" onClick={()=>setStep(2)} disabled={!p.name}/>
    </div>,

    // 2: Bank Connection
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

        {/* Statement upload */}
        <div style={{marginTop:10,background:C.cardAlt,borderRadius:14,padding:'12px 14px',border:`1px solid ${C.border}`}}>
          <div style={{color:C.mutedHi,fontWeight:600,fontSize:12,marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>📄 Or upload a bank statement</div>
          <label style={{display:'block',cursor:'pointer'}}>
            <input type="file" accept=".pdf,.csv" style={{display:'none'}} onChange={handleStatementUpload} disabled={stmtStatus==='parsing'}/>
            <div style={{background:stmtStatus==='parsing'?C.card:`linear-gradient(135deg,${C.gold}22,${C.gold}0A)`,border:`1px dashed ${stmtStatus==='error'?C.red:stmtStatus==='done'?C.green:C.gold}`,borderRadius:10,padding:'10px 14px',textAlign:'center',color:stmtStatus==='error'?C.redBright:stmtStatus==='done'?C.greenBright:C.goldBright,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,transition:'all .2s'}}>
              {stmtStatus==='parsing'?`⏳ ${stmtMsg}`:stmtStatus==='done'?`✓ ${stmtMsg}`:stmtStatus==='error'?`⚠ ${stmtMsg}`:'Choose PDF or CSV →'}
            </div>
          </label>
          {!stmtStatus&&<div style={{color:C.muted,fontSize:11,marginTop:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Supports most Canadian & US bank exports. AI parses PDFs automatically.</div>}
        </div>
      </>}

      {bankStage==="loading"&&<div style={{textAlign:"center",padding:"40px 0"}}>
        <div style={{marginBottom:14,display:"flex",justifyContent:"center",filter:"drop-shadow(0 0 20px #3CB54A55)"}}><FlourishMark size={54}/></div>
        <div style={{color:C.greenBright,fontWeight:700,fontSize:18,marginBottom:8}}>
          {bankProg<50?"Connecting securely…":"Fetching your accounts…"}
        </div>
        <div style={{color:C.muted,fontSize:13,marginBottom:22}}>Securely connecting your accounts</div>
        <div style={{background:C.isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)",borderRadius:99,height:6,overflow:"hidden",margin:"0 10px"}}>
          <div style={{width:`${bankProg}%`,height:"100%",background:`linear-gradient(90deg,${C.green},${C.teal})`,borderRadius:99,transition:"width .4s ease-out"}}/>
        </div>
        <div style={{color:C.muted,fontSize:12,marginTop:8}}>{Math.round(bankProg)}%</div>
      </div>}

      {bankStage==="skipped"&&<div style={{textAlign:"center",padding:"20px 0"}}>
        <div style={{fontSize:48,marginBottom:12}}>✏️</div>
        <div style={{color:C.cream,fontWeight:800,fontSize:18,marginBottom:8}}>Entering manually</div>
        <div style={{color:C.muted,fontSize:13,lineHeight:1.6,marginBottom:20}}>No problem — you can connect your bank any time from Settings to unlock live data.</div>
        <Btn label="Continue →" onClick={()=>setStep(3)}/>
      </div>}
      {bankStage==="done"&&<div>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{width:80,height:80,borderRadius:"50%",background:C.green+"22",border:`1px solid ${C.green}44`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}><Icon id="check" size={40} color={C.greenBright} strokeWidth={1.9}/></div>
          <div style={{fontSize:20,fontWeight:800,color:C.greenBright,fontFamily:"Georgia,serif"}}>Connected!</div>
          <div style={{color:C.mutedHi,fontSize:13,marginTop:4}}>
            {connAccts.length} account{connAccts.length!==1?"s":""} connected across {new Set(connAccts.map(a=>a.institution)).size} bank{new Set(connAccts.map(a=>a.institution)).size!==1?"s":""}
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
        <Btn label="Let's go →" onClick={()=>setStep(3)}/>
      </div>}
    </div>,

    // 3: Income (after bank — auto-detection runs first)
    <div>
      <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,fontSize:30,color:C.cream,marginBottom:6,letterSpacing:-0.5}}>Your income</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:16,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
        {incomes[0]?.autoDetected
          ? "We detected your income from your transactions. Confirm or adjust below."
          : "Add every source — employment, freelance, benefits, rental, a partner's income. We map it all against your bills."}
      </div>
      {incomes.map((inc,i)=>{
        const incTypeMeta = {
          employment:{label:"Full-time Job",emoji:"💼"},
          selfemployed:{label:"Self-Employed",emoji:"🧾"},
          cpp:{label:"CPP / Pension",emoji:"🏛️"},
          ei:{label:"EI Benefits",emoji:"📋"},
          odsp:{label:"ODSP / Ontario Works",emoji:"♿"},
          ccb:{label:"Canada Child Benefit",emoji:"👶"},
          rental:{label:"Rental Income",emoji:"🏠"},
          gig:{label:"Gig / Freelance",emoji:"🚗"},
          other:{label:"Other",emoji:"➕"},
          // US
          salary:{label:"Salary",emoji:"💼"},
          hourly:{label:"Hourly",emoji:"⏱️"},
          ssi:{label:"SSI / Disability",emoji:"♿"},
          snap:{label:"SNAP / Benefits",emoji:"📋"},
          investment:{label:"Investment Income",emoji:"📈"},
        };
        const meta = incTypeMeta[inc.type] || {label:inc.type,emoji:"💰"};
        const freqLabel = {weekly:"weekly",biweekly:"every 2 weeks",semimonthly:"twice/month",monthly:"monthly"}[inc.freq]||"";
        const summaryAmt = parseFloat(inc.amount||inc.typicalAmount||0);
        return (
          <div key={inc.id} style={{background:C.card,borderRadius:18,border:`1px solid ${C.border}`,marginBottom:12,overflow:"hidden"}}>
            {/* Card header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px 0"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:20}}>{meta.emoji}</span>
                <div>
                  <div style={{color:C.cream,fontWeight:700,fontSize:14,lineHeight:1.2}}>{inc.label||meta.label||`Income ${i+1}`}</div>
                  {summaryAmt>0&&<div style={{color:C.greenBright,fontSize:11,fontWeight:600,marginTop:1}}>${summaryAmt.toLocaleString()} {freqLabel}</div>}
                </div>
                {inc.autoDetected&&<span style={{background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:99,padding:"2px 8px",color:C.greenBright,fontSize:10,fontWeight:700,marginLeft:4}}>Auto ✓</span>}
                {inc.isVariable&&<span style={{background:C.purple+"22",border:`1px solid ${C.purple}44`,borderRadius:99,padding:"2px 8px",color:C.purpleBright||C.tealBright,fontSize:10,fontWeight:700}}>Variable</span>}
              </div>
              {incomes.length>1&&<button onClick={()=>setIncomes(incomes.filter(x=>x.id!==inc.id))}
                style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:"0 0 0 8px",lineHeight:1}}>×</button>}
            </div>

            <div style={{padding:"12px 16px 16px"}}>
              {/* Step 1 — Income type chips */}
              <div style={{marginBottom:12}}>
                <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:8}}>Income type</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {(CC[p.country]?.incomeTypes||CC.CA.incomeTypes).map(([val,lbl])=>(
                    <button key={val} onClick={()=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,type:val,label:x.label||(incTypeMeta[val]?.label||"")}:x))}
                      style={{background:inc.type===val?C.green+"22":C.cardAlt,border:`1px solid ${inc.type===val?C.green:C.border}`,color:inc.type===val?C.greenBright:C.muted,borderRadius:99,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:inc.type===val?700:400,transition:"all .15s"}}>{lbl}</button>
                  ))}
                </div>
              </div>

              {/* Step 2 — Label */}
              <div style={{marginBottom:12}}>
                <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>Label <span style={{color:C.border,textTransform:"none",letterSpacing:0}}>(optional — e.g. "Part-time at Tim's")</span></div>
                <input value={inc.label} onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,label:e.target.value}:x))}
                  placeholder={meta.label}
                  style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.cream,fontSize:14,fontFamily:"inherit",boxSizing:"border-box",outline:"none"}}/>
              </div>

              {/* Step 3 — Amount + Frequency (always shown for both paths) */}
              <div style={{marginBottom:12}}>
                <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>
                  {inc.isVariable ? "Typical paycheque (take-home)" : inc.autoDetected ? "Paycheque amount (take-home)" : "Paycheque amount (take-home)"}
                </div>
                <div style={{display:"flex",gap:10}}>
                  {/* Amount */}
                  <div style={{flex:1.2,display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${inc.autoDetected?C.green+"66":C.border}`,borderRadius:10,overflow:"hidden"}}>
                    <span style={{color:C.muted,padding:"0 10px",fontSize:14,flexShrink:0}}>$</span>
                    <input
                      value={inc.amount}
                      onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,amount:e.target.value,typicalAmount:e.target.value}:x))}
                      type="number" placeholder="e.g. 2100"
                      style={{flex:1,background:"none",border:"none",padding:"11px 10px 11px 0",color:inc.autoDetected?C.greenBright:C.cream,fontSize:15,fontFamily:"inherit",outline:"none",fontWeight:inc.autoDetected?700:400}}/>
                    {inc.autoDetected&&<span style={{color:C.green,fontSize:10,fontWeight:700,paddingRight:10,flexShrink:0}}>✓</span>}
                  </div>
                  {/* Frequency — always shown */}
                  <div style={{flex:1}}>
                    <select value={inc.freq} onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,freq:e.target.value}:x))}
                      style={{width:"100%",height:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 10px",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none"}}>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="semimonthly">Twice a month</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 4 — Variable toggle */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:inc.isVariable?C.purple+"11":C.cardAlt,border:`1px solid ${inc.isVariable?C.purple+"44":C.border}`,borderRadius:12,padding:"10px 14px",transition:"all .2s"}}>
                <div>
                  <div style={{color:inc.isVariable?C.purpleBright||C.tealBright:C.mutedHi,fontSize:13,fontWeight:600}}>Variable income</div>
                  <div style={{color:C.muted,fontSize:11,marginTop:1}}>{inc.isVariable?"Amount changes — we'll use your typical paycheque for planning":"Consistent amount every pay period"}</div>
                </div>
                <button onClick={()=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,isVariable:!inc.isVariable}:x))}
                  style={{width:46,height:26,borderRadius:99,background:inc.isVariable?C.purple||C.teal:C.cardAlt,border:`1px solid ${inc.isVariable?C.purple||C.teal:C.border}`,cursor:"pointer",position:"relative",transition:"all .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:3,left:inc.isVariable?23:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"all .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add income button — prominent */}
      <button onClick={()=>setIncomes([...incomes,{id:Date.now(),label:"",amount:"",freq:"biweekly",type:"employment",isVariable:false}])}
        style={{width:"100%",background:`linear-gradient(135deg,${C.green}18,${C.green}08)`,border:`1px solid ${C.green}66`,borderRadius:14,padding:"14px",color:C.greenBright,fontSize:14,cursor:"pointer",fontFamily:"inherit",marginBottom:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        <span style={{fontSize:18,lineHeight:1}}>＋</span> Add Another Income Source
      </button>

      <div style={{background:C.goldDim,border:`1px solid ${C.gold}44`,borderRadius:16,padding:"14px 16px",marginBottom:14}}>
        <div style={{color:C.goldBright,fontSize:13,lineHeight:1.6}}>💡 Include every source — even irregular ones. Flourish maps all income vs. bills to warn you <strong>before</strong> you hit zero.</div>
      </div>
      <Btn label="Continue →" onClick={()=>setStep(4)} disabled={!incomes.some(i=>i.amount||(i.isVariable&&i.typicalAmount))}/>
    </div>,

    // 4: Bills
    <div>
      <div style={{fontSize:28,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5,marginBottom:6}}>Your bills</div>
      {detectedBills&&detectedBills.length>0?(
        <div style={{color:C.muted,fontSize:14,marginBottom:14}}>
          We found <span style={{color:C.tealBright,fontWeight:700}}>{detectedBills.length} recurring bills</span> from your transactions. Amounts are averaged — edit anything that looks off.
        </div>
      ):connAccts.some(a=>a.institution!=="Manual")?(
        <div style={{background:C.tealDim,border:`1px solid ${C.teal}33`,borderRadius:14,padding:"12px 16px",marginBottom:14}}>
          <div style={{color:C.tealBright,fontWeight:700,fontSize:13,marginBottom:2}}>✦ Bills will auto-detect</div>
          <div style={{color:C.muted,fontSize:12}}>Your bank is connected. Recurring bills will be detected automatically once your transactions load. You can also add them manually below.</div>
        </div>
      ):(
        <div style={{color:C.muted,fontSize:14,marginBottom:14}}>Add your regular monthly bills. You can always update these later.</div>
      )}
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
      <div style={{fontSize:28,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5,marginBottom:6}}>Your debts</div>
      {connAccts.some(a=>a.type==="credit"||a.type==="credit card"||a.subtype==="credit card")?(
        <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:14,padding:"12px 14px",marginBottom:16,display:"flex",gap:10,alignItems:"flex-start"}}>
          <span style={{fontSize:18,flexShrink:0}}>🏦</span>
          <div>
            <div style={{color:C.greenBright,fontWeight:700,fontSize:13,marginBottom:2}}>Credit cards imported from your bank</div>
            <div style={{color:C.mutedHi,fontSize:12,lineHeight:1.6}}>We found {connAccts.filter(a=>a.type==="credit"||a.type==="credit card"||a.subtype==="credit card").length} credit card{connAccts.filter(a=>a.type==="credit"||a.type==="credit card"||a.subtype==="credit card").length!==1?"s":""} — balances are live. Add the interest rate and minimum payment so we can build your payoff plan.</div>
          </div>
        </div>
      ):(
        <div style={{color:C.muted,fontSize:14,marginBottom:20}}>No judgment — we&#39;ll build a real payoff plan with a simulator.</div>
      )}
      {debts.map((d,i)=>(
        <div key={i} style={{background:C.cardAlt,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.border}`,marginBottom:10}}>
          <div style={{display:"flex",gap:8}}>
            <div style={{flex:1}}>
              <div style={{position:"relative"}}>
                <Inp label="Name" value={d.name} onChange={v=>upDebt(i,"name",v)} placeholder="Visa, Car Loan…" sm/>
                {d.fromBank&&<span style={{position:"absolute",top:0,right:0,fontSize:9,fontWeight:700,color:C.greenBright,background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:99,padding:"2px 8px"}}>🏦 live balance</span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <Inp label="Balance $" value={d.balance} onChange={v=>upDebt(i,"balance",v)} type="number" sm/>
                <Inp label="Rate %" value={d.rate} onChange={v=>upDebt(i,"rate",v)} type="number" sm placeholder="e.g. 19.99"/>
              </div>
              <Inp label="Min Payment $" value={d.min} onChange={v=>upDebt(i,"min",v)} type="number" sm/>
              {d.fromBank&&!d.rate&&<div style={{color:C.gold,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2,marginBottom:4}}>⚡ Add interest rate to unlock payoff simulator</div>}
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
        ["🧠",connAccts.some(a=>a.institution!=="Manual")?"AI coach ready — transactions loading in background":"AI coach ready to analyze your data"],
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
        {step>0&&step<7&&(
          <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",marginBottom:24}}>
            <button onClick={()=>setStep(s=>s-1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>← Back</button>
          </div>
        )}
        {step>0&&step<7&&<div style={{display:"flex",gap:3,marginBottom:28}}>{Array.from({length:7}).map((_,i)=><div key={i} style={{height:3,borderRadius:99,flex:i===step-1?3:1,background:i<step?`linear-gradient(90deg,${C.green},${C.greenBright})`:C.border,transition:"all .45s cubic-bezier(.16,1,.3,1)",boxShadow:i<step?`0 0 8px ${C.green}44`:"none"}}/>)}</div>}
        {screens[step]}
      </div>
    </div>
  );
}


// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
const NOTIF_COLORS = {autopilot:"#00CC85",bill:"#E8B84B",win:"#00C8E0",score:"#00CC85",behavior:"#FF8C42",opportunity:"#9B7DFF",urgent:"#FF4F6A"};
// INIT_NOTIFS — only generic onboarding notifications
// Bill-due, debt, and spending notifications are generated dynamically from real user data
const INIT_NOTIFS=[
  {id:1,icon:"sparkles",title:"Welcome to Flourish 🌱",body:"Your financial dashboard is ready. Connect your bank to unlock live insights.",read:false,time:"Just now",type:"autopilot",color:NOTIF_COLORS.autopilot},
];

// Generate real notifications from user's actual bills and data
function buildLiveNotifs(data) {
  const notifs = [];
  const today = new Date();
  const todayDate = today.getDate();
  const bills = data?.bills || [];
  const accounts = data?.accounts || [];
  const debts = data?.debts || [];
  const balance = accounts.filter(a=>a.type==="checking"||a.type==="savings").reduce((s,a)=>s+(a.balance||0),0);

  // Bill due soon notifications (real bills only)
  bills.filter(b=>b.name&&b.amount).forEach((b,i) => {
    const dueDay = parseInt(b.date||0);
    if(!dueDay) return;
    const daysUntil = dueDay >= todayDate ? dueDay - todayDate : (30 - todayDate + dueDay);
    if(daysUntil <= 5) {
      const covers = balance >= parseFloat(b.amount||0);
      notifs.push({
        id: `bill_${i}`,
        icon:"calendar",
        title:`${b.name} due in ${daysUntil === 0 ? "today" : daysUntil + " day" + (daysUntil===1?"":"s")}`,
        body:`$${parseFloat(b.amount).toFixed(2)}. ${covers ? "Your balance covers it — you're good." : "You may want to transfer funds before this hits."}`,
        read:false,
        time:`${dueDay}${[11,12,13].includes(dueDay)?"th":["st","nd","rd"][dueDay%10-1]||"th"}`,
        type:"bill",
        color:covers?NOTIF_COLORS.bill:NOTIF_COLORS.urgent,
      });
    }
  });

  // Debt milestone notifications (real debts only)
  debts.filter(d=>d.name&&d.balance&&d.originalBalance).forEach((d,i) => {
    const pct = Math.round((1 - parseFloat(d.balance)/parseFloat(d.originalBalance))*100);
    if(pct >= 25 && pct % 25 === 0) {
      notifs.push({
        id:`debt_${i}`,icon:"target",
        title:`${d.name} is ${pct}% paid off! 🎉`,
        body:`$${parseFloat(d.balance).toLocaleString()} remaining. Keep going!`,
        read:true,time:"Today",type:"win",color:NOTIF_COLORS.win,
      });
    }
  });

  return notifs;
}

function Notifications({onClose, data, onMarkAllRead}){
  // useState with inline lazy initialiser — avoids TDZ from named function before hook
  const [readIds, setReadIds] = useState(()=>{ try { return new Set(JSON.parse(localStorage.getItem("flourish_read_notifs")||"[]")); } catch { return new Set(); } });
  const liveNotifs = data ? [...buildLiveNotifs(data), ...INIT_NOTIFS] : INIT_NOTIFS;
  const notifs = liveNotifs.map(n=>({...n, read: readIds.has(n.id)}));
  const unread = notifs.filter(n=>!n.read).length;
  const markAll = () => {
    const ids = new Set(liveNotifs.map(n=>n.id));
    setReadIds(ids);
    try { localStorage.setItem("flourish_read_notifs", JSON.stringify([...ids])); } catch {}
    if(onMarkAllRead) onMarkAllRead();
  };
  return <div style={{color:C.cream}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
      <div>
        <div style={{fontSize:24,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>Notifications</div>
        {unread>0&&<div style={{color:C.red,fontSize:12,fontWeight:700}}>{unread} unread</div>}
      </div>
      <div style={{display:"flex",gap:8}}>
        {unread>0&&<button onClick={markAll} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Mark all read</button>}
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

// ─── NET WORTH HISTORY ────────────────────────────────────────────────────────
function snapshotNetWorth(netWorth) {
  try {
    const key = "flourish_nw_history";
    const history = JSON.parse(localStorage.getItem(key)||"[]");
    const today = new Date().toISOString().slice(0,7); // "2026-03"
    // Only snapshot once per month
    if(history.length > 0 && history[history.length-1].month === today) {
      // Update this month's snapshot
      history[history.length-1].v = netWorth;
    } else {
      history.push({ month: today, v: netWorth });
    }
    // Keep last 12 months
    const trimmed = history.slice(-12);
    localStorage.setItem(key, JSON.stringify(trimmed));
    return trimmed;
  } catch { return []; }
}

function getNetWorthHistory() {
  try { return JSON.parse(localStorage.getItem("flourish_nw_history")||"[]"); } catch { return []; }
}

function NetWorthSparkline({history, color}){
  if(!history || history.length < 2) return null;
  const vals = history.map(h=>h.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 80, h = 28;
  const pts = vals.map((v,i) => {
    const x = (i / (vals.length-1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const last = vals[vals.length-1];
  const first = vals[0];
  const trend = last > first ? "up" : last < first ? "down" : "flat";
  const trendColor = trend==="up" ? "#00CC85" : trend==="down" ? "#FF4F6A" : "#888";
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
      <svg width={w} height={h} style={{overflow:"visible"}}>
        <polyline fill="none" stroke={trendColor} strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" points={pts}/>
        <circle cx={pts.split(" ").slice(-1)[0].split(",")[0]} cy={pts.split(" ").slice(-1)[0].split(",")[1]}
          r="2.5" fill={trendColor}/>
      </svg>
      <span style={{color:trendColor,fontSize:10,fontWeight:700}}>
        {trend==="up"?"↑":trend==="down"?"↓":"→"} {Math.abs(last-first)>0?`$${Math.abs(((last-first)/1000)).toFixed(1)}k ${trend==="up"?"up":"down"} since ${history[0].month}`:"stable"}
      </span>
    </div>
  );
}


// ─── BACKGROUND REFRESH (Plus only, 30-min rate limit) ───────────────────────
async function backgroundRefresh(isPremium, setAppData) {
  if(!isPremium) return;
  const accessToken = localStorage.getItem("flourish_plaid_token");
  if(!accessToken) return;
  const lastFetch = parseInt(localStorage.getItem("flourish_last_refresh")||"0");
  const THIRTY_MIN = 30 * 60 * 1000;
  if(Date.now() - lastFetch < THIRTY_MIN) return;
  try {
    const [acctData, txnData] = await Promise.all([
      callPlaid("get_accounts", { access_token: accessToken }),
      callPlaid("get_transactions", { access_token: accessToken, days: 90 }),
    ]);
    const normalisedTxns = normaliseTxns(txnData.transactions||[]);
    setAppData(prev => {
      const freshAccounts = acctData.accounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.subtype||a.type,
        balance: a.type==="credit" ? -(a.balance.current||0) : (a.balance.current??a.balance.available??0),
        institution: prev.accounts?.find(p=>p.id===a.id)?.institution||"Bank",
      }));
      // Sync new credit card accounts into debts on background refresh
      const creditAccts = freshAccounts.filter(a =>
        a.type === "credit" || a.type === "credit card" ||
        a.subtype === "credit card" || a.type === "line of credit"
      );
      const existingDebtNames = new Set((prev.debts||[]).map(d => (d.name||"").toLowerCase()));
      const newCCDebts = creditAccts
        .filter(a => !existingDebtNames.has((a.name||"").toLowerCase()))
        .map(a => ({
          name: a.name || "Credit Card",
          balance: Math.abs(a.balance || 0).toFixed(2),
          rate: "", min: "", fromBank: true,
        }));
      return {
        ...prev,
        accounts: freshAccounts,
        transactions: normalisedTxns.length > 0 ? normalisedTxns : prev.transactions,
        debts: newCCDebts.length > 0
          ? [...(prev.debts||[]).filter(d => d.name || d.balance), ...newCCDebts]
          : prev.debts,
      };
    });
    localStorage.setItem("flourish_last_refresh", Date.now().toString());
  } catch { /* silent failure */ }
}


// ─── DATA TRANSPARENCY PANEL ─────────────────────────────────────────────────
// Shows exactly how every key number is calculated — income, spending, balance,
// what was excluded and why (credit card payments, transfers, etc.)
function DataTransparencyPanel({data, onClose}) {
  const [tab, setTab] = useState("income");
  const s = {fontFamily:"'Plus Jakarta Sans',sans-serif"};

  // ── Rebuild calc data with full audit trail ──────────────────────────────
  const profile   = data.profile || {};
  const accounts  = data.accounts || [];
  const incomes   = (data.incomes || []).filter(i => parseFloat(i.amount) > 0);
  const bills     = data.bills || [];
  const txns      = data.transactions || [];
  const now       = new Date();

  // Income inputs
  const toMonthly = (amt, freq) => {
    const a = parseFloat(amt||0);
    switch(freq) {
      case "weekly":      return a * 4.333;
      case "biweekly":    return a * 2.167;
      case "semimonthly": return a * 2;
      case "monthly":     return a;
      default:            return a * 2.167;
    }
  };
  const incomeRows = incomes.map(i => ({
    label: i.label || i.type || "Income",
    entered: parseFloat(i.amount||0),
    freq: i.freq || "biweekly",
    monthly: toMonthly(i.amount, i.freq),
  }));
  const totalMonthlyIncome = incomeRows.reduce((s,r) => s+r.monthly, 0) || 4200;

  // Spending audit — this month
  const thisMonthTxns = txns.filter(t => {
    if (!t.date) return false;
    const d = new Date(t.date + "T12:00:00");
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const included = thisMonthTxns.filter(t =>
    t.amount > 0 &&
    t.cat !== "Transfer" &&
    t.cat !== "Income" &&
    t.cat !== "Fees" &&
    !CC_PAYMENT_KEYWORDS.some(kw => (t.name||"").toLowerCase().includes(kw))
  );
  const excluded = thisMonthTxns.filter(t =>
    t.amount > 0 && (
      t.cat === "Transfer" ||
      t.cat === "Income" ||
      t.cat === "Fees" ||
      CC_PAYMENT_KEYWORDS.some(kw => (t.name||"").toLowerCase().includes(kw))
    )
  );
  const totalSpend = included.reduce((s,t) => s+t.amount, 0);

  // Balance audit
  const chequingAccts = accounts.filter(a => a.type !== "credit" && a.type !== "investment");
  const creditAccts   = accounts.filter(a => a.type === "credit" || a.type === "credit card" || a.subtype === "credit card" || a.type === "line of credit");
  const totalBalance  = chequingAccts.reduce((s,a) => s + parseFloat(a.balance||0), 0);

  // Category breakdown
  const catBreakdown = {};
  included.forEach(t => { catBreakdown[t.cat] = (catBreakdown[t.cat]||0) + t.amount; });
  const catRows = Object.entries(catBreakdown).sort((a,b) => b[1]-a[1]);

  const TabBtn = ({id, label}) => (
    <button onClick={()=>setTab(id)} style={{
      ...s, flex:1, padding:"9px 6px", fontSize:11, fontWeight:700,
      background: tab===id ? C.green+"22" : "transparent",
      border: tab===id ? `1px solid ${C.green}44` : `1px solid transparent`,
      borderRadius:10, color: tab===id ? C.greenBright : C.muted, cursor:"pointer"
    }}>{label}</button>
  );

  const Row = ({label, value, sub, color, indent=false}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
      padding:"9px 0",borderBottom:`1px solid ${C.border}`,paddingLeft:indent?14:0}}>
      <div>
        <div style={{...s,fontSize:12,color:C.cream,fontWeight:indent?400:600}}>{label}</div>
        {sub&&<div style={{...s,fontSize:10,color:C.muted,marginTop:1}}>{sub}</div>}
      </div>
      <div style={{...s,fontSize:13,fontWeight:800,color:color||C.cream,flexShrink:0,marginLeft:12}}>{value}</div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:999,display:"flex",alignItems:window.innerWidth>900?"center":"flex-end",backdropFilter:"blur(4px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{width:"100%",maxWidth:480,margin:"0 auto",background:C.bg,borderRadius:"22px 22px 0 0",
        border:`1px solid ${C.border}`,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{padding:"18px 20px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{...s,fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:900,color:C.cream}}>How it's calculated</div>
              <div style={{...s,fontSize:11,color:C.muted,marginTop:2}}>Full audit trail of every number in Flourish</div>
            </div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,
              borderRadius:10,padding:"8px 12px",color:C.muted,cursor:"pointer",...s,fontSize:13,minHeight:36}}>✕</button>
          </div>
          {/* Tabs */}
          <div style={{display:"flex",gap:6}}>
            <TabBtn id="income"  label="💰 Income"/>
            <TabBtn id="spending" label="💸 Spending"/>
            <TabBtn id="balance" label="🏦 Balance"/>
          </div>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px 32px"}}>

          {/* ── INCOME TAB ── */}
          {tab==="income"&&<>
            <div style={{...s,fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:12}}>
              Income from your profile (what you told us)
            </div>
            {incomeRows.length===0&&(
              <div style={{background:C.gold+"11",border:`1px solid ${C.gold}33`,borderRadius:14,padding:"14px 16px",marginBottom:8}}>
                <div style={{...s,fontSize:12,color:C.goldBright,fontWeight:700,marginBottom:4}}>⚠️ No income entered</div>
                <div style={{...s,fontSize:12,color:C.mutedHi,lineHeight:1.7}}>Flourish is using a default estimate of $4,200/month. Go to <strong style={{color:C.cream}}>Settings → Edit Profile</strong> to enter your real income — this affects every calculation in the app.</div>
              </div>
            )}
            {incomeRows.map((r,i)=>(
              <Row key={i}
                label={r.label}
                sub={`$${r.entered.toFixed(2)} × ${r.freq} = $${r.monthly.toFixed(0)}/mo`}
                value={`$${r.monthly.toFixed(0)}/mo`}
                color={C.greenBright}
              />
            ))}
            {incomeRows.length>0&&(
              <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",marginTop:4}}>
                <div style={{...s,fontSize:13,fontWeight:800,color:C.cream}}>Total monthly income</div>
                <div style={{...s,fontSize:16,fontWeight:900,color:C.greenBright,fontFamily:"'Playfair Display',serif"}}>${totalMonthlyIncome.toFixed(0)}</div>
              </div>
            )}
            <div style={{marginTop:16,background:C.blue+"11",border:`1px solid ${C.blue}33`,borderRadius:14,padding:"12px 14px"}}>
              <div style={{...s,fontSize:11,color:C.blueBright,fontWeight:700,marginBottom:4}}>ℹ️ Why transactions aren't used for income</div>
              <div style={{...s,fontSize:11,color:C.mutedHi,lineHeight:1.7}}>
                Credit card payments (Amex, Visa, Mastercard) appear as money coming IN on your chequing account — but they are debt repayment, not income. Using transactions for income detection caused inflated figures. Your income is based only on what you entered during setup.
              </div>
            </div>
          </>}

          {/* ── SPENDING TAB ── */}
          {tab==="spending"&&<>
            <div style={{...s,fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:12}}>
              This month's spending — {now.toLocaleDateString("en-CA",{month:"long",year:"numeric"})}
            </div>

            {/* Category breakdown */}
            {catRows.length>0&&<div style={{...s,fontSize:11,color:C.muted,marginBottom:10}}>
              {included.length} transaction{included.length!==1?"s":""} · {excluded.length} excluded
            </div>}
            {catRows.length>0&&<>
              {catRows.map(([cat,amt],i)=>(
                <Row key={i} label={cat} value={`$${amt.toFixed(0)}`} indent/>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",marginTop:4}}>
                <div style={{...s,fontSize:13,fontWeight:800,color:C.cream}}>Total included spending</div>
                <div style={{...s,fontSize:16,fontWeight:900,color:C.redBright,fontFamily:"'Playfair Display',serif"}}>${totalSpend.toFixed(0)}</div>
              </div>
            </>}

            {/* Excluded transactions */}
            {excluded.length>0&&<>
              <div style={{...s,fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,margin:"16px 0 8px"}}>
                ✅ Excluded from spending (correctly)
              </div>
              {excluded.slice(0,8).map((t,i)=>(
                <Row key={i}
                  label={t.name}
                  sub={`${t.cat} · excluded: ${
                    CC_PAYMENT_KEYWORDS.some(kw=>(t.name||"").toLowerCase().includes(kw))?"credit card payment" :
                    t.cat==="Transfer"?(()=>{
                      const matched = (data.debts||[]).find(d=>{
                        const min=parseFloat(d.min||0), bal=parseFloat(d.balance||0);
                        return (min>0&&Math.abs(t.amount-min)<5)||(bal>0&&Math.abs(t.amount-bal)<50);
                      });
                      return matched?`CC payment → ${matched.name}`:"account transfer";
                    })():
                    t.cat==="Fees"?"bank fee":"income"
                  }`}
                  value={`$${(t.amount||0).toFixed(0)}`}
                  color={C.muted}
                  indent
                />
              ))}
              {excluded.length>8&&<div style={{...s,fontSize:11,color:C.muted,textAlign:"center",padding:"8px 0"}}>+{excluded.length-8} more excluded</div>}
            </>}

            {included.length===0&&excluded.length===0&&(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",textAlign:"center"}}>
                <div style={{fontSize:24,marginBottom:8}}>💳</div>
                <div style={{...s,fontSize:13,color:C.mutedHi,fontWeight:600,marginBottom:4}}>No transactions this month yet</div>
                <div style={{...s,fontSize:12,color:C.muted,lineHeight:1.65}}>Connect your bank in Settings to see live spending data, or upload a bank statement from the Transactions screen.</div>
              </div>
            )}
          </>}

          {/* ── BALANCE TAB ── */}
          {tab==="balance"&&<>
            <div style={{...s,fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:12}}>
              Accounts used for your balance
            </div>

            {chequingAccts.length>0&&<>
              <div style={{...s,fontSize:11,color:C.greenBright,fontWeight:700,marginBottom:6}}>✅ Included in balance</div>
              {chequingAccts.map((a,i)=>(
                <Row key={i}
                  label={a.name}
                  sub={`${a.institution||"Bank"} · ${a.type}`}
                  value={`$${parseFloat(a.balance||0).toFixed(0)}`}
                  color={C.greenBright}
                  indent
                />
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",marginTop:4}}>
                <div style={{...s,fontSize:13,fontWeight:800,color:C.cream}}>Available balance</div>
                <div style={{...s,fontSize:16,fontWeight:900,color:C.greenBright,fontFamily:"'Playfair Display',serif"}}>${totalBalance.toFixed(0)}</div>
              </div>
            </>}

            {creditAccts.length>0&&<>
              <div style={{...s,fontSize:11,color:C.redBright,fontWeight:700,margin:"16px 0 6px"}}>⚠️ Credit cards — liabilities, not balance</div>
              {creditAccts.map((a,i)=>(
                <Row key={i}
                  label={a.name}
                  sub={`${a.institution||"Bank"} · credit — excluded from balance, shown as debt`}
                  value={`−$${Math.abs(parseFloat(a.balance||0)).toFixed(0)}`}
                  color={C.redBright}
                  indent
                />
              ))}
              <div style={{marginTop:8,background:C.gold+"11",border:`1px solid ${C.gold}33`,borderRadius:12,padding:"10px 12px"}}>
                <div style={{...s,fontSize:11,color:C.goldBright,lineHeight:1.65}}>
                  💡 Credit card balances are liabilities — they reduce your net worth but are NOT deducted from your chequing balance. Your "balance" in Flourish always means available cash, not net position.
                </div>
              </div>
            </>}

            {accounts.length===0&&(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",textAlign:"center"}}>
                <div style={{fontSize:24,marginBottom:8}}>🏦</div>
                <div style={{...s,fontSize:13,color:C.mutedHi,fontWeight:600,marginBottom:4}}>No accounts connected</div>
                <div style={{...s,fontSize:12,color:C.muted}}>Connect your bank in Settings to see live balance data.</div>
              </div>
            )}
            {chequingAccts.length>0&&creditAccts.length>0&&(
              <div style={{marginTop:12,background:C.teal+"11",border:`1px solid ${C.teal}33`,borderRadius:14,padding:"12px 14px"}}>
                <div style={{...s,fontSize:11,color:C.tealBright,fontWeight:700,marginBottom:4}}>📊 Net cash position</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{...s,fontSize:12,color:C.mutedHi}}>
                    Cash (${totalBalance.toFixed(0)}) − Credit owed (${creditAccts.reduce((s,a)=>s+Math.abs(parseFloat(a.balance||0)),0).toFixed(0)})
                  </div>
                  <div style={{...s,fontSize:14,fontWeight:900,fontFamily:"'Playfair Display',serif",
                    color:(totalBalance - creditAccts.reduce((s,a)=>s+Math.abs(parseFloat(a.balance||0)),0))>=0?C.greenBright:C.redBright}}>
                    ${(totalBalance - creditAccts.reduce((s,a)=>s+Math.abs(parseFloat(a.balance||0)),0)).toFixed(0)}
                  </div>
                </div>
              </div>
            )}
          </>}

        </div>
      </div>
    </div>
  );
}

function Dashboard({data,setScreen,setShowNotifs,onUpgrade,checkInBonus=0,onCheckIn,onWhatIf,onWrapped,isDesktop=false,dashLayout,setDashLayout,setGoalsTab,isRefreshing=false}){
  const [mounted,setMounted]=useState(false);
  const [expandedTile,setExpandedTile]=useState(null);
  const [showCustomize,setShowCustomize]=useState(false);
  const [showTransparency,setShowTransparency]=useState(false);
  const [nwHistory,setNwHistory]=useState(()=>getNetWorthHistory());
  const [affordInput, setAffordInput] = useState("");
  const [affordResult, setAffordResult] = useState(null);
  const [affordFocused, setAffordFocused] = useState(false);
  useEffect(()=>{const t=setTimeout(()=>setMounted(true),60);return()=>clearTimeout(t);},[]);
  useEffect(()=>{
    if(data.bankConnected) {
      const { netWorth: nw } = FinancialCalcEngine.netWorth(data);
      const h = snapshotNetWorth(nw);
      setNwHistory(h);
    }
  },[data.bankConnected]);

  const isVisible = id => !dashLayout || (dashLayout.find(t=>t.id===id)?.visible !== false);
  const tileOrder = dashLayout ? dashLayout.map(t=>t.id) : DASH_TILES.map(t=>t.id);
  const tileStyle = id => ({ order: tileOrder.indexOf(id) >= 0 ? tileOrder.indexOf(id) : 99 });

  // ── Engines ──────────────────────────────────────────────────────────────────
  const _ss         = SafeSpendEngine.calculate(data);
  const bal         = _ss.balance;
  const safe        = _ss.safeAmount;
  // overdraft: either bills in next 10 days exceed balance (immediate)
  // OR forecast shows negative balance within 7 days (imminent)
  // sevenDayRisk is calculated below — use a temporary check here with SafeSpend only,
  // then upgrade after sevenDayRisk is available
  const overdraftImmediate = _ss.overdraft;
  const soonBills   = _ss.soonBills;
  const soonTotal   = _ss.upcomingBills;
  const today       = new Date().getDate();
  const monthlyIncome = FinancialCalcEngine.cashFlow(data).monthlyIncome;
  const { netWorth } = FinancialCalcEngine.netWorth(data);
  // Badge reads live from localStorage so it updates after Notifications marks-read
  const getUnreadCount = () => {
    try {
      const readIds = new Set(JSON.parse(localStorage.getItem("flourish_read_notifs")||"[]"));
      return [...INIT_NOTIFS, ...(data ? buildLiveNotifs(data) : [])].filter(n=>!readIds.has(n.id)).length;
    } catch { return 0; }
  };
  const unread = getUnreadCount();
  const spark=[-4200,-3800,-3100,-2600,-1900,netWorth];
  const sMin=Math.min(...spark),sMax=Math.max(...spark);
  const sN=spark.map(v=>90-((v-sMin)/(sMax-sMin)||0)*70);
  const heroColor=overdraftImmediate?C.red:sevenDayOverdraft?C.gold:C.green;
  const heroColorBright=overdraftImmediate?C.redBright:sevenDayOverdraft?C.goldBright:C.greenBright;
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
  // 7-day forecast — calculated once here, shared with priority filter tile
  const { overdraftRisk: sevenDayRisk, willGoNegative: sevenDayOverdraft } = ForecastEngine.generate(data, 7);
  // Combined overdraft signal: immediate (10-day window) OR imminent (7-day forecast)
  const overdraft = overdraftImmediate || sevenDayOverdraft;
  // 14-day forecast — shared with "Can I afford this?" widget. No per-keystroke calls.
  const { forecast: afford14Forecast } = ForecastEngine.generate(data, 14);
  const nextPaydayDay = afford14Forecast.find(f => f.isPayday && f.day > 0)?.day || null;

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
      {showCustomize&&dashLayout&&<DashCustomize layout={dashLayout} onChange={setDashLayout} onClose={()=>setShowCustomize(false)}/>}
      {showTransparency&&<DataTransparencyPanel data={data} onClose={()=>setShowTransparency(false)}/>}

      {/* ── Top status bar ───────────────────────────────────────────────── */}
      <div style={{...anim(0),display:"flex",alignItems:"center",justifyContent:"space-between",paddingBottom:2}}>
        <div onClick={()=>setShowTransparency(true)} style={{display:"flex",alignItems:"center",gap:7,background:"rgba(0,204,133,0.06)",border:"1px solid rgba(0,204,133,0.12)",borderRadius:99,padding:"4px 10px",cursor:"pointer"}} title="How is this calculated?">
          <div style={{width:6,height:6,borderRadius:"50%",background:C.green,boxShadow:`0 0 8px ${C.green}`,animation:"pulse 2.8s ease-in-out infinite",flexShrink:0}}/>
          <span style={{color:C.green,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,letterSpacing:0.4}}>Live</span>
          <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{
            (()=>{ const l=localStorage.getItem("flourish_last_refresh");
              if(!l) return "· 6 engines";
              const m=Math.round((Date.now()-parseInt(l))/60000);
              return m<1?"· just refreshed":m<60?`· updated ${m}m ago`:"· 6 engines"; })()
          }</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:0.2}}>{new Date().toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"})}</span>
          {setDashLayout&&<button onClick={()=>setShowCustomize(true)} style={{background:`linear-gradient(135deg,${C.green}22,${C.teal}11)`,border:`1px solid ${C.green}44`,borderRadius:99,padding:"5px 12px",color:C.greenBright,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,cursor:"pointer",letterSpacing:0.3,display:"flex",alignItems:"center",gap:4}}>⠿ Reorder</button>}
        </div>
      </div>

      {/* ── Greeting + Bell ──────────────────────────────────────────────── */}
      <div style={{...anim(30),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:27,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",lineHeight:1.15,letterSpacing:-0.5}}>
            Hey {data.profile?.name||"there"} 👋
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

      {/* ── Pre-bank estimated insight — replaces generic "sample data" banner ── */}
      {(!data.transactions||data.transactions.length===0)&&(()=>{
        // Calculate a real estimate from their onboarding data
        const toMo = (amt,freq)=>{const a=parseFloat(amt||0);return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="monthly"?a:a*2.167;};
        const monthlyIncome = (data.incomes||[]).filter(i=>parseFloat(i.amount)>0).reduce((s,i)=>s+toMo(i.amount,i.freq),0);
        const monthlyBills = (data.bills||[]).reduce((s,b)=>s+parseFloat(b.amount||0),0);
        const safetyBuffer = monthlyIncome * 0.15;
        const estimatedSpend = monthlyIncome * 0.68; // avg spend rate
        const surplus = monthlyIncome - monthlyBills - safetyBuffer;
        const overspend = estimatedSpend - (monthlyIncome - monthlyBills - safetyBuffer);
        const hasData = monthlyIncome > 0;
        return(
          <div style={{...anim(50),background:hasData?(overspend>0?C.red+"12":C.green+"10"):C.gold+"10",
            border:`1px solid ${hasData?(overspend>0?C.red+"33":C.green+"30"):C.gold+"33"}`,
            borderRadius:16,padding:"14px 16px",cursor:"pointer"}}
            onClick={()=>setScreen("coach")}>
            <div style={{color:C.muted,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>📊 Estimate · Based on your setup — connect bank for real numbers</div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:20,flexShrink:0}}>{hasData?(overspend>0?"⚠️":"💡"):"🔗"}</span>
              <div style={{flex:1}}>
                {hasData?(
                  <>
                    <div style={{color:overspend>0?C.redBright:C.greenBright,fontWeight:800,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:3}}>
                      {overspend>0
                        ? `Based on your setup, you may be overspending by $${Math.round(overspend).toLocaleString()}/mo`
                        : `Based on your setup, you have ~$${Math.round(Math.max(0,surplus)).toLocaleString()}/mo to work with`}
                    </div>
                    <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>
                      {overspend>0
                        ? "Connect your bank to see exactly where it's going — and fix it."
                        : "Connect your bank to track it live and make it work harder."}
                    </div>
                    <div style={{marginTop:8,display:"flex",gap:8}}>
                      <button onClick={e=>{e.stopPropagation();setScreen("coach");}} style={{background:overspend>0?C.red+"22":C.green+"22",border:`1px solid ${overspend>0?C.red+"44":C.green+"44"}`,borderRadius:99,padding:"6px 14px",color:overspend>0?C.redBright:C.greenBright,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                        Ask Coach →
                      </button>
                      <button onClick={e=>{e.stopPropagation();window.dispatchEvent(new CustomEvent("flourish:settings"));}} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:99,padding:"6px 14px",color:C.mutedHi,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                        Connect Bank
                      </button>
                    </div>
                  </>
                ):(
                  <>
                    <span style={{color:C.goldBright,fontWeight:700,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Estimates based on your setup</span>
                    <span style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginLeft:6}}>Connect your bank for live data</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Income accuracy: folded into priority tile below */}

      {/* ═══════════════════════════════════════════════════════════════════
          BENTO GRID — rendered in user's custom order from dashLayout
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>

        {/* ── HERO: Safe to Spend ── full width ─────────────────────────── */}
        {isVisible('hero')&&(
        <div style={{...anim(60),cursor:"pointer",position:"relative",overflow:"hidden",borderRadius:28,
          background:overdraftImmediate
            ?(C.isDark?"linear-gradient(155deg,rgba(24,6,16,0.92) 0%,rgba(32,8,16,0.85) 45%,rgba(12,5,10,0.90) 100%)":"linear-gradient(155deg,rgba(255,240,244,0.96) 0%,rgba(255,232,238,0.94) 45%,rgba(244,241,235,0.96) 100%)")
            :sevenDayOverdraft
              ?(C.isDark?"linear-gradient(155deg,rgba(24,16,6,0.92) 0%,rgba(32,22,8,0.85) 45%,rgba(12,9,5,0.90) 100%)":"linear-gradient(155deg,rgba(255,248,236,0.96) 0%,rgba(255,244,220,0.94) 45%,rgba(244,241,235,0.96) 100%)")
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
              <div style={{width:6,height:6,borderRadius:"50%",background:heroColorBright,boxShadow:`0 0 10px ${heroColor}`,animation:"pulse 2.5s ease-in-out infinite"}}/>
              <span style={{color:heroColorBright+"99",fontSize:9,textTransform:"uppercase",letterSpacing:2.5,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>Today's Safe Limit</span>
              {data.bankConnected&&<span style={{color:heroColorBright+"55",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,letterSpacing:0.3}}>· live</span>}
            </div>
            <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:900,lineHeight:0.88,marginBottom:18,position:"relative",display:"inline-block"}}>
              <span style={{fontSize:24,color:heroColorBright+"77",verticalAlign:"top",marginTop:11,display:"inline-block",fontWeight:700}}>$</span>
              <span style={{fontSize:76,color:heroColorBright,letterSpacing:-4,textShadow:`0 0 60px ${heroColor}${C.isDark?"40":"30"}`,
                transition:"opacity .3s",opacity:isRefreshing?0.4:1}}>
                <CountUp to={safe} decimals={0} dur={300}/>
              </span>
              {/* Shimmer bar — signals live update in progress */}
              {isRefreshing&&(
                <div style={{position:"absolute",bottom:-6,left:0,right:0,height:2,borderRadius:99,
                  background:`linear-gradient(90deg,transparent 0%,${heroColorBright} 50%,transparent 100%)`,
                  backgroundSize:"200% 100%",animation:"shimmer 1.2s ease-in-out infinite"}}/>
              )}
            </div>
            {/* ── Timestamp — hidden during refresh to avoid contradiction ── */}
            {data.bankConnected&&!isRefreshing&&(()=>{
              const lastRefresh = parseInt(localStorage.getItem("flourish_last_refresh")||"0");
              if (!lastRefresh) return null;
              const mins = Math.round((Date.now()-lastRefresh)/60000);
              const label = mins < 1 ? "just updated" : mins < 60 ? `updated ${mins}m ago` : mins < 1440 ? `updated ${Math.floor(mins/60)}h ago` : "updated today";
              return (
                <div style={{color:heroColorBright+"44",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:500,letterSpacing:0.3,marginBottom:4}}>
                  {label}
                </div>
              );
            })()}
            {/* ── Inline math proof — one line, no tap required ── */}
            {(()=>{
              const accts = data.accounts||[];
              const chequing = accts.filter(a=>a.type==="checking"||a.type==="depository").reduce((s,a)=>s+(a.balance||0),0);
              const savings  = accts.filter(a=>a.type==="savings").reduce((s,a)=>s+(a.balance||0),0);
              const totalBalance = data.bankConnected ? (chequing||savings||bal)||0 : null;
              const billsTotal  = (data.bills||[]).reduce((s,b)=>s+parseFloat(b.amount||0),0);
              const bufferAmt   = monthlyIncome * 0.15;
              // Overdraft: show a focused warning instead of the math
              if (overdraft) return (
                <div style={{marginBottom:14}}>
                  <div style={{color:overdraftImmediate?C.redBright+"88":C.goldBright+"88",fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.5}}>
                    {overdraftImmediate
                      ? "Bills exceed your balance — tap to see forecast and fix it"
                      : "You will overdraft within 7 days — tap to see what's coming"}
                  </div>
                </div>
              );
              // Proof: max 2 parts — balance + biggest deduction. Scannable, not a math lesson.
              const balLabel = totalBalance!=null ? `$${totalBalance.toFixed(0)} balance` : `~$${(bal||0).toFixed(0)}`;
              const bigDeduct = billsTotal > bufferAmt
                ? (billsTotal > 0 ? `$${billsTotal.toFixed(0)} in bills` : null)
                : (bufferAmt > 0 ? `$${bufferAmt.toFixed(0)} safety buffer` : null);
              const proofLine = bigDeduct ? `${balLabel} · minus ${bigDeduct}` : balLabel;
              return (
                <div style={{marginBottom:14}}>
                  <div style={{color:heroColorBright+"66",fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:0.2,lineHeight:1.5}}>
                    {proofLine} → <strong style={{color:heroColorBright+"99"}}>${Math.max(0,safe).toFixed(0)} today</strong>
                  </div>
                </div>
              );
            })()}

            {/* ── Can I afford this? ──────────────────────────────────────
                Pure math. No AI call. Instant answer.
                Subtracts from safe amount → one of three states.
            ─────────────────────────────────────────────────────────────── */}
            {/* Afford widget: hidden if immediate overdraft (balance already negative-bound)
                but shown with warning if only 7-day forecast overdraft */}
            {!overdraftImmediate&&<div style={{marginTop:16,borderTop:`1px solid ${heroColor}18`,paddingTop:14}}
              onClick={e=>e.stopPropagation()}>
              {(()=>{
                // R1: Uses pre-calculated nextPaydayDay — no ForecastEngine call per keystroke
                const checkAfford = (raw) => {
                  const amt = parseFloat(raw.replace(/[^0-9.]/g,""));
                  // R10: cap at $99,999 — avoids absurd results
                  if (!amt || amt <= 0 || amt > 99999) { setAffordResult(null); return; }
                  const remaining = safe - amt;
                  // R2: Threshold is 10% of safe — scales with the user's actual situation
                  const tightThreshold = Math.max(10, safe * 0.10);
                  const waitMsg = nextPaydayDay === 1
                    ? "tomorrow"
                    : nextPaydayDay
                      ? `in ${nextPaydayDay} day${nextPaydayDay===1?"":"s"}`
                      : "after your next paycheck";
                  if (remaining >= tightThreshold) {
                    setAffordResult({
                      state: "yes",
                      msg: "Yes — you can afford this",
                      sub: `$${remaining.toFixed(0)} left in your safe limit today`,
                      color: C.green,
                    });
                  } else if (remaining >= 0) {
                    // R6: $0 remaining says "Nothing left" not "Only $0 left"
                    const leftMsg = remaining < 1 ? "Nothing left after this" : `Only $${remaining.toFixed(0)} left`;
                    setAffordResult({
                      state: "tight",
                      msg: "You can — but it's tight",
                      sub: `${leftMsg}. Hold everything else today.`,
                      color: C.gold,
                    });
                  } else {
                    setAffordResult({
                      state: "no",
                      msg: "Not right now",
                      sub: `This puts you $${Math.abs(remaining).toFixed(0)} over your limit. Wait ${waitMsg}.`,
                      color: C.red,
                    });
                  }
                };

                return (
                  <div>
                    <div style={{color:heroColorBright+"66",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:8}}>
                      Can I afford this?
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <div style={{position:"relative",flex:1}}>
                        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:affordFocused||affordInput?heroColorBright:C.muted,fontSize:14,fontWeight:700,pointerEvents:"none",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>$</span>
                        {/* R7: type=text+inputMode=decimal — shows numeric keyboard, respects placeholder */}
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={affordInput}
                          onFocus={()=>setAffordFocused(true)}
                          onBlur={()=>setAffordFocused(false)}
                          onChange={e=>{setAffordInput(e.target.value);checkAfford(e.target.value);}}
                          style={{
                            width:"100%",background:"rgba(255,255,255,0.06)",
                            border:`1px solid ${affordFocused?heroColor+"66":heroColor+"22"}`,
                            borderRadius:12,padding:"10px 12px 10px 26px",
                            color:C.cream,fontSize:15,fontWeight:700,
                            fontFamily:"'Plus Jakarta Sans',sans-serif",
                            outline:"none",transition:"border-color .15s",
                            /* R4: hide number spinners */
                            WebkitAppearance:"none",MozAppearance:"textfield",
                          }}
                        />
                      </div>
                      {affordInput&&(
                        <button onClick={()=>{setAffordInput("");setAffordResult(null);}}
                          style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${heroColor}22`,borderRadius:10,padding:"10px 12px",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",flexShrink:0,minHeight:40,minWidth:40,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Quick-tap presets — scaled to actual safe amount so every preset is meaningful */}
                    {!affordResult&&!affordInput&&safe>0&&(()=>{
                      // Generate 3 presets relative to safe: ~25%, ~50%, ~90%
                      // Round to nearest $5 for clean numbers, min $1
                      const p = (pct) => Math.max(1, Math.round((safe * pct) / 5) * 5);
                      const presets = [p(0.25), p(0.50), p(0.90)]
                        .filter((v,i,a) => a.indexOf(v) === i) // dedupe
                        .slice(0, 3);
                      return (
                        <div style={{display:"flex",gap:6,marginTop:8}}>
                          {presets.map(amt=>(
                            <button key={amt} onClick={()=>{setAffordInput(String(amt));checkAfford(String(amt));}}
                              style={{flex:1,background:heroColor+"0D",border:`1px solid ${heroColor}22`,borderRadius:10,
                                padding:"7px 0",color:heroColorBright+"88",fontSize:12,fontWeight:700,cursor:"pointer",
                                fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all .15s",minHeight:34}}
                              onMouseEnter={e=>{e.currentTarget.style.background=heroColor+"22";e.currentTarget.style.color=heroColorBright;}}
                              onMouseLeave={e=>{e.currentTarget.style.background=heroColor+"0D";e.currentTarget.style.color=heroColorBright+"88";}}>
                              ${amt}
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Result — tappable to dismiss */}
                    {affordResult&&(
                      <div onClick={()=>{setAffordResult(null);setAffordInput("");}}
                        style={{
                          marginTop:10,padding:"10px 14px",borderRadius:12,
                          background:affordResult.color+"14",
                          border:`1px solid ${affordResult.color}33`,
                          display:"flex",alignItems:"flex-start",gap:10,
                          animation:"fadeIn 0.2s ease",
                          cursor:"pointer",
                        }}>
                        <span style={{fontSize:16,flexShrink:0,marginTop:1}}>
                          {affordResult.state==="yes"?"✅":affordResult.state==="tight"?"⚠️":"❌"}
                        </span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:affordResult.state==="yes"?C.greenBright:affordResult.state==="tight"?C.goldBright:C.redBright,fontWeight:800,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.3}}>
                            {affordResult.msg}
                          </div>
                          <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:3,lineHeight:1.5}}>
                            {affordResult.sub}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>}

            {/* ── Bottom row: actions + tap affordance ── */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {onWhatIf&&<button onClick={e=>{e.stopPropagation();onWhatIf();}} style={{background:"rgba(255,255,255,0.08)",border:`1px solid rgba(255,255,255,0.12)`,color:C.cream,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,fontSize:10,padding:"6px 12px",borderRadius:99,cursor:"pointer",minHeight:36}}>What if? →</button>}
              </div>
              {/* Tap affordance — prominent pill, clear action */}
              <div onClick={e=>{e.stopPropagation();overdraft?setScreen("plan"):setShowTransparency(true);}}
                style={{display:"flex",alignItems:"center",gap:6,
                  background:`linear-gradient(135deg,${heroColor}22,${heroColor}12)`,
                  border:`1px solid ${heroColor}44`,
                  borderRadius:99,padding:"10px 16px",cursor:"pointer",minHeight:44,
                  transition:"all .15s",boxShadow:`0 2px 12px ${heroColor}20`}}
                onMouseEnter={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${heroColor}33,${heroColor}22)`;e.currentTarget.style.boxShadow=`0 4px 20px ${heroColor}35`;}}
                onMouseLeave={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${heroColor}22,${heroColor}12)`;e.currentTarget.style.boxShadow=`0 2px 12px ${heroColor}20`;}}>
                <span style={{color:heroColorBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,letterSpacing:0.2}}>
                  {overdraft?"Fix this":"Why this number?"}
                </span>
                <span style={{color:heroColorBright,fontSize:14,lineHeight:1}}>→</span>
              </div>
            </div>
            {overdraft&&<div style={{marginTop:12,padding:"10px 14px",background:C.red+"18",borderRadius:14,border:`1px solid ${C.red}33`,color:C.cream,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              <strong style={{color:C.redBright}}>Overdraft risk</strong> — bills exceed your balance. Hold non-essential spending.
            </div>}
          </div>
        </div>
        )}

        {/* ── BENTO ROW 1: 3 mini stat tiles inside 2-col span ──────────── */}
        {isVisible('bento')&&(
        <div style={{...anim(110),display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[
            {label:"Due Soon",value:`$${(soonTotal||0).toFixed(0)}`,sub:`next 10 days`,color:C.gold,icon:"calendar",screen:"plan"},
            {label:totalDebt>0?"Total Debt":"Debt Free!",value:totalDebt>0?`$${((totalDebt||0)/1000).toFixed(1)}k`:"🎉",sub:totalDebt>0?`${(data.debts||[]).length} accounts`:"Amazing!",color:C.red,icon:"trendUp",screen:"goals",tab:"sim"},
            {label:"Net Worth",value:`${netWorth>=0?"+":""}$${(Math.abs(netWorth)/1000).toFixed(1)}k`,sub:"total net worth",color:C.teal,icon:"chartUp",screen:"goals",tab:"worth"},
          ].map((s,i)=>(
            <div key={i} onClick={()=>{if(s.tab&&setGoalsTab)setGoalsTab(s.tab);setScreen(s.screen);}} style={{...glass(s.color),borderRadius:20,padding:"14px 12px 12px",textAlign:"center",position:"relative",overflow:"hidden",cursor:"pointer",transition:"transform .2s, box-shadow .2s"}}
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
        )}

        {/* ── HEALTH + STREAK — 2-col row ─────────────────────────────────── */}
        {isVisible('healthrow')&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
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
        <div style={{...anim(140),...glass(C.gold),borderRadius:24,padding:"18px 16px 16px",position:"relative",overflow:"hidden",cursor:"pointer"}} onClick={()=>{if(setGoalsTab)setGoalsTab("goals");setScreen("goals");}}>
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

        </div>
        )}
        {/* ── SINGLE VOICE: priority-filtered action tile ──────────────────
        {isVisible('action')&&(
            Only ONE system speaks at a time. Priority order:
            0. Income not set / suspiciously high → data quality, affects everything
            1. Overdraft risk (from forecast)     → urgent, act now
            2. Urgent bill ≤2 days               → time-sensitive
            3. Payday                            → money decision moment
            Nothing else competes here.
        ─────────────────────────────────────────────────────────────────── */}
        {(()=>{
          // Uses sevenDayRisk pre-calculated above — no duplicate ForecastEngine call
          const isForecastOverdraft = sevenDayOverdraft && sevenDayRisk.length > 0;

          // Priority 0 — income data quality (affects every calculation)
          const incomeCheck = (data.incomes||[]).filter(i=>parseFloat(i.amount)>0);
          const toMoCheck = (amt,freq)=>{const a=parseFloat(amt||0);return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="monthly"?a:a*2.167;};
          const totalMoCheck = incomeCheck.reduce((s,i)=>s+toMoCheck(i.amount,i.freq),0);
          const incomeUsingDefault = incomeCheck.length === 0;
          const incomeSuspicious = totalMoCheck > 25000;
          if (incomeUsingDefault || incomeSuspicious) {
            return (
              <div style={{...anim(170),background:C.gold+"0D",border:`1px solid ${C.gold}33`,borderRadius:20,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>setShowTransparency(true)}>
                <div style={{width:44,height:44,borderRadius:14,background:C.gold+"18",border:`1px solid ${C.gold}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>💰</div>
                <div style={{flex:1}}>
                  <div style={{color:C.goldBright,fontWeight:800,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                    {incomeUsingDefault?"Income not set — every number is an estimate":`Income showing $${totalMoCheck.toLocaleString()}/mo — does this look right?`}
                  </div>
                  <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>
                    {incomeUsingDefault?"Tap to set your income — takes 30 seconds":"Tap to see how this is calculated"}
                  </div>
                </div>
                <span style={{color:C.goldBright,fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",flexShrink:0}}>Fix →</span>
              </div>
            );
          }

          // Priority 1 — forecast overdraft within 7 days
          if (isForecastOverdraft) {
            const firstNeg = sevenDayRisk[0];
            return (
              <div style={{...anim(170),background:"rgba(255,60,80,0.10)",border:`1px solid ${C.red}44`,borderRadius:20,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>setScreen("plan")}>
                <div style={{width:44,height:44,borderRadius:14,background:C.red+"20",border:`1px solid ${C.red}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>⚠️</div>
                <div style={{flex:1}}>
                  <div style={{color:C.redBright,fontWeight:800,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Projected overdraft in {firstNeg.day} day{firstNeg.day===1?"":"s"}</div>
                  <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>Your balance will go negative — tap to see which bills cause this and fix it now.</div>
                </div>
                <span style={{color:C.redBright,fontSize:18,fontWeight:700}}>Fix →</span>
              </div>
            );
          }

          // Priority 2 — urgent bill ≤2 days
          if (urgentBill) {
            return (
              <div style={{...anim(170),background:"rgba(232,184,75,0.08)",border:`1px solid ${C.gold}44`,borderRadius:20,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>setScreen("plan")}>
                <div style={{width:44,height:44,borderRadius:14,background:C.gold+"18",border:`1px solid ${C.gold}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>📅</div>
                <div style={{flex:1}}>
                  <div style={{color:C.goldBright,fontWeight:800,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{urgentBill.name} due in {parseInt(urgentBill.date)-today} day{parseInt(urgentBill.date)-today===1?"":"s"}</div>
                  <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>${urgentBill.amount} coming out · Tap to see full forecast</div>
                </div>
                <span style={{color:C.goldBright,fontSize:18}}>→</span>
              </div>
            );
          }

          // Priority 3 — payday
          if (isPayday) {
            return (
              <div style={{...anim(170),background:"rgba(0,204,133,0.07)",border:`1px solid ${C.green}33`,borderRadius:20,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>setScreen("goals")}>
                <div style={{width:44,height:44,borderRadius:14,background:C.green+"18",border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>💸</div>
                <div style={{flex:1}}>
                  <div style={{color:C.greenBright,fontWeight:800,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Payday — save before you spend</div>
                  <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>Transfer ${((safe||0)*0.2).toFixed(0)} now and you'll barely notice it · See your goals</div>
                </div>
                <span style={{color:C.greenBright,fontSize:18}}>→</span>
              </div>
            );
          }

          // Nothing urgent — tile stays silent
          return null;
        })()}

        {/* ── NET WORTH SPARKLINE — full width ──────────────────────────── */}
        {isVisible('networth')&&<div onClick={()=>{setScreen("goals");if(setGoalsTab)setGoalsTab("worth");}} style={{...anim(190),...tileStyle('networth'),...glass(C.teal),borderRadius:22,padding:"18px 20px 16px",cursor:"pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{...label11(C.muted),marginBottom:4}}>Net Worth Trend</div>
              <div style={{color:C.tealBright,fontWeight:900,fontSize:26,fontFamily:"'Playfair Display',Georgia,serif",lineHeight:1,letterSpacing:-1}}>{netWorth>=0?"+":""}<span style={{fontSize:14,verticalAlign:"super",marginRight:1}}>$</span><CountUp to={Math.abs(netWorth)} decimals={0}/></div>
            </div>
            <div style={{background:C.teal+"20",border:`1px solid ${C.teal}33`,borderRadius:99,padding:"4px 12px",color:C.tealBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>
              {nwHistory.length>1
                ? (() => { const delta=nwHistory[nwHistory.length-1].v - nwHistory[0].v;
                    return `${delta>=0?"↑ +":"↓ –"}$${Math.abs(delta/1000).toFixed(1)}k since ${nwHistory[0].month}`; })()
                : "Track your net worth over time"}
            </div>
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
          {nwHistory.length > 1 && <NetWorthSparkline history={nwHistory} color={C.teal}/>}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            {(nwHistory.length>1 ? nwHistory : [{month:"—"},{month:"—"},{month:"—"},{month:"Now"}]).map((h,i,arr)=>(
              <span key={i} style={{color:i===arr.length-1?C.tealBright:C.muted,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:i===arr.length-1?700:400}}>
                {h.month?.slice(5)||h.month||"—"}
              </span>
            ))}
          </div>
        </div>}

        {/* ── DECISION ENGINE ───────────────────────────────────────────── */}
        {isVisible('decision')&&<div style={{...anim(210),...tileStyle('decision'),background:C.isDark?"rgba(155,125,255,0.04)":"rgba(155,125,255,0.03)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:`1px solid ${C.purple}18`,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",borderRadius:22,overflow:"hidden"}}>
          <DecisionEngine data={data} safe={safe} bal={bal} monthlyIncome={monthlyIncome} soonBills={soonBills} todayDate={today} setScreen={setScreen}/>
        </div>}

        {/* ── OVER-BUDGET NUDGE (dashboard) ─────────────────────────────── */}
        {(()=>{
          const budgets = data.budgets||{};
          if(!Object.keys(budgets).length) return null;
          const now = new Date();
          const monthTxns = (data.transactions||[]).filter(t=>{
            try{const d=new Date(t.date+"T12:00:00");return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()&&t.amount>0;}catch{return false;}
          });
          const monthSpend = {};
          monthTxns.forEach(t=>{ monthSpend[t.cat]=(monthSpend[t.cat]||0)+t.amount; });
          const overCats = Object.entries(budgets).filter(([cat,limit])=>(monthSpend[cat]||0)>limit);
          if(!overCats.length) return null;
          const totalOver = overCats.reduce((s,[cat,limit])=>s+((monthSpend[cat]||0)-limit),0);
          const catEmojis={"Groceries":"🛒","Coffee & Dining":"☕","Gas & Transport":"🚗","Shopping":"🛍️","Clothing":"👗","Subscriptions":"📱","Health":"💊","Personal Care":"🧴","Entertainment":"🎬","Hobbies & Sports":"🎯","Kids & Extracurricular":"🧒","Kids & Activities":"🧒","Travel":"✈️","Home":"🏠","Education":"📚"};
          return (
            <div style={{...anim(215),background:"rgba(255,80,80,0.06)",backdropFilter:"blur(20px)",
              WebkitBackdropFilter:"blur(20px)",border:`1px solid ${C.red}33`,borderRadius:16,
              padding:"12px 14px",cursor:"pointer"}} onClick={()=>setScreen("spend")}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{color:C.redBright,fontWeight:800,fontSize:13}}>
                  ⚠️ Over budget · ${Math.round(totalOver).toLocaleString()} this month
                </div>
                <span style={{color:C.muted,fontSize:11}}>View →</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {overCats.map(([cat,limit])=>(
                  <span key={cat} style={{background:C.red+"22",border:`1px solid ${C.red}33`,
                    borderRadius:99,padding:"3px 8px",fontSize:10,color:C.redBright,fontWeight:600}}>
                    {catEmojis[cat]||""} {cat} +${Math.round((monthSpend[cat]||0)-limit)}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── AUTOPILOT ─────────────────────────────────────────────────── */}
        {isVisible('autopilot')&&<div style={{...anim(225),...tileStyle('autopilot'),background:C.isDark?"rgba(77,168,255,0.04)":"rgba(77,168,255,0.03)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:`1px solid ${C.blue}18`,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",borderRadius:22,overflow:"hidden"}}>
          <AutopilotCard data={data} setScreen={setScreen}/>
        </div>}

        {/* ── TIME MACHINE — forecast graph ─────────────────────────────── */}
        {isVisible('forecast')&&<div style={{...anim(240),...tileStyle('forecast'),...glass(C.green),borderRadius:22,padding:"18px 18px 14px"}}>
          <TimeMachine data={data}/>
        </div>}

        {/* ── OPPORTUNITY DETECTOR ─────────────────────────────────────── */}
        {isVisible('opportunity')&&<div style={{...anim(255),...tileStyle('opportunity'),background:C.isDark?"rgba(232,184,75,0.04)":"rgba(232,184,75,0.03)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:`1px solid ${C.gold}18`,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",borderRadius:22,overflow:"hidden"}}>
          <OpportunityDetector data={data} setScreen={setScreen} setGoalsTab={setGoalsTab}/>
        </div>}

        {/* ── HEALTH SCORE PILLARS: progressive disclosure ───────────────── */}
        {isVisible('health')&&<div style={{...anim(270),...tileStyle('health'),...glass(scoreBase),borderRadius:22,padding:"14px 18px",cursor:"pointer",transition:"border-color .2s"}}
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
        </div>}

        {/* ── CREDIT SCORE ──────────────────────────────────────────────── */}
        {isVisible('credit')&&data.profile?.creditKnown&&(()=>{
          const score=data.profile.creditScore||720;
          const sc=score>=750?C.greenBright:score>=700?C.tealBright:score>=650?C.goldBright:score>=600?C.orangeBright:C.redBright;
          const scBase=score>=750?C.green:score>=700?C.teal:score>=650?C.gold:score>=600?C.orange:C.red;
          const lbl=score>=750?"Excellent":score>=700?"Good":score>=650?"Fair":score>=600?"Poor":"Very Poor";
          return <div style={{...anim(285),...glass(scBase),borderRadius:22,padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,overflow:"hidden",position:"relative"}} onClick={()=>setScreen("goals")}>
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
          <div onClick={onUpgrade} style={{...anim(300),...glass(C.purple,C.purple+"33"),borderRadius:20,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}
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
        {isVisible('quicknav')&&<div style={{...anim(320),...tileStyle('quicknav'),display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {label:"2-Week Forecast",icon:"calendar",screen:"plan",color:C.teal,sub:"Cash flow ahead"},
            {label:"Debt Simulator",icon:"trendUp",screen:"goals",tab:"sim",color:C.purple,sub:"Drag to freedom date"},
            {label:"AI Coach",icon:"sparkles",screen:"coach",color:C.green,sub:"Ask anything · powered by Claude",hero:true},
            {label:data.profile.status==="single"?"Solo Check-In":"Money Meeting",icon:data.profile.status==="single"?"🧘":"💑",screen:"family",color:C.pink,sub:"Weekly ritual"},
          ].concat(onWhatIf?[{label:"What If?",icon:"sparkles",screen:null,color:C.teal,sub:"Simulate any decision",whatIf:true}]:[]).map((a,i)=>(
            <button key={a.label} onClick={()=>a.whatIf?onWhatIf():(a.tab&&setGoalsTab&&setGoalsTab(a.tab),setScreen(a.screen))}
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
        </div>}

        {/* ── URGENT ALERT ──────────────────────────────────────────────── */}
        {INIT_NOTIFS.filter(n=>!n.read&&n.type==="urgent").slice(0,1).map(n=>(
          <div key={n.id} style={{...anim(340),...glass(C.red,C.red+"33"),borderRadius:18,padding:"14px 16px",display:"flex",gap:12,alignItems:"flex-start",cursor:"pointer"}} onClick={()=>setShowNotifs(true)}>
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
// ─── BILL MANAGER ────────────────────────────────────────────────────────────
const BILL_TEMPLATES = {
  CA:[
    {icon:"🏠",name:"Rent",           cat:"housing",   hint:"Monthly rent"},
    {icon:"🏡",name:"Mortgage",        cat:"housing",   hint:"Monthly mortgage"},
    {icon:"⚡",name:"Hydro / Electricity",cat:"utilities",hint:"Hydro One, Toronto Hydro…"},
    {icon:"🔥",name:"Gas / Heating",   cat:"utilities", hint:"Enbridge, Union Gas…"},
    {icon:"💧",name:"Water",           cat:"utilities", hint:"Municipal water bill"},
    {icon:"📱",name:"Phone",           cat:"telecom",   hint:"Bell, Rogers, Telus…"},
    {icon:"🌐",name:"Internet",        cat:"telecom",   hint:"Home internet service"},
    {icon:"🚗",name:"Car Payment",     cat:"transport", hint:"Vehicle loan payment"},
    {icon:"🛡️",name:"Car Insurance",  cat:"insurance", hint:"Monthly auto insurance"},
    {icon:"🏠",name:"Home Insurance",  cat:"insurance", hint:"Home or tenant insurance"},
    {icon:"🏥",name:"Health / Dental", cat:"insurance", hint:"Extended health benefits"},
    {icon:"💳",name:"Credit Card",     cat:"debt",      hint:"Minimum or full payment"},
    {icon:"🎓",name:"Student Loan",    cat:"debt",      hint:"OSAP or private loan"},
    {icon:"🏋️",name:"Gym",            cat:"lifestyle", hint:"Monthly membership"},
    {icon:"🎵",name:"Streaming",       cat:"lifestyle", hint:"Netflix, Spotify…"},
    {icon:"☁️",name:"Cloud Storage",  cat:"lifestyle", hint:"iCloud, Google One…"},
  ],
  US:[
    {icon:"🏠",name:"Rent",            cat:"housing",   hint:"Monthly rent"},
    {icon:"🏡",name:"Mortgage",         cat:"housing",   hint:"Monthly mortgage"},
    {icon:"⚡",name:"Electricity",      cat:"utilities", hint:"Electric utility"},
    {icon:"🔥",name:"Gas",              cat:"utilities", hint:"Natural gas bill"},
    {icon:"💧",name:"Water",            cat:"utilities", hint:"Municipal water"},
    {icon:"📱",name:"Phone",            cat:"telecom",   hint:"AT&T, Verizon, T-Mobile…"},
    {icon:"🌐",name:"Internet",         cat:"telecom",   hint:"Comcast, Spectrum…"},
    {icon:"🚗",name:"Car Payment",      cat:"transport", hint:"Vehicle loan payment"},
    {icon:"🛡️",name:"Car Insurance",   cat:"insurance", hint:"Monthly auto insurance"},
    {icon:"🏥",name:"Health Insurance", cat:"insurance", hint:"Monthly health premium"},
    {icon:"💳",name:"Credit Card",      cat:"debt",      hint:"Minimum or full payment"},
    {icon:"🎓",name:"Student Loan",     cat:"debt",      hint:"Federal or private loan"},
    {icon:"🏋️",name:"Gym",             cat:"lifestyle", hint:"Monthly membership"},
    {icon:"🎵",name:"Streaming",        cat:"lifestyle", hint:"Netflix, Hulu, Spotify…"},
  ],
};
const BILL_CAT_COLORS={housing:"#00CC85",utilities:"#E8B84B",telecom:"#4DA8FF",transport:"#FF8C42",insurance:"#9B7DFF",debt:"#FF4F6A",lifestyle:"#00C8E0"};

function BillManager({data, setAppData, onClose}){
  const [adding, setAdding] = useState(null);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("1");
  const [customName, setCustomName] = useState("");
  const [saved, setSaved] = useState("");
  const country = data.profile?.country||"CA";
  const templates = BILL_TEMPLATES[country]||BILL_TEMPLATES.CA;
  const existingNames = new Set((data.bills||[]).map(b=>b.name.toLowerCase()));

  const saveBill = name => {
    if(!amount||!name) return;
    setAppData(prev=>({...prev, bills:[...(prev.bills||[]), {name, amount, date:dueDate}]}));
    setSaved(name); setTimeout(()=>setSaved(""), 2000);
    setAdding(null); setAmount(""); setDueDate("1"); setCustomName("");
  };
  const removeBill = i => setAppData(prev=>({...prev, bills:(prev.bills||[]).filter((_,x)=>x!==i)}));
  const updateBill = (i,field,val) => setAppData(prev=>({...prev, bills:(prev.bills||[]).map((b,x)=>x===i?{...b,[field]:val}:b)}));
  const ord = n => { const v=parseInt(n); return [11,12,13].includes(v)?"th":["st","nd","rd"][v%10-1]||"th"; };

  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)",display:"flex",alignItems:window.innerWidth>900?"center":"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{width:"100%",maxWidth:520,background:C.bg,borderRadius:"24px 24px 0 0",maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 -12px 48px rgba(0,0,0,0.5)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"14px 20px 12px",flexShrink:0,borderBottom:`1px solid ${C.border}`}}>
          <div style={{width:36,height:4,borderRadius:99,background:C.border,margin:"0 auto 12px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:C.cream,fontWeight:800,fontSize:17}}>Your Bills</div>
              <div style={{color:C.muted,fontSize:12,marginTop:2}}>Add regular expenses to power your forecast</div>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer",padding:"4px 8px",lineHeight:1}}>✕</button>
          </div>
        </div>
        <div style={{overflowY:"auto",flex:1,padding:"16px 20px 32px"}}>
          {(data.bills||[]).length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>Your Current Bills</div>
              {(data.bills||[]).map((b,i)=>{
                const hasArrears = parseFloat(b.arrears||0) > 0;
                return (
                <div key={i} style={{background:C.card,borderRadius:16,marginBottom:10,border:`1px solid ${hasArrears?C.gold+"44":C.border}`,overflow:"hidden"}}>
                  {/* Main row */}
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:C.cream,fontWeight:700,fontSize:13}}>{b.name}</div>
                      {hasArrears&&(
                        <div style={{color:C.goldBright,fontSize:10,fontWeight:700,marginTop:2}}>
                          ⚠ ${parseFloat(b.arrears).toFixed(2)} in arrears
                        </div>
                      )}
                    </div>
                    {/* Amount — always editable */}
                    <div>
                      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:3,textAlign:"center"}}>Monthly</div>
                      <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",width:80}}>
                        <span style={{color:C.muted,fontSize:11,padding:"0 4px 0 6px"}}>$</span>
                        <input value={b.amount} onChange={e=>updateBill(i,"amount",e.target.value)}
                          type="number" inputMode="decimal"
                          style={{flex:1,background:"none",border:"none",padding:"7px 4px 7px 0",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none",width:0,fontWeight:700}}/>
                      </div>
                    </div>
                    {/* Due date — always editable */}
                    <div>
                      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:3,textAlign:"center"}}>Due</div>
                      <select value={b.date||"1"} onChange={e=>updateBill(i,"date",e.target.value)}
                        style={{background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 6px",color:C.cream,fontSize:12,fontFamily:"inherit",outline:"none",minHeight:33}}>
                        {Array.from({length:28},(_,d)=><option key={d+1} value={String(d+1)}>{d+1}{ord(d+1)}</option>)}
                      </select>
                    </div>
                    <button onClick={()=>removeBill(i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:15,padding:"4px 6px",minWidth:32,minHeight:32,flexShrink:0}}>✕</button>
                  </div>
                  {/* Arrears row — expandable */}
                  <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 14px",background:C.cardAlt+"88"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:1}}>Amount currently owed (arrears)</div>
                        <div style={{color:C.muted,fontSize:10,lineHeight:1.4}}>
                          {hasArrears
                            ? "Payments from Transactions will reduce this balance."
                            : "Behind on this bill? Enter the total you owe — not the monthly amount."}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${hasArrears?C.gold+"66":C.border}`,borderRadius:8,overflow:"hidden",width:96}}>
                        <span style={{color:C.muted,fontSize:11,padding:"0 4px 0 6px"}}>$</span>
                        <input value={b.arrears||""} onChange={e=>updateBill(i,"arrears",e.target.value)}
                          type="number" inputMode="decimal" placeholder="0.00"
                          style={{flex:1,background:"none",border:"none",padding:"7px 4px 7px 0",color:hasArrears?C.goldBright:C.cream,fontSize:13,fontFamily:"inherit",outline:"none",width:0,fontWeight:700}}/>
                      </div>
                    </div>
                  </div>
                </div>
              );})}
            </div>
          )}
          {adding&&(
            <div style={{background:C.cardAlt,borderRadius:16,padding:"14px 16px",marginBottom:16,border:`1px solid ${C.green}44`}}>
              <div style={{color:C.cream,fontWeight:700,fontSize:14,marginBottom:12}}>{adding.icon} {adding.name==="__custom__"?customName||"Custom Bill":adding.name}</div>
              {adding.name==="__custom__"&&(
                <input value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="Bill name…"
                  style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 12px",color:C.cream,fontSize:13,fontFamily:"inherit",marginBottom:8,boxSizing:"border-box"}}/>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div>
                  <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Monthly Amount</div>
                  <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.green}`,borderRadius:10,overflow:"hidden"}}>
                    <span style={{color:C.muted,padding:"0 8px",fontSize:13}}>$</span>
                    <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" placeholder="0.00" autoFocus
                      style={{flex:1,background:"none",border:"none",padding:"10px 8px 10px 0",color:C.cream,fontSize:14,fontFamily:"inherit",outline:"none",fontWeight:700}}/>
                  </div>
                </div>
                <div>
                  <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Day Due</div>
                  <select value={dueDate} onChange={e=>setDueDate(e.target.value)}
                    style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 12px",color:C.cream,fontSize:13,fontFamily:"inherit"}}>
                    {Array.from({length:28},(_,i)=><option key={i+1} value={String(i+1)}>{i+1}{ord(i+1)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>saveBill(adding.name==="__custom__"?customName:adding.name)}
                  disabled={!amount||(adding.name==="__custom__"&&!customName)}
                  style={{flex:1,background:amount?C.green:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:700,fontSize:13,cursor:amount?"pointer":"default",fontFamily:"inherit",opacity:(!amount||(adding.name==="__custom__"&&!customName))?0.4:1}}>
                  Add Bill ✓
                </button>
                <button onClick={()=>{setAdding(null);setAmount("");setDueDate("1");setCustomName("");}}
                  style={{background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 16px",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>Common Bills — Tap to Add</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            {templates.filter(t=>!existingNames.has(t.name.toLowerCase())).map((t,i)=>{
              const clr=BILL_CAT_COLORS[t.cat]||C.teal;
              return(
                <button key={i} onClick={()=>{setAdding(t);setAmount("");setDueDate("1");}}
                  style={{background:clr+"12",border:`1px solid ${clr}33`,borderRadius:14,padding:"12px 14px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=clr+"88";e.currentTarget.style.background=clr+"22";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=clr+"33";e.currentTarget.style.background=clr+"12";}}>
                  <div style={{fontSize:20,marginBottom:4}}>{t.icon}</div>
                  <div style={{color:C.cream,fontWeight:600,fontSize:12,lineHeight:1.3}}>{t.name}</div>
                  <div style={{color:C.muted,fontSize:10,marginTop:2}}>{t.hint}</div>
                </button>
              );
            })}
          </div>
          <button onClick={()=>{setAdding({icon:"📝",name:"__custom__"});setAmount("");setDueDate("1");}}
            style={{width:"100%",background:"none",border:`1px dashed ${C.border}`,borderRadius:14,padding:"13px",color:C.muted,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            + Add custom bill
          </button>
          {saved&&<div style={{textAlign:"center",color:C.greenBright,fontWeight:700,fontSize:13,marginTop:12}}>✓ {saved} added!</div>}
        </div>
      </div>
    </div>
  );
}


// ─── SHARED SCREEN HEADER ────────────────────────────────────────────────────
// Consistent back button + title + optional CTA on every main screen
function ScreenHeader({title, subtitle, onBack, cta, onCta, ctaColor}) {
  const C_ = typeof C !== "undefined" ? C : {};
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
        {onBack&&(
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:12,
            width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,
            color:C.cream,fontSize:18,transition:"all .15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.10)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}>
            ←
          </button>
        )}
        <div style={{minWidth:0}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:C.cream,letterSpacing:-0.5,lineHeight:1.15}}>{title}</div>
          {subtitle&&<div style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>{subtitle}</div>}
        </div>
      </div>
      {cta&&onCta&&(
        <button onClick={onCta} style={{background:(ctaColor||C.green)+"22",border:`1px solid ${(ctaColor||C.green)}44`,
          borderRadius:99,padding:"8px 14px",color:ctaColor||C.greenBright,fontSize:11,fontWeight:700,
          cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",flexShrink:0,minHeight:36}}>
          {cta}
        </button>
      )}
    </div>
  );
}

function PlanAhead({data, setAppData, setScreen}){
  const [range,setRange]=useState(14);
  const [showBillManager,setShowBillManager]=useState(false);
  const [connected,setConnected]=useState([]);  // Start empty — user connects their own
  const [showConnect,setShowConnect]=useState(false);
  const [connecting,setConnecting]=useState(null);
  const [customProviders,setCustomProviders]=useState([]);
  const [showCustomForm,setShowCustomForm]=useState(false);
  const [newProvider,setNewProvider]=useState({name:"",amount:"",icon:"🏦"});
  const [expandedPlanDay, setExpandedPlanDay] = useState(null);
  const PROVIDERS=[
    {name:"Netflix",icon:"🎬",color:"#E50914",amount:"18.99"},{name:"Spotify",icon:"🎵",color:C.green,amount:"11.99"},
    {name:"Amazon Prime",icon:"📦",color:"#FF9900",amount:"9.99"},{name:"Hydro One",icon:"⚡",color:C.gold,amount:"124.00"},
    {name:"Bell / Rogers",icon:"📱",color:C.blue,amount:"65.00"},{name:"Disney+",icon:"✨",color:"#113CCF",amount:"13.99"},
    {name:"Apple iCloud",icon:"☁️",color:"#888",amount:"3.99"},{name:"Planet Fitness",icon:"💪",color:C.purple,amount:"25.00"},
    {name:"Enbridge Gas",icon:"🔥",color:C.orange,amount:"89.00"},
    ...customProviders,
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
  // Use actual per-paycheque amount based on income frequency
  const _retFreq = (data.incomes||[])[0]?.freq||"biweekly";
  const _retMoInc = FinancialCalcEngine.cashFlow(data).monthlyIncome;
  const income = _retFreq==="monthly"?_retMoInc:_retFreq==="semimonthly"?_retMoInc/2:_retFreq==="weekly"?_retMoInc/4.333:_retMoInc/2.167;
  const minBalance = Math.min(...days.map(d => d.balance));

  const hasBills = (data.bills||[]).length > 0;
  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    {showBillManager&&setAppData&&<BillManager data={data} setAppData={setAppData} onClose={()=>setShowBillManager(false)}/>}
    {!hasBills&&<EmptyState icon="📅" title="No bills tracked yet" body="Add your recurring bills to see a personalized cash-flow forecast." action="Add Bills →" onAction={()=>setShowBillManager(true)} color={C.teal}/>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <ScreenHeader title="Plan Ahead" subtitle="Your financial crystal ball" onBack={setScreen?()=>setScreen("home"):null}/>
      <div style={{display:"flex",gap:6,background:C.surface,borderRadius:12,padding:3,flexShrink:0,marginBottom:16}}>{[7,14].map(r=><button key={r} onClick={()=>setRange(r)} style={{background:range===r?C.teal+"28":"transparent",border:`1px solid ${range===r?C.teal+"55":"transparent"}`,color:range===r?C.tealBright:C.muted,borderRadius:10,padding:"6px 16px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",transition:"all .22s"}}>{r}d</button>)}</div>
    </div>
    {(()=>{
      const _fbal = SafeSpendEngine.calculate(data).balance;
      const _favg = FinancialCalcEngine.avgDailySpend(data);
      const _ffreq = (data.incomes||[])[0]?.freq||"biweekly";
      const _fIncome = FinancialCalcEngine.cashFlow(data).monthlyIncome;
      const _fPay = _ffreq==="monthly"?_fIncome:_ffreq==="semimonthly"?_fIncome/2:_ffreq==="weekly"?_fIncome/4.333:_fIncome/2.167;
      return (
        <div style={{background:C.isDark?"rgba(255,255,255,0.03)":C.surface,borderRadius:14,padding:"12px 16px",border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:8}}>
            <span style={{fontSize:12,flexShrink:0,marginTop:1}}>ℹ️</span>
            <span style={{color:C.muted,fontSize:10.5,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>Forecast projects forward from today using your bank balance, income schedule, bills, and average daily spending. Not financial advice.</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[
              ["Starting balance", `$${(_fbal||0).toFixed(0)}`],
              ["Est. daily spend", `$${(_favg||0).toFixed(0)}/day`],
              ["Pay frequency", _ffreq],
              ["Est. paycheque", `$${(_fPay||0).toFixed(0)}`],
            ].map(([lbl,val])=>(
              <div key={lbl} style={{background:C.card,borderRadius:10,padding:"7px 10px",border:`1px solid ${C.border}`}}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>{lbl}</div>
                <div style={{color:C.cream,fontSize:12,fontWeight:700}}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      );
    })()}
    {willGoNeg&&<div style={{background:C.redDim,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.red}55`}}>
      <div style={{color:C.redBright,fontWeight:800,marginBottom:4}}>Projected Overdraft</div>
      <div style={{color:C.cream,fontSize:13,lineHeight:1.5}}>Balance hits <strong style={{color:C.red}}>${(minBalance||0).toFixed(2)}</strong> before your next deposit. Reduce spending now.</div>
    </div>}
    <Card style={{border:`1px solid ${C.teal}33`,background:`linear-gradient(135deg,rgba(0,200,224,0.05) 0%,${C.card} 100%)`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:connected.length>0?10:0}}>
        <div><div style={{color:C.tealBright,fontWeight:700,fontSize:14}}>📅 Bill Autopilot</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{(data.bills||[]).length} bills tracked</div></div>
          {setAppData&&<button onClick={()=>setShowBillManager(true)} style={{background:C.teal+"22",border:`1px solid ${C.teal}44`,color:C.tealBright,borderRadius:99,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>+ Add Bill</button>}
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
        {/* Add custom provider */}
        {!showCustomForm&&<button onClick={()=>setShowCustomForm(true)} style={{background:C.gold+"14",border:`1px dashed ${C.gold}55`,borderRadius:12,padding:"10px 14px",color:C.goldBright,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:"inherit"}}>
          <span style={{fontSize:16}}>➕</span><span>Add custom bill / provider…</span>
        </button>}
        {showCustomForm&&<div style={{background:C.card,borderRadius:14,padding:"14px",border:`1px solid ${C.gold}44`}}>
          <div style={{color:C.goldBright,fontWeight:700,fontSize:13,marginBottom:10}}>Custom Provider</div>
          <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
            <input value={newProvider.icon} onChange={e=>setNewProvider(v=>({...v,icon:e.target.value}))} placeholder="🏦" maxLength={2}
              style={{width:44,background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px",color:C.cream,fontSize:18,textAlign:"center",fontFamily:"inherit"}}/>
            <input value={newProvider.name} onChange={e=>setNewProvider(v=>({...v,name:e.target.value}))} placeholder="e.g. Gym, Netflix, Internet"
              style={{flex:2,background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.cream,fontSize:13,fontFamily:"inherit"}}/>
            <input value={newProvider.amount} onChange={e=>setNewProvider(v=>({...v,amount:e.target.value}))} placeholder="$/mo" type="number"
              style={{flex:1,background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.cream,fontSize:13,fontFamily:"inherit"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{
              if(!newProvider.name.trim())return;
              const p={name:newProvider.name.trim(),icon:newProvider.icon||"🏦",color:C.teal,amount:newProvider.amount||"0"};
              setCustomProviders(v=>[...v,p]);
              doConnect(p);
              setNewProvider({name:"",amount:"",icon:"🏦"});
              setShowCustomForm(false);
            }} style={{flex:1,background:`linear-gradient(135deg,${C.teal},${C.tealBright})`,border:"none",borderRadius:10,padding:"9px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              Add & Connect
            </button>
            <button onClick={()=>setShowCustomForm(false)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 14px",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          </div>
        </div>}
      </div>}
    </Card>
    <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.8,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Day-by-Day Cash Flow</div>
    {(()=>{
      const avgDailySpend = FinancialCalcEngine.avgDailySpend(data);
      return days.filter((d,i)=>i===0||d.income>0||d.bills.length>0).map((day,i)=>{
        const isToday=day.idx===0,neg=day.balance<0,low=day.balance<150&&day.balance>=0;
        const isDrilled=expandedPlanDay===day.idx;
        const prevBalance=day.idx>0?(_forecast[day.idx-1]?.balance||0):day.balance;
        const billsTotal=day.bills.reduce((s,b)=>s+parseFloat(b.amount||0),0);
        const borderColor=isToday?C.green+"55":neg?C.red+"55":low?C.gold+"44":isDrilled?C.teal+"33":C.border;
        return (
          <div key={i} style={{background:isToday?C.greenDim:neg?C.redDim:C.card,borderRadius:20,border:`1px solid ${borderColor}`,boxShadow:isToday?`0 0 24px ${C.green}18`:neg?`0 0 24px ${C.red}18`:"none",overflow:"hidden"}}>
            <div onClick={()=>setExpandedPlanDay(isDrilled?null:day.idx)} style={{padding:"16px 18px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{color:isToday?C.greenBright:C.mutedHi,fontWeight:isToday?700:500,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{isToday?"Today ✦":day.d.toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"})}</div>
                    <span style={{color:C.muted,fontSize:10}}>{isDrilled?"▲":"▼"}</span>
                  </div>
                  {day.income>0&&<div style={{color:C.green,fontWeight:700,fontSize:13,marginTop:3}}>💰 +${day.income.toLocaleString()} paycheck</div>}
                  {day.bills.map((b,j)=><div key={j} style={{color:C.gold,fontSize:12,marginTop:2}}>📅 {b.name}: −${parseFloat(b.amount).toFixed(0)}</div>)}
                  {isToday&&!day.income&&!day.bills.length&&<div style={{color:C.muted,fontSize:11,marginTop:2}}>Tap to see balance breakdown</div>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:17,fontWeight:800,fontFamily:"Georgia,serif",color:neg?C.redBright:low?C.goldBright:C.greenBright}}>{neg?"−":""}${Math.abs(day.balance||0).toFixed(0)}</div>
                  <div style={{color:C.muted,fontSize:9}}>balance</div>
                </div>
              </div>
              <Bar v={Math.max(0,day.balance)} max={bal+income} color={neg?C.red:low?C.gold:C.green} h={4}/>
              {neg&&<div style={{marginTop:8,color:C.redBright,fontSize:12,fontWeight:600}}>⚠️ Projected overdraft — NSF fees $45–48. Move money now.</div>}
              {low&&!neg&&<div style={{marginTop:6,color:C.goldBright,fontSize:11}}>⚠ Getting low — hold non-essential spending.</div>}
            </div>
            {isDrilled&&(
              <div style={{borderTop:`1px solid ${C.border}`,padding:"12px 18px 14px",background:"rgba(0,0,0,0.2)"}}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:10}}>Cash flow breakdown</div>
                {day.idx>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}><span style={{color:C.muted,fontSize:11}}>Opening balance</span><span style={{color:C.muted,fontSize:11}}>${(prevBalance||0).toFixed(0)}</span></div>}
                {day.income>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}><span style={{color:C.mutedHi,fontSize:12}}>💰 Paycheck</span><span style={{color:C.greenBright,fontWeight:700,fontSize:12}}>+${(day.income||0).toFixed(0)}</span></div>}
                {day.bills.map((b,j)=><div key={j} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}><span style={{color:C.mutedHi,fontSize:12}}>📅 {b.name}</span><span style={{color:C.gold,fontWeight:700,fontSize:12}}>−${parseFloat(b.amount||0).toFixed(0)}</span></div>)}
                {day.idx>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}><span style={{color:C.mutedHi,fontSize:12}}>🛒 Est. daily spend <span style={{color:C.muted,fontSize:9}}>(30d avg)</span></span><span style={{color:C.muted,fontSize:12}}>−${(avgDailySpend).toFixed(0)}</span></div>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:4}}>
                  <span style={{color:C.cream,fontWeight:700,fontSize:13}}>{isToday?"Current balance":"Projected balance (est.)"}</span>
                  <span style={{color:neg?C.redBright:low?C.goldBright:C.greenBright,fontWeight:900,fontSize:16,fontFamily:"'Playfair Display',serif"}}>{neg?"−":""}${Math.abs(day.balance||0).toFixed(0)}</span>
                </div>
                {day.idx>0&&<div style={{marginTop:6,color:C.muted,fontSize:10,lineHeight:1.7}}>${(prevBalance||0).toFixed(0)}{day.income>0&&<span style={{color:C.green}}> +${(day.income||0).toFixed(0)}</span>}{billsTotal>0&&<span style={{color:C.gold}}> −${billsTotal.toFixed(0)} bills</span>}<span style={{color:C.muted}}> −${(avgDailySpend).toFixed(0)} spend</span><span style={{color:neg?C.redBright:C.greenBright}}> = ${(day.balance||0).toFixed(0)}</span></div>}
              </div>
            )}
          </div>
        );
      });
    })()}
  </div>;
}

// ─── SPEND ────────────────────────────────────────────────────────────────────
function AddCustomCategory({onAdd}){
  const [show,setShow]=useState(false);
  const [val,setVal]=useState("");
  // Quick preset categories people commonly need
  const QUICK_CATS = ["Business","Reimbursement","Family","Medical","Gym","Pet","Gifts","Education"];
  const save=(name)=>{
    const n = (name||val).trim();
    if(!n) return;
    const existing=JSON.parse(localStorage.getItem("flourish_custom_cats")||"[]");
    if(!existing.includes(n)) localStorage.setItem("flourish_custom_cats",JSON.stringify([...existing,n]));
    onAdd(n);
    setVal(""); setShow(false);
  };
  if(!show) return (
    <button onClick={()=>setShow(true)} style={{background:"none",border:`1px dashed ${C.green}55`,borderRadius:10,padding:"8px 16px",color:C.green,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
      + Add custom category
    </button>
  );
  return (
    <div style={{marginTop:8}}>
      {/* Quick presets */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
        {QUICK_CATS.map(c=>(
          <button key={c} onClick={()=>save(c)}
            style={{background:C.green+"14",border:`1px solid ${C.green}33`,borderRadius:99,padding:"5px 12px",color:C.greenBright,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:30}}>
            {c}
          </button>
        ))}
      </div>
      {/* Custom name input */}
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <input value={val} onChange={e=>setVal(e.target.value)} placeholder="Or type a custom name…"
          onKeyDown={e=>{if(e.key==="Enter") save();}}
          style={{flex:1,background:C.cardAlt,border:`1px solid ${C.green}`,borderRadius:10,padding:"8px 12px",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none"}} autoFocus/>
        <button onClick={()=>save()} style={{background:C.green,border:"none",borderRadius:10,padding:"8px 14px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",minHeight:36}}>Add</button>
        <button onClick={()=>{setShow(false);setVal("");}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",minHeight:36}}>✕</button>
      </div>
    </div>
  );
}

// ─── INCOME AUTO-DETECTOR ────────────────────────────────────────────────────
function detectPayroll(transactions, existingIncomes) {
  // Find large recurring negative-amount transactions (deposits)
  // Negative = money coming IN per Plaid convention
  const deposits = (transactions||[]).filter(t => t.amount < -200);
  if(deposits.length === 0) return [];

  // Group by name similarity
  const groups = {};
  deposits.forEach(t => {
    // Normalise name: strip numbers, dates, make lowercase key
    const key = t.name.replace(/\d+/g,'').replace(/[^a-z ]/gi,'').trim().toLowerCase().substring(0,20);
    if(!groups[key]) groups[key] = {name:t.name, key, amounts:[], dates:[]};
    groups[key].amounts.push(Math.abs(t.amount));
    groups[key].dates.push(t.date);
  });

  // Keep only groups with 2+ occurrences (recurring = likely payroll)
  const candidates = Object.values(groups)
    .filter(g => g.amounts.length >= 2)
    .map(g => ({
      name: g.name,
      avgAmount: Math.round(g.amounts.reduce((s,a)=>s+a,0)/g.amounts.length),
      count: g.amounts.length,
    }))
    .sort((a,b) => b.avgAmount - a.avgAmount)
    .slice(0,3);

  // Filter out already-added income sources — fuzzy match within 15% so biweekly
  // vs monthly rounding doesn't create duplicate suggestions
  const existingAmounts = (existingIncomes||[]).map(i=>parseFloat(i.amount||0)).filter(a=>a>0);
  return candidates.filter(c =>
    !existingAmounts.some(ea => Math.abs(ea - c.avgAmount) / Math.max(ea, c.avgAmount) < 0.15)
  );
}

function IncomeDetectionBanner({transactions, incomes, setAppData}){
  const [dismissed, setDismissed] = useState(()=>{
    try { return JSON.parse(localStorage.getItem("flourish_dismissed_income")||"[]"); } catch { return []; }
  });
  const candidates = detectPayroll(transactions, incomes).filter(c => !dismissed.includes(c.name));
  if(candidates.length === 0) return null;

  const c0 = candidates[0];
  const dismiss = () => {
    const updated = [...dismissed, c0.name];
    setDismissed(updated);
    try { localStorage.setItem("flourish_dismissed_income", JSON.stringify(updated)); } catch {}
  };
  const addIncome = () => {
    if(setAppData) setAppData(prev=>{
      const existing = prev.incomes || [];
      // Don't add if a similar amount already exists (within 15% — same paycheck)
      const isDuplicate = existing.some(i => {
        const existAmt = parseFloat(i.amount || 0);
        const newAmt = c0.avgAmount;
        return existAmt > 0 && Math.abs(existAmt - newAmt) / Math.max(existAmt, newAmt) < 0.15;
      });
      if (isDuplicate) return prev; // already tracked — don't add
      return {
        ...prev,
        incomes: [...existing, {id:Date.now(),label:c0.name,amount:String(c0.avgAmount),freq:"biweekly",type:"employment",isVariable:false,autoDetected:true}]
      };
    });
    dismiss();
  };

  return (
    <div style={{background:`linear-gradient(135deg,${C.green}12,${C.teal}08)`,border:`1px solid ${C.green}44`,borderRadius:16,padding:"14px 16px",display:"flex",gap:12,alignItems:"flex-start"}}>
      <span style={{fontSize:20,flexShrink:0}}>💡</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:C.greenBright,fontWeight:700,fontSize:13,marginBottom:2}}>Looks like a regular deposit</div>
        <div style={{color:C.mutedHi,fontSize:12,lineHeight:1.5}}>
          <strong style={{color:C.cream}}>{c0.name}</strong> appears {c0.count}× averaging <strong style={{color:C.greenBright}}>${c0.avgAmount.toLocaleString()}</strong>. Is this your paycheque?
        </div>
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button onClick={addIncome} style={{background:C.green,border:"none",borderRadius:99,padding:"7px 14px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",minHeight:32}}>
            Yes, add as income ✓
          </button>
          <button onClick={dismiss} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:99,padding:"7px 12px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",minHeight:32}}>
            Not a paycheque
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpandableCatCard({cat, amt, totalSpent, color, catTxns, budget, onSetBudget}){
  const [open, setOpen] = useState(false);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetVal, setBudgetVal] = useState(budget ? String(budget) : "");
  const [showAllTxns, setShowAllTxns] = useState(false);
  const TXN_LIMIT = 8;
  // Reset expanded state when card closes
  const handleToggle = () => { if(open) setShowAllTxns(false); setOpen(o=>!o); };
  const pct = totalSpent > 0 ? Math.round(amt/totalSpent*100) : 0;
  const budgetPct = budget > 0 ? Math.min(100, Math.round((amt/budget)*100)) : null;
  const overBudget = budget > 0 && amt > budget;

  const saveBudget = () => {
    const v = parseFloat(budgetVal);
    if(onSetBudget) onSetBudget(cat, isNaN(v) || v <= 0 ? null : v);
    setEditBudget(false);
  };

  return (
    <Card style={{cursor:"pointer"}} onClick={()=>!editBudget&&handleToggle()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{color:C.cream,fontSize:14,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:20}}>{catTxns[0]?.icon||"💰"}</span>{cat}
        </span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:overBudget?C.red:color,fontWeight:700}}>${(amt||0).toFixed(0)}
            {budget>0&&<span style={{color:overBudget?C.redBright:C.muted,fontSize:11}}> / ${(budget||0).toFixed(0)}</span>}
            <span style={{color:C.muted,fontSize:11}}> ({catTxns.length}×)</span>
          </span>
          <span style={{color:C.muted,fontSize:14,transition:"transform .2s",transform:open?"rotate(90deg)":"none",display:"inline-block"}}>›</span>
        </div>
      </div>
      {/* Spending bar */}
      <Bar v={amt} max={budget>0?budget:totalSpent} color={overBudget?C.red:color}/>
      {/* Budget progress */}
      {budget>0&&(
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
          <div style={{color:overBudget?C.redBright:C.muted,fontSize:11,fontWeight:overBudget?700:400}}>
            {overBudget ? `⚠️ $${((amt||0)-(budget||0)).toFixed(0)} over budget` : `${budgetPct||0}% of $${(budget||0).toFixed(0)} budget`}
          </div>
          <div style={{color:C.muted,fontSize:10}}>{pct}% of total</div>
        </div>
      )}
      {!budget&&<div style={{color:C.muted,fontSize:11,marginTop:4}}>{pct}% of spending this month</div>}
      {open&&(
        <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:10}} onClick={e=>e.stopPropagation()}>
          {/* Bills explanation — only show for Bills category */}
          {cat==="Bills"&&(
            <div style={{background:C.teal+"10",border:`1px solid ${C.teal}22`,borderRadius:10,padding:"8px 12px",marginBottom:8}}>
              <div style={{color:C.tealBright,fontSize:11,fontWeight:600}}>📋 These are payments made this month</div>
              <div style={{color:C.muted,fontSize:10,marginTop:2,lineHeight:1.5}}>Transactions marked ✓ match your tracked bills. Your tracked bills power the forecast — this list shows what was actually paid.</div>
            </div>
          )}
          {/* Budget setter */}
          <div style={{marginBottom:10,padding:"8px 10px",background:C.cardAlt,borderRadius:10,border:`1px solid ${C.border}`}}>
            {editBudget ? (
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{color:C.muted,fontSize:12,flexShrink:0}}>Monthly budget:</span>
                <div style={{display:"flex",alignItems:"center",flex:1,background:C.card,border:`1px solid ${color}`,borderRadius:8,overflow:"hidden"}}>
                  <span style={{color:C.muted,padding:"0 6px",fontSize:12}}>$</span>
                  <input value={budgetVal} onChange={e=>setBudgetVal(e.target.value)} type="number" placeholder="0"
                    autoFocus onKeyDown={e=>e.key==="Enter"&&saveBudget()}
                    style={{flex:1,background:"none",border:"none",padding:"6px 4px",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                </div>
                <button onClick={saveBudget} style={{background:color,border:"none",borderRadius:8,padding:"6px 10px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",minHeight:32}}>✓</button>
                <button onClick={()=>setEditBudget(false)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 8px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",minHeight:32}}>✕</button>
              </div>
            ) : (
              <button onClick={e=>{e.stopPropagation();setBudgetVal(budget?String(budget):"");setEditBudget(true);}}
                style={{background:"none",border:"none",color:budget?color:C.muted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",padding:0}}>
                {budget ? `📊 Budget: $${budget}/mo — tap to edit` : "＋ Set monthly budget for this category"}
              </button>
            )}
          </div>
          {/* Transaction list */}
          {catTxns.length===0
            ? <div style={{color:C.muted,fontSize:12}}>No transactions in this category this month.</div>
            : (()=>{
              const sorted = catTxns.sort((a,b)=>b.amount-a.amount);
              const visible = showAllTxns ? sorted : sorted.slice(0, TXN_LIMIT);
              const hiddenCount = sorted.length - TXN_LIMIT;
              return (<>
                {visible.map((t,j)=>{
                  const bills = window.__flourishBills||[];
                  const linkedBill = bills.find(b=>Math.abs(parseFloat(b.amount||0)-t.amount)<5);
                  return (
                    <div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:j<visible.length-1?`1px solid ${C.border}`:"none"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <div style={{color:C.cream,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>{t.name}</div>
                          {linkedBill&&<span style={{background:C.green+"22",color:C.greenBright,fontSize:9,fontWeight:700,borderRadius:99,padding:"1px 6px",flexShrink:0}}>✓ {linkedBill.name}</span>}
                        </div>
                        <div style={{color:C.muted,fontSize:10}}>{t.date}</div>
                      </div>
                      <span style={{color:linkedBill?C.greenBright:color,fontWeight:700,fontSize:13,flexShrink:0,marginLeft:8}}>${(t.amount||0).toFixed(2)}</span>
                    </div>
                  );
                })}
                {!showAllTxns && hiddenCount > 0 && (
                  <button onClick={e=>{e.stopPropagation();setShowAllTxns(true);}}
                    style={{width:"100%",marginTop:8,background:color+"12",border:`1px solid ${color}33`,borderRadius:10,padding:"8px",color,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:36}}>
                    Show {hiddenCount} more transaction{hiddenCount===1?"":"s"} ↓
                  </button>
                )}
                {showAllTxns && sorted.length > TXN_LIMIT && (
                  <button onClick={e=>{e.stopPropagation();setShowAllTxns(false);}}
                    style={{width:"100%",marginTop:8,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px",color:C.muted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",minHeight:36}}>
                    Show less ↑
                  </button>
                )}
              </>);
            })()}
        </div>
      )}
    </Card>
  );
}

// ─── BUDGET SUGGESTION ENGINE ────────────────────────────────────────────────
// Category metadata: emoji, colour key, plain-English reason shown to user
const BUDGET_CAT_META = {
  "Groceries":         { emoji:"🛒", colorKey:"green",  why:"Based on household size" },
  "Coffee & Dining":   { emoji:"☕", colorKey:"orange", why:"Based on your dining history" },
  "Gas & Transport":   { emoji:"🚗", colorKey:"blue",   why:"Commuting & errands" },
  "Shopping":          { emoji:"🛍️", colorKey:"pink",   why:"General retail purchases" },
  "Clothing":          { emoji:"👗", colorKey:"purple", why:"Clothes & apparel for your household" },
  "Subscriptions":     { emoji:"📱", colorKey:"teal",   why:"Streaming, apps, memberships" },
  "Health":            { emoji:"💊", colorKey:"teal",   why:"Pharmacy, dental, fitness" },
  "Personal Care":     { emoji:"🧴", colorKey:"gold",   why:"Grooming, beauty, hygiene" },
  "Entertainment":     { emoji:"🎬", colorKey:"pink",   why:"Fun money — movies, games, nights out" },
  "Hobbies & Sports":  { emoji:"🎯", colorKey:"blue",   why:"Extracurriculars, leagues, classes" },
  "Kids & Extracurricular": { emoji:"🧒", colorKey:"green", why:"Activities, camps, sports per child" },
  "Travel":            { emoji:"✈️", colorKey:"purple", why:"Trips & weekend getaways (monthly reserve)" },
  "Home":              { emoji:"🏠", colorKey:"orange", why:"Repairs, décor, household supplies" },
  "Education":         { emoji:"📚", colorKey:"blue",   why:"Courses, books, tuition" },
};

function generateBudgetSuggestions(data) {
  const profile   = data.profile || {};
  const isCA      = (profile.country||"CA") === "CA";
  const _toMo     = (amt,freq) => {
    const a = parseFloat(amt||0);
    return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="annually"?a/12:a;
  };

  // ── Income ──────────────────────────────────────────────────────────
  const grossMo   = (data.incomes||[]).reduce((s,i)=>s+_toMo(i.amount,i.freq),0)||0;
  const taxRate   = isCA
    ? (grossMo>10000?0.35:grossMo>6000?0.30:grossMo>3500?0.25:0.18)
    : (grossMo>8000?0.30:grossMo>5000?0.24:grossMo>3000?0.20:0.15);
  const netMo     = Math.round(grossMo*(1-taxRate));

  // ── Fixed commitments (auto-filled from bills + debt minimums) ──────
  const billsMo   = (data.bills||[]).reduce((s,b)=>s+parseFloat(b.amount||0),0);
  const debtsMo   = (data.debts||[]).reduce((s,d)=>s+parseFloat(d.min||0),0);
  const fixedMo   = Math.round(billsMo+debtsMo);

  // ── Savings ─────────────────────────────────────────────────────────
  const savingsRate = netMo < 2500 ? 0.10 : netMo < 5000 ? 0.15 : 0.20;
  const savingsMo   = Math.round(netMo * savingsRate);

  // ── Goal savings ─────────────────────────────────────────────────────
  const goalsMo   = (data.goals||[])
    .filter(g=>parseFloat(g.target||0)>parseFloat(g.saved||0))
    .reduce((s,g)=>{
      const remaining = parseFloat(g.target||0)-parseFloat(g.saved||0);
      const mo = parseFloat(g.monthly||0);
      return s+(mo>0?mo:remaining>0?Math.ceil(remaining/24):0);
    },0);

  // ── Discretionary pool ──────────────────────────────────────────────
  const discret   = Math.max(0, netMo - fixedMo - savingsMo - goalsMo);

  // ── Household context ────────────────────────────────────────────────
  const hasPartner = profile.status==="couple"||profile.status==="cohabit";
  const numKids    = (profile.kids||[]).length||(profile.hasKids?1:0);
  const hSize      = 1+(hasPartner?1:0)+numKids;

  // ── Situation-based benchmarks — NEVER blended with history ──────────
  // All amounts are reasonable targets for this household, scaled to discret pool.
  // Priority: Needs first (Groceries, Transport, Health), then Wants.
  const r = (v) => Math.max(10, Math.round(v/5)*5); // round to nearest $5

  const suggestions = {};

  // NEEDS — always included
  suggestions["Groceries"]       = r((isCA?280:250)*hSize);
  suggestions["Gas & Transport"] = r(isCA?(numKids?250:180):(numKids?220:160));
  suggestions["Health"]          = r(Math.min((isCA?55:110)*hSize, isCA?200:400));

  // WANTS — scaled to what's actually available after needs
  const needsTotal = Object.values(suggestions).reduce((s,v)=>s+v,0);
  const wantsPool  = Math.max(0, discret - needsTotal);

  suggestions["Coffee & Dining"] = r(Math.max(60, wantsPool*(numKids?0.10:0.14)));
  suggestions["Clothing"]        = r(Math.max(30, (isCA?55:50)*hSize*(numKids?1.2:1)));
  suggestions["Personal Care"]   = r(hasPartner?90:55);
  suggestions["Shopping"]        = r(Math.max(30, wantsPool*(hasPartner?0.09:0.07)));
  suggestions["Entertainment"]   = r(Math.max(30, wantsPool*(numKids?0.05:0.08)));
  suggestions["Subscriptions"]   = r(hSize<=2?45:65);
  if(numKids>0) suggestions["Kids & Extracurricular"] = r(numKids*(isCA?165:180));

  const totalSugg  = Object.values(suggestions).reduce((s,v)=>s+v,0);
  const canAfford  = totalSugg <= discret;
  const shortfall  = Math.max(0, totalSugg - discret);

  // ── Cut suggestions — priority order if over budget ─────────────────
  // 1. Subscriptions (easiest, most painless)
  // 2. Entertainment
  // 3. Coffee & Dining
  // 4. Shopping
  // 5. Personal Care
  // 6. Groceries (reduce, don't eliminate)
  const CUT_PRIORITY = [
    "Subscriptions","Entertainment","Coffee & Dining","Shopping",
    "Personal Care","Groceries","Clothing","Hobbies & Sports"
  ];
  const cutSuggestions = [];
  if(!canAfford) {
    let remaining = shortfall;
    for(const cat of CUT_PRIORITY) {
      if(remaining <= 0) break;
      const current = suggestions[cat]||0;
      if(!current) continue;
      // How much can realistically be cut from this category?
      const maxCut = cat==="Groceries" ? Math.floor(current*0.15)   // max 15% off groceries
                   : cat==="Personal Care" ? Math.floor(current*0.3)
                   : Math.floor(current*0.5); // up to 50% off wants
      const cut = Math.min(remaining, maxCut);
      if(cut >= 5) {
        cutSuggestions.push({cat, current, suggested: r(current-cut), saving: cut});
        remaining -= cut;
      }
    }
  }

  return {
    suggestions, netMo, grossMo, fixedMo, billsMo, debtsMo,
    savingsMo, savingsRate, goalsMo, discret, wantsPool,
    hSize, numKids, hasPartner, totalSugg, canAfford, shortfall, cutSuggestions
  };
}

// ─── BUDGET PLAN CARD ────────────────────────────────────────────────────────
function BudgetPlanCard({data, setAppData}) {
  const existingBudgets = data.budgets||{};
  const hasBudgets = Object.keys(existingBudgets).length > 0;
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(()=>{ try{return localStorage.getItem("flourish_budget_dismissed")==="1";}catch{return false;} });
  const [editVals, setEditVals] = useState({});
  const [accepted, setAccepted] = useState(false);
  const [customCat, setCustomCat] = useState("");
  const [showAddCat, setShowAddCat] = useState(false);

  const { suggestions, netMo, discret, savingsMo, savingsRate, numKids, totalSugg } = useMemo(()=>generateBudgetSuggestions(data),[data]);

  // Open panel: seed edit values from saved budgets or suggestions
  const handleOpen = () => {
    const seed = {};
    // Start with all existing budgeted categories
    Object.entries(existingBudgets).forEach(([cat,amt])=>{ seed[cat]=String(amt); });
    // Add any suggested categories not yet budgeted
    Object.entries(suggestions).forEach(([cat,amt])=>{ if(!seed[cat]) seed[cat]=String(amt); });
    setEditVals(seed);
    setOpen(true);
    setAccepted(false);
    setShowAddCat(false);
    setCustomCat("");
    // Reset dismissed when user actively opens the panel
    setDismissed(false);
    try{localStorage.removeItem("flourish_budget_dismissed");}catch{}
  };

  const handleAcceptAll = () => {
    const newBudgets = {};
    Object.entries(editVals).forEach(([cat,v])=>{
      const n=parseFloat(v);
      if(!isNaN(n)&&n>0) newBudgets[cat]=n;
    });
    if(setAppData) setAppData(prev=>({...prev,budgets:newBudgets}));
    setAccepted(true);
    setTimeout(()=>setOpen(false),1200);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setOpen(false);
    try{localStorage.setItem("flourish_budget_dismissed","1");}catch{}
  };

  const handleAddCustom = () => {
    const cat = customCat.trim();
    if(!cat) return;
    setEditVals(prev=>({...prev,[cat]:"50"}));
    setCustomCat("");
    setShowAddCat(false);
  };

  const handleDeleteCat = (cat) => {
    setEditVals(prev=>{ const n={...prev}; delete n[cat]; return n; });
  };

  const catColors = {"Groceries":C.green,"Coffee & Dining":C.orange,"Gas & Transport":C.blue,
    "Shopping":C.pink,"Clothing":C.purple,"Subscriptions":C.teal,"Health":C.teal,
    "Personal Care":C.gold,"Entertainment":C.pink,"Hobbies & Sports":C.blue,
    "Kids & Extracurricular":C.green,"Kids & Activities":C.green,
    "Travel":C.purple,"Home":C.orange,"Education":C.blue};
  const catEmoji = {"Groceries":"🛒","Coffee & Dining":"☕","Gas & Transport":"🚗",
    "Shopping":"🛍️","Clothing":"👗","Subscriptions":"📱","Health":"💊",
    "Personal Care":"🧴","Entertainment":"🎬","Hobbies & Sports":"🎯",
    "Kids & Extracurricular":"🧒","Kids & Activities":"🧒",
    "Travel":"✈️","Home":"🏠","Education":"📚"};


  // Current-month spending per budget category — excludes bill categories and CC payments
  const catOverrides = (()=>{ try{return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}")}catch{return{}} })();
  const now = new Date();
  const monthTxns = (data.transactions||[]).filter(t=>{
    try{const d=new Date(t.date+"T12:00:00");return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()&&t.amount>0;}catch{return false;}
  });
  const monthSpend = {};
  monthTxns.forEach(t=>{
    const cat=catOverrides[t.id]||t.cat;
    if(!NON_SPEND_CATS.has(cat)&&!CC_PAYMENT_KEYWORDS.some(kw=>(t.name||"").toLowerCase().includes(kw))){
      monthSpend[cat]=(monthSpend[cat]||0)+t.amount;
    }
  });
  const totalBudgeted = Object.values(existingBudgets).reduce((s,v)=>s+v,0);
  const totalSpentThisMonth = Object.entries(existingBudgets).reduce((s,[cat])=>s+(monthSpend[cat]||0),0);
  const budgetUsedPct = totalBudgeted>0 ? Math.min(100,Math.round(totalSpentThisMonth/totalBudgeted*100)) : 0;

  // Compact "budget active" strip when not editing
  if(hasBudgets&&!open) return (
    <div style={{background:overBudgetCats.length>0?C.red+"15":C.green+"12",
      border:`1px solid ${overBudgetCats.length>0?C.red:C.green}33`,
      borderRadius:14,padding:"12px 14px",marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:overBudgetCats.length>0?8:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>{overBudgetCats.length>0?"⚠️":"📊"}</span>
          <div>
            <div style={{color:overBudgetCats.length>0?C.redBright:C.greenBright,fontWeight:800,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              {overBudgetCats.length>0?`Over budget in ${overBudgetCats.length} categor${overBudgetCats.length===1?"y":"ies"}`:"Budget Plan Active"}
            </div>
            <div style={{color:C.muted,fontSize:10}}>
              ${Math.round(totalSpentThisMonth).toLocaleString()} / ${Math.round(totalBudgeted).toLocaleString()} this month ({budgetUsedPct}%)
            </div>
          </div>
        </div>
        <button onClick={handleOpen}
          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px",
            color:C.muted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Edit</button>
      </div>
      {/* Progress bar */}
      <div style={{height:4,background:C.border,borderRadius:99,overflow:"hidden"}}>
        <div style={{width:`${budgetUsedPct}%`,height:"100%",borderRadius:99,transition:"width .4s",
          background:overBudgetCats.length>0?C.red:budgetUsedPct>80?C.orange:C.green}}/>
      </div>
      {overBudgetCats.length>0&&(
        <div style={{color:C.muted,fontSize:10,marginTop:6}}>
          {overBudgetCats.map(([cat,limit])=>`${catEmoji[cat]||""}${cat}: $${Math.round((monthSpend[cat]||0)-limit)} over`).join(" · ")}
        </div>
      )}
    </div>
  );

  // Initial banner when no budgets set — respect dismissed flag
  if(dismissed&&!hasBudgets&&!open) return null;
  if(!open) return (
    <div style={{background:`linear-gradient(135deg,${C.green}18 0%,${C.teal}12 100%)`,
      borderRadius:16,padding:"14px 16px",marginBottom:8,border:`1px solid ${C.green}33`,
      display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
      <div style={{flex:1}}>
        <div style={{color:C.greenBright,fontWeight:800,fontSize:13,marginBottom:2}}>✨ Build Your Budget Plan</div>
        <div style={{color:C.muted,fontSize:11,lineHeight:1.5}}>
          We'll suggest spending limits for groceries, clothing, extracurriculars and more — based on your ${Math.round(netMo).toLocaleString()}/mo take-home.
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
        <button onClick={handleOpen}
          style={{background:`linear-gradient(135deg,${C.green},${C.greenBright})`,border:"none",
            borderRadius:10,padding:"8px 14px",color:"#041810",fontWeight:800,fontSize:12,
            cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Build Plan</button>
        <button onClick={handleDismiss}
          style={{background:"none",border:"none",color:C.muted,fontSize:10,cursor:"pointer",
            fontFamily:"inherit",padding:0}}>No thanks</button>
      </div>
    </div>
  );

  // ── Edit panel ──────────────────────────────────────────────────────────────
  const totalEdited = Object.values(editVals).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const overDiscret = totalEdited > discret;

  return (
    <div style={{background:`linear-gradient(135deg,${C.green}0A 0%,${C.card} 100%)`,
      border:`1px solid ${C.green}44`,borderRadius:16,padding:"14px",marginBottom:8}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div>
          <div style={{color:C.greenBright,fontWeight:900,fontSize:15,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            {accepted?"✅ Budget Plan Saved!":"📊 Your Budget Plan"}
          </div>
          <div style={{color:C.muted,fontSize:11,marginTop:2}}>
            ~${Math.round(discret).toLocaleString()}/mo discretionary · adjust any amount · add categories
          </div>
        </div>
        <button onClick={()=>setOpen(false)}
          style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>✕</button>
      </div>

      {/* Savings context strip */}
      <div style={{background:C.cardAlt,borderRadius:10,padding:"8px 10px",marginBottom:10,
        border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:14}}>💰</span>
          <div>
            <div style={{color:C.greenBright,fontWeight:700,fontSize:11}}>Savings target included</div>
            <div style={{color:C.muted,fontSize:10}}>${Math.round(savingsMo).toLocaleString()}/mo ({Math.round(savingsRate*100)}% of take-home) set aside before this budget</div>
          </div>
        </div>
      </div>

      {/* Category rows */}
      <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
        {Object.entries(editVals).map(([cat,val])=>{
          const cc = catColors[cat]||C.muted;
          const emoji = catEmoji[cat]||"📌";
          const meta = BUDGET_CAT_META[cat];
          const isSuggested = !!suggestions[cat];
          return (
            <div key={cat} style={{display:"flex",alignItems:"center",gap:8,
              padding:"8px 10px",background:C.cardAlt,borderRadius:10,border:`1px solid ${C.border}`}}>
              <span style={{fontSize:15,flexShrink:0}}>{emoji}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.cream,fontSize:12,fontWeight:600}}>{cat}</div>
                {meta?.why&&<div style={{color:C.muted,fontSize:9,marginTop:1}}>{meta.why}</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",background:C.card,
                border:`1px solid ${cc}55`,borderRadius:8,overflow:"hidden",width:90,flexShrink:0}}>
                <span style={{color:C.muted,padding:"0 4px",fontSize:11}}>$</span>
                <input type="number" value={val}
                  onChange={e=>setEditVals(prev=>({...prev,[cat]:e.target.value}))}
                  style={{width:50,background:"none",border:"none",padding:"6px 2px",color:C.cream,
                    fontSize:12,fontFamily:"inherit",outline:"none",fontWeight:700}}/>
                <span style={{color:C.muted,padding:"0 3px",fontSize:9}}>/mo</span>
              </div>
              <button onClick={()=>handleDeleteCat(cat)}
                style={{background:"none",border:"none",color:C.muted,cursor:"pointer",
                  fontSize:14,padding:"2px",flexShrink:0,opacity:0.6,lineHeight:1}}
                title="Remove category">×</button>
            </div>
          );
        })}

        {/* Add custom category */}
        {showAddCat ? (
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",
            background:C.cardAlt,borderRadius:10,border:`1px dashed ${C.green}55`}}>
            <input value={customCat} onChange={e=>setCustomCat(e.target.value)}
              placeholder="Category name (e.g. Gym, Art Classes)"
              onKeyDown={e=>e.key==="Enter"&&handleAddCustom()}
              style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,
                padding:"7px 10px",color:C.cream,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
            <button onClick={handleAddCustom}
              style={{background:C.green,border:"none",borderRadius:8,padding:"7px 10px",
                color:"#041810",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Add</button>
            <button onClick={()=>{setShowAddCat(false);setCustomCat("");}}
              style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:0}}>✕</button>
          </div>
        ) : (
          <button onClick={()=>setShowAddCat(true)}
            style={{background:"none",border:`1px dashed ${C.green}44`,borderRadius:10,
              padding:"9px 10px",color:C.green,fontWeight:700,fontSize:12,
              cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
            ＋ Add a category
          </button>
        )}
      </div>

      {/* Total vs discretionary */}
      <div style={{padding:"9px 12px",background:overDiscret?C.red+"18":C.green+"12",
        borderRadius:10,marginBottom:10,border:`1px solid ${overDiscret?C.red:C.green}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:C.muted,fontSize:11}}>Total budgeted</span>
          <span style={{color:overDiscret?C.redBright:C.greenBright,fontWeight:800,fontSize:13}}>
            ${Math.round(totalEdited).toLocaleString()} / mo
          </span>
        </div>
        {overDiscret&&(
          <div style={{color:C.redBright,fontSize:10,marginTop:3}}>
            ⚠️ ${Math.round(totalEdited-discret).toLocaleString()} over your discretionary budget — consider trimming some categories
          </div>
        )}
        {!overDiscret&&totalEdited>0&&(
          <div style={{color:C.muted,fontSize:10,marginTop:3}}>
            ${Math.round(discret-totalEdited).toLocaleString()} discretionary remaining unallocated
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={handleAcceptAll}
          style={{flex:1,background:`linear-gradient(135deg,${C.green},${C.greenBright})`,border:"none",
            borderRadius:12,padding:"12px",color:"#041810",fontWeight:800,fontSize:13,
            cursor:"pointer",fontFamily:"inherit"}}>
          {accepted?"✅ Saved!":"✓ Save Budget Plan"}
        </button>
        <button onClick={()=>setOpen(false)}
          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",
            color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
      </div>
    </div>
  );
}

function SpendScreen({data, setAppData, setScreen}){
  const isDesktop = window.innerWidth >= 960;
  // ── ALL HOOKS FIRST — no non-hook code before the last hook (TDZ prevention) ──
  const [tab,setTab]=useState("txn");
  const [catFilter,setCatFilter]=useState("All");
  const [dismissed,setDismissed]=useState([]);
  const [period,setPeriod]=useState("month");
  const [accountFilter,setAccountFilter]=useState("All");
  const [recatTxn,setRecatTxn]=useState(null);
  const [markBillTxn,setMarkBillTxn]=useState(null);
  const [billForm,setBillForm]=useState({name:"",amount:"",date:"1",type:"fixed",category:"Bills"});
  const [arrearsPayTxn,setArrearsPayTxn]=useState(null);
  const [applyAllPrompt, setApplyAllPrompt] = useState(null);
  const [showAllBdCats, setShowAllBdCats] = useState(false);

  // ── NON-HOOK DERIVED VALUES (after all hooks) ──────────────────────────────
  const isDemo=!data.bankConnected;
  const txns=data.transactions||[];
  const now = new Date();
  const thisMonthTxns = txns.filter(t => {
    if(!t.date) return false;
    const d = new Date(t.date + "T12:00:00");
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const monthLabel = now.toLocaleString("en-CA",{month:"long",year:"numeric"});
  const catOverrides = JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}");
  const getCat = (t) => catOverrides[t.id] || t.cat;
  const stats=computeStats(thisMonthTxns, catOverrides);

  const recat = (txn, newCat, applyToAll=false) => {
    const overrides = JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}");
    if(applyToAll) {
      const merchantKey = (txn.name||"").toLowerCase().trim();
      const updated = {...overrides};
      txns.forEach(t => {
        if((t.name||"").toLowerCase().trim() === merchantKey) updated[t.id] = newCat;
      });
      localStorage.setItem("flourish_cat_overrides", JSON.stringify(updated));
    } else {
      const updated = {...overrides, [txn.id]: newCat};
      localStorage.setItem("flourish_cat_overrides", JSON.stringify(updated));
    }
    // Auto-link: if this vendor matches a bill's name, store in vendorBillMap
    const merchantKey = (txn.name||"").toLowerCase().trim();
    if(merchantKey.length >= 3 && setAppData) {
      const matchedBill = (data.bills||[]).find(b =>
        merchantKey.includes((b.name||"").toLowerCase().trim().substring(0,5)) ||
        (b.name||"").toLowerCase().trim().includes(merchantKey.substring(0,8))
      );
      if(matchedBill) {
        setAppData(prev => ({
          ...prev,
          vendorBillMap: {...(prev.vendorBillMap||{}), [merchantKey]: matchedBill.name}
        }));
      }
    }
    setRecatTxn(null);
    setApplyAllPrompt(null);
  };

  // When user picks a category, check if there are other transactions from same merchant
  const recatWithSmartPrompt = (txn, newCat) => {
    const merchantKey = (txn.name||"").toLowerCase().trim();
    // Guard: empty name would match ALL unnamed transactions — skip prompt
    if(!merchantKey) { recat(txn, newCat, false); return; }
    const otherSameMerchant = txns.filter(t =>
      t.id !== txn.id &&
      (t.name||"").toLowerCase().trim() === merchantKey &&
      merchantKey.length >= 3 && // require at least 3 chars to avoid over-matching
      (catOverrides[t.id] || t.cat) !== newCat
    );
    if(otherSameMerchant.length > 0) {
      setApplyAllPrompt({txn, newCat, count: otherSameMerchant.length + 1});
    } else {
      recat(txn, newCat, false);
    }
  };
  const cats=["All",...Array.from(new Set(txns.map(t=>{
    // Incoming transfers show as "Received" in the filter
    if(getCat(t)==="Transfer" && t.amount<0) return "Received";
    return getCat(t);
  }))).filter(c=>c!=="Transfer"||txns.some(t=>getCat(t)==="Transfer"&&t.amount>0))];
  // displayTxns and EXCLUDE_CATS must be defined BEFORE filtered (TDZ prevention)
  const EXCLUDE_CATS = new Set(["Transfer","Income"]);
  // Period date helpers — placed after all hooks to avoid TDZ
  const startOfPeriod = (() => {
    const d = new Date();
    if(period==="week")  { const s=new Date(d); s.setDate(d.getDate()-d.getDay()); s.setHours(0,0,0,0); return s; }
    if(period==="month") { return new Date(d.getFullYear(),d.getMonth(),1); }
    if(period==="last")  { return new Date(d.getFullYear(),d.getMonth()-1,1); }
    if(period==="3mo")   { return new Date(d.getFullYear(),d.getMonth()-2,1); }
    return null;
  })();
  const endOfPeriod = (() => {
    const d = new Date();
    if(period==="last") { return new Date(d.getFullYear(),d.getMonth(),0,23,59,59); }
    return null;
  })();
  const displayTxns = (() => {
    if(period==="week"||period==="last"||period==="3mo") {
      return txns.filter(t => {
        if(!t.date) return false;
        const d = new Date(t.date+"T12:00:00");
        return (!startOfPeriod || d >= startOfPeriod) && (!endOfPeriod || d <= endOfPeriod);
      });
    }
    if(period==="month") return thisMonthTxns;
    return txns; // "all" = last 90 days
  })();
  // Account filter — map account_id to account name
  const accountMap = (data.accounts||[]).reduce((m,a)=>({...m,[a.id]:a}),{});
  const uniqueAccounts = [...new Set(txns.map(t=>t.account_id).filter(Boolean))];
  const accountsWithNames = uniqueAccounts.map(id=>({
    id,
    name: accountMap[id]?.name || accountMap[id]?.institution || id,
    type: accountMap[id]?.type || "account",
  }));
  const acctFiltered = accountFilter==="All" ? displayTxns : displayTxns.filter(t=>t.account_id===accountFilter);
  const filtered=catFilter==="All"
    ? acctFiltered.filter(t=>{
        if(isCCPayment(t,data.debts||[])) return false; // CC payments are balance sheet events — hide from list
        const cat=getCat(t);
        if(cat==="Transfer") return t.amount<0; // show incoming (e-transfers in), hide outgoing
        return true;
      })
    : catFilter==="Received"
      ? acctFiltered.filter(t=>getCat(t)==="Transfer"&&t.amount<0)
      : acctFiltered.filter(t=>getCat(t)===catFilter&&!isCCPayment(t,data.debts||[]));
  const totalSpent=acctFiltered.filter(t=>t.amount>0&&!EXCLUDE_CATS.has(getCat(t))&&!isCCPayment(t,data.debts||[])).reduce((a,t)=>a+t.amount,0);
  const totalIn=acctFiltered.filter(t=>t.amount<0&&getCat(t)!=="Transfer").reduce((a,t)=>a+Math.abs(t.amount),0);

  const cuts=[
    stats.coffee>0&&{id:1,icon:"coffee",title:"Coffee is adding up",body:`${stats.coffeeCount} coffee run${stats.coffeeCount===1?"":"s"} this month totalling $${stats.coffee.toFixed(2)}. That's $${(stats.coffee*12).toFixed(0)}/year. Making coffee at home 4 days a week cuts this by 60%.`,saving:`$${Math.round(stats.coffee*0.6)}/mo`,effort:"Low",color:C.orange},
    stats.delivery>0&&{id:2,icon:"package",title:"Food delivery every week",body:`$${(stats.delivery||0).toFixed(2)} on delivery this month. One fewer order per week saves $40–60/month reliably. Your wallet will notice in 30 days.`,saving:"$50/mo",effort:"Low",color:C.orange},
    {id:3,icon:"bag",title:"Amazon impulse purchases",body:"Try the 48-hour rule: add to cart, wait 2 days. Most impulse buys get removed without regret. Studies show this cuts impulse spend by 30–40%.",saving:"$40–70/mo",effort:"Low",color:C.pink},
    stats.subs>0&&{id:4,icon:"zap",title:"Subscriptions creeping up",body:`$${(stats.subs||0).toFixed(2)}/mo in subscriptions. Go through each one — did you use it last month? Most households find 1–2 to cancel painlessly.`,saving:"$15–35/mo",effort:"Low",color:C.purple},
    {id:5,icon:"chartUp",title:`${stats.busiest} is your expensive day`,body:`You spend significantly more on ${stats.busiest}s than any other day. Knowing this is half the battle — awareness alone cuts it 20–30%.`,saving:"$30–60/mo",effort:"Very Low",color:C.blue},
  ].filter(Boolean).filter(s=>!dismissed.includes(s.id));

  const ALL_CATS = ["Food & Drink","Groceries","Transport","Shopping","Entertainment","Bills & Utilities","Health","Income","Subscriptions","Travel","Other"];

    if(!isDemo && txns.length === 0) return <EmptyState icon="💳" title="No transactions yet" body="Your transactions are loading from your bank. Check back in a moment — or pull to refresh." action="Refresh" onAction={()=>window.location.reload()} color={C.orange}/>;

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <ScreenHeader title="Transactions" subtitle={monthLabel} onBack={setScreen?()=>setScreen("home"):null} cta="Ask Coach" onCta={setScreen?()=>setScreen("coach"):null} ctaColor={C.purple}/>
    {/* Mark as Bill modal */}
    {markBillTxn&&(
      <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:isDesktop?"center":"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)"}} onClick={()=>setMarkBillTxn(null)}>
        <div style={{background:C.bg,borderRadius:"24px 24px 0 0",width:"100%",maxWidth:520,border:`1px solid ${C.border}`,boxShadow:"0 -12px 48px rgba(0,0,0,0.5)",padding:"0 0 env(safe-area-inset-bottom,16px)"}} onClick={e=>e.stopPropagation()}>
          <div style={{padding:"16px 20px 14px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:36,height:4,borderRadius:99,background:C.border,margin:"0 auto 14px"}}/>
            {(()=>{
              // Check if an existing bill matches this transaction's amount closely
              const txAmt = parseFloat(markBillTxn?.amount||0);
              const matchedBill = (data.bills||[]).find(b => Math.abs(parseFloat(b.amount||0) - txAmt) < 5);
              return matchedBill ? (
                <div style={{color:C.goldBright,fontSize:12,fontWeight:700,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                  <span>⚠️</span> This looks like your tracked <strong>{matchedBill.name}</strong> (${parseFloat(matchedBill.amount).toFixed(2)}/mo)
                </div>
              ) : null;
            })()}
            <div style={{color:C.cream,fontWeight:800,fontSize:16}}>Add to Monthly Bills</div>
            <div style={{color:C.muted,fontSize:12,marginTop:3}}>This will add it to your forecast and Plan screen.</div>
          </div>
          <div style={{padding:"16px 20px 20px"}}>
            <div style={{marginBottom:12}}>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Bill Name</div>
              <input value={billForm.name} onChange={e=>setBillForm(v=>({...v,name:e.target.value}))}
                style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.cream,fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              <div>
                <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Monthly Amount</div>
                <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.green}`,borderRadius:10,overflow:"hidden"}}>
                  <span style={{color:C.muted,padding:"0 10px",fontSize:14}}>$</span>
                  <input value={billForm.amount} onChange={e=>setBillForm(v=>({...v,amount:e.target.value}))} type="number"
                    style={{flex:1,background:"none",border:"none",padding:"10px 10px 10px 0",color:C.cream,fontSize:14,fontFamily:"inherit",outline:"none",fontWeight:700}}/>
                </div>
              </div>
              <div>
                <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Day Due</div>
                <select value={billForm.date} onChange={e=>setBillForm(v=>({...v,date:e.target.value}))}
                  style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.cream,fontSize:13,fontFamily:"inherit"}}>
                  {Array.from({length:28},(_,i)=>{const n=i+1;const s=[11,12,13].includes(n)?"th":["st","nd","rd"][n%10-1]||"th";return <option key={n} value={String(n)}>{n}{s}</option>;})}
                </select>
              </div>
            </div>
            {/* Fixed / Variable toggle */}
            <div style={{marginBottom:12}}>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Bill Type</div>
              <div style={{display:"flex",gap:8}}>
                {[["fixed","📌 Fixed","Same every month"],["variable","🔄 Variable","Changes monthly"]].map(([val,label,hint])=>(
                  <button key={val} onClick={()=>setBillForm(v=>({...v,type:val}))}
                    style={{flex:1,background:billForm.type===val?C.teal+"22":C.card,border:`1px solid ${billForm.type===val?C.teal:C.border}`,
                      borderRadius:10,padding:"9px 10px",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                    <div style={{color:billForm.type===val?C.tealBright:C.cream,fontWeight:700,fontSize:12}}>{label}</div>
                    <div style={{color:C.muted,fontSize:10,marginTop:2}}>{hint}</div>
                  </button>
                ))}
              </div>
            </div>
            {/* Reports-under category */}
            <div style={{marginBottom:14}}>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Reports under (in Budget)</div>
              <select value={billForm.category||"Other Bills"} onChange={e=>setBillForm(v=>({...v,category:e.target.value}))}
                style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",
                  color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none"}}>
                {["Housing","Utilities","Phone & Internet","Insurance","Subscriptions","Transportation","Health","Education","Other Bills"].map(c=>(
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <div style={{color:C.muted,fontSize:10,marginTop:4}}>Keeps bills separate from your discretionary spending budget.</div>
            </div>
            <div style={{background:C.teal+"12",border:`1px solid ${C.teal}33`,borderRadius:12,padding:"10px 14px",marginBottom:16}}>
              <div style={{color:C.tealBright,fontSize:12,fontWeight:600}}>💡 This will also update your cash-flow forecast</div>
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>Your Plan screen will now include ${billForm.amount}/month on the {billForm.date ? billForm.date+"th" : ""}</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button
                disabled={!billForm.name||!billForm.amount}
                onClick={()=>{
                  if(!billForm.name||!billForm.amount) return;
                  if(setAppData){
                    const billName = billForm.name.trim().toLowerCase();
                    const alreadyExists = (data.bills||[]).some(b=>b.name.trim().toLowerCase()===billName);
                    if(!alreadyExists){
                      const newBill = {name:billForm.name.trim(),amount:billForm.amount,date:billForm.date,
                        type:billForm.type||"fixed",category:billForm.category||"Other Bills",
                        vendorPattern:(markBillTxn?.name||"").toLowerCase().trim()};
                      const merchantKey = (markBillTxn?.name||"").toLowerCase().trim();
                      setAppData(prev=>({...prev,
                        bills:[...(prev.bills||[]),newBill],
                        vendorBillMap:{...(prev.vendorBillMap||{}),...(merchantKey?{[merchantKey]:newBill.name}:{})}}));
                    }
                    // Categorise transaction under bill's category (not generic "Bills")
                    const billCat = billForm.category||"Other Bills";
                    const overrides=JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}");
                    localStorage.setItem("flourish_cat_overrides",JSON.stringify({...overrides,[markBillTxn.id]:billCat}));
                  }
                  setMarkBillTxn(null);setBillForm({name:"",amount:"",date:"1",type:"fixed",category:"Bills"});
                }}
                style={{flex:1,background:billForm.name&&billForm.amount?C.green:"rgba(255,255,255,0.08)",border:"none",
                  borderRadius:12,padding:"13px",color:billForm.name&&billForm.amount?"#041810":C.muted,fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
                Add to Bills ✓
              </button>
              <button onClick={()=>setMarkBillTxn(null)}
                style={{background:"none",border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 18px",color:C.muted,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {/* ── Arrears payment modal ─────────────────────────────────────
        User taps "Pay arrears →" on a transaction.
        They pick which bill this payment applies to.
        We deduct the transaction amount from that bill's arrears balance.
    ────────────────────────────────────────────────────────────────── */}
    {arrearsPayTxn&&(
      <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:isDesktop?"center":"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)"}} onClick={()=>setArrearsPayTxn(null)}>
        <div style={{width:"100%",maxWidth:520,background:C.bg,borderRadius:"24px 24px 0 0",border:`1px solid ${C.border}`,boxShadow:"0 -12px 48px rgba(0,0,0,0.5)",padding:"0 0 env(safe-area-inset-bottom,16px)"}} onClick={e=>e.stopPropagation()}>
          <div style={{padding:"16px 20px 14px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:36,height:4,borderRadius:99,background:C.border,margin:"0 auto 14px"}}/>
            <div style={{color:C.cream,fontWeight:800,fontSize:16}}>Apply payment to arrears</div>
            <div style={{color:C.muted,fontSize:12,marginTop:3}}>
              ${(arrearsPayTxn.amount||0).toFixed(2)} from <strong style={{color:C.mutedHi}}>{arrearsPayTxn.name}</strong> — which bill does this pay down?
            </div>
          </div>
          <div style={{padding:"14px 20px 20px",maxHeight:"60vh",overflowY:"auto"}}>
            {(data.bills||[]).filter(b=>parseFloat(b.arrears||0)>0).length===0?(
              <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>
                No bills with arrears tracked yet.<br/>
                <span style={{fontSize:11}}>Add an arrears balance in Your Bills first.</span>
              </div>
            ):(
              (data.bills||[]).filter(b=>parseFloat(b.arrears||0)>0).map((b,i)=>{
                const billIdx = (data.bills||[]).indexOf(b);
                const arrears = parseFloat(b.arrears||0);
                const payment = parseFloat(arrearsPayTxn.amount||0);
                const newBalance = Math.max(0, arrears - payment);
                return (
                  <div key={i} style={{background:C.card,borderRadius:14,padding:"14px 16px",marginBottom:10,border:`1px solid ${C.gold}33`,cursor:"pointer"}}
                    onClick={()=>{
                      // Apply payment — reduce arrears by transaction amount
                      setAppData(prev=>({
                        ...prev,
                        bills:(prev.bills||[]).map((bill,bi)=>
                          bi===billIdx ? {...bill, arrears:String(newBalance.toFixed(2))} : bill
                        )
                      }));
                      setArrearsPayTxn(null);
                    }}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{color:C.cream,fontWeight:700,fontSize:14}}>{b.name}</div>
                        <div style={{color:C.muted,fontSize:11,marginTop:2}}>${b.amount}/mo regular payment</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{color:C.goldBright,fontWeight:800,fontSize:13}}>Owes ${arrears.toFixed(2)}</div>
                        <div style={{color:C.muted,fontSize:10,marginTop:2}}>→ ${newBalance.toFixed(2)} after this</div>
                      </div>
                    </div>
                    {newBalance===0&&(
                      <div style={{background:C.green+"18",border:`1px solid ${C.green}33`,borderRadius:10,padding:"6px 10px",color:C.greenBright,fontSize:11,fontWeight:700,textAlign:"center"}}>
                        ✓ This clears the balance entirely
                      </div>
                    )}
                    {newBalance>0&&(
                      <div style={{background:C.gold+"11",borderRadius:10,padding:"6px 10px",color:C.goldBright,fontSize:11,textAlign:"center"}}>
                        ${newBalance.toFixed(2)} still owing after this payment
                      </div>
                    )}
                    <button style={{width:"100%",marginTop:10,background:`linear-gradient(135deg,${C.gold},${C.goldBright})`,border:"none",borderRadius:10,padding:"10px",color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                      Apply ${payment.toFixed(2)} to {b.name} arrears ✓
                    </button>
                  </div>
                );
              })
            )}
            <button onClick={()=>setArrearsPayTxn(null)}
              style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"11px",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    {/* ── Apply to all vendor modal ─────────────────────────────────── */}
    {applyAllPrompt&&(
      <div style={{position:"fixed",inset:0,zIndex:1001,display:"flex",alignItems:isDesktop?"center":"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)"}} onClick={()=>setApplyAllPrompt(null)}>
        <div style={{width:"100%",maxWidth:520,background:C.bg,borderRadius:"24px 24px 0 0",border:`1px solid ${C.border}`,boxShadow:"0 -12px 48px rgba(0,0,0,0.5)",padding:"0 0 env(safe-area-inset-bottom,16px)"}} onClick={e=>e.stopPropagation()}>
          <div style={{padding:"16px 20px 14px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:36,height:4,borderRadius:99,background:C.border,margin:"0 auto 14px"}}/>
            <div style={{color:C.cream,fontWeight:800,fontSize:16}}>Apply to all?</div>
            <div style={{color:C.muted,fontSize:13,marginTop:4,lineHeight:1.5}}>
              Found <strong style={{color:C.mutedHi}}>{applyAllPrompt.count} transactions</strong> from <strong style={{color:C.mutedHi}}>{applyAllPrompt.txn.name}</strong>.
            </div>
          </div>
          <div style={{padding:"14px 20px 20px",display:"flex",flexDirection:"column",gap:10}}>
            <button onClick={()=>recat(applyAllPrompt.txn, applyAllPrompt.newCat, true)}
              style={{background:`linear-gradient(135deg,${C.orange},${C.orangeBright})`,border:"none",borderRadius:14,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
              Apply "{applyAllPrompt.newCat}" to all {applyAllPrompt.count} transactions ✓
            </button>
            <button onClick={()=>recat(applyAllPrompt.txn, applyAllPrompt.newCat, false)}
              style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"12px",color:C.mutedHi,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              Just this one transaction
            </button>
            <button onClick={()=>setApplyAllPrompt(null)}
              style={{background:"none",border:"none",padding:"8px",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Re-categorize bottom sheet */}
    {recatTxn&&(
      <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:isDesktop?"center":"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)"}}
        onClick={e=>{if(e.target===e.currentTarget)setRecatTxn(null);}}>
        <div style={{background:C.card,borderRadius:isDesktop?"20px":"24px 24px 0 0",width:"100%",maxWidth:520,border:`1px solid ${C.border}`,boxShadow:"0 8px 60px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",maxHeight:isDesktop?"80vh":"85vh"}}>
          {/* Fixed header */}
          <div style={{padding:"16px 20px 12px",flexShrink:0,borderBottom:`1px solid ${C.border}`}}>
            {!isDesktop&&<div style={{width:36,height:4,borderRadius:99,background:C.border,margin:"0 auto 14px"}}/>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.cream,fontWeight:800,fontSize:15}}>Change Category</div>
                <div style={{color:C.muted,fontSize:11,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:240}}>{recatTxn.name}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                {setAppData&&recatTxn.amount>0&&!isCCPayment(recatTxn,data.debts||[])&&<button onClick={()=>{
                  const day=recatTxn.date?new Date(recatTxn.date+"T12:00:00").getDate():new Date().getDate();
                  setBillForm({name:recatTxn.name,amount:(recatTxn.amount||0).toFixed(2),date:String(day)});
                  setMarkBillTxn(recatTxn);setRecatTxn(null);
                }} style={{background:C.teal+"22",border:`1px solid ${C.teal}44`,color:C.tealBright,borderRadius:99,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  + Add to Bills
                </button>}
                {/* Pay arrears button — shows if transaction amount matches a bill with arrears */}
                {setAppData&&recatTxn.amount>0&&(data.bills||[]).some(b=>parseFloat(b.arrears||0)>0)&&(
                  <button onClick={()=>{setArrearsPayTxn(recatTxn);setRecatTxn(null);}}
                    style={{background:C.gold+"22",border:`1px solid ${C.gold}44`,color:C.goldBright,borderRadius:99,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    Pay arrears →
                  </button>
                )}
                <button onClick={()=>setRecatTxn(null)} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer",padding:"4px 8px",lineHeight:1}}>✕</button>
              </div>
            </div>
          </div>
          {/* Scrollable categories */}
          <div style={{overflowY:"auto",padding:"16px 20px",flex:1}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {[...ALL_CATS, ...(JSON.parse(localStorage.getItem("flourish_custom_cats")||"[]"))].map(cat=>(
                <button key={cat} onClick={()=>recatWithSmartPrompt(recatTxn,cat)} style={{background:getCat(recatTxn)===cat?C.orange+"33":C.cardAlt,border:`1px solid ${getCat(recatTxn)===cat?C.orange:C.border}`,color:getCat(recatTxn)===cat?C.orangeBright:C.muted,borderRadius:99,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",minHeight:36}}>
                  {cat}
                </button>
              ))}
            </div>
            {/* Add custom category */}
            <AddCustomCategory onAdd={(cat)=>recatWithSmartPrompt(recatTxn,cat)}/>
          </div>
          {/* Safe bottom padding for mobile */}
          <div style={{height:"env(safe-area-inset-bottom, 16px)",flexShrink:0}}/>
        </div>
      </div>
    )}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:24,fontWeight:900,color:C.cream,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:-0.5}}>Transactions</div>
        <div style={{color:isDemo?C.gold:C.muted,fontSize:12,marginTop:3}}>{isDemo?"Sample data · connect your bank for real insights":"Live from your bank"}</div>
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{color:C.red,fontWeight:800,fontSize:15}}>–${(totalSpent||0).toFixed(0)}</div>
        <div style={{color:C.green,fontSize:11}}>+${(totalIn||0).toFixed(0)} in</div>
        <div style={{color:C.muted,fontSize:10,marginTop:2}}>
          {period==="week"?"This week":period==="month"?monthLabel:period==="last"?"Last month":period==="3mo"?"Last 3 months":"Last 90 days"}
        </div>
      </div>
    </div>

    {!isDemo&&<IncomeDetectionBanner transactions={txns} incomes={data.incomes} setAppData={setAppData}/>}
    <div style={{display:"flex",gap:6,background:C.surface,borderRadius:16,padding:4}}>
      {["txn","breakdown","cuts"].map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?C.orange+"28":"transparent",border:`1px solid ${tab===t?C.orange+"55":"transparent"}`,color:tab===t?C.orangeBright:C.muted,borderRadius:12,padding:"9px 0",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",transition:"all .22s cubic-bezier(.16,1,.3,1)"}}>
        {t==="txn"?"Transactions":t==="breakdown"?"Breakdown":"Smart Cuts"}
      </button>)}
    </div>
    {tab==="txn"&&<>
      {/* Filter row — dropdowns for account, category, period */}
      <div style={{display:"grid",gridTemplateColumns:accountsWithNames.length>1?"1fr 1fr 1fr":"1fr 1fr",gap:8}}>
        {accountsWithNames.length>1&&(
          <div>
            <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Account</div>
            <select value={accountFilter} onChange={e=>{setAccountFilter(e.target.value);setCatFilter("All");}}
              style={{width:"100%",background:C.card,border:`1px solid ${accountFilter!=="All"?C.blue:C.border}`,borderRadius:10,padding:"9px 10px",color:accountFilter!=="All"?C.blueBright:C.cream,fontSize:12,fontFamily:"inherit",fontWeight:600,cursor:"pointer",outline:"none"}}>
              <option value="All">All Accounts</option>
              {accountsWithNames.map(a=>{
                const icon = a.type==="credit"||a.type==="credit card"?"💳":a.type==="savings"?"🏦":a.type==="investment"?"📈":"🏦";
                return <option key={a.id} value={a.id}>{icon} {a.name}</option>;
              })}
            </select>
          </div>
        )}
        <div>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Category</div>
          <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
            style={{width:"100%",background:C.card,border:`1px solid ${catFilter!=="All"?C.orange:C.border}`,borderRadius:10,padding:"9px 10px",color:catFilter!=="All"?C.orangeBright:C.cream,fontSize:12,fontFamily:"inherit",fontWeight:600,cursor:"pointer",outline:"none"}}>
            {cats.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Period</div>
          <select value={period} onChange={e=>setPeriod(e.target.value)}
            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 10px",color:C.cream,fontSize:12,fontFamily:"inherit",fontWeight:600,cursor:"pointer",outline:"none"}}>
            <option value="week">This week</option>
            <option value="month">{monthLabel}</option>
            <option value="last">Last month</option>
            <option value="3mo">Last 3 months</option>
            <option value="all">Last 90 days</option>
          </select>
        </div>
      </div>
      {filtered.length===0&&(
        <div style={{background:C.card,borderRadius:18,padding:"28px 20px",textAlign:"center",border:`1px solid ${C.border}`}}>
          {txns.length===0?(
            <>
              <div style={{fontSize:36,marginBottom:12}}>📂</div>
              <div style={{color:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',serif",marginBottom:8}}>No transactions yet</div>
              <div style={{color:C.muted,fontSize:13,lineHeight:1.6,maxWidth:260,margin:"0 auto"}}>
                Connect your bank in Settings to import live transactions, or upload a bank statement.
              </div>
            </>
          ):(
            <>
              <div style={{fontSize:32,marginBottom:10}}>🔍</div>
              <div style={{color:C.cream,fontWeight:700,fontSize:14,marginBottom:6}}>No transactions match this filter</div>
              <div style={{color:C.muted,fontSize:12}}>Try switching the category or time period above.</div>
            </>
          )}
        </div>
      )}
      {filtered.map(txn=>{
        const effCat = getCat(txn);
        const { emoji: txnEmoji, color: txnDispColor } = getCatDisplay(effCat);
        return (
        <div key={txn.id} style={{background:C.card,borderRadius:18,padding:"14px 16px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,cursor:"default",transition:"all .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.borderHi;e.currentTarget.style.background=C.isDark?C.cardAlt:C.surface;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.card;}}>
          <div style={{width:42,height:42,borderRadius:14,background:txnDispColor+"18",border:`1px solid ${txnDispColor}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
            {txn.logo&&<img src={txn.logo} alt="" style={{width:28,height:28,borderRadius:8,objectFit:"contain"}} onError={e=>{e.target.style.display="none";}}/>}
            {!txn.logo&&<span>{txnEmoji}</span>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:C.cream,fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{txn.name}</div>
            <div style={{display:"flex",gap:6,marginTop:3,alignItems:"center"}}>
              <button onClick={e=>{e.stopPropagation();setRecatTxn(txn);}} style={{background:txn.amount<0?C.green+"18":txnDispColor+"18",border:`1px solid ${txn.amount<0?C.green:txnDispColor}33`,borderRadius:99,padding:"2px 8px",color:txn.amount<0?C.greenBright:txnDispColor,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:3}}>
                {txn.amount<0&&getCat(txn)==="Transfer"?"Received ↓ tap to label":getCat(txn)} <span style={{opacity:0.6,fontSize:9}}>✎</span>
              </button>
              <span style={{color:C.muted,fontSize:10}}>{txn.date}</span>
              {txn.account_id&&accountFilter==="All"&&accountMap[txn.account_id]&&(
                <span style={{color:C.muted,fontSize:9,background:"rgba(255,255,255,0.04)",borderRadius:99,padding:"1px 7px",border:`1px solid ${C.border}`}}>
                  {accountMap[txn.account_id]?.name||"Bank"}
                </span>
              )}
              {txn.pending&&<Chip label="Pending" color={C.gold} size={9}/>}
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{color:txn.amount<0?C.greenBright:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',serif"}}>
              {txn.amount<0?"+":"–"}${Math.abs(txn.amount).toFixed(2)}
            </div>
            {txn.amount<0&&(isCashAdvance(txn)?<div style={{color:C.redBright,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>⚠️ CASH ADVANCE</div>:<div style={{color:C.greenBright,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{getCat(txn)==="Transfer"?"RECEIVED":"INCOME"}</div>)}
          </div>
        </div>
        );
      })}
    </>}
    {tab==="breakdown"&&<>
      {(()=>{
        // Breakdown uses the same period-filtered set as the Transactions tab
        const bdTxns = acctFiltered.filter(t=>t.amount>0&&!EXCLUDE_CATS.has(getCat(t))&&getCat(t)!=="Fees"&&!isCCPayment(t,data.debts||[]));
        const bdIn   = acctFiltered.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
        const bdTotal= bdTxns.reduce((s,t)=>s+t.amount,0);
        const bdByCat= {};
        bdTxns.forEach(t=>{const c=getCat(t);bdByCat[c]=(bdByCat[c]||0)+t.amount;});
        const bdAllCats=Object.entries(bdByCat).sort((a,b)=>b[1]-a[1]);
  const bdTopCats=showAllBdCats?bdAllCats:bdAllCats.slice(0,8);
        const periodLabel = period==="week"?"This week":period==="month"?monthLabel:period==="last"?"Last month":period==="3mo"?"Last 3 months":"Last 90 days";
        return (<>
      <Card style={{background:`linear-gradient(135deg,${C.orangeDim} 0%,${C.card} 100%)`,border:`1px solid ${C.orange}44`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Total Spent · {periodLabel}</div>
            <div style={{fontSize:38,fontWeight:900,color:C.orangeBright,fontFamily:"Georgia,serif"}}>{`$${(bdTotal||0).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2})}`}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{color:C.muted,fontSize:10,marginBottom:2}}>{bdTxns.length} transactions</div>
            <div style={{color:C.green,fontSize:11}}>+${(bdIn||0).toLocaleString("en-CA",{minimumFractionDigits:0})} in</div>
          </div>
        </div>
      </Card>
      {bdTopCats.length===0&&<div style={{background:C.card,borderRadius:16,padding:"24px 20px",textAlign:"center",border:`1px solid ${C.border}`}}>
        <div style={{fontSize:32,marginBottom:8}}>📊</div>
        <div style={{color:C.cream,fontWeight:700,fontSize:14,marginBottom:4}}>No spending data for this period</div>
        <div style={{color:C.muted,fontSize:12}}>Try a broader time range above.</div>
      </div>}
      {/* Budget Plan Card — shown above category breakdown */}
      {period==="month"&&<BudgetPlanCard data={data} setAppData={setAppData}/>}
      {bdTopCats.map(([cat,amt],i)=>{
        const colors=[C.orange,C.pink,C.green,C.blue,C.purple,C.gold];
        const catTxns=acctFiltered.filter(t=>getCat(t)===cat&&t.amount>0&&!isCCPayment(t,data.debts||[]));
        const budget = (data.budgets||{})[cat] || null;
        window.__flourishBills = data.bills||[];
        return <ExpandableCatCard key={i} cat={cat} amt={amt} totalSpent={bdTotal} color={colors[i%6]} catTxns={catTxns}
          budget={budget} onSetBudget={(cat,val)=>{
            if(setAppData) setAppData(prev=>({...prev,budgets:{...(prev.budgets||{}),
              ...(val===null ? Object.fromEntries(Object.entries(prev.budgets||{}).filter(([k])=>k!==cat)) : {[cat]:val})
            }}));
          }}/>;
      })}
      {bdAllCats.length>8&&(
        <button onClick={()=>setShowAllBdCats(v=>!v)}
          style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:12,
            padding:"11px",color:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",
            fontFamily:"inherit",marginTop:2}}>
          {showAllBdCats?"▲ Show less":`▼ Show ${bdAllCats.length-8} more categor${bdAllCats.length-8===1?"y":"ies"}`}
        </button>
      )}
        </>);
      })()}
    </>}
    {tab==="cuts"&&<>
      <Card style={{background:`linear-gradient(135deg,${C.orangeDim} 0%,${C.card} 100%)`,border:`1px solid ${C.orange}44`}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Potential Monthly Savings</div>
        <div style={{fontSize:32,fontWeight:900,color:C.goldBright,fontFamily:"Georgia,serif"}}>${(()=>{
              const total = cuts.reduce((s,c)=>{
                // saving field is like "$50/mo" or "$40–70/mo" — extract first number
                const match = (c.saving||"").match(/\d+/);
                return s + (match ? parseInt(match[0]) : 0);
              },0);
              return total > 0 ? total.toLocaleString() : "0";
            })()}</div>
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
function Goals({data,initialTab="sim",onUpgrade,setScreen,setAppData}){
  const [tab,setTab]=useState(initialTab);
  useEffect(()=>{ setTab(initialTab); },[initialTab]);
  const [selDebt,setSelDebt]=useState(0);
  const [extra,setExtra]=useState(50);
  const [method,setMethod]=useState("avalanche");
  // Goals tab state — must be at top level (Rules of Hooks)
  const [showForm, setShowForm] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [form, setForm] = useState({name:"",target:"",saved:"",monthly:"",notes:""});
  const debts=data.debts||[];
  const safeSelDebt=Math.min(selDebt,Math.max(0,debts.length-1));
  const debt=debts.length>0?debts[safeSelDebt]:{name:"Credit Card",balance:"3420",rate:"19.99",min:"68"};
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
  const { netWorth } = FinancialCalcEngine.netWorth(data);

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <ScreenHeader title="Goals & Wealth" onBack={setScreen?()=>setScreen("home"):null} cta={CC[data?.profile?.country||"CA"]?.flag+" "+CC[data?.profile?.country||"CA"]?.currency} ctaColor={CC[data?.profile?.country||"CA"]?.currency==="USD"?C.blue:C.green}/>
    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
      {[["goals","My Goals"],["sim","Debt Sim"],["worth","Net Worth"],["retire","Retirement"],["forecast","Wealth"],["budget","Budget"],["personality","Personality"],["tax","Tax Tips"],["learn","Learn"]].map(([key,lbl])=>(
        <button key={key} onClick={()=>setTab(key)} style={{flexShrink:0,background:tab===key?C.purple+"22":C.cardAlt,border:`1px solid ${tab===key?C.purple:C.border}`,color:tab===key?C.purpleBright:C.muted,borderRadius:10,padding:"8px 12px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>{lbl}</button>
      ))}
    </div>
    {/* ── MY GOALS TAB ─────────────────────────────────────── */}
    {tab==="goals"&&(()=>{
      const goals = data.goals||[];
      const GOAL_TYPES = [
        {label:"Emergency Fund", icon:"🆘", color:C.orange},
        {label:"RRSP",           icon:"🏦", color:C.teal},
        {label:"TFSA",           icon:"💎", color:C.green},
        {label:"Vacation",       icon:"✈️",  color:C.blue},
        {label:"Down Payment",   icon:"🏠", color:C.purple},
        {label:"Car",            icon:"🚗", color:C.gold},
        {label:"Education",      icon:"🎓", color:C.teal},
        {label:"Wedding",        icon:"💍", color:C.pink},
        {label:"Home Reno",      icon:"🔨", color:C.orange},
        {label:"Other",          icon:"🎯", color:C.muted},
      ];

      const openAdd = () => { setForm({name:"",target:"",saved:"",monthly:"",notes:""}); setEditIdx(null); setShowForm(true); };
      const openEdit = (g,i) => { setForm({name:g.name||g.label||"",target:g.target||"",saved:g.saved||g.current||"",monthly:g.monthly||"",notes:g.notes||""}); setEditIdx(i); setShowForm(true); };
      const saveGoal = () => {
        if(!form.name||!form.target) return;
        if(setAppData) setAppData(prev=>{
          const goals = prev.goals||[];
          if(editIdx!=null) {
            return {...prev, goals: goals.map((g,i)=>i===editIdx?{...g,...form}:g)};
          }
          return {...prev, goals:[...goals,{...form,id:Date.now()}]};
        });
        setShowForm(false); setEditIdx(null);
      };
      const removeGoal = i => { if(setAppData) setAppData(prev=>({...prev,goals:(prev.goals||[]).filter((_,x)=>x!==i)})); };
      const updateField = (i,field,val) => { if(setAppData) setAppData(prev=>({...prev,goals:(prev.goals||[]).map((g,x)=>x===i?{...g,[field]:val}:g)})); };

      const toMonthlyIncome = (() => {
        const toMo = (amt,freq) => { const a=parseFloat(amt||0); return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="monthly"?a:a*2.167; };
        return (data.incomes||[]).filter(i=>parseFloat(i.amount)>0).reduce((s,i)=>s+toMo(i.amount,i.freq),0);
      })();

      return (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Header row */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.5}}>
                {goals.length===0?"Set goals and track progress toward them."
                  :`${goals.length} goal${goals.length===1?"":"s"} · $${goals.reduce((s,g)=>s+parseFloat(g.saved||g.current||0),0).toLocaleString()} saved so far`}
              </div>
            </div>
            <button onClick={openAdd}
              style={{background:`linear-gradient(135deg,${C.purple},${C.purpleBright})`,border:"none",borderRadius:12,padding:"8px 16px",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",minHeight:36}}>
              + Add Goal
            </button>
          </div>

          {/* Goal list */}
          {goals.length===0&&!showForm&&(
            <div style={{background:C.card,borderRadius:18,padding:"28px 20px",textAlign:"center",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:40,marginBottom:12}}>🎯</div>
              <div style={{color:C.cream,fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif",marginBottom:8}}>No goals set yet</div>
              <div style={{color:C.muted,fontSize:13,marginBottom:16,lineHeight:1.6}}>Add your RRSP, emergency fund, vacation — anything you're saving toward. The app will track progress and show you how long it'll take.</div>
              <button onClick={openAdd}
                style={{background:C.purple+"22",border:`1px solid ${C.purple}44`,borderRadius:12,padding:"10px 24px",color:C.purpleBright,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                Add your first goal →
              </button>
            </div>
          )}

          {goals.map((g,i)=>{
            const target  = parseFloat(g.target||1);
            const saved   = parseFloat(g.saved||g.current||0);
            const monthly = parseFloat(g.monthly||0);
            const pct     = Math.min(100, Math.round((saved/target)*100));
            const remaining = Math.max(0, target-saved);
            const moToGo  = monthly>0 ? Math.ceil(remaining/monthly) : null;
            const goalType = GOAL_TYPES.find(t=>t.label.toLowerCase()===((g.name||"").toLowerCase())) || GOAL_TYPES[GOAL_TYPES.length-1];
            const col = goalType.color;
            return (
              <div key={g.id||i} style={{background:C.card,borderRadius:18,border:`1px solid ${col}33`,overflow:"hidden",position:"relative"}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${col},${col}88)`}}/>
                <div style={{padding:"14px 16px 12px"}}>
                  {/* Top row */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{fontSize:22,flexShrink:0}}>{goalType.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:C.cream,fontWeight:800,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name||g.label||"Goal"}</div>
                      {g.notes&&<div style={{color:C.muted,fontSize:11,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.notes}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{color:col,fontWeight:900,fontSize:18,fontFamily:"'Playfair Display',serif"}}>{pct}%</div>
                      <div style={{color:C.muted,fontSize:9}}>complete</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{background:C.border,borderRadius:99,height:8,overflow:"hidden",marginBottom:10}}>
                    <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${col},${col}cc)`,borderRadius:99,transition:"width .5s ease"}}/>
                  </div>
                  {/* Stats row */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                    {[
                      ["Saved","saved", saved>0?`$${saved.toLocaleString()}`:"$0", C.greenBright],
                      ["Target","target", `$${target.toLocaleString()}`, C.cream],
                      ["Monthly","monthly", monthly>0?`$${monthly}/mo`:"Not set", monthly>0?col:C.muted],
                    ].map(([lbl,field,display,color])=>(
                      <div key={field} style={{background:C.cardAlt,borderRadius:10,padding:"8px 10px"}}>
                        <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{lbl}</div>
                        <div style={{display:"flex",alignItems:"center",background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,overflow:"hidden"}}>
                          {field!=="monthly"&&<span style={{color:C.muted,fontSize:10,padding:"0 3px 0 5px"}}>$</span>}
                          <input value={g[field]||""} onChange={e=>updateField(i,field,e.target.value)}
                            type="number" inputMode="decimal" placeholder="0"
                            style={{flex:1,background:"none",border:"none",padding:"5px 4px 5px 0",color,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",width:0,fontWeight:700}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Time estimate */}
                  {remaining>0&&(
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                        {moToGo
                          ? `$${remaining.toLocaleString()} to go · ~${moToGo} month${moToGo===1?"":"s"}`
                          : `$${remaining.toLocaleString()} remaining · add monthly contribution to see timeline`}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>openEdit(g,i)}
                          style={{background:col+"18",border:`1px solid ${col}33`,borderRadius:8,padding:"5px 10px",color:col,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",minHeight:28}}>
                          Edit
                        </button>
                        <button onClick={()=>removeGoal(i)}
                          style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:"5px 8px",minHeight:28,minWidth:28}}>✕</button>
                      </div>
                    </div>
                  )}
                  {remaining<=0&&(
                    <div style={{background:C.green+"14",border:`1px solid ${C.green}33`,borderRadius:10,padding:"8px 12px",color:C.greenBright,fontWeight:700,fontSize:12,textAlign:"center"}}>
                      🎉 Goal reached! Congratulations!
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add / Edit form */}
          {showForm&&(
            <div style={{background:C.cardAlt,borderRadius:18,padding:"16px",border:`1px solid ${C.purple}44`}}>
              <div style={{color:C.cream,fontWeight:800,fontSize:15,marginBottom:14}}>
                {editIdx!=null?"Edit Goal":"New Goal"}
              </div>
              {/* Goal name — type selector */}
              <div style={{marginBottom:10}}>
                <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Goal Type</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {GOAL_TYPES.map(t=>(
                    <button key={t.label} onClick={()=>setForm(v=>({...v,name:t.label}))}
                      style={{background:form.name===t.label?t.color+"33":"rgba(255,255,255,0.04)",border:`1px solid ${form.name===t.label?t.color+"66":C.border}`,borderRadius:10,padding:"7px 12px",color:form.name===t.label?t.color:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",minHeight:34}}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                {/* Custom name override */}
                <input value={GOAL_TYPES.find(t=>t.label===form.name)?"":(form.name||"")}
                  onChange={e=>setForm(v=>({...v,name:e.target.value}))}
                  placeholder="Or type a custom name…"
                  style={{marginTop:8,width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 12px",color:C.cream,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",boxSizing:"border-box"}}/>
              </div>
              {/* Amounts */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                {[["Target $","target"],["Saved so far $","saved"],["Monthly $ contribution","monthly"]].map(([lbl,field])=>(
                  <div key={field}>
                    <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{lbl}</div>
                    <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                      <span style={{color:C.muted,fontSize:11,padding:"0 5px 0 8px"}}>$</span>
                      <input value={form[field]||""} onChange={e=>setForm(v=>({...v,[field]:e.target.value}))}
                        type="number" inputMode="decimal" placeholder="0"
                        style={{flex:1,background:"none",border:"none",padding:"10px 8px 10px 0",color:C.cream,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",fontWeight:600}}/>
                    </div>
                  </div>
                ))}
              </div>
              {/* Notes */}
              <div style={{marginBottom:14}}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Notes (optional)</div>
                <input value={form.notes||""} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}
                  placeholder="e.g. RRSP at TD Bank, contributing $200/paycheque"
                  style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 12px",color:C.cream,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",boxSizing:"border-box"}}/>
              </div>
              {/* Timeline preview */}
              {form.target&&form.monthly&&parseFloat(form.monthly)>0&&(()=>{
                const remaining = Math.max(0,parseFloat(form.target||0)-parseFloat(form.saved||0));
                const months = Math.ceil(remaining/parseFloat(form.monthly));
                const d = new Date(); d.setMonth(d.getMonth()+months);
                return remaining>0?(
                  <div style={{background:C.purple+"12",border:`1px solid ${C.purple}33`,borderRadius:10,padding:"8px 12px",marginBottom:14,color:C.purpleBright,fontSize:12,fontWeight:700,textAlign:"center"}}>
                    📅 At ${parseFloat(form.monthly).toLocaleString()}/mo → reached {d.toLocaleDateString("en-CA",{month:"long",year:"numeric"})} (~{months} month{months===1?"":"s"})
                  </div>
                ):null;
              })()}
              {/* Buttons */}
              <div style={{display:"flex",gap:8}}>
                <button onClick={saveGoal}
                  disabled={!form.name||!form.target}
                  style={{flex:1,background:form.name&&form.target?`linear-gradient(135deg,${C.purple},${C.purpleBright})`:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,padding:"11px",color:form.name&&form.target?"#fff":C.muted,fontWeight:800,fontSize:13,cursor:form.name&&form.target?"pointer":"default",fontFamily:"'Plus Jakarta Sans',sans-serif",opacity:form.name&&form.target?1:0.5}}>
                  {editIdx!=null?"Save Changes ✓":"Add Goal ✓"}
                </button>
                <button onClick={()=>{setShowForm(false);setEditIdx(null);}}
                  style={{background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 18px",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Coach integration hint */}
          {goals.length>0&&setScreen&&(
            <div style={{background:C.purple+"08",border:`1px solid ${C.purple}22`,borderRadius:14,padding:"12px 16px",display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}
              onClick={()=>setScreen("coach")}>
              <span style={{fontSize:18}}>🤖</span>
              <div style={{flex:1}}>
                <div style={{color:C.purpleBright,fontWeight:700,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Ask Coach about your goals</div>
                <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:1}}>Your goals are shared with the AI Coach — ask it to suggest contributions or adjust timelines.</div>
              </div>
              <span style={{color:C.purpleBright,fontSize:16}}>→</span>
            </div>
          )}
        </div>
      );
    })()}

    {tab==="sim"&&<>
      {noDebts&&<EmptyState icon="🎯" title="No debts tracked yet" body="Add debts during setup to simulate payoff strategies and see how much interest you can save." action="Add Debts in Settings" onAction={()=>window.dispatchEvent(new CustomEvent("flourish:settings"))} color={C.purple}/>}
      {!noDebts&&debts.every(d=>!parseFloat(d.rate||0))&&(
        <div style={{background:C.gold+"11",border:`1px solid ${C.gold}33`,borderRadius:14,padding:"12px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"flex-start"}}>
          <span style={{fontSize:16,flexShrink:0}}>⚡</span>
          <div>
            <div style={{color:C.goldBright,fontWeight:700,fontSize:13,marginBottom:2}}>Add interest rates to unlock the simulator</div>
            <div style={{color:C.mutedHi,fontSize:12,lineHeight:1.6}}>Your credit card rate is on your statement or card agreement — typically 19.99%–29.99%. Add it in Settings → Debts to see your exact debt-free date and total interest saved.</div>
          </div>
        </div>
      )}
      {!noDebts&&debts.length>1&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{debts.map((d,i)=><button key={i} onClick={()=>setSelDebt(i)} style={{background:safeSelDebt===i?C.purple+"33":C.cardAlt,border:`1px solid ${selDebt===i?C.purple:C.border}`,color:safeSelDebt===i?C.purpleBright:C.muted,borderRadius:10,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>{d.name}</button>)}</div>}
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
      const checking=allAccts.filter(a=>a.type==="checking").reduce((s,a)=>s+(a.balance||0),0);
      const savings=allAccts.filter(a=>a.type==="savings").reduce((s,a)=>s+(a.balance||0),0);
      const totalAssets=checking+savings+totalInvested;
      const { netWorth: realNetWorth, bankCreditLiabilities, manualNonBankDebts } = FinancialCalcEngine.netWorth(data);
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
      const tips=getPersonalizedTaxCredits(data.profile);
      const highPriority=tips.filter(t=>t.priority==="high");
      const medPriority=tips.filter(t=>t.priority!=="high");
      const totalSavings=highPriority.length+" high-priority credits identified";
      return <div style={{display:"flex",flexDirection:"column",gap:14}}>

        {/* Hero banner */}
        <div style={{background:`linear-gradient(135deg,${C.gold}18 0%,${C.gold}08 100%)`,border:`1px solid ${C.gold}40`,borderRadius:20,padding:"18px 20px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-18,right:-18,fontSize:64,opacity:0.08}}>💰</div>
          <div style={{color:C.goldBright,fontWeight:800,fontSize:13,marginBottom:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{cfg.flag} {cfg.name}-Specific Tax Opportunities</div>
          <div style={{color:C.muted,fontSize:12,lineHeight:1.6,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:12}}>Most people leave thousands on the table. These are the credits and benefits you may be missing right now.</div>
          <div style={{display:"flex",gap:10}}>
            <div style={{background:C.gold+"22",borderRadius:12,padding:"8px 14px",textAlign:"center"}}>
              <div style={{color:C.goldBright,fontWeight:900,fontSize:18,fontFamily:"'Playfair Display',serif"}}>{highPriority.length}</div>
              <div style={{color:C.muted,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>High Priority</div>
            </div>
            <div style={{background:C.teal+"18",borderRadius:12,padding:"8px 14px",textAlign:"center"}}>
              <div style={{color:C.tealBright,fontWeight:900,fontSize:18,fontFamily:"'Playfair Display',serif"}}>{cfg.benefitsChecker.length}</div>
              <div style={{color:C.muted,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>Benefits</div>
            </div>
            <div style={{background:C.green+"18",borderRadius:12,padding:"8px 14px",textAlign:"center",flex:1}}>
              <div style={{color:C.greenBright,fontWeight:900,fontSize:14,fontFamily:"'Playfair Display',serif"}}>$$$</div>
              <div style={{color:C.muted,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>Unclaimed</div>
            </div>
          </div>
        </div>

        {/* High Priority Section */}
        {highPriority.length>0&&<>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{height:1,flex:1,background:C.gold+"33"}}/>
            <span style={{color:C.goldBright,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1.8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>🔥 High Priority</span>
            <div style={{height:1,flex:1,background:C.gold+"33"}}/>
          </div>
          {highPriority.map((tip,i)=>(
            <div key={i} style={{background:C.card,borderRadius:20,padding:"18px 20px",border:`1.5px solid ${C.gold}44`,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${C.gold},${C.goldBright})`}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div style={{flex:1,paddingRight:12}}>
                  <div style={{color:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',serif",lineHeight:1.3,marginBottom:6}}>{tip.title}</div>
                  <div style={{color:C.mutedHi,fontSize:12.5,lineHeight:1.7,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{tip.body}</div>
                </div>
                <div style={{background:C.gold+"18",borderRadius:12,padding:"8px 10px",textAlign:"center",flexShrink:0,minWidth:56}}>
                  <div style={{fontSize:18}}>{tip.flag}</div>
                  <div style={{color:C.goldBright,fontSize:8,fontWeight:800,textTransform:"uppercase",letterSpacing:0.8,marginTop:3}}>Priority</div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:12,borderTop:`1px solid ${C.gold}22`}}>
                <div>
                  <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:2}}>Potential savings</div>
                  <div style={{color:C.goldBright,fontWeight:900,fontSize:16,fontFamily:"'Playfair Display',serif"}}>{tip.savings}</div>
                </div>
                <button style={{background:`linear-gradient(135deg,${C.gold}33,${C.gold}18)`,border:`1px solid ${C.gold}55`,borderRadius:99,padding:"8px 16px",color:C.goldBright,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  {tip.action} →
                </button>
              </div>
            </div>
          ))}
        </>}

        {/* Other Tips Section */}
        {medPriority.length>0&&<>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
            <div style={{height:1,flex:1,background:C.border}}/>
            <span style={{color:C.muted,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1.8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Also Worth Reviewing</span>
            <div style={{height:1,flex:1,background:C.border}}/>
          </div>
          {medPriority.map((tip,i)=>(
            <div key={i} style={{background:C.card,borderRadius:18,padding:"16px 18px",border:`1px solid ${C.border}`,position:"relative",overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{flex:1,paddingRight:10}}>
                  <div style={{color:C.cream,fontWeight:700,fontSize:14,fontFamily:"'Playfair Display',serif",lineHeight:1.3,marginBottom:5}}>{tip.title}</div>
                  <div style={{color:C.mutedHi,fontSize:12,lineHeight:1.65,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{tip.body}</div>
                </div>
                <div style={{fontSize:18,flexShrink:0,marginLeft:8}}>{tip.flag}</div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                <div style={{color:C.tealBright,fontWeight:700,fontSize:13,fontFamily:"'Playfair Display',serif"}}>{tip.savings}</div>
                <button style={{background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:99,padding:"6px 14px",color:C.mutedHi,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  {tip.action} →
                </button>
              </div>
            </div>
          ))}
        </>}

        {/* Benefits Checker */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
          <div style={{height:1,flex:1,background:C.teal+"33"}}/>
          <span style={{color:C.tealBright,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1.8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>🎁 Benefits You May Not Be Claiming</span>
          <div style={{height:1,flex:1,background:C.teal+"33"}}/>
        </div>
        {cfg.benefitsChecker.map((b,i)=>(
          <div key={i} style={{background:C.card,borderRadius:16,padding:"14px 18px",border:`1px solid ${C.teal}28`,display:"flex",gap:14,alignItems:"center"}}>
            <div style={{width:44,height:44,borderRadius:14,background:C.teal+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{b.icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:C.cream,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:2}}>{b.name}</div>
              <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4}}>{b.eligible}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:C.tealBright,fontWeight:800,fontSize:13,fontFamily:"'Playfair Display',serif"}}>{b.amount}</span>
                <span style={{color:C.tealBright,fontSize:11,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{b.apply} →</span>
              </div>
            </div>
          </div>
        ))}

        {/* Bottom nudge */}
        <div style={{background:C.green+"10",border:`1px solid ${C.green}28`,borderRadius:16,padding:"14px 18px",textAlign:"center",marginTop:4}}>
          <div style={{fontSize:20,marginBottom:6}}>🌱</div>
          <div style={{color:C.greenBright,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4}}>Not sure what applies to you?</div>
          <div style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Ask your AI Coach — tell it your situation and it will identify exactly which credits you qualify for.</div>
        </div>

      </div>;
    })()}

    {tab==="retire"&&(()=>{
      const cfg=CC[data.profile?.country||"CA"];
      const accts=cfg.retirementAccounts;
      const isCA = (data.profile?.country||"CA")==="CA";
      // Retirement account balances — stored in profile.retirement
      const ret = data.profile?.retirement||{};
      const updateRet = (field,val) => {
        if(setAppData) setAppData(prev=>({...prev,profile:{...(prev.profile||{}),retirement:{...(prev.profile?.retirement||{}),[field]:val}}}));
      };
      return <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{background:C.blueDim,border:`1px solid ${C.blue}33`,borderRadius:16,padding:"14px 16px"}}>
          <div style={{color:C.blueBright,fontWeight:700,fontSize:13,marginBottom:4}}>{cfg.flag} Registered & Tax-Advantaged Accounts</div>
          <div style={{color:C.muted,fontSize:12,lineHeight:1.6}}>These accounts are legal ways to keep more of your money. Most people don't maximize them.</div>
        </div>

        {/* ── My Balances & Contributions ─────────────────────── */}
        <div style={{background:C.card,borderRadius:18,padding:"16px 18px",border:`1px solid ${C.teal}33`}}>
          <div style={{color:C.tealBright,fontWeight:800,fontSize:14,fontFamily:"'Playfair Display',serif",marginBottom:14}}>
            💼 My Current Balances & Contributions
          </div>
          {/* ── Balances row (2 col grid) */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          {(isCA?[
            ["rrspBalance","RRSP Balance","Current RRSP value"],
            ["tfsaBalance","TFSA Balance","Current TFSA value"],
          ]:[
            ["401kBalance","401(k) Balance","Current 401(k) value"],
            ["iraBalance","IRA / Roth IRA Balance","Current IRA value"],
          ]).map(([field,label,hint])=>(
            <div key={field}>
              <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</div>
              <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                <span style={{color:C.muted,fontSize:11,padding:"0 5px 0 8px"}}>$</span>
                <input value={ret[field]||""} onChange={e=>updateRet(field,e.target.value)}
                  type="number" inputMode="decimal" placeholder="0" title={hint}
                  style={{flex:1,background:"none",border:"none",padding:"10px 8px 10px 0",color:C.tealBright,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",fontWeight:700}}/>
              </div>
              <div style={{color:C.muted,fontSize:9,marginTop:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{hint}</div>
            </div>
          ))}
          </div>
          {/* ── Contributions with frequency selector */}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {(isCA?[
            ["rrspMonthly","rrspFreq","RRSP Contribution"],
            ["tfsaMonthly","tfsaFreq","TFSA Contribution"],
            ["pensionMonthly","pensionFreq","Pension / Other"],
          ]:[
            ["401kMonthly","401kFreq","401(k) Contribution"],
            ["iraMonthly","iraFreq","IRA / Roth IRA Contribution"],
            ["otherRetire","otherRetireFreq","Other Retirement"],
          ]).map(([field,freqField,label])=>{
            const freq = ret[freqField]||"monthly";
            const toMo = (amt,f) => { const a=parseFloat(amt||0); return f==="weekly"?a*4.333:f==="biweekly"?a*2.167:f==="annually"?a/12:a; };
            const mo = toMo(ret[field]||0, freq);
            return (
              <div key={field}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{flex:1,display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                    <span style={{color:C.muted,fontSize:11,padding:"0 5px 0 8px"}}>$</span>
                    <input value={ret[field]||""} onChange={e=>updateRet(field,e.target.value)}
                      type="number" inputMode="decimal" placeholder="0"
                      style={{flex:1,background:"none",border:"none",padding:"10px 8px 10px 0",color:C.tealBright,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",fontWeight:700}}/>
                  </div>
                  <select value={freq} onChange={e=>updateRet(freqField,e.target.value)}
                    style={{background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 8px",
                      color:C.mutedHi,fontSize:11,fontFamily:"inherit",outline:"none",flexShrink:0,cursor:"pointer"}}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="annually">Annually</option>
                  </select>
                </div>
                {ret[field]&&freq!=="monthly"&&(
                  <div style={{color:C.teal,fontSize:9,marginTop:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                    = ${mo.toFixed(0)}/mo
                  </div>
                )}
              </div>
            );
          })}
          </div>
          {/* Projection summary */}
          {(()=>{
            const toMo=(amt,f)=>{const a=parseFloat(amt||0);return f==="weekly"?a*4.333:f==="biweekly"?a*2.167:f==="annually"?a/12:a;};
            const bal = parseFloat(ret[isCA?"rrspBalance":"401kBalance"]||0) + parseFloat(ret[isCA?"tfsaBalance":"iraBalance"]||0);
            const monthly = toMo(ret[isCA?"rrspMonthly":"401kMonthly"]||0, ret[isCA?"rrspFreq":"401kFreq"]||"monthly")
                          + toMo(ret[isCA?"tfsaMonthly":"iraMonthly"]||0, ret[isCA?"tfsaFreq":"iraFreq"]||"monthly")
                          + toMo(ret[isCA?"pensionMonthly":"otherRetire"]||0, ret[isCA?"pensionFreq":"otherRetireFreq"]||"monthly");
            if(bal<=0&&monthly<=0) return null;
            // Simple 30-year projection at 6% annual return
            const r = 0.06/12;
            const n = 30*12;
            const fv = bal*Math.pow(1+r,n) + (monthly>0?monthly*((Math.pow(1+r,n)-1)/r):0);
            return (
              <div style={{marginTop:12,background:C.teal+"10",border:`1px solid ${C.teal}33`,borderRadius:12,padding:"10px 14px"}}>
                <div style={{color:C.tealBright,fontWeight:700,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  📈 At this rate, in 30 years: ~${(fv/1000).toFixed(0)}k
                </div>
                <div style={{color:C.muted,fontSize:10,marginTop:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  Assumes 6% avg annual return · {isCA?"RRSP + TFSA":"401(k) + IRA"} combined · ${bal.toLocaleString()} current + ${monthly}/mo
                </div>
              </div>
            );
          })()}
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
    {tab==="budget"&&(()=>{
      const { suggestions, netMo, fixedMo, discret, savingsMo, savingsRate, grossMo } = generateBudgetSuggestions(data);
      const budgets = data.budgets||{};
      const hasBudgets = Object.keys(budgets).length > 0;
      const isCA = (data.profile?.country||"CA")==="CA";

      // Monthly savings needed for active goals
      const activeGoals = (data.goals||[]).filter(g=>parseFloat(g.target||0)>parseFloat(g.saved||0));
      const localGoalsMo = activeGoals.reduce((s,g)=>{
        const remaining = parseFloat(g.target||0) - parseFloat(g.saved||0);
        const mo = parseFloat(g.monthly||0);
        return s + (mo>0 ? mo : remaining>0 ? Math.ceil(remaining/24) : 0);
      },0);
      // discret from generateBudgetSuggestions already accounts for goals globally,
      // but inside Goals tab we recalc locally for display
      const spendPool = Math.max(50, discret - localGoalsMo);

      // Current month spending per category
      const catOverrides = (()=>{try{return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}");}catch{return {};}})();
      const now = new Date();
      const monthTxns = (data.transactions||[]).filter(t=>{
        try{const d=new Date(t.date+"T12:00:00");return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()&&t.amount>0;}catch{return false;}
      });
      const monthSpend = {};
      monthTxns.forEach(t=>{ const cat=catOverrides[t.id]||t.cat; monthSpend[cat]=(monthSpend[cat]||0)+t.amount; });

      // Merge budgets + suggestions for display
      const displayCats = {...suggestions};
      Object.keys(budgets).forEach(k=>{ if(!displayCats[k]) displayCats[k]=budgets[k]; });

      // Where to save suggestions — categories where actual > budget by >20%
      const saveSuggestions = Object.entries(budgets).map(([cat,limit])=>{
        const spent = monthSpend[cat]||0;
        const pct = limit>0?spent/limit:0;
        const saving = actuals[cat]||0;
        if(pct>1.2&&saving>20) return {cat, spent, limit, over:spent-limit, potential:Math.round((saving-(limit*0.85))/5)*5};
        return null;
      }).filter(Boolean).sort((a,b)=>b.over-a.over).slice(0,3);

      const catEmojis = {"Groceries":"🛒","Coffee & Dining":"☕","Gas & Transport":"🚗","Shopping":"🛍️","Clothing":"👗","Subscriptions":"📱","Health":"💊","Personal Care":"🧴","Entertainment":"🎬","Hobbies & Sports":"🎯","Kids & Extracurricular":"🧒","Travel":"✈️","Home":"🏠","Education":"📚"};
      const catColors2 = {"Groceries":C.green,"Coffee & Dining":C.orange,"Gas & Transport":C.blue,"Shopping":C.pink,"Clothing":C.purple,"Subscriptions":C.teal,"Health":C.teal,"Personal Care":C.gold,"Entertainment":C.pink,"Hobbies & Sports":C.blue,"Kids & Extracurricular":C.green,"Travel":C.purple,"Home":C.orange,"Education":C.blue};

      return (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Header math strip */}
          <div style={{background:C.card,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.border}`}}>
            <div style={{color:C.cream,fontWeight:800,fontSize:14,marginBottom:10,fontFamily:"'Playfair Display',serif"}}>📊 Your Budget Breakdown</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                ["Take-home", `$${Math.round(netMo).toLocaleString()}/mo`, C.green],
                ["Fixed bills & debt", `−$${Math.round(fixedMo).toLocaleString()}/mo`, C.red],
                ["Savings target", `−$${Math.round(savingsMo).toLocaleString()}/mo`, C.teal],
                ...(localGoalsMo>0?[["Goal savings", `−$${Math.round(localGoalsMo).toLocaleString()}/mo`, C.purple]]:[]),
                ["Available for spending", `$${Math.round(spendPool).toLocaleString()}/mo`, C.greenBright],
              ].map(([label,val,color])=>(
                <div key={label} style={{background:C.cardAlt,borderRadius:10,padding:"8px 10px",border:`1px solid ${C.border}`}}>
                  <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
                  <div style={{color,fontWeight:800,fontSize:13,marginTop:2}}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Active goal savings reminder */}
          {localGoalsMo>0&&(
            <div style={{background:C.purple+"18",border:`1px solid ${C.purple}33`,borderRadius:12,padding:"10px 14px"}}>
              <div style={{color:C.purpleBright,fontWeight:700,fontSize:12,marginBottom:4}}>🎯 Saving for {activeGoals.length} goal{activeGoals.length>1?"s":""}</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {activeGoals.map((g,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:C.muted,fontSize:11}}>{g.name||"Goal"}</span>
                    <span style={{color:C.purpleBright,fontSize:11,fontWeight:700}}>${parseFloat(g.monthly||Math.ceil((parseFloat(g.target||0)-parseFloat(g.saved||0))/24)).toFixed(0)}/mo</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Where to save suggestions */}
          {saveSuggestions.length>0&&(
            <div style={{background:C.orange+"12",border:`1px solid ${C.orange}33`,borderRadius:12,padding:"12px 14px"}}>
              <div style={{color:C.orange,fontWeight:800,fontSize:12,marginBottom:8}}>💡 Where you could save</div>
              {saveSuggestions.map(({cat,over,potential})=>(
                <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div>
                    <span style={{color:C.cream,fontSize:12}}>{catEmojis[cat]||"📌"} {cat}</span>
                    <span style={{color:C.redBright,fontSize:10,marginLeft:6}}>${Math.round(over)} over this month</span>
                  </div>
                  {potential>0&&<span style={{color:C.green,fontSize:11,fontWeight:700}}>Save ~${potential}/mo</span>}
                </div>
              ))}
            </div>
          )}

          {/* Per-category budget rows */}
          <div style={{background:C.card,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{color:C.cream,fontWeight:700,fontSize:13}}>Monthly Category Budgets</div>
              <button onClick={()=>{
                const seed={};
                Object.entries(budgets).forEach(([k,v])=>{seed[k]=String(v);});
                Object.entries(displayCats).forEach(([k,v])=>{if(!seed[k])seed[k]=String(v);});
                if(setAppData) setAppData(prev=>({...prev,_budgetEditOpen:true,_budgetEditSeed:seed}));
              }} style={{background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:8,padding:"5px 10px",color:C.greenBright,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                Edit
              </button>
            </div>
            {!hasBudgets&&(
              <div style={{textAlign:"center",padding:"16px 0",color:C.muted,fontSize:12}}>
                No budget set yet. Go to <strong style={{color:C.green}}>Activity → This Month</strong> to build your budget plan, then come back here to track it.
              </div>
            )}
            {Object.entries(budgets).map(([cat,limit])=>{
              const spent = monthSpend[cat]||0;
              const pct = limit>0?Math.min(100,Math.round(spent/limit*100)):0;
              const over = spent>limit;
              const color = catColors2[cat]||C.muted;
              return (
                <div key={cat} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{color:C.cream,fontSize:12,fontWeight:600}}>{catEmojis[cat]||"📌"} {cat}</span>
                    <span style={{color:over?C.redBright:C.muted,fontSize:11,fontWeight:over?700:400}}>
                      ${Math.round(spent).toLocaleString()} / ${Math.round(limit).toLocaleString()}
                      {over&&<span style={{color:C.redBright}}> ⚠️ ${Math.round(spent-limit)} over</span>}
                    </span>
                  </div>
                  <div style={{height:6,background:C.border,borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,borderRadius:99,transition:"width .4s",
                      background:over?C.red:pct>80?C.orange:color}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                    <span style={{color:C.muted,fontSize:9}}>{pct}% used</span>
                    {!over&&<span style={{color:C.muted,fontSize:9}}>${Math.round(limit-spent)} remaining</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Savings rate note */}
          <div style={{background:C.tealDim,border:`1px solid ${C.teal}33`,borderRadius:12,padding:"10px 14px",textAlign:"center"}}>
            <div style={{color:C.tealBright,fontSize:11,fontWeight:700}}>
              💰 {Math.round(savingsRate*100)}% savings target ({isCA?"RRSP/TFSA/Emergency":"401k/IRA/Emergency"}) = ${Math.round(savingsMo).toLocaleString()}/mo already reserved
            </div>
            <div style={{color:C.muted,fontSize:10,marginTop:3}}>
              Budget in Activity → This Month to set or adjust your spending limits.
            </div>
          </div>

        </div>
      );
    })()}
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
function Family({data,household,setHousehold,setScreen}){
  const [tab,setTab]=useState("meeting");
  const [householdTab,setHouseholdTab]=useState("join");
  const [householdCode,setHouseholdCode]=useState("");
  const [started,setStarted]=useState(false);
  const [checks,setChecks]=useState({});
  const [notes,setNotes]=useState({});
  const [mood,setMood]=useState(null);
  const [done2,setDone2]=useState(false);
  const [expandedItem,setExpandedItem]=useState(null);
  const [kids,setKids]=useState(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("flourish_kids")||"null")||[];
      return saved.map(k=>({
        jars:{spend:0,save:0,give:0},
        goal:{name:"",amount:"",emoji:"🎯"},
        theme:"pink",streak:0,lastReset:null,
        requireApproval:false,...k,
        chores:(k.chores||[]).map(c=>({freq:"weekly",approved:false,...c}))
      }));
    }catch{return[];}
  });
  const [activeKidId,setActiveKidId]=useState(()=>{
    try{const k=JSON.parse(localStorage.getItem("flourish_kids")||"null")||[];return k[0]?.id||null;}catch{return null;}
  });
  const [showAddKid,setShowAddKid]=useState(false);
  const [newKidName,setNewKidName]=useState("");
  const [newKidAge,setNewKidAge]=useState("8-12");
  const [newKidEmoji,setNewKidEmoji]=useState("🧒");
  const [newChoreTask,setNewChoreTask]=useState("");
  const [newChoreReward,setNewChoreReward]=useState("");
  const [newChoreFreq,setNewChoreFreq]=useState("weekly");
  const [copiedKidId,setCopiedKidId]=useState(null);
  const [globalKidAge,setGlobalKidAge]=useState("8-12");
  const [showPayday,setShowPayday]=useState(false);

  const KID_THEMES={
    pink:{name:"Pink",emoji:"🌸",primary:"#FF6B9D",bg:"#ff6b9d22",border:"#ff6b9d44"},
    purple:{name:"Purple",emoji:"💜",primary:"#A855F7",bg:"#a855f722",border:"#a855f744"},
    green:{name:"Green",emoji:"🌿",primary:"#22C55E",bg:"#22c55e22",border:"#22c55e44"},
    blue:{name:"Blue",emoji:"🌊",primary:"#38BDF8",bg:"#38bdf822",border:"#38bdf844"},
    orange:{name:"Orange",emoji:"🔥",primary:"#FB923C",bg:"#fb923c22",border:"#fb923c44"},
    night:{name:"Night",emoji:"🌙",primary:"#818CF8",bg:"#818cf822",border:"#818cf844"},
    sunshine:{name:"Sunshine",emoji:"☀️",primary:"#D97706",bg:"#d9770620",border:"#d9770640"},
    candy:{name:"Candy",emoji:"🍬",primary:"#DB2777",bg:"#db277720",border:"#db277740"},
    sky:{name:"Sky",emoji:"🌤️",primary:"#0284C7",bg:"#0284c720",border:"#0284c740"},
    meadow:{name:"Meadow",emoji:"🌼",primary:"#15803D",bg:"#15803d20",border:"#15803d40"},
    lavender:{name:"Lavender",emoji:"💐",primary:"#7C3AED",bg:"#7c3aed20",border:"#7c3aed40"},
    peach:{name:"Peach",emoji:"🍑",primary:"#C2410C",bg:"#c2410c20",border:"#c2410c40"},
  };

  const saveKids=(updated)=>{
    setKids(updated);
    try{
      localStorage.setItem("flourish_kids",JSON.stringify(updated));
      // Clean up orphaned keys for removed kids
      const codes=new Set(updated.map(k=>k.code));
      Object.keys(localStorage).forEach(key=>{
        const m=key.match(/^flourish_kid_(chores|data|theme)_(.+)$/);
        if(m&&!codes.has(m[2]))localStorage.removeItem(key);
      });
    }catch{}
  };
  const syncKidToStorage=(kid)=>{
    if(kid)try{
      localStorage.setItem("flourish_kid_chores_"+kid.code,JSON.stringify(kid.chores||[]));
      localStorage.setItem("flourish_kid_data_"+kid.code,JSON.stringify({
        name:kid.name,emoji:kid.emoji,age:kid.age,theme:kid.theme||"pink",
        jars:kid.jars||{spend:0,save:0,give:0},
        goal:kid.goal||{name:"",amount:"",emoji:"🎯"},
        streak:kid.streak||0,
      }));
    }catch{}
  };
  const updateKid=(kidId,patch)=>{
    const updated=kids.map(k=>String(k.id)===String(kidId)?{...k,...patch}:k);
    saveKids(updated);
    const kid=updated.find(k=>String(k.id)===String(kidId));
    syncKidToStorage(kid);
  };
  const addKid=()=>{
    if(!newKidName.trim())return;
    const code="KID"+Math.random().toString(36).substring(2,7).toUpperCase();
    const kid={id:Date.now(),name:newKidName.trim(),age:newKidAge,emoji:newKidEmoji,code,
      chores:[],jars:{spend:0,save:0,give:0},goal:{name:"",amount:"",emoji:"🎯"},
      theme:"pink",streak:0,lastReset:null,requireApproval:false};
    const updated=[...kids,kid];
    saveKids(updated);
    setActiveKidId(kid.id);
    setNewKidName("");setNewKidAge("8-12");setNewKidEmoji("🧒");setShowAddKid(false);
  };
  const removeKid=(id)=>{
    const kid=kids.find(k=>String(k.id)===String(id));
    if(kid){
      try{
        localStorage.removeItem("flourish_kid_chores_"+kid.code);
        localStorage.removeItem("flourish_kid_data_"+kid.code);
        localStorage.removeItem("flourish_kid_theme_"+kid.code);
      }catch{}
    }
    saveKids(kids.filter(k=>String(k.id)!==String(id)));
  };
  const addChoreToKid=(kidId)=>{
    if(!newChoreTask.trim())return;
    const chore={id:Date.now(),task:newChoreTask.trim(),reward:parseFloat(newChoreReward)||0.50,
      done:false,freq:newChoreFreq,approved:false};
    const updated=kids.map(k=>String(k.id)===String(kidId)?{...k,chores:[...(k.chores||[]),chore]}:k);
    saveKids(updated);
    setNewChoreTask("");setNewChoreReward("");setNewChoreFreq("weekly");
    const kid=updated.find(k=>String(k.id)===String(kidId));
    syncKidToStorage(kid);
  };
  const toggleKidChore=(kidId,choreId)=>{
    const updated=kids.map(k=>String(k.id)===String(kidId)?{...k,chores:(k.chores||[]).map(c=>c.id===choreId?{...c,done:!c.done,approved:false}:c)}:k);
    saveKids(updated);
    const kid=updated.find(k=>String(k.id)===String(kidId));
    syncKidToStorage(kid);
  };
  const approveKidChore=(kidId,choreId)=>{
    const updated=kids.map(k=>String(k.id)===String(kidId)?{...k,chores:(k.chores||[]).map(c=>c.id===choreId?{...c,approved:true}:c)}:k);
    saveKids(updated);
  };
  const removeKidChore=(kidId,choreId)=>{
    const updated=kids.map(k=>String(k.id)===String(kidId)?{...k,chores:(k.chores||[]).filter(c=>c.id!==choreId)}:k);
    saveKids(updated);
  };
  const paydayKid=(kidId)=>{
    const kid=kids.find(k=>String(k.id)===String(kidId));
    if(!kid)return;
    const chores=kid.chores||[];
    const req=kid.requireApproval;
    const eligible=chores.filter(c=>c.done&&(!req||c.approved));
    const total=eligible.reduce((a,c)=>a+(c.reward||0),0);
    if(total<=0)return;
    const split=kid.jarSplit||{spend:50,save:30,give:20};
    const spend=Math.round(total*(split.spend/100)*100)/100;
    const save=Math.round(total*(split.save/100)*100)/100;
    const give=total-spend-save;
    const prevJars=kid.jars||{spend:0,save:0,give:0};
    const newJars={spend:(prevJars.spend||0)+spend,save:(prevJars.save||0)+save,give:(prevJars.give||0)+give};
    const allDone=chores.every(c=>c.done&&(!req||c.approved));
    const newStreak=allDone?(kid.streak||0)+1:(kid.streak||0);
    const resetChores=chores.map(c=>({...c,done:false,approved:false}));
    const updated=kids.map(k=>String(k.id)===String(kidId)?{...k,jars:newJars,streak:newStreak,chores:resetChores,lastReset:new Date().toISOString()}:k);
    saveKids(updated);
    const updatedKid=updated.find(k=>String(k.id)===String(kidId));
    syncKidToStorage(updatedKid);
  };
  const activeKid=kids.find(k=>String(k.id)===String(activeKidId))||null;

  // Derived — after all hooks
  const isCouple=data.profile?.status!=="single";

  // Pull real metrics for meeting
  const _ss=SafeSpendEngine.calculate(data);
  const {monthlyIncome,monthlyBills,cashFlow}=FinancialCalcEngine.cashFlow(data);
  const totalDebt=(data.debts||[]).reduce((a,d)=>a+parseFloat(d.balance||0),0);
  const SKIP_FAM = new Set(["Transfer","Income","Fees"]);
  const topSpend=(data.transactions||[])
    .filter(t=>t.amount>0 && !SKIP_FAM.has(t.cat))
    .reduce((acc,t)=>{
      const cat=t.cat||"Other";
      acc[cat]=(acc[cat]||0)+t.amount;
      return acc;
    },{});
  const topCat=Object.entries(topSpend).sort((a,b)=>b[1]-a[1])[0];
  const {score:healthScore}=calcHealthScore(data);
  const soonBills=_ss.soonBills||[];
  const householdCode_gen="FLRSH"+Math.random().toString(36).substring(2,5).toUpperCase();

  const meetingMetrics=isCouple?[
    {id:"bills",icon:"📅",title:"Review upcoming bills together",desc:"Open Plan Ahead. Any surprises?",
     metric:soonBills.length>0?`${soonBills.length} bill${soonBills.length>1?"s":""} due soon · $${soonBills.reduce((a,b)=>a+parseFloat(b.amount||0),0).toFixed(0)} total`:"No bills due in the next 10 days ✓",
     metricColor:soonBills.length>0?C.goldBright:C.greenBright,
     prompt:"Which of these did you discuss? Any you need to adjust for?"},
    {id:"spend",icon:"💳",title:"Check where you each spent",desc:"No blame — just awareness.",
     metric:topCat?`Top category: ${topCat[0]} · $${(topCat[1]||0).toFixed(0)} this month`:"No transaction data yet",
     metricColor:C.tealBright,
     prompt:"Was any category a surprise? What would you do differently?"},
    {id:"debt",icon:"📉",title:"Celebrate debt progress",desc:"Even $1 less is a win.",
     metric:totalDebt>0?`Total debt: $${totalDebt.toLocaleString()} · Min payments: $${(data.debts||[]).reduce((a,d)=>a+parseFloat(d.min||0),0).toFixed(0)}/mo`:"No debt tracked — incredible! 🎉",
     metricColor:totalDebt>0?C.orangeBright:C.greenBright,
     prompt:"Did you make any extra payments? What felt hard this week?"},
    {id:"goal",icon:"🎯",title:"Check in on your shared goal",desc:"Emergency fund? Vacation? House?",
     metric:`Cash flow: ${cashFlow>=0?"$"+(cashFlow||0).toFixed(0)+" surplus":"$"+Math.abs(cashFlow).toFixed(0)+" deficit"} · Health score: ${healthScore}/100`,
     metricColor:cashFlow>=0?C.greenBright:C.redBright,
     prompt:"Does the goal still feel right? Are you on track?"},
    {id:"wins",icon:"⭐",title:"Name one win each",desc:"Rewires how you both feel about money.",
     metric:"Both share one money win from this week — no skipping.",
     metricColor:C.purpleBright,
     prompt:"What did you each name? Write it down to revisit next time."},
    {id:"next",icon:"📌",title:"One change for next week",desc:"One achievable change. That's it.",
     metric:"Not ten things. One.",
     metricColor:C.cream,
     prompt:"What's the one change you're committing to?"},
  ]:[
    {id:"bills",icon:"📅",title:"What's coming up this week?",desc:"Any bill or expense to plan around?",
     metric:soonBills.length>0?`${soonBills.length} bill${soonBills.length>1?"s":""} coming · $${soonBills.reduce((a,b)=>a+parseFloat(b.amount||0),0).toFixed(0)} total`:"No bills due soon ✓",
     metricColor:soonBills.length>0?C.goldBright:C.greenBright,
     prompt:"Anything you forgot to budget for?"},
    {id:"varbills",icon:"🔄",title:"Any variable bills to update?",desc:"Hydro, phone, internet — did any change this month?",
     metric:(data.bills||[]).filter(b=>b.type==="variable").length>0
       ?`${(data.bills||[]).filter(b=>b.type==="variable").length} variable bill${(data.bills||[]).filter(b=>b.type==="variable").length>1?"s":""} to review`
       :"No variable bills tracked yet",
     metricColor:C.tealBright,
     prompt:"Update the amount for any bill that changed this month — your forecast will adjust automatically."},
    {id:"spend",icon:"💳",title:"How was your spending?",desc:"Honestly. No judgment.",
     metric:topCat?`Biggest spend: ${topCat[0]} · $${(topCat[1]||0).toFixed(0)}`:`Income: $${(monthlyIncome||0).toFixed(0)} · Bills: $${monthlyBills.toFixed(0)}`,
     metricColor:C.tealBright,
     prompt:"Did anything feel out of control? What triggered it?"},
    {id:"mood",icon:"💭",title:"How do you feel about money right now?",desc:"Your emotional state affects every decision.",
     metric:"Anxious? Calm? Overwhelmed? Be honest with yourself.",
     metricColor:C.purpleBright,
     prompt:"What's driving that feeling? Has anything changed?"},
    {id:"win",icon:"⭐",title:"Name one win",desc:"Cooked at home? Resisted a sale? Put $20 away?",
     metric:cashFlow>=0?`You have a $${(cashFlow||0).toFixed(0)}/mo surplus — that's real progress.`:"Tight this month — but showing up to check in IS the win.",
     metricColor:cashFlow>=0?C.greenBright:C.goldBright,
     prompt:"Say it out loud. Write it down. Wins compound."},
    {id:"goal",icon:"🎯",title:"Check in on your goal",desc:"Even 1% closer is worth acknowledging.",
     metric:`Health score: ${healthScore}/100 · Debt: $${totalDebt>0?totalDebt.toLocaleString():"0"}`,
     metricColor:C.tealBright,
     prompt:"How much closer are you? What's the next milestone?"},
    {id:"next",icon:"📌",title:"One intention for next week",desc:"Small wins build into lasting change.",
     metric:"Not a list. One intention.",
     metricColor:C.cream,
     prompt:"What is it? Make it specific and achievable."},
  ];

  const doneCount=Object.values(checks).filter(Boolean).length;
  const earned=(activeKid?.chores||[]).filter(c=>c.done).reduce((a,c)=>a+(c.reward||0),0);

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <ScreenHeader title="Family" subtitle="Money is a team sport" onBack={setScreen?()=>setScreen("home"):null}/>
    <div style={{display:"flex",gap:6}}>
      {[["meeting",isCouple?"Money Meeting":"Check-In"],["kids","Kids Zone"],["household","Household"]].map(([t,lbl])=>(
        <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?C.purple+"22":C.cardAlt,border:`1px solid ${tab===t?C.purple:C.border}`,color:tab===t?C.purpleBright:C.muted,borderRadius:12,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>
          {lbl}
        </button>
      ))}
    </div>

    {/* ── MEETING TAB ── */}
    {tab==="meeting"&&<>
      {!started&&!done2&&<>
        {/* Live metrics snapshot */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[
            {label:"Balance",value:`$${(_ss.balance||0).toFixed(0)}`,color:_ss.overdraft?C.redBright:C.greenBright},
            {label:"Cash Flow",value:`${cashFlow>=0?"+":""}$${(cashFlow||0).toFixed(0)}/mo`,color:cashFlow>=0?C.greenBright:C.redBright},
            {label:"Health",value:`${healthScore}/100`,color:healthScore>=70?C.greenBright:healthScore>=50?C.goldBright:C.redBright},
          ].map(m=>(
            <div key={m.label} style={{background:C.cardAlt,borderRadius:14,padding:"12px 10px",border:`1px solid ${C.border}`,textAlign:"center"}}>
              <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginBottom:4}}>{m.label}</div>
              <div style={{color:m.color,fontWeight:900,fontSize:16,fontFamily:"'Playfair Display',serif"}}>{m.value}</div>
            </div>
          ))}
        </div>
        <Card style={{background:C.purpleDim,border:`1px solid ${C.purple}44`}}>
          <div style={{color:C.purpleBright,fontWeight:800,fontSize:16,marginBottom:8}}>{isCouple?"💑 Weekly Money Meeting":"🧘 Weekly Check-In"}</div>
          <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.65}}>{isCouple?`The #1 habit of couples who build wealth: a 15-minute weekly money talk. No fights, no blame — just a structured check-in.${data.profile.partnerName?` Ready to go with ${data.profile.partnerName}?`:""}`:
            "10 minutes a week. Honest reflection on where your money went and where you're heading."}</div>
        </Card>
        <Card>
          <div style={{color:C.cream,fontWeight:700,marginBottom:10}}>Today's agenda</div>
          {meetingMetrics.map((a,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:i<meetingMetrics.length-1?`1px solid ${C.border}`:"none",alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>{a.icon}</span>
              <div style={{flex:1}}>
                <div style={{color:C.mutedHi,fontSize:13}}>{a.title}</div>
                <div style={{color:a.metricColor,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginTop:2}}>{a.metric}</div>
              </div>
            </div>
          ))}
        </Card>
        <Btn label={isCouple?"Start Meeting ▶":"Start Check-In ▶"} onClick={()=>setStarted(true)} color={C.purple}/>
      </>}

      {started&&!done2&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Chip label={`${doneCount}/${meetingMetrics.length} done`} color={doneCount===meetingMetrics.length?C.green:C.purple}/>
          <div style={{display:"flex",gap:3}}>{meetingMetrics.map((a,i)=><div key={i} style={{width:28,height:3,borderRadius:99,background:checks[a.id]?C.purple:C.border,transition:"background .3s"}}/>)}</div>
        </div>
        {meetingMetrics.map(item=>{
          const isExpanded=expandedItem===item.id;
          // Build the rich data panel for each item
          const DataPanel=(()=>{
            if(item.id==="bills"){
              const allBills=(data.bills||[]).map(b=>{
                const today2=new Date();
                const due=new Date(today2.getFullYear(),today2.getMonth(),parseInt(b.dueDay||1));
                if(due<today2)due.setMonth(due.getMonth()+1);
                const days=Math.round((due-today2)/(1000*60*60*24));
                return{...b,days};
              }).sort((a,b)=>a.days-b.days);
              return allBills.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"8px 0"}}>No bills tracked yet — add them in Settings</div>:
              <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:8}}>
                {allBills.slice(0,6).map((b,i)=>{
                  const urgency=b.days<=3?C.redBright:b.days<=7?C.goldBright:C.greenBright;
                  return<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:C.bg,borderRadius:10,border:`1px solid ${urgency}22`}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:urgency,flexShrink:0}}/>
                    <span style={{color:C.cream,fontSize:12,flex:1,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{b.name}</span>
                    <span style={{color:C.muted,fontSize:11}}>{b.days===0?"today":b.days===1?"tomorrow":`${b.days}d`}</span>
                    <span style={{color:urgency,fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>${parseFloat(b.amount||0).toFixed(0)}</span>
                  </div>;
                })}
                <div style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",marginTop:2}}>
                  <span style={{color:C.muted,fontSize:11}}>Total coming up</span>
                  <span style={{color:C.cream,fontSize:12,fontWeight:700}}>${allBills.reduce((a,b)=>a+parseFloat(b.amount||0),0).toFixed(0)}/mo</span>
                </div>
              </div>;
            }
        if(item.id==="varbills"){
          const varBills=(data.bills||[]).filter(b=>b.type==="variable");
          if(varBills.length===0) return <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"8px 0"}}>
            No variable bills set up yet. When adding a bill, mark it as Variable to track it here.
          </div>;
          return <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
            {varBills.map((b,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:C.bg,borderRadius:10,border:`1px solid ${C.teal}33`}}>
                <span style={{color:C.tealBright,fontSize:14,flexShrink:0}}>🔄</span>
                <span style={{color:C.cream,fontSize:13,fontWeight:600,flex:1}}>{b.name}</span>
                <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.teal}44`,borderRadius:8,overflow:"hidden"}}>
                  <span style={{color:C.muted,padding:"0 5px 0 8px",fontSize:11}}>$</span>
                  <input type="number" defaultValue={b.amount||""} placeholder={b.amount||"0"}
                    onBlur={e=>{
                      const val=parseFloat(e.target.value);
                      if(!isNaN(val)&&val>0&&setAppData){
                        setAppData(prev=>({...prev,bills:(prev.bills||[]).map((bill,idx)=>
                          bill.name===b.name?{...bill,amount:String(val)}:bill
                        )}))
                      }
                    }}
                    style={{width:60,background:"none",border:"none",padding:"7px 2px",color:C.tealBright,fontSize:13,fontFamily:"inherit",outline:"none",fontWeight:700}}/>
                  <span style={{color:C.muted,padding:"0 6px",fontSize:9}}>/mo</span>
                </div>
              </div>
            ))}
            <div style={{color:C.muted,fontSize:10,marginTop:2}}>Changes save immediately and update your forecast.</div>
          </div>;
        }
            if(item.id==="spend"){
              const cats=Object.entries(topSpend).sort((a,b)=>b[1]-a[1]).slice(0,5);
              const maxAmt=cats[0]?.[1]||1;
              const totalSpend=cats.reduce((a,c)=>a+c[1],0);
              return cats.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"8px 0"}}>No transactions yet</div>:
              <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
                {cats.map(([cat,amt],i)=><div key={i}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{cat}</span>
                    <span style={{color:C.cream,fontSize:11,fontWeight:700}}>${(amt||0).toFixed(0)}<span style={{color:C.muted,fontSize:10}}> ({((amt/totalSpend)*100).toFixed(0)}%)</span></span>
                  </div>
                  <div style={{height:5,background:C.border,borderRadius:99,overflow:"hidden"}}>
                    <div style={{width:`${(amt/maxAmt)*100}%`,height:"100%",background:i===0?C.tealBright:i===1?C.purpleBright:i===2?C.goldBright:C.muted,borderRadius:99,transition:"width .4s"}}/>
                  </div>
                </div>)}
                <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderTop:`1px solid ${C.border}`,marginTop:2}}>
                  <span style={{color:C.muted,fontSize:11}}>Total tracked spend</span>
                  <span style={{color:C.cream,fontSize:12,fontWeight:700}}>${(totalSpend||0).toFixed(0)}/mo</span>
                </div>
              </div>;
            }
            if(item.id==="debt"){
              const debts=(data.debts||[]).slice().sort((a,b)=>parseFloat(b.apr||0)-parseFloat(a.apr||0));
              return debts.length===0?<div style={{color:C.greenBright,fontSize:12,textAlign:"center",padding:"8px 0"}}>🎉 No debts tracked — incredible!</div>:
              <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:8}}>
                <div style={{display:"flex",justifyContent:"space-between",padding:"4px 10px"}}>
                  <span style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1}}>Debt (avalanche order)</span>
                  <span style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1}}>APR</span>
                </div>
                {debts.map((d,i)=>{
                  const bal=parseFloat(d.balance||0);
                  const apr=parseFloat(d.apr||0);
                  const interestPerMo=(bal*(apr/100)/12);
                  return<div key={i} style={{padding:"8px 10px",background:C.bg,borderRadius:10,border:`1px solid ${i===0?C.redBright+"33":C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{color:C.cream,fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{d.name||"Debt"}</span>
                      <span style={{color:i===0?C.redBright:C.muted,fontSize:12,fontWeight:700}}>{apr}%</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{color:C.orangeBright,fontSize:11}}>Balance: ${bal.toLocaleString()}</span>
                      <span style={{color:C.muted,fontSize:10}}>Interest: ${interestPerMo.toFixed(0)}/mo · Min: ${parseFloat(d.min||0).toFixed(0)}/mo</span>
                    </div>
                  </div>;
                })}
                <div style={{color:C.muted,fontSize:10,fontStyle:"italic",padding:"4px 2px"}}>Avalanche method: pay minimums on all, attack highest APR first. Saves the most interest.</div>
              </div>;
            }
            if(item.id==="goal"){
              const goals=data.goals||[];
              const mSavings=cashFlow>0?cashFlow:0;
              return goals.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"8px 0"}}>No goals set yet — add one in Goals</div>:
              <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
                {goals.map((g,i)=>{
                  const target=parseFloat(g.target||g.amount||1000);
                  const saved=parseFloat(g.saved||g.current||0);
                  const pct=Math.min(100,(saved/target)*100);
                  const remaining=target-saved;
                  const moToGo=mSavings>0?Math.ceil(remaining/mSavings):null;
                  return<div key={i} style={{padding:"10px 12px",background:C.bg,borderRadius:12,border:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{color:C.cream,fontSize:12,fontWeight:700}}>{g.name||g.label||"Goal"}</span>
                      <span style={{color:C.purpleBright,fontSize:11,fontWeight:700}}>{(pct||0).toFixed(0)}%</span>
                    </div>
                    <div style={{height:6,background:C.border,borderRadius:99,overflow:"hidden",marginBottom:4}}>
                      <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.purple},${C.purpleBright})`,borderRadius:99}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{color:C.muted,fontSize:10}}>${saved.toLocaleString()} saved of ${target.toLocaleString()}</span>
                      {moToGo&&<span style={{color:C.muted,fontSize:10}}>~{moToGo} mo to go</span>}
                    </div>
                  </div>;
                })}
              </div>;
            }
            // wins/win/mood/next — show previous notes if any
            const prevKey=`flourish_prev_notes_${item.id}`;
            const prevNote=typeof localStorage!=="undefined"?localStorage.getItem(prevKey):null;
            return prevNote?<div style={{marginTop:8,padding:"8px 12px",background:C.purpleDim,borderRadius:10,border:`1px solid ${C.purple}33`}}>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Last week</div>
              <div style={{color:C.cream,fontSize:12,lineHeight:1.5}}>{prevNote}</div>
            </div>:null;
          })();
          return(
          <div key={item.id} style={{background:checks[item.id]?C.purpleDim:C.card,borderRadius:16,padding:"16px 18px",border:`1px solid ${checks[item.id]?C.purple+"66":C.border}`,transition:"all .3s"}}>
            <div style={{display:"flex",gap:12}}>
              <div onClick={()=>setChecks(c=>({...c,[item.id]:!c[item.id]}))} style={{width:22,height:22,borderRadius:6,border:`2px solid ${checks[item.id]?C.purple:C.border}`,background:checks[item.id]?C.purple:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2,transition:"all .2s"}}>
                {checks[item.id]&&<span style={{color:C.bg,fontSize:12,fontWeight:900}}>✓</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                  <div style={{color:C.cream,fontWeight:700,fontSize:14}}>{item.icon} {item.title}</div>
                  <button onClick={()=>setExpandedItem(isExpanded?null:item.id)}
                    style={{background:isExpanded?C.purple+"33":C.cardAlt,border:`1px solid ${isExpanded?C.purple+"55":C.border}`,borderRadius:8,padding:"3px 8px",color:isExpanded?C.purpleBright:C.muted,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,marginLeft:8}}>
                    {isExpanded?"▲ hide":"📊 data"}
                  </button>
                </div>
                <div style={{color:item.metricColor,fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4,background:item.metricColor+"18",borderRadius:8,padding:"4px 10px",display:"inline-block"}}>{item.metric}</div>
                <div style={{color:C.mutedHi,fontSize:12,lineHeight:1.5,marginBottom:8,marginTop:4}}>{item.desc}</div>
                {isExpanded&&DataPanel&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginBottom:8}}>{DataPanel}</div>}
                <div style={{color:C.muted,fontSize:11,fontStyle:"italic",marginBottom:6}}>{item.prompt}</div>
                <textarea value={notes[item.id]||""} onChange={e=>setNotes(n=>({...n,[item.id]:e.target.value}))} placeholder="Notes…"
                  style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,color:C.cream,padding:"9px 12px",fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",height:60,boxSizing:"border-box"}}/>
              </div>
            </div>
          </div>
          );
        })}
        {!isCouple&&<Card>
          <div style={{color:C.cream,fontWeight:700,marginBottom:10}}>How do you feel right now?</div>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            {["😰","😟","😐","🙂","😊","🤩"].map(e=><button key={e} onClick={()=>setMood(e)} style={{fontSize:28,background:mood===e?C.purple+"33":"none",border:`2px solid ${mood===e?C.purple:"transparent"}`,borderRadius:12,padding:6,cursor:"pointer",transition:"all .2s"}}>{e}</button>)}
          </div>
        </Card>}
        <Btn label={doneCount===meetingMetrics.length?"Complete ✓":`Finish (${doneCount}/${meetingMetrics.length} done)`} onClick={()=>setDone2(true)} color={doneCount===meetingMetrics.length?C.purple:C.muted}/>
      </>}

      {done2&&<div>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:6}}><Icon id="sparkles" size={48} color={C.green} strokeWidth={1.3}/></div>
          <div style={{fontSize:22,fontWeight:800,color:C.purpleBright,fontFamily:"Georgia,serif",marginTop:12,marginBottom:8}}>{isCouple?"Meeting complete!":"Check-in done!"}</div>
          <div style={{color:C.mutedHi,fontSize:14,lineHeight:1.7,marginBottom:16}}>{isCouple?"You just did what most couples never do: talked openly about money. That's the habit that builds wealth.":"10 minutes every week. This is the habit."}</div>
        </div>
        {/* Meeting summary */}
        <Card style={{background:`linear-gradient(135deg,${C.purpleDim},${C.card})`,border:`1px solid ${C.purple}33`,marginBottom:12}}>
          <div style={{color:C.purpleBright,fontWeight:700,fontSize:14,marginBottom:12}}>📋 Meeting Summary</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {[
              {label:"Balance",value:`$${(_ss.balance||0).toFixed(0)}`},
              {label:"Monthly Cash Flow",value:`${cashFlow>=0?"+":""}$${(cashFlow||0).toFixed(0)}`},
              {label:"Health Score",value:`${healthScore}/100`},
              {label:"Total Debt",value:totalDebt>0?`$${totalDebt.toLocaleString()}`:"None 🎉"},
            ].map(m=>(
              <div key={m.label} style={{background:C.cardAlt,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{m.label}</div>
                <div style={{color:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',serif",marginTop:2}}>{m.value}</div>
              </div>
            ))}
          </div>
          {Object.entries(notes).filter(([,v])=>v.trim()).length>0&&<>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginBottom:8}}>Your notes this week</div>
            {meetingMetrics.filter(m=>notes[m.id]?.trim()).map(m=>(
              <div key={m.id} style={{marginBottom:8,padding:"8px 12px",background:C.bg,borderRadius:10,border:`1px solid ${C.border}`}}>
                <div style={{color:C.muted,fontSize:10,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:3}}>{m.title}</div>
                <div style={{color:C.cream,fontSize:13,lineHeight:1.5}}>{notes[m.id]}</div>
              </div>
            ))}
          </>}
          {mood&&<div style={{textAlign:"center",marginTop:8}}><span style={{fontSize:11,color:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>This week's mood: </span><span style={{fontSize:20}}>{mood}</span></div>}
        </Card>
        <Btn label="Start New" onClick={()=>{setStarted(false);setDone2(false);setChecks({});setNotes({});setMood(null);}} outline color={C.purple}/>
      </div>}
    </>}

    {/* ── KIDS TAB ── */}
    {tab==="kids"&&<>
      {/* Empty state */}
      {kids.length===0&&!showAddKid&&(
        <Card style={{textAlign:"center",padding:"32px 20px"}}>
          <div style={{fontSize:48,marginBottom:12}}>👧</div>
          <div style={{color:C.cream,fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',Georgia,serif",marginBottom:8}}>Add your first child</div>
          <div style={{color:C.muted,fontSize:13,lineHeight:1.6,marginBottom:20}}>Each child gets their own chore list, jar tracker, savings goal, and a shareable mini app — no access to your financial data.</div>
          <button onClick={()=>setShowAddKid(true)} style={{background:`linear-gradient(135deg,${C.pink},#ff8cb8)`,border:"none",borderRadius:12,padding:"13px 28px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",minHeight:44}}>+ Add Child</button>
        </Card>
      )}

      {/* Kid selector row */}
      {kids.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {kids.map(k=>{
              const t=KID_THEMES[k.theme||"pink"];
              return(
                <button key={k.id} onClick={()=>setActiveKidId(String(activeKidId)===String(k.id)?null:k.id)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",borderRadius:99,border:`2px solid ${String(activeKidId)===String(k.id)?t.primary:C.border}`,background:String(activeKidId)===String(k.id)?t.bg:C.cardAlt,color:String(activeKidId)===String(k.id)?t.primary:C.cream,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",transition:"all .2s",minHeight:44}}>
                  <span style={{fontSize:20}}>{k.emoji}</span>
                  <span>{k.name}</span>
                  {(k.streak||0)>0&&<span style={{fontSize:11}}>🔥{k.streak}</span>}
                  <span style={{fontSize:11,opacity:0.6}}>{String(activeKidId)===String(k.id)?"▲":"▼"}</span>
                </button>
              );
            })}
            <button onClick={()=>setShowAddKid(true)}
              style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",borderRadius:99,border:`2px solid ${C.pink}66`,background:C.pink+"14",color:C.pinkBright,fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",minHeight:44}}>
              + Add Child
            </button>
          </div>
        </div>
      )}

      {/* Add child form */}
      {showAddKid&&(
        <Card style={{border:`1px solid ${C.pink}44`}}>
          <div style={{color:C.pinkBright,fontWeight:800,fontSize:14,marginBottom:14}}>👧 Add a child</div>
          <div style={{marginBottom:10}}>
            <div style={{color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>Choose emoji</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {["🧒","👧","👦","🧒‍♀️","🧒‍♂️","👶","🧑","🌟","🦁","🐼","🦊","🐸"].map(e=>(
                <button key={e} onClick={()=>setNewKidEmoji(e)} style={{fontSize:22,padding:"6px",borderRadius:8,border:`2px solid ${newKidEmoji===e?C.pink:"transparent"}`,background:newKidEmoji===e?C.pink+"22":"transparent",cursor:"pointer",minHeight:44}}>{e}</button>
              ))}
            </div>
          </div>
          <input value={newKidName} onChange={e=>setNewKidName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addKid()}
            placeholder="Child's name"
            style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.cream,fontSize:14,fontFamily:"inherit",marginBottom:10,boxSizing:"border-box"}}/>
          <div style={{marginBottom:14}}>
            <div style={{color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>Age group</div>
            <div style={{display:"flex",gap:8}}>
              {["4-7","8-12","13+"].map(a=>(
                <button key={a} onClick={()=>setNewKidAge(a)} style={{flex:1,padding:"9px",borderRadius:10,border:`1.5px solid ${newKidAge===a?C.pink:C.border}`,background:newKidAge===a?C.pink+"22":C.cardAlt,color:newKidAge===a?C.pinkBright:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",minHeight:44}}>
                  {a==="4-7"?"🐣 4–7":a==="8-12"?"🌱 8–12":"🌳 13+"}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addKid} style={{flex:1,background:newKidName.trim()?`linear-gradient(135deg,${C.pink},#ff8cb8)`:"rgba(255,107,157,0.3)",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontWeight:800,fontSize:13,cursor:newKidName.trim()?"pointer":"default",fontFamily:"inherit",minHeight:44}}>
              Add {newKidEmoji} {newKidName||"Child"}
            </button>
            <button onClick={()=>{setShowAddKid(false);setNewKidName("");}} style={{padding:"12px 16px",borderRadius:10,border:`1px solid ${C.border}`,background:"none",color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",minHeight:44}}>Cancel</button>
          </div>
        </Card>
      )}

      {/* Active kid full view */}
      {activeKid&&(()=>{
        const kidTheme=KID_THEMES[activeKid.theme||"pink"];
        const kidUrl=`${window.location.origin}/kids?code=${activeKid.code}&n=${encodeURIComponent(activeKid.name)}&e=${encodeURIComponent(activeKid.emoji||"🌱")}&a=${encodeURIComponent(activeKid.age||"8-12")}&t=${encodeURIComponent(activeKid.theme||"pink")}`;
        const kidChores=activeKid.chores||[];
        const jars=activeKid.jars||{spend:0,save:0,give:0};
        const goal=activeKid.goal||{name:"",amount:"",emoji:"🎯"};
        const totalJars=(jars.spend||0)+(jars.save||0)+(jars.give||0);
        const goalAmt=parseFloat(goal.amount)||0;
        const goalPct=goalAmt>0?Math.min(100,Math.round(((jars.save||0)/goalAmt)*100)):0;
        const req=activeKid.requireApproval;
        const earned=kidChores.filter(c=>c.done&&(!req||c.approved)).reduce((a,c)=>a+(c.reward||0),0);
        const pendingApproval=kidChores.filter(c=>c.done&&req&&!c.approved);
        const FREQ_LABELS={daily:"Daily",few:"Few times/week",weekly:"Weekly",monthly:"Monthly"};

        return(<>
          {/* Kid header card */}
          <Card style={{background:`linear-gradient(135deg,${kidTheme.bg},${C.card})`,border:`1.5px solid ${kidTheme.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
              <div style={{fontSize:44}}>{activeKid.emoji}</div>
              <div style={{flex:1}}>
                <div style={{color:C.cream,fontWeight:900,fontSize:20,fontFamily:"'Playfair Display',Georgia,serif"}}>{activeKid.name}</div>
                <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4,flexWrap:"wrap"}}>
                  <span style={{color:C.muted,fontSize:12}}>Ages {activeKid.age}</span>
                  {(activeKid.streak||0)>0&&<span style={{background:"#ff8c4222",border:"1px solid #ff8c4244",borderRadius:99,padding:"2px 8px",color:"#FF8C42",fontSize:11,fontWeight:700}}>🔥 {activeKid.streak} week streak</span>}
                  <span style={{color:C.muted,fontSize:12}}>${totalJars.toFixed(2)} total saved</span>
                </div>
              </div>
              <button onClick={()=>{if(window.confirm(`Remove ${activeKid.name}?`)){removeKid(activeKid.id);setActiveKidId(kids.find(k=>String(k.id)!==String(activeKid.id))?.id||null);}}}
                style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
            </div>

            {/* Theme picker */}
            <div style={{marginBottom:14}}>
              <div style={{color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1.2,marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>🎨 Colour Theme</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <select value={activeKid.theme||"pink"} onChange={e=>updateKid(activeKid.id,{theme:e.target.value})}
                  style={{flex:1,background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.cream,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer",outline:"none",appearance:"none",WebkitAppearance:"none"}}>
                  {Object.entries(KID_THEMES).map(([key,t])=>(
                    <option key={key} value={key}>{t.emoji} {t.name}</option>
                  ))}
                </select>
                <div style={{width:28,height:28,borderRadius:99,background:KID_THEMES[activeKid.theme||"pink"]?.primary,flexShrink:0,boxShadow:`0 0 8px ${KID_THEMES[activeKid.theme||"pink"]?.primary}88`}}/>
              </div>
            </div>

            {/* Share link */}
            <div style={{background:C.bg,borderRadius:12,padding:"12px 14px"}}>
              <div style={{color:kidTheme.primary,fontWeight:800,fontSize:13,marginBottom:6}}>📱 {activeKid.name}'s Flourish Link</div>
              <div style={{fontSize:11,color:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",wordBreak:"break-all",marginBottom:10}}>{kidUrl}</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{navigator.clipboard.writeText(kidUrl).then(()=>{setCopiedKidId(activeKid.id);setTimeout(()=>setCopiedKidId(null),2500);});}}
                  style={{flex:1,background:copiedKidId===String(activeKid.id)?C.green:kidTheme.primary,border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all .2s",minHeight:44}}>
                  {copiedKidId===String(activeKid.id)?"✓ Copied!":"📋 Copy Link"}
                </button>
                <button onClick={()=>{if(navigator.share)navigator.share({title:`${activeKid.name}'s Flourish`,url:kidUrl}).catch(()=>{});}}
                  style={{flex:1,background:C.cardAlt,border:`1.5px solid ${kidTheme.border}`,borderRadius:10,padding:"11px",color:kidTheme.primary,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",minHeight:44}}>
                  🔗 Share
                </button>
              </div>
            </div>
          </Card>

          {/* Jar balances */}
          <Card style={{border:`1px solid ${C.gold}44`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{color:C.gold,fontWeight:800,fontSize:14}}>🫙 {activeKid.name}'s Jars</div>
              <div style={{color:C.gold,fontWeight:900,fontSize:16,fontFamily:"'Playfair Display',serif"}}>${totalJars.toFixed(2)}</div>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {(()=>{const split=activeKid.jarSplit||{spend:50,save:30,give:20};return [{key:"spend",name:"Spend",emoji:"🎮",color:C.orange,pct:split.spend},{key:"save",name:"Save",emoji:"🏦",color:C.blue,pct:split.save},{key:"give",name:"Give",emoji:"❤️",color:C.pink,pct:split.give}];})().map(j=>(
                <div key={j.key} style={{flex:1,background:j.color+"18",border:`1px solid ${j.color}33`,borderRadius:12,padding:"12px 8px",textAlign:"center"}}>
                  <div style={{fontSize:22}}>{j.emoji}</div>
                  <div style={{color:j.color,fontWeight:800,fontSize:16,marginTop:4,fontFamily:"'Playfair Display',serif"}}>${(jars[j.key]||0).toFixed(2)}</div>
                  <div style={{color:j.color,fontWeight:700,fontSize:11,marginTop:2}}>{j.name}</div>
                  <div style={{color:C.muted,fontSize:9,marginTop:1}}>{j.pct}%</div>
                </div>
              ))}
            </div>
            {/* Jar split editor */}
            <div style={{background:C.cardAlt,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
              <div style={{color:C.purpleBright||C.tealBright,fontWeight:700,fontSize:13,marginBottom:8}}>🫙 Jar Percentages</div>
              <div style={{color:C.muted,fontSize:11,marginBottom:10}}>How earnings split across Spend / Save / Give (must total 100%)</div>
              {(()=>{
                const split=activeKid.jarSplit||{spend:50,save:30,give:20};
                const colors={spend:C.orange,save:C.blue,give:C.pink};
                const total=split.spend+split.save+split.give;
                return (
                  <>
                    {["spend","save","give"].map(key=>(
                      <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <div style={{width:44,color:colors[key],fontWeight:700,fontSize:12,textTransform:"capitalize"}}>{key}</div>
                        <input type="range" min={0} max={100} value={split[key]}
                          onChange={e=>{
                            const val=parseInt(e.target.value)||0;
                            const others=["spend","save","give"].filter(k=>k!==key);
                            const remaining=100-val;
                            const otherTotal=split[others[0]]+split[others[1]];
                            let newSplit={...split,[key]:val};
                            if(otherTotal>0){
                              newSplit[others[0]]=Math.round(remaining*(split[others[0]]/otherTotal));
                              newSplit[others[1]]=100-val-newSplit[others[0]];
                            } else {
                              newSplit[others[0]]=Math.floor(remaining/2);
                              newSplit[others[1]]=remaining-newSplit[others[0]];
                            }
                            updateKid(activeKid.id,{jarSplit:newSplit});
                          }}
                          style={{flex:1,accentColor:colors[key]}}/>
                        <div style={{width:34,textAlign:"right",color:total===100?colors[key]:C.red,fontWeight:700,fontSize:12}}>{split[key]}%</div>
                      </div>
                    ))}
                    {total!==100&&<div style={{color:C.red,fontSize:11,marginTop:4}}>⚠ Must total 100% (currently {total}%)</div>}
                  </>
                );
              })()}
            </div>
            {/* Savings goal */}
            <div style={{background:C.cardAlt,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
              <div style={{color:C.tealBright,fontWeight:700,fontSize:13,marginBottom:8}}>🎯 Savings Goal</div>
              {goal.name?(
                <>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{color:C.cream,fontSize:13,fontWeight:600}}>{goal.emoji} {goal.name}</span>
                    <span style={{color:C.tealBright,fontWeight:700,fontSize:13}}>{goalPct}%</span>
                  </div>
                  <div style={{height:8,background:C.bg,borderRadius:4,overflow:"hidden",marginBottom:6}}>
                    <div style={{height:"100%",width:`${goalPct}%`,background:`linear-gradient(90deg,${C.teal},${C.tealBright})`,borderRadius:4,transition:"width .5s"}}/>
                  </div>
                  <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                    ${(jars.save||0).toFixed(2)} saved of ${goalAmt.toFixed(2)} goal
                    {goalPct>=100&&<span style={{color:C.greenBright,fontWeight:700}}> 🎉 Goal reached!</span>}
                  </div>
                  <button onClick={()=>updateKid(activeKid.id,{goal:{name:"",amount:"",emoji:"🎯"}})}
                    style={{marginTop:8,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Change goal</button>
                </>
              ):(
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:18,cursor:"pointer"}} onClick={()=>{
                    const emojis=["🎯","🎮","🚲","📚","🎸","⚽","🏊","🎨","✈️","🦄"];
                    const curr=emojis.indexOf(goal.emoji||"🎯");
                    updateKid(activeKid.id,{goal:{...goal,emoji:emojis[(curr+1)%emojis.length]||"🎯"}});
                  }}>{goal.emoji||"🎯"}</span>
                  <input value={goal.name||""} onChange={e=>updateKid(activeKid.id,{goal:{...goal,name:e.target.value}})}
                    placeholder="Goal name (e.g. Nintendo game)"
                    style={{flex:2,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.cream,fontSize:12,fontFamily:"inherit"}}/>
                  <input value={goal.amount||""} onChange={e=>updateKid(activeKid.id,{goal:{...goal,amount:e.target.value}})}
                    placeholder="$" type="number"
                    style={{width:60,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.cream,fontSize:12,fontFamily:"inherit"}}/>
                </div>
              )}
            </div>
            {/* Payday button */}
            {earned>0&&(
              <button onClick={()=>{
                  if(window.confirm(`Pay out $${earned.toFixed(2)} to ${activeKid.name}'s jars and reset chores?`)){
                    paydayKid(activeKid.id);
                  }
                }}
                style={{width:"100%",background:`linear-gradient(135deg,${C.gold},#f5cc6a)`,border:"none",borderRadius:12,padding:"14px",color:"#1a1000",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit",minHeight:44}}>
                💰 Payday! Pay out ${earned.toFixed(2)}
              </button>
            )}
          </Card>

          {/* Chore chart */}
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{color:C.greenBright,fontWeight:700,fontSize:14}}>🏡 {activeKid.name}'s Chores</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {earned>0&&<div style={{color:C.gold,fontWeight:800,fontSize:13}}>${earned.toFixed(2)} earned</div>}
              </div>
            </div>

            {/* Require approval toggle */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 10px",background:C.cardAlt,borderRadius:10}}>
              <span style={{color:C.muted,fontSize:12,flex:1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Require parent approval before chores count</span>
              <button onClick={()=>updateKid(activeKid.id,{requireApproval:!req})}
                style={{width:44,height:24,borderRadius:99,border:"none",background:req?C.green:"rgba(255,255,255,0.12)",cursor:"pointer",position:"relative",transition:"all .2s",flexShrink:0}}>
                <div style={{width:18,height:18,borderRadius:99,background:"#fff",position:"absolute",top:3,left:req?23:3,transition:"all .2s"}}/>
              </button>
            </div>

            {/* Pending approval */}
            {req&&pendingApproval.length>0&&(
              <div style={{background:C.goldDim,border:`1px solid ${C.gold}44`,borderRadius:12,padding:"10px 14px",marginBottom:12}}>
                <div style={{color:C.goldBright,fontWeight:700,fontSize:12,marginBottom:8}}>⏳ Waiting for your approval</div>
                {pendingApproval.map(ch=>(
                  <div key={ch.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{flex:1,color:C.cream,fontSize:13}}>{ch.task}</span>
                    <span style={{color:C.gold,fontSize:12}}>+${(ch.reward||0).toFixed(2)}</span>
                    <button onClick={()=>approveKidChore(activeKid.id,ch.id)}
                      style={{background:C.green,border:"none",borderRadius:8,padding:"4px 10px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✓ Approve</button>
                  </div>
                ))}
              </div>
            )}

            {kidChores.length===0&&(
              <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"16px 0",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>No chores yet — add some below!</div>
            )}

            {kidChores.map(ch=>(
              <div key={ch.id} style={{display:"flex",gap:8,alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                <div onClick={()=>toggleKidChore(activeKid.id,ch.id)} style={{width:26,height:26,borderRadius:8,border:`2px solid ${ch.done?C.green:C.border}`,background:ch.done?C.green:"none",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",transition:"all .2s",minHeight:26}}>
                  {ch.done&&<span style={{color:C.bg,fontSize:14,fontWeight:900}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{color:ch.done?C.muted:C.cream,fontSize:13,textDecoration:ch.done?"line-through":"none"}}>{ch.task}</div>
                  <div style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{FREQ_LABELS[ch.freq||"weekly"]}</div>
                </div>
                <span style={{color:C.gold,fontWeight:700,fontSize:12}}>+${(ch.reward||0).toFixed(2)}</span>
                {ch.done&&req&&ch.approved&&<span style={{color:C.green,fontSize:11}}>✓ approved</span>}
                <button onClick={()=>removeKidChore(activeKid.id,ch.id)} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 2px",lineHeight:1,minHeight:30}}>×</button>
              </div>
            ))}

            {/* Add chore form */}
            <div style={{marginTop:14}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <input value={newChoreTask} onChange={e=>setNewChoreTask(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addChoreToKid(activeKid.id)}
                  placeholder="Add a chore…"
                  style={{flex:3,background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.cream,fontSize:13,fontFamily:"inherit"}}/>
                <input value={newChoreReward} onChange={e=>setNewChoreReward(e.target.value)} placeholder="$" type="number"
                  style={{width:56,background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 8px",color:C.cream,fontSize:13,fontFamily:"inherit"}}/>
                <button onClick={()=>addChoreToKid(activeKid.id)}
                  style={{background:C.green,border:"none",borderRadius:8,padding:"9px 14px",color:"#fff",fontWeight:800,cursor:"pointer",fontSize:14,minHeight:40}}>+</button>
              </div>
              <div style={{display:"flex",gap:6}}>
                {[{v:"daily",l:"Daily"},{v:"few",l:"Few/week"},{v:"weekly",l:"Weekly"},{v:"monthly",l:"Monthly"}].map(f=>(
                  <button key={f.v} onClick={()=>setNewChoreFreq(f.v)}
                    style={{flex:1,padding:"7px 4px",borderRadius:8,border:`1.5px solid ${newChoreFreq===f.v?C.teal:C.border}`,background:newChoreFreq===f.v?C.teal+"22":C.cardAlt,color:newChoreFreq===f.v?C.tealBright:C.muted,fontWeight:700,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
                    {f.l}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </>);
      })()}
      {/* ── Always-visible: Age lessons + 3 Jars ── */}
      {(()=>{
        const kidName=activeKid?.name||"your child";
        const lessonAge=activeKid?.age||globalKidAge;
        const allLessons={
          "4-7":[
            {emoji:"🪙",title:"Money is for trading",body:"When you want something at the store, you give money and get the thing. Money is like a trade ticket!",activity:"Play store at home. Use toy coins to 'buy' snacks from a parent.",key:"Money is how we trade for things we want."},
            {emoji:"🐷",title:"Saving means waiting",body:"If a toy costs $10 and you have $3, you need to save $7 more. Saving means keeping money safe until you have enough.",activity:"Put $1 in a piggy bank each day and count it every 3 days.",key:"Waiting for something makes it even better."},
          ],
          "8-12":[
            {emoji:"🏦",title:"What banks do",body:"A bank keeps your money safe and pays you a little extra (interest) to use it while it's there. Like a super-safe piggy bank that rewards patience.",activity:"Ask a parent to open a youth savings account. Watch the interest appear.",key:"Banks keep money safe AND pay you to use them."},
            {emoji:"💳",title:"Credit cards are loans",body:"A credit card lets you buy now, pay later. If you don't pay it ALL back quickly, they charge you extra. That's how people get into trouble.",activity:"If you borrowed $10 and had to pay back $11, would you? That's what a credit card charges.",key:"Pay your credit card in full every month, always."},
            {emoji:"📈",title:"Money can grow",body:"$100 saved today at 7% becomes $386 in 20 years without doing anything extra. This is compound interest — money making more money.",activity:"Use an online compound interest calculator with a parent. Put in small numbers and watch.",key:"Start saving young. Time is the secret ingredient."},
          ],
          "13+":[
            {emoji:"💰",title:"Budget like a boss",body:"50% needs, 30% wants, 20% savings. Without a budget, money just disappears. A budget isn't restriction — it's a plan for the life you actually want.",key:"A budget gives your money direction."},
            {emoji:"🚫",title:"Debt borrows from your future self",body:"When you go into debt, you're spending money you haven't earned yet — and paying extra for the privilege. Use debt only for things that gain value.",key:"Debt is expensive. Use it wisely or not at all."},
            {emoji:"📊",title:"Start investing at your first job",body:"$50/month invested at 7% starting at age 16 = $245,000 at retirement. The same $50 starting at 30 = $68,000. Starting early nearly triples your outcome.",key:"Invest with your very first paycheck."},
          ],
        };
        return(<>
          {/* 3 Jar Method */}
          <Card style={{background:`linear-gradient(135deg,${C.goldDim} 0%,${C.card} 100%)`,border:`1px solid ${C.gold}33`}}>
            <div style={{color:C.gold,fontWeight:800,marginBottom:8}}>🫙 The 3 Jar Method</div>
            <div style={{color:C.mutedHi,fontSize:13,marginBottom:12}}>Split every dollar {kidName} earns into 3 jars.</div>
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

          {/* Age-tiered lessons */}
          <div style={{color:C.pinkBright,fontWeight:800,fontSize:14}}>📚 Money Lessons{activeKid?` for ${activeKid.name}`:""}</div>
          <div style={{display:"flex",gap:6}}>
            {["4-7","8-12","13+"].map(age=>(
              <button key={age} onClick={()=>{
                  if(activeKid) saveKids(kids.map(k=>k.id===activeKid.id?{...k,age}:k));
                  else setGlobalKidAge(age);
                }}
                style={{flex:1,background:lessonAge===age?C.pink+"22":C.cardAlt,border:`1px solid ${lessonAge===age?C.pink:C.border}`,color:lessonAge===age?C.pinkBright:C.muted,borderRadius:10,padding:"9px 0",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>
                {age==="4-7"?"🐣 4–7":age==="8-12"?"🌱 8–12":"🌳 13+"}
              </button>
            ))}
          </div>
          {(allLessons[lessonAge]||[]).map((l,i)=>(
            <Card key={i} style={{border:`1px solid ${C.pink}22`}}>
              <div style={{fontSize:30,marginBottom:8}}>{l.emoji}</div>
              <div style={{color:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',Georgia,serif",marginBottom:8}}>{l.title}</div>
              <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.65,marginBottom:l.activity?10:0}}>{l.body}</div>
              {l.activity&&<div style={{background:C.teal+"18",border:`1px solid ${C.teal}44`,borderRadius:12,padding:"10px 14px",marginBottom:10}}>
                <div style={{color:C.tealBright,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Try this activity</div>
                <div style={{color:C.cream,fontSize:13}}>{l.activity}</div>
              </div>}
              <Chip label={l.key} color={C.pink} size={12}/>
            </Card>
          ))}
        </>);
      })()}
    </>}

    {/* ── HOUSEHOLD TAB ── */}
    {tab==="household"&&(()=>{
      const genCode=()=>"FLRSH"+Math.random().toString(36).substring(2,5).toUpperCase();
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
          {/* Combined metrics */}
          <Card>
            <div style={{color:C.cream,fontWeight:700,marginBottom:12}}>📊 Household Overview</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[
                {label:"Your Balance",value:`$${(_ss.balance||0).toFixed(0)}`,color:C.greenBright},
                {label:"Monthly Income",value:`$${(monthlyIncome||0).toFixed(0)}`,color:C.tealBright},
                {label:"Total Debt",value:totalDebt>0?`$${totalDebt.toLocaleString()}`:"None 🎉",color:totalDebt>0?C.orangeBright:C.greenBright},
                {label:"Health Score",value:`${healthScore}/100`,color:healthScore>=70?C.greenBright:C.goldBright},
              ].map(m=>(
                <div key={m.label} style={{background:C.cardAlt,borderRadius:12,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                  <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{m.label}</div>
                  <div style={{color:m.color,fontWeight:900,fontSize:15,fontFamily:"'Playfair Display',serif",marginTop:2}}>{m.value}</div>
                </div>
              ))}
            </div>
          </Card>
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
  </div>;
}


// ─── WIDGET SCREEN ────────────────────────────────────────────────────────────
function WidgetScreen({data,onBack}){
  const [wSize,setWSize]=useState("medium");
  const [wContent,setWContent]=useState({safe:true,balance:true,health:true,nextBill:true,streak:false,cashFlow:false});
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

  // Compute cashFlow for widget
  const {cashFlow:wCashFlow}=FinancialCalcEngine.cashFlow(data);
  // Check-in streak from localStorage
  const wStreak=(()=>{try{return parseInt(localStorage.getItem("flourish_streak")||"0");}catch{return 0;}})();

  // Shared widget stat tile (dark always)
  const WTile=({label,value,color="rgba(237,233,226,0.9)",bg="rgba(255,255,255,0.05)"})=>(
    <div style={{background:bg,borderRadius:10,padding:"6px 10px",flex:1,minWidth:0}}>
      <div style={{color:"rgba(237,233,226,0.4)",fontSize:8,fontFamily:"'Plus Jakarta Sans',sans-serif",textTransform:"uppercase",letterSpacing:1,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
      <div style={{color,fontSize:13,fontWeight:800,fontFamily:"'Playfair Display',serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value}</div>
    </div>
  );

  // Build list of active medium tiles (up to 3 slots, Safe always first)
  const medTiles=[
    wContent.balance&&{label:"Balance",value:`$${(bal||0).toFixed(0)}`,color:"rgba(237,233,226,0.85)"},
    wContent.health&&{label:"Health",value:`${healthScore}/100`,color:"rgba(0,232,154,0.9)"},
    wContent.nextBill&&nextBill&&{label:"Next Bill",value:`${nextBill.name} $${parseFloat(nextBill.amount).toFixed(0)}`,color:"rgba(245,204,106,0.95)"},
    wContent.cashFlow&&{label:"Cash Flow",value:`${wCashFlow>=0?"+":""}$${Math.round(wCashFlow)}/mo`,color:wCashFlow>=0?"rgba(0,232,154,0.9)":"rgba(255,79,106,0.9)"},
    wContent.streak&&{label:"Streak",value:`${wStreak} days 🔥`,color:"rgba(237,233,226,0.85)"},
  ].filter(Boolean).slice(0,3);

  // Build list of active large grid tiles
  const largeTiles=[
    wContent.balance&&{label:"Balance",value:`$${(bal||0).toFixed(0)}`,bg:"rgba(255,255,255,0.05)",color:"rgba(237,233,226,0.9)"},
    wContent.health&&{label:"Health Score",value:`${healthScore}`,bg:"rgba(0,204,133,0.08)",color:"rgba(0,232,154,0.95)"},
    wContent.nextBill&&{label:"Due Soon",value:`$${Math.round(_ss.upcomingBills)}`,bg:"rgba(232,184,75,0.08)",color:"rgba(245,204,106,0.95)"},
    wContent.cashFlow&&{label:"Cash Flow",value:`${wCashFlow>=0?"+":""}$${Math.round(wCashFlow)}`,bg:wCashFlow>=0?"rgba(0,204,133,0.08)":"rgba(255,79,106,0.08)",color:wCashFlow>=0?"rgba(0,232,154,0.95)":"rgba(255,79,106,0.95)"},
    wContent.streak&&{label:"Streak",value:`${wStreak}d 🔥`,bg:"rgba(161,140,255,0.08)",color:"rgba(179,161,255,0.95)"},
  ].filter(Boolean);

  // ── Medium 2×4 Widget ──────────────────────────────────────────
  const MediumWidget=()=>(
    <WShell w={338} h={158}>
      <div style={{width:"100%",height:"100%",background:overdraft
        ?"linear-gradient(145deg,#1A040C,#120208)"
        :"linear-gradient(145deg,#051810,#090F18)",
        padding:"18px 20px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <FlourishMark size={24}/>
          <div style={{color:"rgba(237,233,226,0.4)",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{today}</div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div>
            <div style={{color:heroColorBright+"88",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:3}}>Safe to Spend</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:38,color:heroColorBright,letterSpacing:-1,lineHeight:1}}>${Math.round(safe)}</div>
          </div>
          {medTiles.length>0&&<div style={{textAlign:"right"}}>
            <div style={{color:"rgba(237,233,226,0.4)",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",textTransform:"uppercase",letterSpacing:1}}>{medTiles[0].label}</div>
            <div style={{color:medTiles[0].color,fontSize:16,fontWeight:700,fontFamily:"'Playfair Display',serif"}}>{medTiles[0].value}</div>
          </div>}
        </div>
        {medTiles.length>1&&<div style={{display:"flex",gap:6}}>
          {medTiles.slice(1).map((t,i)=><WTile key={i} {...t}/>)}
        </div>}
      </div>
    </WShell>
  );

  // ── Large 4×4 Widget ──────────────────────────────────────────
  const LargeWidget=()=>(
    <WShell w={338} h={338}>
      <div style={{width:"100%",height:"100%",background:overdraft
        ?"linear-gradient(165deg,#1A040C,#120208,#0A0510)"
        :"linear-gradient(165deg,#051810,#080D18,#050810)",
        padding:"20px",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <FlourishMark size={24}/>
          <div style={{background:`rgba(${overdraft?"255,79,106":"0,204,133"},0.15)`,borderRadius:99,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:heroColorBright}}/><span style={{color:heroColorBright,fontSize:9,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{overdraft?"Overdraft risk":"Looking good"}</span>
          </div>
        </div>
        <div style={{background:`rgba(${overdraft?"255,79,106":"0,204,133"},0.08)`,borderRadius:16,padding:"14px 16px",border:`1px solid ${heroColor}28`}}>
          <div style={{color:heroColorBright+"77",fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Safe to Spend Today</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:46,color:heroColorBright,letterSpacing:-2,lineHeight:1}}>${Math.round(safe)}</div>
          {wContent.balance&&<div style={{color:"rgba(237,233,226,0.45)",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4}}>Balance: ${bal.toFixed(2)}</div>}
        </div>
        {largeTiles.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {largeTiles.slice(0,4).map((t,i)=>(
            <div key={i} style={{background:t.bg,border:`1px solid ${t.color.replace("0.9","0.15").replace("0.95","0.15")}`,borderRadius:14,padding:"11px 12px"}}>
              <div style={{color:t.color.replace(/[\d.]+\)$/,"0.5)"),fontSize:8,textTransform:"uppercase",letterSpacing:1.2,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>{t.label}</div>
              <div style={{color:t.color,fontWeight:900,fontSize:24,fontFamily:"'Playfair Display',serif",marginTop:3,letterSpacing:-0.5}}>{t.value}</div>
            </div>
          ))}
        </div>}
        {wContent.nextBill&&<div>
          {soonBills.slice(0,2).map((b,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i===0?`1px solid rgba(255,255,255,0.06)`:"none"}}>
              <span style={{color:"rgba(237,233,226,0.55)",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{b.name}</span>
              <span style={{color:DARK_C.goldBright,fontSize:10,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>${parseFloat(b.amount).toFixed(0)}</span>
            </div>
          ))}
          {soonBills.length===0&&<div style={{color:"rgba(237,233,226,0.3)",fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",textAlign:"center",paddingTop:4}}>No bills due soon ✓</div>}
        </div>}
      </div>
    </WShell>
  );

  const toggleW=k=>setWContent(v=>({...v,[k]:!v[k]}));
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

    {/* Widget content customizer */}
    <div style={{background:C.card,borderRadius:20,padding:"18px 20px",border:`1px solid ${C.border}`}}>
      <div style={{color:C.cream,fontWeight:700,fontSize:14,marginBottom:12}}>✦ Choose what to show</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[
          {key:"safe",label:"Safe to Spend",always:true},
          {key:"balance",label:"Account Balance"},
          {key:"health",label:"Health Score"},
          {key:"nextBill",label:"Next Bill Due"},
          {key:"cashFlow",label:"Cash Flow"},
          {key:"streak",label:"Check-in Streak"},
        ].map(item=>(
          <div key={item.key} onClick={()=>!item.always&&toggleW(item.key)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,
              background:wContent[item.key]?C.green+"14":C.cardAlt,
              border:`1px solid ${wContent[item.key]?C.green+"44":C.border}`,
              cursor:item.always?"default":"pointer",transition:"all .2s"}}>
            <div style={{width:18,height:18,borderRadius:5,background:wContent[item.key]?C.green:"none",border:`2px solid ${wContent[item.key]?C.green:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {wContent[item.key]&&<span style={{color:"#fff",fontSize:10,fontWeight:900}}>✓</span>}
            </div>
            <span style={{color:wContent[item.key]?C.cream:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{item.label}</span>
            {item.always&&<span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",marginLeft:"auto"}}>always</span>}
          </div>
        ))}
      </div>
      <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:10}}>Small widget shows Safe to Spend only. Medium shows up to 3 items. Large shows all selected.</div>
    </div>

    {/* iOS setup */}
    <div style={{background:C.isDark?`linear-gradient(135deg,${C.greenDim} 0%,${C.card} 100%)`:C.card,borderRadius:22,border:`1px solid ${C.green}33`,padding:"20px"}}>
      <div style={{fontWeight:700,fontSize:15,color:C.cream,marginBottom:3,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>🍎</span> Add to iPhone Home Screen</div>
      <div style={{color:C.muted,fontSize:12,marginBottom:14,marginLeft:26}}>iOS 16+ · Safari required</div>
      {[["1","Open flourishmoney.app in Safari"],["2","Tap the Share button (⬆️) at the bottom"],["3","Scroll and tap 'Add to Home Screen'"],["4","Tap Add — the app icon appears instantly"],["5","Long-press the icon → 'Edit Home Screen' → add as widget"]].map(([n,step])=>(
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
      {[["1","Open flourishmoney.app in Chrome"],["2","Tap the three-dot menu (⋮) top right"],["3","Tap 'Add to Home screen'"],["4","Confirm — icon appears on your home screen"],["5","On Samsung: long-press icon → 'Add widget' in Home screen editor"]].map(([n,step])=>(
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
// ─── SETTINGS SECTION INLINE CONTENT ─────────────────────────────────────────
// ─── INLINE SETTINGS EDITORS ─────────────────────────────────────────────────
function InlineDebtEditor({data, setAppData, color, navToScreen}){
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({name:"",balance:"",rate:"",min:""});
  const s = {background:C.card,borderRadius:"0 0 18px 18px",border:`1px solid ${color}33`,padding:"16px 18px",marginBottom:8,borderTop:`1px solid ${color}22`};
  const DEBT_TYPES = ["Credit Card","Line of Credit","Car Loan","Student Loan","OSAP","HELOC","Mortgage","Personal Loan","Buy Now Pay Later","Other"];

  const saveDebt = () => {
    if(!form.name || !form.balance) return;
    setAppData(prev=>({...prev, debts:[...(prev.debts||[]), {...form}]}));
    setForm({name:"",balance:"",rate:"",min:""});
    setAdding(false);
  };
  const removeDebt = i => setAppData(prev=>({...prev, debts:(prev.debts||[]).filter((_,x)=>x!==i)}));
  const updateDebt = (i,field,val) => setAppData(prev=>({...prev, debts:(prev.debts||[]).map((d,x)=>x===i?{...d,[field]:val}:d)}));

  return (
    <div style={s}>
      {(data.debts||[]).length===0&&!adding&&(
        <div style={{background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:12,textAlign:"center"}}>
          <div style={{fontSize:22,marginBottom:6}}>💳</div>
          <div style={{color:C.mutedHi,fontWeight:600,fontSize:13,marginBottom:4}}>No debts tracked yet</div>
          <div style={{color:C.muted,fontSize:11,lineHeight:1.65}}>Connect your bank to auto-import credit cards, or tap + Add Debt below.</div>
        </div>
      )}
      {(data.debts||[]).some(d=>d.fromBank)&&(
        <div style={{background:C.green+"0A",border:`1px solid ${C.green}22`,borderRadius:10,padding:"8px 12px",marginBottom:8,display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:12}}>🏦</span>
          <span style={{color:C.green,fontSize:11,fontWeight:600}}>Balances imported live from your bank</span>
        </div>
      )}
      {(data.debts||[]).map((d,i)=>(
        <div key={i} style={{background:C.cardAlt,borderRadius:12,padding:"10px 14px",marginBottom:8,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <div style={{color:C.cream,fontWeight:600,fontSize:13}}>{d.name}</div>
              {d.fromBank&&<span style={{fontSize:9,fontWeight:700,color:C.greenBright,background:C.green+"22",border:`1px solid ${C.green}33`,borderRadius:99,padding:"2px 7px",flexShrink:0}}>live</span>}
            </div>
            <button onClick={()=>removeDebt(i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:"4px 8px",minWidth:32,minHeight:32}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            {[["Balance","balance","$"],["Rate %","rate","%"],["Min/mo","min","$"]].map(([lbl,field,pre])=>(
              <div key={field}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",marginBottom:3}}>{lbl}</div>
                <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                  <span style={{color:C.muted,fontSize:11,padding:"0 4px"}}>{pre}</span>
                  <input value={d[field]||""} onChange={e=>updateDebt(i,field,e.target.value)} type="number"
                    style={{flex:1,background:"none",border:"none",padding:"6px 4px 6px 0",color:C.cream,fontSize:12,fontFamily:"inherit",outline:"none",width:0,minWidth:0}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {adding?(
        <div style={{background:C.cardAlt,borderRadius:12,padding:"12px 14px",border:`1px solid ${color}44`,marginBottom:8}}>
          <select value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}
            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 12px",color:form.name?C.cream:C.muted,fontSize:13,fontFamily:"inherit",marginBottom:8}}>
            <option value="">Select debt type…</option>
            {DEBT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
            {[["Balance","balance","$"],["Rate %","rate","%"],["Min/mo","min","$"]].map(([lbl,field,pre])=>(
              <div key={field}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",marginBottom:4}}>{lbl}</div>
                <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                  <span style={{color:C.muted,fontSize:11,padding:"0 5px"}}>{pre}</span>
                  <input value={form[field]} onChange={e=>setForm(v=>({...v,[field]:e.target.value}))} type="number" placeholder="0"
                    style={{flex:1,background:"none",border:"none",padding:"7px 4px 7px 0",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none",width:0,minWidth:0}}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={saveDebt} disabled={!form.name||!form.balance}
              style={{flex:1,background:form.name&&form.balance?color:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,padding:"10px",color:"#fff",fontWeight:700,fontSize:13,cursor:form.name&&form.balance?"pointer":"default",fontFamily:"inherit",opacity:!form.name||!form.balance?0.4:1}}>
              Save Debt ✓
            </button>
            <button onClick={()=>{setAdding(false);setForm({name:"",balance:"",rate:"",min:""}); }}
              style={{background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              Cancel
            </button>
          </div>
        </div>
      ):(
        <button onClick={()=>setAdding(true)}
          style={{width:"100%",background:color+"18",border:`1px solid ${color}44`,borderRadius:10,padding:"10px",color,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:(navToScreen&&(data.debts||[]).length>0)?8:0}}>
          + Add Debt
        </button>
      )}
      {!adding&&navToScreen&&(data.debts||[]).length>0&&(
        <button onClick={()=>navToScreen("goals")}
          style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
          View Debt Simulator →
        </button>
      )}
    </div>
  );
}

function InlineGoalEditor({data, setAppData, color}){
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({name:"",target:"",saved:""});
  const s = {background:C.card,borderRadius:"0 0 18px 18px",border:`1px solid ${color}33`,padding:"16px 18px",marginBottom:8,borderTop:`1px solid ${color}22`};
  const GOAL_PRESETS = ["Emergency Fund","Vacation","Down Payment","Car","Wedding","Education","Home Renovation","New Baby","Other"];

  const saveGoal = () => {
    if(!form.name||!form.target) return;
    setAppData(prev=>({...prev, goals:[...(prev.goals||[]), {...form}]}));
    setForm({name:"",target:"",saved:""});
    setAdding(false);
  };
  const removeGoal = i => setAppData(prev=>({...prev, goals:(prev.goals||[]).filter((_,x)=>x!==i)}));

  return (
    <div style={s}>
      {(data.goals||[]).length===0&&!adding&&<div style={{color:C.muted,fontSize:13,marginBottom:12}}>No savings goals set yet.</div>}
      {(data.goals||[]).map((g,i)=>{
        const pct = g.target?Math.min(100,Math.round((parseFloat(g.saved||0)/parseFloat(g.target))*100)):0;
        return(
          <div key={i} style={{background:C.cardAlt,borderRadius:12,padding:"10px 14px",marginBottom:8,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{color:C.cream,fontWeight:600,fontSize:13}}>{g.name||g.label||"Goal"}</div>
              <button onClick={()=>removeGoal(i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:"2px 6px"}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
              {[["Saved","saved"],["Target","target"]].map(([lbl,field])=>(
                <div key={field}>
                  <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",marginBottom:3}}>{lbl}</div>
                  <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                    <span style={{color:C.muted,fontSize:11,padding:"0 5px"}}>$</span>
                    <input value={g[field]||""} onChange={e=>setAppData(prev=>({...prev,goals:(prev.goals||[]).map((x,j)=>j===i?{...x,[field]:e.target.value}:x)}))} type="number"
                      style={{flex:1,background:"none",border:"none",padding:"6px 4px 6px 0",color:field==="saved"?C.greenBright:C.cream,fontSize:12,fontFamily:"inherit",outline:"none",fontWeight:field==="saved"?700:400,width:0,minWidth:0}}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:C.border,borderRadius:99,height:4,overflow:"hidden"}}>
              <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${color},${color}cc)`,borderRadius:99}}/>
            </div>
            <div style={{color:C.muted,fontSize:10,marginTop:3}}>{pct}% saved · ${Math.max(0,(parseFloat(g.target||0)-parseFloat(g.saved||0))).toLocaleString()} to go</div>
          </div>
        );
      })}
      {adding?(
        <div style={{background:C.cardAlt,borderRadius:12,padding:"12px 14px",border:`1px solid ${color}44`,marginBottom:8}}>
          <select value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}
            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 12px",color:form.name?C.cream:C.muted,fontSize:13,fontFamily:"inherit",marginBottom:8}}>
            <option value="">Select goal type…</option>
            {GOAL_PRESETS.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[["Target Amount","target"],["Already Saved","saved"]].map(([lbl,field])=>(
              <div key={field}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",marginBottom:4}}>{lbl}</div>
                <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                  <span style={{color:C.muted,fontSize:11,padding:"0 5px"}}>$</span>
                  <input value={form[field]} onChange={e=>setForm(v=>({...v,[field]:e.target.value}))} type="number" placeholder="0"
                    style={{flex:1,background:"none",border:"none",padding:"7px 4px 7px 0",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none",width:0,minWidth:0}}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={saveGoal} disabled={!form.name||!form.target}
              style={{flex:1,background:form.name&&form.target?color:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,padding:"10px",color:"#fff",fontWeight:700,fontSize:13,cursor:form.name&&form.target?"pointer":"default",fontFamily:"inherit",opacity:!form.name||!form.target?0.4:1}}>
              Save Goal ✓
            </button>
            <button onClick={()=>{setAdding(false);setForm({name:"",target:"",saved:""}); }}
              style={{background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              Cancel
            </button>
          </div>
        </div>
      ):(
        <button onClick={()=>setAdding(true)}
          style={{width:"100%",background:color+"18",border:`1px solid ${color}44`,borderRadius:10,padding:"10px",color,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          + Add Goal
        </button>
      )}
    </div>
  );
}

function SettingsSectionContent({sectionKey,data,setAppData,navToScreen,color,onAddBank,onDisconnectBank,bankConnected,needsReconnect,reconnectLoading,onReconnect}){
  const s={background:C.card,border:`1px solid ${color}33`,borderRadius:"0 0 18px 18px",padding:"16px 18px",marginBottom:8,borderTop:`1px solid ${color}22`};
  const row={display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`};
  const val={color:C.cream,fontSize:13,fontWeight:600};
  const lbl={color:C.muted,fontSize:12};

  const updateProfile = (key, value) => {
    if(setAppData) setAppData(prev=>({...prev, profile:{...prev.profile, [key]:value}}));
  };

  if(sectionKey==="profile") return (
    <div style={s}>
      <div style={row}><span style={lbl}>Name</span>
        <input defaultValue={data.profile?.name||""} onBlur={e=>updateProfile("name",e.target.value)}
          style={{background:"none",border:"none",borderBottom:`1px solid ${color}44`,color:C.cream,fontSize:13,fontWeight:600,textAlign:"right",outline:"none",fontFamily:"inherit",padding:"2px 4px",width:140}}/>
      </div>
      <div style={row}><span style={lbl}>Country</span>
        <select defaultValue={data.profile?.country||"CA"} onChange={e=>updateProfile("country",e.target.value)}
          style={{background:C.card,border:`1px solid ${color}44`,color:C.cream,fontSize:13,fontWeight:600,borderRadius:8,padding:"4px 8px",fontFamily:"inherit"}}>
          <option value="CA">🇨🇦 Canada</option><option value="US">🇺🇸 United States</option>
        </select>
      </div>
      <div style={row}><span style={lbl}>Status</span>
        <select defaultValue={data.profile?.status||"single"} onChange={e=>updateProfile("status",e.target.value)}
          style={{background:C.card,border:`1px solid ${color}44`,color:C.cream,fontSize:13,fontWeight:600,borderRadius:8,padding:"4px 8px",fontFamily:"inherit"}}>
          <option value="single">Single</option><option value="couple">Couple</option>
        </select>
      </div>
      <div style={row}><span style={lbl}>Has Kids</span>
        <select defaultValue={data.profile?.hasKids?"yes":"no"} onChange={e=>updateProfile("hasKids",e.target.value==="yes")}
          style={{background:C.card,border:`1px solid ${color}44`,color:C.cream,fontSize:13,fontWeight:600,borderRadius:8,padding:"4px 8px",fontFamily:"inherit"}}>
          <option value="no">No</option><option value="yes">Yes</option>
        </select>
      </div>
      <div style={{color:C.muted,fontSize:11,marginTop:10}}>Changes save automatically.</div>
    </div>
  );

  if(sectionKey==="accounts") {
    const removeAccount = (accountId) => {
      if(!setAppData) return;
      setAppData(prev => {
        const filtered = (prev.accounts||[]).filter(a => a.id !== accountId);
        // Remove associated debts
        const removedAcct = (prev.accounts||[]).find(a => a.id === accountId);
        const debtsFiltered = removedAcct
          ? (prev.debts||[]).filter(d => (d.name||"").toLowerCase() !== (removedAcct.name||"").toLowerCase())
          : prev.debts;
        // Remove transactions belonging to this account
        const txnsFiltered = (prev.transactions||[]).filter(t => t.account_id !== accountId);
        return {
          ...prev,
          accounts: filtered,
          debts: debtsFiltered,
          transactions: txnsFiltered,
          bankConnected: filtered.some(a => a.institution !== "Manual"),
        };
      });
    };

    // Dedup by id for display (fixes existing duplicates on screen)
    const seenDisplay = new Set();
    const dedupedDisplay = (data.accounts||[]).filter(a => {
      if (seenDisplay.has(a.id)) return false;
      seenDisplay.add(a.id);
      return true;
    });
    const hasDuplicates = dedupedDisplay.length < (data.accounts||[]).length;

    return (
      <div style={s}>
        {hasDuplicates&&(
          <div style={{background:C.gold+"11",border:`1px solid ${C.gold}33`,borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{fontSize:16}}>⚠️</span>
            <div style={{flex:1}}>
              <div style={{color:C.goldBright,fontWeight:700,fontSize:12}}>Duplicate accounts detected</div>
              <div style={{color:C.muted,fontSize:11,marginTop:1}}>The same accounts appear multiple times. Tap to fix.</div>
            </div>
            <button onClick={()=>setAppData(prev=>({...prev,accounts:dedupedDisplay}))}
              style={{background:C.gold+"22",border:`1px solid ${C.gold}44`,borderRadius:8,padding:"6px 12px",color:C.goldBright,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>
              Fix now
            </button>
          </div>
        )}
        {dedupedDisplay.length===0
          ? <div style={{color:C.muted,fontSize:13,marginBottom:12}}>No bank accounts connected yet. Tap below to connect your bank.</div>
          : dedupedDisplay.map((a,i)=>(
            <div key={a.id||i} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:i<dedupedDisplay.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.cream,fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                <div style={{color:C.muted,fontSize:11}}>{a.type} · {a.institution}</div>
              </div>
              <span style={{color:a.balance>=0?C.greenBright:C.red,fontWeight:700,fontSize:13,flexShrink:0}}>
                {a.balance>=0?"$":"–$"}{Math.abs(a.balance||0).toFixed(2)}
              </span>
              <button onClick={()=>removeAccount(a.id)}
                style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:"4px 6px",minWidth:32,minHeight:36,flexShrink:0}}
                title="Remove this account">
                ✕
              </button>
            </div>
          ))
        }
        <button onClick={onAddBank} style={{width:"100%",marginTop:12,background:color+"18",border:`1px solid ${color}44`,borderRadius:10,padding:"10px",color,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          + Connect Another Bank
        </button>
      </div>
    );
  }

  if(sectionKey==="bills") {
    const updateBillAmt = (i,val) => { if(setAppData) setAppData(prev=>({...prev,bills:(prev.bills||[]).map((b,x)=>x===i?{...b,amount:val}:b)})); };
    const removeBillS = i => { if(setAppData) setAppData(prev=>({...prev,bills:(prev.bills||[]).filter((_,x)=>x!==i)})); };
    const ord = n => { const v=parseInt(n); return [11,12,13].includes(v)?"th":["st","nd","rd"][v%10-1]||"th"; };
    return (
      <div style={s}>
        {(data.bills||[]).length===0
          ? <div style={{color:C.muted,fontSize:13,marginBottom:8}}>No bills tracked yet.</div>
          : (data.bills||[]).map((b,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:i<(data.bills||[]).length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.cream,fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
                <div style={{color:C.muted,fontSize:11}}>due {b.date}{ord(b.date)}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",width:78,flexShrink:0}}>
                <span style={{color:C.muted,fontSize:11,padding:"0 4px",flexShrink:0}}>$</span>
                <input value={b.amount} onChange={e=>updateBillAmt(i,e.target.value)} type="number"
                  style={{flex:1,background:"none",border:"none",padding:"5px 4px 5px 0",color:C.cream,fontSize:12,fontFamily:"inherit",outline:"none",width:0,fontWeight:600}}/>
              </div>
              <button onClick={()=>removeBillS(i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:13,padding:"4px",flexShrink:0,minWidth:24,minHeight:24}}>✕</button>
            </div>
          ))
        }
        {navToScreen&&<button onClick={()=>navToScreen("plan")} style={{width:"100%",marginTop:10,background:color+"18",border:`1px solid ${color}44`,borderRadius:10,padding:"9px",color,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          + Add or Manage Bills →
        </button>}
      </div>
    );
  }

  if(sectionKey==="debts") return <InlineDebtEditor data={data} setAppData={setAppData} color={color} navToScreen={navToScreen}/>;

  if(sectionKey==="goals") return <InlineGoalEditor data={data} setAppData={setAppData} color={color}/>;

  if(sectionKey==="family") return (
    <div style={s}>
      <div style={row}><span style={lbl}>Status</span>
        <select defaultValue={data.profile?.status||"single"} onChange={e=>updateProfile("status",e.target.value)}
          style={{background:C.card,border:`1px solid ${color}44`,color:C.cream,fontSize:13,fontWeight:600,borderRadius:8,padding:"4px 8px",fontFamily:"inherit"}}>
          <option value="single">Single</option><option value="couple">Couple</option>
        </select>
      </div>
      <div style={row}><span style={lbl}>Partner's Name</span>
        <input defaultValue={data.profile?.partnerName||""} placeholder="Partner's first name" onBlur={e=>updateProfile("partnerName",e.target.value)}
          style={{background:"none",border:"none",borderBottom:`1px solid ${color}44`,color:C.cream,fontSize:13,fontWeight:600,textAlign:"right",outline:"none",fontFamily:"inherit",padding:"2px 4px",width:140}}/>
      </div>
      <div style={row}><span style={lbl}>Has Kids</span>
        <select defaultValue={data.profile?.hasKids?"yes":"no"} onChange={e=>updateProfile("hasKids",e.target.value==="yes")}
          style={{background:C.card,border:`1px solid ${color}44`,color:C.cream,fontSize:13,fontWeight:600,borderRadius:8,padding:"4px 8px",fontFamily:"inherit"}}>
          <option value="no">No</option><option value="yes">Yes</option>
        </select>
      </div>
      <div style={{color:C.muted,fontSize:11,marginTop:10}}>Changes save automatically.</div>
      {navToScreen&&<button onClick={()=>navToScreen("family")} style={{width:"100%",marginTop:12,background:color+"18",border:`1px solid ${color}44`,borderRadius:10,padding:"10px",color,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
        Open Family Dashboard →
      </button>}
    </div>
  );

  return null;
}

function Settings({data,setAppData,setScreen:navToScreen,onClose,onReset,theme,toggleTheme,onOpenWidget,onDisconnectBank,onAddBank,onDeleteData,bankConnected,needsReconnect,reconnectLoading,onReconnect}){
  const [notifToggles,setNotifToggles]=useState({overdraft:true,bills:true,coach:true,meeting:false,patterns:true});
  const [activeSection,setActiveSection]=useState(null);
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
    <button onClick={handleShare} style={{background:"linear-gradient(135deg,#0D3320 0%,#0A2518 100%)",borderRadius:18,padding:"20px 22px",border:"1px solid rgba(0,204,133,0.25)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"inherit",width:"100%",marginBottom:10,boxShadow:"0 4px 24px rgba(0,204,133,0.12)"}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:44,height:44,borderRadius:14,background:"rgba(0,204,133,0.15)",border:"1px solid rgba(0,204,133,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <FlourishMark size={28}/>
        </div>
        <div style={{textAlign:"left"}}>
          <div style={{color:"#fff",fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,letterSpacing:-0.3}}>Share Flourish</div>
          <div style={{color:"rgba(255,255,255,0.45)",fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:3}}>Invite a friend · help them thrive</div>
        </div>
      </div>
      <div style={{background:"rgba(0,204,133,0.2)",border:"1px solid rgba(0,204,133,0.35)",borderRadius:99,padding:"7px 16px",color:"#00CC85",fontSize:12,fontWeight:700,letterSpacing:0.2,flexShrink:0}}>Share ↗</div>
    </button>
    {[
        {icon:"user",  color:C.purple, label:"Profile & Income",    sub:`${data.profile?.name||"You"} · ${data.profile?.country||"CA"}`,   key:"profile"},
        {icon:"bank",  color:C.blue,   label:"Connected Accounts",  sub:`${data.accounts?.length||0} accounts`,              key:"accounts"},
        {icon:"calendar",color:C.teal, label:"Manage Bills",        sub:`${data.bills?.length||0} tracked`,                  key:"bills"},
        {icon:"trendUp",color:C.orange,label:"Manage Debts",        sub:`${data.debts?.length||0} in plan`,                  key:"debts"},
        {icon:"target", color:C.gold,  label:"Savings Goals",       sub:"Emergency fund & more",                             key:"goals"},
        {icon:"users",  color:C.pink,  label:"Family Settings",     sub:`${data.profile?.status||"single"} · ${data.profile?.hasKids?"has kids":"no kids"}`, key:"family"},
      ].map((item,i)=>{
        const isActive = activeSection === item.key;
        return (
        <div key={i}>
          <div
            onClick={()=>setActiveSection(isActive ? null : item.key)}
            style={{background:isActive?item.color+"14":C.card,borderRadius:isActive?"18px 18px 0 0":18,padding:"13px 16px",marginBottom:isActive?0:8,border:`1px solid ${isActive?item.color+"55":C.border}`,borderBottom:isActive?"none":"",display:"flex",alignItems:"center",gap:13,cursor:"pointer",transition:"all .22s cubic-bezier(.16,1,.3,1)"}}
            onMouseEnter={e=>{if(!isActive){e.currentTarget.style.borderColor=item.color+"55";e.currentTarget.style.transform="translateX(2px)";}}}
            onMouseLeave={e=>{if(!isActive){e.currentTarget.style.borderColor=C.border;e.currentTarget.style.transform="none";}}}>
            <div style={{width:38,height:38,borderRadius:12,background:item.color+"18",border:`1px solid ${item.color}28`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Icon id={item.icon} size={18} color={item.color} strokeWidth={1.6}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:C.cream,fontWeight:600,fontSize:14}}>{item.label}</div>
              <div style={{color:C.muted,fontSize:12,marginTop:1}}>{item.sub}</div>
            </div>
            <span style={{color:isActive?item.color:C.muted,fontSize:16,fontWeight:300,transition:"transform .2s",transform:isActive?"rotate(90deg)":"none",display:"inline-block"}}>›</span>
          </div>
          {isActive&&<SettingsSectionContent sectionKey={item.key} data={data} setAppData={setAppData} navToScreen={navToScreen} color={item.color} onAddBank={onAddBank} onDisconnectBank={onDisconnectBank} bankConnected={bankConnected} needsReconnect={needsReconnect} reconnectLoading={reconnectLoading} onReconnect={onReconnect}/>}
        </div>
      );})}
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
    {/* ── Bank reconnect banner ──────────────────────────────── */}
    {needsReconnect&&bankConnected&&(
      <div style={{marginTop:16,padding:"14px 16px",background:`${C.gold}15`,borderRadius:16,border:`1px solid ${C.gold}44`,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:22}}>🔗</span>
        <div style={{flex:1}}>
          <div style={{color:C.goldBright,fontWeight:700,fontSize:13}}>Bank session expired</div>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>Reconnect to refresh your data</div>
        </div>
        <button onClick={onReconnect} disabled={reconnectLoading} style={{background:C.gold,border:"none",borderRadius:10,padding:"8px 14px",color:"#000",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",opacity:reconnectLoading?0.6:1}}>
          {reconnectLoading?"…":"Reconnect"}
        </button>
      </div>
    )}
    {/* ── Bank connection ──────────────────────────────────────── */}
    {(bankConnected || true)&&(
      <div style={{marginTop:10,padding:"14px 16px",background:C.card,borderRadius:16,border:`1px solid ${C.border}`}}>
        <div style={{color:C.cream,fontWeight:700,fontSize:13,marginBottom:8}}>Connected Banks</div>
        {/* Show each connected bank */}
        {(()=>{
          const tokens = JSON.parse(localStorage.getItem("flourish_plaid_tokens")||"[]");
          const legacy = localStorage.getItem("flourish_plaid_token");
          const banks = tokens.length > 0 ? tokens : (legacy ? [{id:"bank_0",token:legacy,institution:"Your Bank"}] : []);
          return banks.map((b,i)=>(
            <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<banks.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:28,height:28,borderRadius:8,background:C.green+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🏦</div>
                <div style={{color:C.cream,fontSize:13,fontWeight:600}}>{b.institution}</div>
              </div>
              <button onClick={()=>{
                if(!window.confirm(`Disconnect ${b.institution}?`)) return;
                const updated = banks.filter(x=>x.id!==b.id);
                localStorage.setItem("flourish_plaid_tokens", JSON.stringify(updated));
                if(updated.length===0){localStorage.removeItem("flourish_plaid_token");onDisconnectBank();}
                else{ localStorage.setItem("flourish_plaid_token", updated[0].token); window.location.reload(); }
              }} style={{background:"none",border:`1px solid ${C.orange}44`,borderRadius:8,padding:"4px 10px",color:C.orange,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                Disconnect
              </button>
            </div>
          ));
        })()}
        <button onClick={onAddBank} style={{width:"100%",marginTop:12,background:C.green+"18",border:`1px solid ${C.green}33`,borderRadius:10,padding:"10px",color:C.greenBright,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          + Connect Another Bank
        </button>
      </div>
    )}
    {/* ── Delete all data ──────────────────────────────────────── */}
    <div style={{marginTop:10,padding:"16px",background:C.redDim,borderRadius:16,border:`1px solid ${C.red}33`}}>
      <div style={{color:C.red,fontWeight:700,marginBottom:4}}>Delete All Data</div>
      <div style={{color:C.mutedHi,fontSize:13,marginBottom:12}}>Permanently removes all data from Flourish and revokes any bank connections. This cannot be undone.</div>
      <Btn label="Delete My Data" onClick={onDeleteData||onReset} color={C.red} small/>
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
  const txns=data.transactions||[];
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
          <div style={{color:C.cream,fontWeight:700,fontSize:13}}>${(t.amount||0).toFixed(2)}</div>
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


// ─── AI COACH ─────────────────────────────────────────────────────────────────
function AICoach({data, isOnline, isPremium=false, coachMsgCount=0, onSend=()=>{}, onUpgrade=()=>{}, setScreen}){
  // ── ALL HOOKS FIRST — constants moved below to prevent TDZ ───────────────
  const [messages, setMessages] = useState(()=>{
    try {
      const saved = JSON.parse(localStorage.getItem("flourish_coach_history") || "null");
      if (Array.isArray(saved) && saved.length > 0) return saved.slice(-40);
    } catch {}
    return [{role:"assistant", content:"Hey! I'm your Flourish AI Coach 👋 I can see your spending patterns, balances, and financial data. What would you like to work on today?"}];
  });
  const [sessionDate] = useState(()=>new Date().toLocaleDateString("en-CA",{month:"short",day:"numeric"}));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  // ── Constants and derived values (after all hooks) ────────────────────────
  const FREE_LIMIT=5;
  const STORAGE_KEY = "flourish_coach_history";
  const WELCOME = {role:"assistant", content:"Hey! I'm your Flourish AI Coach 👋 I can see your spending patterns, balances, and financial data. What would you like to work on today?"};
  const freeMsgsLeft=isPremium?Infinity:Math.max(0,FREE_LIMIT-coachMsgCount);

  // Persist messages to localStorage whenever they change
  // If the last saved message is from a different day, inject a date divider on load
  useEffect(()=>{
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
      if (Array.isArray(saved) && saved.length > 0) {
        const lastMsg = saved[saved.length-1];
        if (lastMsg._date && lastMsg._date !== sessionDate) {
          setMessages(prev => [
            ...prev,
            {role:"system", content:`— ${sessionDate} —`, _date:sessionDate}
          ]);
        }
      }
    } catch {}
  // eslint-disable-next-line
  },[]);

  useEffect(()=>{
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch {}
  },[messages]);

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({behavior:"smooth"});
  },[messages]);

  // Build a concise financial snapshot to inject into the system prompt
  const buildContext = ()=>{
    const txns = (data.transactions||[]).slice(0,40);
    const accounts = data.accounts||[];
    const profile = data.profile||{};
    const country = profile.country||"CA";
    const _toMoCtx=(amt,freq)=>{const a=parseFloat(amt||0);return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="annually"?a/12:a;};
    const income = (data.incomes||[]).filter(i=>parseFloat(i.amount||0)>0).reduce((s,i)=>s+_toMoCtx(i.amount,i.freq),0) || DEMO.income;
    const balance = (accounts||[]).filter(a=>["checking","savings","depository"].includes((a.type||"").toLowerCase())).reduce((s,a)=>s+parseFloat(a.balance||0),0) || DEMO.balance;
    const spending = txns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const topCats = Object.entries(
      txns.filter(t=>t.amount>0 && t.cat!=="Income")
        .reduce((acc,t)=>{acc[t.cat]=(acc[t.cat]||0)+t.amount;return acc;},{})
    ).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: $${(v||0).toFixed(0)}`).join(", ");
    const goals = (data.goals||[]).map(g=>`${g.name}: $${parseFloat(g.saved||0).toFixed(0)} saved of $${parseFloat(g.target||0).toFixed(0)} target${g.monthly?`, $${g.monthly}/mo contribution`:""}`).join("; ")||"none set";
    const bills = (data.bills||[]).map(b=>`${b.name} $${b.amount}/mo${b.arrears?` (arrears: $${b.arrears})`:""}` ).join("; ")||"none tracked";
    const debts = (data.debts||[]).map(d=>`${d.name} $${parseFloat(d.balance||0).toFixed(0)}${d.rate?` @ ${d.rate}%`:""}`).join("; ")||"none";
    const ret = profile.retirement||{};
    const retInfo = Object.entries(ret).filter(([,v])=>parseFloat(v)>0).map(([k,v])=>`${k}: $${v}`).join(", ")||"none entered";
    const birthYear = parseInt(profile.birthYear||"0");
    const age = birthYear>0 ? new Date().getFullYear()-birthYear : null;
    const kidsArr = profile.kids||[];
    const kidsInfo = kidsArr.length>0
      ? kidsArr.map(k=>`${k.name||"Child"} (born ${k.birthYear||"?"}, age ${k.birthYear?new Date().getFullYear()-parseInt(k.birthYear):"?"})`).join(", ")
      : profile.hasKids?"yes (ages unknown)":"none";
    const empType = profile.employmentType||"employed";
    const empLabel = {t4:"T4 Employee",w2:"W-2 Employee",selfemployed:"Self-Employed",incorporated:"Incorporated Business Owner",student:"Student",retired:"Retired"}[empType]||empType;
    const isSelfEmp = empType==="selfemployed"||empType==="incorporated";
    return `You are a warm, expert personal finance coach for Flourish Money (${country==="CA"?"Canada":"USA"}).

User profile:
- Name: ${profile.name||"User"} | Age: ${age?`${age} (born ${birthYear})`:"not provided"}
- Location: ${country==="CA"?"Canada":"United States"} — ${profile.province||"unknown"}
- Status: ${profile.status||"single"}${profile.partnerName?` (partner: ${profile.partnerName})`:""}
- Employment: ${empLabel} | Homeowner: ${profile.isHomeowner?"Yes":"No"}
- Children: ${kidsInfo}

Financial snapshot:
- Balance: $${(balance||0).toFixed(2)} | Income (biweekly): $${(income||0).toFixed(2)}
- Recent spending: $${(spending||0).toFixed(2)} | Top categories: ${topCats||"no data"}
- Accounts: ${accounts.map(a=>`${a.name} (${a.type}) $${a.balance}`).join("; ")||"none linked"}
- Bills: ${bills}
- Debts: ${debts}
- Savings goals: ${goals}
- Retirement accounts: ${retInfo}${profile.rrspRoom?`
- RRSP room: $${profile.rrspRoom}`:""}${profile.tfsaRoom?`
- TFSA room: $${profile.tfsaRoom}`:""}

Tax & advice context (use these to give accurate, personalised advice):
${country==="CA"?`- Employment: ${isSelfEmp?"SELF-EMPLOYED — mention HST/GST ($30k threshold), quarterly installments, home office, business deductions, CRA My Account":"T4 EMPLOYEE — standard employment deductions, RRSP, union dues, home office if remote"}
- ${age&&age>=65?"SENIOR 65+: Age Amount credit, pension income splitting (Form T1032), OAS ($727/mo), GIS if low income, medical expense credit, RRIF withdrawals":""}
- ${age&&age<71?"RRSP contribution room matters — deadline to convert is age 71":"age 71+: RRIF required, minimum withdrawals apply"}
- ${!profile.isHomeowner&&(!age||age<40)?"FIRST-TIME BUYER ELIGIBLE: FHSA ($8,000/yr deductible, tax-free growth), HBP (borrow up to $60k from RRSP — limit raised in Budget 2024), First Home Buyers Tax Credit ($1,500)":""}
- ${profile.hasKids?`PARENT: CCB (2025: $7,997/yr under-6, $6,748/yr ages 6–17 — tax-free, income-tested), RESP+CESG (government adds 20% on first $2,500/yr = $500 free/child/yr), childcare deduction (lower-income spouse claims), ${kidsArr.some(k=>parseInt(k.birthYear||0)>0&&new Date().getFullYear()-parseInt(k.birthYear)>=17)?"college-age child: consider RESP withdrawal strategy":""}`:""}
- Province ${profile.province||"ON"}: apply correct provincial tax rates and credits`:
`- Employment: ${isSelfEmp?"SELF-EMPLOYED — quarterly estimated taxes, Schedule C, SE tax deduction (50% of SE tax), home office Form 8829, retirement via SEP-IRA or Solo 401k":"W-2 EMPLOYEE — check withholding accuracy, max employer 401k match first"}
- ${age&&age>=65?"SENIOR 65+: Social Security taxation (up to 85% taxable), RMDs start at 73, higher standard deduction ($1,950 extra single), OBBBA NEW $6,000 senior bonus deduction (2025–2028, phases out at $75k MAGI), QCD from IRA up to $108,000 (2025 indexed limit)":""}
- ${age&&age>=73?"RMDs ARE REQUIRED — penalty is 25% of missed amount. Calculate and plan withdrawals carefully":""}
- ${!profile.isHomeowner&&(!age||age<40)?"FIRST-TIME BUYER: mortgage interest deduction, property tax deduction, $10k IRA penalty-free withdrawal, check state programs":""}
- ${profile.hasKids?`PARENT: Child Tax Credit ($2,200/child under 17 — OBBBA 2025), Dependent Care FSA ($5,000 pre-tax for 2025; rises to $7,500 for 2026 per OBBBA), ${kidsArr.some(k=>parseInt(k.birthYear||0)>0&&new Date().getFullYear()-parseInt(k.birthYear)>=17)?"AOTC for college ($2,500/yr, 40% refundable)":""}`:""}
- State ${profile.province||"unknown"}: ${profile.province==="TX"||profile.province==="FL"||profile.province==="WA"?"NO state income tax — higher effective savings rate possible":"state income tax applies — factor into net income calculations"}`}

When user agrees to a specific goal or plan: FLOURISH_UPDATE:{"action":"update_goal","name":"<n>","target":<n>,"saved":<n>,"monthly":<n>}
To add new goal: FLOURISH_UPDATE:{"action":"add_goal","name":"<n>","target":<n>,"saved":<n>,"monthly":<n>}

Keep responses concise (3-5 sentences), practical, warm. Use $ amounts. Never be preachy.
CRITICAL: Balances are live. NEVER tell user to check their bank app — Flourish IS their financial view. Never mention Plaid.`;
  };

  const send = async ()=>{
    const text = input.trim();
    if(!text || loading) return;
    if(!isPremium && freeMsgsLeft<=0){ onUpgrade(); return; }
    // Detect if user is asking about balance mismatch
    const isBalanceQuestion = (text.toLowerCase().includes("balance") && 
      (text.toLowerCase().includes("wrong") || text.toLowerCase().includes("match") || 
       text.toLowerCase().includes("correct") || text.toLowerCase().includes("right") ||
       text.toLowerCase().includes("different") || text.toLowerCase().includes("off")));
    setInput("");
    setError("");
    const newMessages = [...messages, {role:"user", content:text}];
    setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          type: "chat",
          payload: {
            system: buildContext(),
            messages: newMessages.map(m=>({role:m.role, content:m.content})),
          },
        }),
      });
      if(!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      const rawReply = json.content?.[0]?.text || json.reply || "Sorry, I couldn't get a response. Try again.";
      onSend(); // only count on successful response

      // Parse FLOURISH_UPDATE action from coach reply and apply to app data
      let displayReply = rawReply;
      const updateMatch = rawReply.match(/FLOURISH_UPDATE:(\{[^\n]+\})/);
      if(updateMatch && setAppData) {
        try {
          const update = JSON.parse(updateMatch[1]);
          displayReply = rawReply.replace(/\nFLOURISH_UPDATE:[^\n]+/, "").trim();
          if(update.action==="add_goal") {
            setAppData(prev=>({...prev, goals:[...(prev.goals||[]), {
              id:Date.now(), name:update.name||"Goal",
              target:String(update.target||0), saved:String(update.saved||0),
              monthly:String(update.monthly||0),
            }]}));
          } else if(update.action==="update_goal") {
            setAppData(prev=>({...prev, goals:(prev.goals||[]).map(g=>
              (g.name||"").toLowerCase()===(update.name||"").toLowerCase()
                ? {...g, ...(update.target?{target:String(update.target)}:{}),
                        ...(update.saved!=null?{saved:String(update.saved)}:{}),
                        ...(update.monthly?{monthly:String(update.monthly)}:{})}
                : g
            )}));
          }
        } catch(e) { /* malformed update — ignore */ }
      }

      setMessages(prev=>{
        const msgs = [...prev, {role:"assistant", content:displayReply}];
        if(isBalanceQuestion) msgs.push({role:"assistant",content:"💡 If your balance doesn't match your bank app, I can help reconcile it. Upload your latest bank statement PDF or CSV in the **Transactions** screen — I'll compare the numbers and flag any discrepancies.",isSystem:true});
        return msgs;
      });
    } catch(e){
      setError("Couldn't reach the coach. Check your connection and try again.");
      setMessages(prev=>prev.slice(0,-1)); // remove the user msg so they can retry
      setInput(text);
    }
    setLoading(false);
  };

  const handleKey = e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); }};

  const suggestions = [
    "Where is my money going?",
    "How can I save more this month?",
    "Am I on track for my goals?",
    "What's my biggest spending problem?",
  ];

  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 120px)",fontFamily:"'Plus Jakarta Sans',sans-serif",maxWidth:430,margin:"0 auto",width:"100%"}}>
      {/* Header */}
      <div style={{padding:"16px 20px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {setScreen&&<button onClick={()=>setScreen("home")} style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:12,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,color:C.cream,fontSize:18}}>←</button>}
          <div style={{width:38,height:38,borderRadius:12,background:`linear-gradient(135deg,${C.purple}33,${C.purple}11)`,border:`1px solid ${C.purple}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <Icon id="sparkles" size={19} color={C.purpleBright} strokeWidth={1.5}/>
          </div>
          <div style={{flex:1}}>
            <div style={{color:C.cream,fontWeight:800,fontSize:15}}>AI Coach</div>
            <div style={{color:isOnline?C.green:C.muted,fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:isOnline?C.green:C.muted}}/>
              {isOnline?"Live · Your real data":"Offline"}
            </div>
          </div>
          <button onClick={()=>{
            if(window.confirm("Clear chat history? This cannot be undone.")){
              try{localStorage.removeItem(STORAGE_KEY);}catch{}
              setMessages([WELCOME]);
            }
          }} style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 10px",color:C.muted,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",minHeight:36,flexShrink:0}} title="Clear history">
            🗑️
          </button>
          {!isPremium&&<div onClick={onUpgrade} style={{background:freeMsgsLeft>0?C.purple+"22":C.red+"22",border:`1px solid ${freeMsgsLeft>0?C.purple+"44":C.red+"44"}`,borderRadius:10,padding:"5px 10px",cursor:"pointer",textAlign:"center"}}>
            <div style={{color:freeMsgsLeft>0?C.purpleBright:C.redBright,fontSize:12,fontWeight:800}}>{freeMsgsLeft}/{FREE_LIMIT}</div>
            <div style={{color:C.muted,fontSize:9,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>free left</div>
          </div>}
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            {m.role==="system"
              ? <div style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"4px 0"}}>
                  <div style={{flex:1,height:1,background:C.border}}/>
                  <span style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,flexShrink:0}}>{m.content}</span>
                  <div style={{flex:1,height:1,background:C.border}}/>
                </div>
              : <div style={{
                  maxWidth:"82%",
                  background:m.role==="user"
                    ?`linear-gradient(135deg,${C.purple},${C.purpleBright})`
                    :C.card,
                  color:m.role==="user"?"#fff":C.cream,
                  border:m.role==="user"?"none":`1px solid ${C.border}`,
                  borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",
                  padding:"11px 15px",
                  fontSize:13,
                  lineHeight:1.65,
                  fontFamily:"inherit",
                  whiteSpace:"pre-wrap",
                }}>{m.content}</div>
            }
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",justifyContent:"flex-start"}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:"18px 18px 18px 4px",padding:"11px 16px",display:"flex",gap:5,alignItems:"center"}}>
              {[0,1,2].map(i=>(
                <div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.purple,opacity:0.7,animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite`}}/>
              ))}
            </div>
          </div>
        )}
        {error&&<div style={{color:C.red,fontSize:12,textAlign:"center",padding:"8px 16px",background:C.redDim,borderRadius:10,border:`1px solid ${C.red}33`}}>{error}</div>}
        <div ref={bottomRef}/>
      </div>

      {/* Quick suggestions — only show when just the greeting */}
      {messages.length===1&&(
        <div style={{padding:"0 20px 10px",display:"flex",flexWrap:"wrap",gap:7,flexShrink:0}}>
          {suggestions.map((s,i)=>(
            <button key={i} onClick={()=>{setInput(s);}} style={{background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:99,padding:"7px 13px",color:C.mutedHi,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{padding:"10px 20px 16px",borderTop:`1px solid ${C.border}`,flexShrink:0,display:"flex",gap:10,alignItems:"flex-end"}}>
        <textarea
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask your coach anything…"
          rows={1}
          style={{
            flex:1,resize:"none",background:C.card,border:`1.5px solid ${C.border}`,
            borderRadius:14,padding:"11px 14px",color:C.cream,fontSize:13,
            fontFamily:"inherit",outline:"none",lineHeight:1.5,
            transition:"border-color .15s",maxHeight:100,overflowY:"auto",
          }}
          onFocus={e=>e.target.style.borderColor=C.purple}
          onBlur={e=>e.target.style.borderColor=C.border}
        />
        <button
          onClick={send}
          disabled={!input.trim()||loading}
          style={{
            width:42,height:42,borderRadius:13,border:"none",cursor:input.trim()&&!loading?"pointer":"not-allowed",
            background:input.trim()&&!loading?`linear-gradient(135deg,${C.purple},${C.purpleBright})`:`${C.purple}33`,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── CREDIT SCREEN ────────────────────────────────────────────────────────────
function CreditScreen({data,setScreen}){
  const profile = data.profile||{};
  const country = profile.country||"CA";
  const isCA = country==="CA";

  // Score derived from behavioral signals (mock until Plaid/bureau integration)
  const txns = data.transactions||[];
  const accounts = data.accounts||[];

  // Empty state — no bank and no credit score entered
  if(!data.bankConnected && !profile.creditKnown) return (
    <EmptyState icon="💳" title="Connect your bank for credit coaching"
      body="Flourish analyses your spending patterns and debt utilization to build a personalized credit improvement plan. Connect your bank to unlock this."
      action="Connect Bank" onAction={()=>window.dispatchEvent(new CustomEvent("flourish:settings"))} color={C.blue}/>
  );
  // Monthly income using frequency-aware conversion (same as FinancialCalcEngine)
  const toMonthlyC = (amt, freq) => { const a=parseFloat(amt||0); return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="monthly"?a:a*2.167; };
  const income = (data.incomes||[]).reduce((s,i)=>s+toMonthlyC(i.amount,i.freq),0) || (DEMO.income*2.167);
  const spending = txns.filter(t=>t.amount>0&&t.cat!=="Income"&&t.cat!=="Transfer"&&t.cat!=="Fees").reduce((s,t)=>s+t.amount,0);
  const utilization = Math.min(1, spending / Math.max(income, 1));
  const baseScore = isCA ? 720 : 718;
  const score = Math.round(baseScore - (utilization * 60) + (accounts.length * 8));
  const clampedScore = Math.min(850, Math.max(580, score));

  const scoreColor = clampedScore >= 740 ? C.green : clampedScore >= 670 ? C.gold : C.red;
  const scoreLabel = clampedScore >= 740 ? "Very Good" : clampedScore >= 670 ? "Fair" : "Needs Work";

  const factors = [
    {label:"Payment History", weight:"35%", score:clampedScore>700?95:78, tip:"Never miss a payment — set up auto-pay on all accounts."},
    {label:"Credit Utilization", weight:"30%", score:Math.max(40, Math.round(100-(utilization*80))), tip:`Keep balances below 30% of your limit. Yours is ~${Math.round(utilization*100)}%.`},
    {label:"Credit Age", weight:"15%", score:72, tip:"Don't close old accounts — length of history matters."},
    {label:"Credit Mix", weight:"10%", score:accounts.length>1?80:55, tip:"A mix of credit types (card + loan) helps your score."},
    {label:"New Inquiries", weight:"10%", score:85, tip:"Limit hard inquiries — only apply for credit you need."},
  ];

  const tips = isCA ? [
    {icon:"🏦", title:"Check your Equifax & TransUnion reports", desc:"Get free annual reports at equifax.ca and transunion.ca. Dispute any errors immediately."},
    {icon:"🤝", title:"Become an authorized user", desc:"Ask a family member with excellent credit to add you to their card. Their history helps yours."},
    {icon:"📅", title:"Pay twice a month", desc:"Paying every 2 weeks instead of monthly lowers your reported utilization significantly."},
  ] : [
    {icon:"🏦", title:"Get your free credit report", desc:"Check AnnualCreditReport.com — you're entitled to free reports from all 3 bureaus."},
    {icon:"💳", title:"Request a credit limit increase", desc:"A higher limit with the same spending = lower utilization. Do this every 12 months."},
    {icon:"📅", title:"Pay twice a month", desc:"Paying every 2 weeks lowers your reported utilization and can boost your score in 60 days."},
  ];

  const arc = (score)=>{
    const pct = (score - 300) / 550;
    const angle = -210 + pct * 240;
    const rad = (angle * Math.PI) / 180;
    const r = 70;
    const cx = 100, cy = 95;
    return {x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad)};
  };

  const scoreAngle = -210 + ((clampedScore-300)/550)*240;
  const rad = scoreAngle * Math.PI / 180;
  const needleX = 100 + 55 * Math.cos(rad);
  const needleY = 95 + 55 * Math.sin(rad);

  return(
    <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"20px 20px 80px",maxWidth:430,margin:"0 auto"}}>
      <ScreenHeader title="Credit Score" subtitle="Estimated from your financial behaviour" onBack={setScreen?()=>setScreen("home"):null} cta="Ask Coach" onCta={setScreen?()=>setScreen("coach"):null} ctaColor={C.purple}/>
      {/* Score gauge */}
      <div style={{background:C.card,borderRadius:20,padding:"24px 20px 20px",border:`1px solid ${C.border}`,marginBottom:16,textAlign:"center"}}>
        <div style={{color:C.muted,fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Credit Score Estimate</div>
        <svg viewBox="0 0 200 120" style={{width:"100%",maxWidth:240,margin:"0 auto",display:"block"}}>
          {/* Track arc */}
          <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke={C.border} strokeWidth="12" strokeLinecap="round"/>
          {/* Colored arc */}
          <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke={scoreColor} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${((clampedScore-300)/550)*251} 251`}/>
          {/* Needle */}
          <line x1="100" y1="95" x2={needleX} y2={needleY} stroke={scoreColor} strokeWidth="3" strokeLinecap="round"/>
          <circle cx="100" cy="95" r="5" fill={scoreColor}/>
          {/* Score text */}
          <text x="100" y="82" textAnchor="middle" fill={scoreColor} fontSize="28" fontWeight="900" fontFamily="Plus Jakarta Sans,sans-serif">{clampedScore}</text>
          <text x="100" y="112" textAnchor="middle" fill={scoreColor} fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans,sans-serif">{scoreLabel}</text>
        </svg>
        <div style={{color:C.muted,fontSize:11,marginTop:8}}>
          Estimated from your spending behaviour · {isCA?"Equifax/TransUnion scale 300–900":"FICO® scale 300–850"}
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:12}}>
          {[["580","Poor",C.red],["670","Fair",C.gold],["740","Good",C.green],["800","Excellent",C.teal]].map(([s,l,col])=>(
            <div key={s} style={{background:col+"22",border:`1px solid ${col}44`,borderRadius:8,padding:"3px 8px",textAlign:"center"}}>
              <div style={{color:col,fontSize:9,fontWeight:800}}>{s}+</div>
              <div style={{color:col,fontSize:8,fontWeight:600}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Factors */}
      <div style={{background:C.card,borderRadius:20,padding:"18px 18px",border:`1px solid ${C.border}`,marginBottom:16}}>
        <div style={{color:C.cream,fontWeight:800,fontSize:14,marginBottom:14}}>Score Factors</div>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {factors.map((f,i)=>(
            <div key={i}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{color:C.cream,fontSize:12,fontWeight:700}}>{f.label}</span>
                  <span style={{color:C.muted,fontSize:10,fontWeight:600}}>{f.weight}</span>
                </div>
                <span style={{color:f.score>=80?C.green:f.score>=60?C.gold:C.red,fontWeight:800,fontSize:12}}>{f.score}/100</span>
              </div>
              <div style={{background:C.cardAlt,borderRadius:99,height:6,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${f.score}%`,background:f.score>=80?C.green:f.score>=60?C.gold:C.red,borderRadius:99,transition:"width 1s ease"}}/>
              </div>
              <div style={{color:C.muted,fontSize:11,marginTop:4,lineHeight:1.5}}>{f.tip}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Action tips */}
      <div style={{color:C.cream,fontWeight:800,fontSize:14,marginBottom:10}}>Your Action Plan</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {tips.map((t,i)=>(
          <div key={i} style={{background:C.card,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.border}`,display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{fontSize:22,flexShrink:0,marginTop:1}}>{t.icon}</div>
            <div>
              <div style={{color:C.cream,fontWeight:700,fontSize:13,marginBottom:3}}>{t.title}</div>
              <div style={{color:C.muted,fontSize:12,lineHeight:1.55}}>{t.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div style={{marginTop:16,padding:"12px 16px",background:C.cardAlt,borderRadius:14,border:`1px solid ${C.border}`}}>
        <div style={{color:C.muted,fontSize:10,lineHeight:1.6,textAlign:"center"}}>
          ⚠️ This is a behavioural estimate, not your official credit score. Connect a bureau account or check {isCA?"Equifax/TransUnion directly":"AnnualCreditReport.com"} for your actual score.
        </div>
      </div>
    </div>
  );
}

// ─── PRIVACY POLICY ───────────────────────────────────────────────────────────
// ─── FEEDBACK MODAL ───────────────────────────────────────────────────────────
function FeedbackModal({onClose}){
  const [msg,setMsg]=useState("");
  const [type,setType]=useState("bug");
  const [sent,setSent]=useState(false);
  const [sending,setSending]=useState(false);

  const submit=async()=>{
    if(!msg.trim()) return;
    setSending(true);
    try{
      await fetch("https://formspree.io/f/xnnqoqkl",{
        method:"POST",
        headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({type,message:msg,url:window.location.href})
      });
    }catch{}
    setSent(true);
    setSending(false);
    setTimeout(onClose,1800);
  };

  const types=[["🐛","bug","Bug"],["💡","idea","Idea"],["👍","praise","Praise"],["❓","question","Question"]];

  return(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(6px)",
      display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0 0 20px"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{width:"100%",maxWidth:430,background:C.surface,borderRadius:20,padding:"20px 20px 24px",
        border:`1px solid ${C.border}`,animation:"slideUp .28s ease"}}>
        {sent?(
          <div style={{textAlign:"center",padding:"28px 0"}}>
            <div style={{fontSize:40,marginBottom:10}}>🙏</div>
            <div style={{color:C.greenBright,fontWeight:800,fontSize:16,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              Thanks for your feedback!
            </div>
            <div style={{color:C.muted,fontSize:13,marginTop:6}}>It goes straight to Amanda.</div>
          </div>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{color:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                Beta Feedback
              </div>
              <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer",padding:0,lineHeight:1}}>✕</button>
            </div>
            {/* Type selector */}
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {types.map(([emoji,val,label])=>(
                <button key={val} onClick={()=>setType(val)}
                  style={{flex:1,background:type===val?C.green+"33":C.cardAlt,border:`1px solid ${type===val?C.green:C.border}`,
                    borderRadius:10,padding:"8px 4px",color:type===val?C.greenBright:C.muted,
                    fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                    display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <span style={{fontSize:16}}>{emoji}</span>{label}
                </button>
              ))}
            </div>
            <textarea value={msg} onChange={e=>setMsg(e.target.value)}
              placeholder={type==="bug"?"What happened? What did you expect?":type==="idea"?"What would make Flourish better?":type==="praise"?"What do you love?":"What's your question?"}
              rows={4}
              style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:12,
                padding:"12px 14px",color:C.cream,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",
                outline:"none",resize:"none",lineHeight:1.6,boxSizing:"border-box"}}/>
            <button onClick={submit} disabled={!msg.trim()||sending}
              style={{width:"100%",background:msg.trim()&&!sending?`linear-gradient(135deg,${C.green},${C.greenBright})`:"rgba(255,255,255,0.06)",
                border:"none",borderRadius:12,padding:"13px",color:msg.trim()&&!sending?"#041810":C.muted,
                fontWeight:800,fontSize:13,cursor:msg.trim()&&!sending?"pointer":"default",
                fontFamily:"inherit",marginTop:10}}>
              {sending?"Sending…":"Send Feedback →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PrivacyPolicy({onBack}){
  const s={fontFamily:"'Plus Jakarta Sans',sans-serif"};
  const h2={...s,fontSize:16,fontWeight:800,color:C.cream,marginTop:28,marginBottom:8};
  const p={...s,fontSize:13,color:C.mutedHi,lineHeight:1.75,marginBottom:0};
  const last="March 16, 2026";
  return(
    <div style={{maxWidth:600,margin:"0 auto",padding:"0 4px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28,paddingTop:4}}>
        <button onClick={onBack} style={{background:`rgba(255,255,255,0.05)`,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 18px",minHeight:44,color:C.cream,cursor:"pointer",...s,fontSize:13,fontWeight:600}}>← Back</button>
        <div>
          <div style={{...s,fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:C.cream}}>Privacy Policy</div>
          <div style={{...s,fontSize:11,color:C.muted}}>Last updated {last}</div>
        </div>
      </div>

      <div style={{...p,background:C.card,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.border}`,marginBottom:4}}>
        Flourish Money is operated by <strong style={{color:C.cream}}>GrowSmart Inc.</strong> ("we", "us", or "our"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Flourish Money application ("App"), available at flourishmoney.app.
      </div>

      <div style={h2}>1. Information We Collect</div>
      <div style={p}><strong style={{color:C.cream}}>Information you provide directly:</strong> First name, country and province/state, relationship status, income sources, account balances, bills, debts, savings goals, and financial transactions you enter manually or via bank connection (Plaid). We also collect an email address and password when you create an account.</div>
      <div style={{...p,marginTop:10}}><strong style={{color:C.cream}}>Information collected automatically:</strong> Device type, operating system, app version, usage patterns (screens viewed, features used), and crash reports. We do not collect your IP address for tracking purposes.</div>
      <div style={{...p,marginTop:10}}><strong style={{color:C.cream}}>Bank connection data (Plaid):</strong> If you connect your bank, Plaid Inc. retrieves account balances and transaction history on our behalf. We receive read-only access to this data. We do not store your banking credentials. Plaid's privacy policy applies to that connection.</div>

      <div style={h2}>2. How We Use Your Information</div>
      <div style={p}>We use your financial data solely to provide the Flourish Money service — including your Financial Health Score, spending insights, AI coaching, budgeting, debt tracking, and goals. Specifically we use it to: power your personalized AI Coach (via Anthropic's Claude API), calculate your financial health metrics, surface relevant opportunities and warnings, and improve the App. We do not sell your personal information to third parties. We do not use your financial data for advertising profiling.</div>

      <div style={h2}>3. Legal Basis for Processing (Canada — PIPEDA)</div>
      <div style={p}>For users in Canada, we collect and process your personal information with your knowledge and consent in accordance with the <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA) and applicable provincial privacy laws. You may withdraw consent at any time by deleting your account. We retain data only as long as necessary to provide the service or as required by law.</div>

      <div style={h2}>4. Legal Basis for Processing (United States)</div>
      <div style={p}>For US residents, we comply with applicable state and federal privacy laws. California residents have rights under the CCPA/CPRA including the right to know, delete, and opt out of sale of personal information. We do not sell personal information. To exercise your rights, contact us at privacy@flourishmoney.app.</div>

      <div style={h2}>5. Data Storage & Security</div>
      <div style={p}>Your data is stored on your device (locally via localStorage) and, if you create an account, in our secure cloud database provided by Supabase (hosted in data centres compliant with SOC 2 Type II). Data transmitted between your device and our servers is encrypted using TLS 1.2+. AI coaching queries are processed by Anthropic's API and are subject to Anthropic's data-handling policies — no conversation history is stored server-side by Flourish.</div>

      <div style={h2}>6. Data Sharing</div>
      <div style={p}>We share data with the following service providers solely to operate the App:</div>
      <div style={{...p,marginTop:8,paddingLeft:16}}>• <strong style={{color:C.cream}}>Anthropic</strong> — AI coaching responses (transaction summaries sent as context)</div>
      <div style={{...p,paddingLeft:16}}>• <strong style={{color:C.cream}}>Plaid</strong> — Bank account connectivity (if you choose to connect)</div>
      <div style={{...p,paddingLeft:16}}>• <strong style={{color:C.cream}}>Supabase</strong> — Account authentication and encrypted cloud data storage</div>
      <div style={{...p,paddingLeft:16}}>• <strong style={{color:C.cream}}>Netlify</strong> — App hosting and serverless function processing</div>
      <div style={{...p,marginTop:8}}>We do not share your data with advertisers, data brokers, or any other third parties.</div>

      <div style={h2}>7. Your Rights</div>
      <div style={p}>You have the right to access, correct, or delete your personal information at any time. You can delete your account and all associated data from Settings → Delete Account. For data requests or questions, contact us at privacy@flourishmoney.app. We will respond within 30 days.</div>

      <div style={h2}>8. Children's Privacy</div>
      <div style={p}>The App is not intended for individuals under the age of 18. We do not knowingly collect personal information from minors. If we learn that we have collected personal information from a minor, we will promptly delete it.</div>

      <div style={h2}>9. Changes to This Policy</div>
      <div style={p}>We may update this Privacy Policy periodically. We will notify you of material changes via the App or by email. Continued use of the App after changes constitutes your acceptance of the updated policy.</div>

      <div style={h2}>10. Contact Us</div>
      <div style={p}>GrowSmart Inc. / Flourish Money<br/>Website: flourishmoney.app</div>
      <a href="mailto:privacy@flourishmoney.app" style={{display:"inline-flex",alignItems:"center",gap:8,marginTop:12,background:C.green+"18",border:`1px solid ${C.green}44`,borderRadius:99,padding:"10px 18px",color:C.greenBright,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,fontWeight:700,textDecoration:"none",minHeight:44}}>
        ✉️ privacy@flourishmoney.app
      </a>
    </div>
  );
}

// ─── TERMS OF SERVICE ─────────────────────────────────────────────────────────
function TermsOfService({onBack}){
  const s={fontFamily:"'Plus Jakarta Sans',sans-serif"};
  const h2={...s,fontSize:16,fontWeight:800,color:C.cream,marginTop:28,marginBottom:8};
  const p={...s,fontSize:13,color:C.mutedHi,lineHeight:1.75,marginBottom:0};
  const last="March 16, 2026";
  return(
    <div style={{maxWidth:600,margin:"0 auto",padding:"0 4px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28,paddingTop:4}}>
        <button onClick={onBack} style={{background:`rgba(255,255,255,0.05)`,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 18px",minHeight:44,color:C.cream,cursor:"pointer",...s,fontSize:13,fontWeight:600}}>← Back</button>
        <div>
          <div style={{...s,fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:C.cream}}>Terms of Service</div>
          <div style={{...s,fontSize:11,color:C.muted}}>Last updated {last}</div>
        </div>
      </div>

      <div style={{...p,background:C.card,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.border}`,marginBottom:4}}>
        Please read these Terms of Service carefully before using Flourish Money. By accessing or using the App, you agree to be bound by these Terms. If you do not agree, do not use the App.
      </div>

      <div style={h2}>1. About Flourish Money</div>
      <div style={p}>Flourish Money ("App") is a personal finance management tool operated by <strong style={{color:C.cream}}>GrowSmart Inc.</strong> ("Company", "we", "us"). The App provides budgeting, spending tracking, financial health scoring, AI-powered coaching, and goal-setting tools for personal use.</div>

      <div style={h2}>2. Eligibility</div>
      <div style={p}>You must be at least 18 years old and a resident of Canada or the United States to use Flourish Money. By using the App, you represent and warrant that you meet these requirements.</div>

      <div style={h2}>3. Not Financial Advice</div>
      <div style={{...p,background:`${C.gold}11`,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.gold}33`}}>⚠️ <strong style={{color:C.goldBright}}>Important:</strong> Flourish Money is an educational financial tool, not a licensed financial advisor. The AI Coach, insights, scores, and all content in the App are for informational purposes only and do not constitute financial, investment, tax, or legal advice. Always consult a qualified financial professional before making significant financial decisions.</div>

      <div style={h2}>4. Account Registration</div>
      <div style={p}>You may use Flourish Money with a guest account (data stored locally) or create a registered account with your email and password. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify us immediately at hello@flourishmoney.app of any unauthorized use.</div>

      <div style={h2}>5. Bank Connectivity (Plaid)</div>
      <div style={p}>If you choose to connect your bank accounts, you authorize us to use Plaid Inc. to access your financial institution on your behalf. This access is read-only; we cannot initiate transactions. Your banking credentials are never shared with or stored by Flourish Money. By connecting your bank, you also agree to Plaid's End User Privacy Policy.</div>

      <div style={h2}>6. Acceptable Use</div>
      <div style={p}>You agree not to: use the App for any unlawful purpose; attempt to reverse-engineer, decompile, or hack the App; use the App to process another person's financial data without their consent; resell or sublicense the App; or interfere with the security or integrity of the App or its infrastructure.</div>

      <div style={h2}>7. Subscription & Billing</div>
      <div style={p}><strong style={{color:C.cream}}>Free Tier:</strong> Core features are available at no charge with a 14-day trial of premium features.<br/><br/><strong style={{color:C.cream}}>Flourish Plus:</strong> Premium features require a paid subscription. Subscription fees are billed in advance on a monthly or annual basis. Prices are displayed in CAD for Canadian users and USD for US users, inclusive of applicable taxes. You may cancel at any time; cancellations take effect at the end of the current billing period. No refunds are provided for partial billing periods unless required by applicable law.</div>

      <div style={h2}>8. Intellectual Property</div>
      <div style={p}>The App, including its design, logo, code, AI systems, and content, is the exclusive property of GrowSmart Inc. and is protected by copyright, trademark, and other intellectual property laws. You receive a limited, non-exclusive, non-transferable licence to use the App for personal, non-commercial purposes.</div>

      <div style={h2}>9. Disclaimer of Warranties</div>
      <div style={p}>THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT FINANCIAL DATA WILL BE ACCURATE OR COMPLETE. YOUR USE OF THE APP IS AT YOUR SOLE RISK.</div>

      <div style={h2}>10. Limitation of Liability</div>
      <div style={p}>TO THE MAXIMUM EXTENT PERMITTED BY LAW, GROWSMART INC. SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF OR INABILITY TO USE THE APP, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRIOR TO THE CLAIM.</div>

      <div style={h2}>11. Governing Law</div>
      <div style={p}>These Terms shall be governed by the laws of the Province of Ontario and the federal laws of Canada applicable therein, without regard to conflict of law principles. For US users, disputes may alternatively be resolved under the laws of your state of residence to the extent required by applicable law.</div>

      <div style={h2}>12. Changes to These Terms</div>
      <div style={p}>We reserve the right to modify these Terms at any time. We will notify you of material changes via the App or email. Continued use of the App after changes constitutes your acceptance of the updated Terms.</div>

      <div style={h2}>13. Contact</div>
      <div style={p}>GrowSmart Inc. / Flourish Money<br/>Website: flourishmoney.app</div>
      <a href="mailto:hello@flourishmoney.app" style={{display:"inline-flex",alignItems:"center",gap:8,marginTop:12,background:C.green+"18",border:`1px solid ${C.green}44`,borderRadius:99,padding:"10px 18px",color:C.greenBright,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,fontWeight:700,textDecoration:"none",minHeight:44}}>
        ✉️ hello@flourishmoney.app
      </a>
    </div>
  );
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
      <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>14-day free trial · Cancel anytime</div>
    </div>
  );
}

// ─── PAYWALL ──────────────────────────────────────────────────────────────────
function Paywall({onClose,onUpgrade,country}){
  const [selected,setSelected]=useState("annual");
  const [promo,setPromo]=useState("");
  const [promoError,setPromoError]=useState("");
  const PROMO_CODES=["FLOURISH2026","FOUNDER","BETA100"];
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

        {/* Promo code */}
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input
            value={promo}
            onChange={e=>{setPromo(e.target.value.toUpperCase());setPromoError("");}}
            placeholder="Promo code"
            style={{flex:1,background:C.card,border:`1.5px solid ${promoError?C.red:C.border}`,borderRadius:12,padding:"11px 14px",color:C.cream,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none"}}
          />
          <button
            onClick={()=>{
              if(PROMO_CODES.includes(promo.trim())){onUpgrade();}
              else{setPromoError("Invalid code");}
            }}
            style={{background:C.purple+"22",border:`1.5px solid ${C.purple}44`,borderRadius:12,padding:"11px 16px",color:C.purpleBright,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap"}}
          >Apply</button>
        </div>
        {promoError&&<div style={{color:C.red,fontSize:11,marginBottom:8,textAlign:"center"}}>{promoError}</div>}

        {/* CTA */}
        <button onClick={onUpgrade} style={{width:"100%",background:`linear-gradient(135deg,${C.purple} 0%,${C.purpleBright} 100%)`,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,fontSize:16,padding:"16px",borderRadius:99,border:"none",cursor:"pointer",boxShadow:`0 8px 32px ${C.purple}40`,marginBottom:12}}>
          Start Free 14-Day Trial →
        </button>
        <div style={{textAlign:"center",color:C.muted,fontSize:11,lineHeight:1.7}}>
          14 days free, then {plans[selected].price}. Cancel anytime.<br/>
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


// ─── FIRST VISIT FOCUSED SCREEN ──────────────────────────────────────────────
// Shown once, immediately after onboarding completes.
// One number. One sentence. One button.
// Dismissed permanently after user taps through.
function FirstVisitScreen({data, onDismiss}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { safeAmount } = SafeSpendEngine.calculate(data);
  const { monthlyIncome, monthlyBills } = FinancialCalcEngine.cashFlow(data);
  const toMo = (amt,freq)=>{const a=parseFloat(amt||0);return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="monthly"?a:a*2.167;};
  const incomeAmt = (data.incomes||[]).filter(i=>parseFloat(i.amount)>0).reduce((s,i)=>s+toMo(i.amount,i.freq),0);
  const billsAmt = (data.bills||[]).reduce((s,b)=>s+parseFloat(b.amount||0),0);
  const safeFloor = incomeAmt * 0.15;
  const bufferAmt = Math.max(0, incomeAmt - billsAmt - safeFloor);
  const name = data.profile?.name || "there";

  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 28px",textAlign:"center"}}>
      {/* Ambient glow */}
      <div style={{position:"absolute",top:"20%",left:"50%",transform:"translateX(-50%)",width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${C.green}14 0%,transparent 65%)`,pointerEvents:"none"}}/>

      <div style={{position:"relative",width:"100%",maxWidth:360}}>
        {/* Welcome */}
        <div style={{color:C.muted,fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:16,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
          Welcome, {name}
        </div>

        {/* The Number */}
        <div style={{marginBottom:8}}>
          {incomeAmt > 0 ? (<>
            <div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4}}>You can safely spend</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,lineHeight:1}}>
              <span style={{fontSize:22,color:C.greenBright+"88",verticalAlign:"top",marginTop:12,display:"inline-block"}}>$</span>
              <span style={{fontSize:88,color:C.greenBright,letterSpacing:-4,textShadow:`0 0 80px ${C.green}40`}}>
                {Math.max(0,safeAmount).toFixed(0)}
              </span>
            </div>
            <div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4}}>today</div>
          </>) : (
            <div style={{marginTop:8}}>
              <div style={{fontSize:64,marginBottom:12}}>🌱</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:900,color:C.greenBright,marginBottom:8}}>Flourish is ready</div>
            </div>
          )}
        </div>

        {/* One-line explanation */}
        <div style={{color:C.mutedHi,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6,marginBottom:32,maxWidth:280,margin:"0 auto 32px"}}>
          {incomeAmt > 0
            ? "After your bills are covered and a buffer is set aside — this is yours, free and clear."
            : "Add your income in Settings to see your personalised safe-to-spend number."}
        </div>

        {/* Breakdown — progressive disclosure */}
        {showBreakdown&&(
          <div style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:18,padding:"16px 20px",marginBottom:24,textAlign:"left"}}>
            <div style={{color:C.muted,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>How this is calculated</div>
            {[
              ["💰","Monthly income", incomeAmt>0?`$${incomeAmt.toFixed(0)}`:"Not entered yet", incomeAmt>0?C.greenBright:C.muted],
              ["📅","Bills this period",billsAmt>0?`−$${billsAmt.toFixed(0)}`:"None tracked",billsAmt>0?C.gold:C.muted],
              ["🛡️","Safety buffer (15%)",incomeAmt>0?`−$${safeFloor.toFixed(0)}`:"—",C.teal],
              ["✅","Available to spend",`$${Math.max(0,safeAmount).toFixed(0)}`,C.greenBright],
            ].map(([icon,label,val,col],i,arr)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}22`:"none"}}>
                <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{icon} {label}</span>
                <span style={{color:col,fontWeight:700,fontSize:13,fontFamily:"'Playfair Display',serif"}}>{val}</span>
              </div>
            ))}
            {!data.bankConnected&&<div style={{marginTop:12,color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>📌 Connect your bank to make this number live and precise.</div>}<div style={{marginTop:8,color:C.tealBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6,fontWeight:600}}>Unlike Mint or YNAB — we tell you what you <em>can</em> spend, not just what you already did.</div>
          </div>
        )}

        {/* Primary CTA */}
        {!showBreakdown?(
          <button onClick={()=>setShowBreakdown(true)}
            style={{width:"100%",background:`linear-gradient(135deg,${C.green},${C.greenBright})`,border:"none",borderRadius:16,padding:"18px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:`0 8px 32px ${C.green}40`,marginBottom:12}}>
            See how this works →
          </button>
        ):(
          <button onClick={onDismiss}
            style={{width:"100%",background:`linear-gradient(135deg,${C.green},${C.greenBright})`,border:"none",borderRadius:16,padding:"18px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:`0 8px 32px ${C.green}40`,marginBottom:12}}>
            Go to my dashboard →
          </button>
        )}

        <div style={{marginTop:4,color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6,maxWidth:260,margin:"0 auto"}}>
          Your number updates every day — check it each morning before you spend anything.
        </div>
        <button onClick={onDismiss} style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"12px 8px 4px"}}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const NAV=[
  {id:"home",  icon:"home",     label:"Today"},
  {id:"plan",  icon:"calendar", label:"Plan"},
  {id:"spend", icon:"card",     label:"Activity"},
  {id:"coach", icon:"sparkles", label:"Guidance"},
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


// ── AUTH SCREEN ───────────────────────────────────────────────────────────────
// ─── KIDS MINI SITE ──────────────────────────────────────────────────────────
function KidsGoal({goal, jars, code, theme, primary, playSound}){
  const goalEmojis=["🎯","🎮","🚲","📚","🎸","⚽","🏊","🎨","✈️","🦄","👟","🍕","🏆","🎪","🤖"];
  const [editingGoal,setEditingGoal]=useState(false);
  const [goalName,setGoalName]=useState(goal.name||"");
  const [goalAmt2,setGoalAmt2]=useState(goal.amount||"");
  const [goalEmoji2,setGoalEmoji2]=useState(goal.emoji||"🎯");

  const getDisplayGoal=()=>{
    let d=goal;
    try{const local=JSON.parse(localStorage.getItem("flourish_kid_goal_"+code)||"null");if(local?.name)d=local;}catch{}
    return d;
  };
  const [displayGoal,setDisplayGoal]=useState(getDisplayGoal);

  const saveGoal=()=>{
    if(!goalName||!goalAmt2)return;
    const g={name:goalName,amount:goalAmt2,emoji:goalEmoji2};
    try{
      const all=JSON.parse(localStorage.getItem("flourish_kids")||"[]");
      const updated=all.map(k=>k.code===code?{...k,goal:g}:k);
      localStorage.setItem("flourish_kids",JSON.stringify(updated));
      localStorage.setItem("flourish_kid_goal_"+code,JSON.stringify(g));
    }catch{}
    setDisplayGoal(g);
    setEditingGoal(false);
  };

  const dAmt=parseFloat(displayGoal.amount)||0;
  const dPct=dAmt>0?Math.min(100,Math.round(((jars.save||0)/dAmt)*100)):0;

  return (
    <div style={{background:theme.card,borderRadius:18,padding:"18px",border:`1px solid ${theme.primaryBorder}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{color:primary,fontWeight:800,fontSize:14}}>🎯 My Goal</div>
        <button onClick={()=>{setGoalName(displayGoal.name||"");setGoalAmt2(displayGoal.amount||"");setGoalEmoji2(displayGoal.emoji||"🎯");setEditingGoal(e=>!e);}}
          style={{background:"none",border:`1px solid ${theme.primaryBorder}`,borderRadius:8,padding:"4px 10px",color:primary,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          {editingGoal?"Cancel":displayGoal.name?"Change":"Set Goal"}
        </button>
      </div>
      {editingGoal?(
        <div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {goalEmojis.map(e=>(
              <button key={e} onClick={()=>setGoalEmoji2(e)}
                style={{background:goalEmoji2===e?theme.primaryDim:"none",border:`1px solid ${goalEmoji2===e?primary:theme.choreBorder}`,borderRadius:8,padding:"6px",fontSize:18,cursor:"pointer"}}>
                {e}
              </button>
            ))}
          </div>
          <input value={goalName} onChange={e=>setGoalName(e.target.value)} placeholder="What are you saving for?"
            style={{width:"100%",background:theme.cardAlt,border:`1px solid ${theme.choreBorder}`,borderRadius:10,padding:"10px 12px",color:theme.text,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",marginBottom:8,outline:"none"}}/>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
            <span style={{color:primary,fontSize:15,fontWeight:700}}>$</span>
            <input value={goalAmt2} onChange={e=>setGoalAmt2(e.target.value)} placeholder="Amount" type="number"
              style={{flex:1,background:theme.cardAlt,border:`1px solid ${theme.choreBorder}`,borderRadius:10,padding:"10px 12px",color:theme.text,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
          </div>
          <button onClick={saveGoal} disabled={!goalName||!goalAmt2}
            style={{width:"100%",background:goalName&&goalAmt2?primary:"rgba(255,255,255,0.1)",border:"none",borderRadius:12,padding:"12px",color:goalName&&goalAmt2?theme.bg:"rgba(255,255,255,0.3)",fontWeight:800,fontSize:14,cursor:goalName&&goalAmt2?"pointer":"default",fontFamily:"inherit"}}>
            Save Goal {goalEmoji2}
          </button>
        </div>
      ):displayGoal.name&&dAmt>0?(
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{color:theme.text,fontSize:15,fontWeight:700}}>{displayGoal.emoji} {displayGoal.name}</span>
            <span style={{color:primary,fontWeight:800,fontSize:16}}>{dPct}%</span>
          </div>
          <div style={{height:12,background:"rgba(255,255,255,0.06)",borderRadius:6,overflow:"hidden",marginBottom:8}}>
            <div style={{height:"100%",width:`${dPct}%`,background:`linear-gradient(90deg,${theme.jar1},${theme.jar2})`,borderRadius:6,transition:"width .5s"}}/>
          </div>
          <div style={{color:theme.textMuted,fontSize:12}}>
            ${(jars.save||0).toFixed(2)} saved · ${Math.max(0,dAmt-(jars.save||0)).toFixed(2)} to go
            {dPct>=100&&<span style={{color:theme.jar1,fontWeight:700}}> 🎉 You did it!</span>}
          </div>
          {dPct>=100&&<div onClick={()=>playSound("goal")} style={{marginTop:10,background:theme.primaryDim,border:`1px solid ${theme.primaryBorder}`,borderRadius:12,padding:"12px",textAlign:"center",cursor:"pointer"}}>
            <span style={{fontSize:26}}>🎉</span>
            <div style={{color:primary,fontWeight:800,fontSize:13,marginTop:4}}>Goal reached! Tap to celebrate!</div>
          </div>}
        </>
      ):(
        <div style={{color:theme.textMuted,fontSize:13,textAlign:"center",padding:"8px 0"}}>Tap "Set Goal" to pick something to save for!</div>
      )}
    </div>
  );
}

function KidsMiniSite(){
  const params=new URLSearchParams(window.location.search);
  const code=params.get("code")||"";

  const kidData=(()=>{
    try{
      // Try localStorage first (same device as parent)
      const all=JSON.parse(localStorage.getItem("flourish_kids")||"[]");
      const k=all.find(k=>k.code===code);
      if(k)return k;
      const d=JSON.parse(localStorage.getItem("flourish_kid_data_"+code)||"null");
      if(d)return d;
      // Fall back to URL params (any device — data encoded in the share link)
      const n=params.get("n");
      if(n)return{
        name:n,
        emoji:params.get("e")||"🌱",
        age:params.get("a")||"8-12",
        theme:params.get("t")||"pink",
        jars:{spend:0,save:0,give:0},
        goal:{name:"",amount:"",emoji:"🎯"},
        streak:0,
      };
      return null;
    }catch{return null;}
  })();

  const THEMES={
    // ── DARK ──
    pink:{name:"Pink",emoji:"🌸",dark:true,primary:"#FF6B9D",primaryDim:"#FF6B9D22",primaryBorder:"rgba(255,107,157,0.3)",bg:"#0D0508",card:"#1A0A10",cardAlt:"#220D14",text:"#FFE8F0",textMuted:"#C4848A",header:"linear-gradient(135deg,#220D14,#0D0508)",chore:"rgba(255,107,157,0.08)",choreBorder:"rgba(255,107,157,0.15)",jar1:"#FF6B9D",jar2:"#FF94B8",jar3:"#FFB3C9"},
    purple:{name:"Purple",emoji:"💜",dark:true,primary:"#A855F7",primaryDim:"#A855F722",primaryBorder:"rgba(168,85,247,0.3)",bg:"#07040D",card:"#110A1A",cardAlt:"#180F22",text:"#EDE0FF",textMuted:"#9B7AB5",header:"linear-gradient(135deg,#180F22,#07040D)",chore:"rgba(168,85,247,0.08)",choreBorder:"rgba(168,85,247,0.15)",jar1:"#A855F7",jar2:"#C084FC",jar3:"#D8A4FF"},
    green:{name:"Green",emoji:"🌿",dark:true,primary:"#22C55E",primaryDim:"#22C55E22",primaryBorder:"rgba(34,197,94,0.3)",bg:"#030D06",card:"#081A0E",cardAlt:"#0D2214",text:"#DCFCE7",textMuted:"#6DAF7E",header:"linear-gradient(135deg,#0D2214,#030D06)",chore:"rgba(34,197,94,0.08)",choreBorder:"rgba(34,197,94,0.15)",jar1:"#22C55E",jar2:"#4ADE80",jar3:"#86EFAC"},
    blue:{name:"Blue",emoji:"🌊",dark:true,primary:"#38BDF8",primaryDim:"#38BDF822",primaryBorder:"rgba(56,189,248,0.3)",bg:"#030810",card:"#071018",cardAlt:"#0A1620",text:"#E0F4FF",textMuted:"#6B9EB5",header:"linear-gradient(135deg,#0A1620,#030810)",chore:"rgba(56,189,248,0.08)",choreBorder:"rgba(56,189,248,0.15)",jar1:"#38BDF8",jar2:"#7DD3FC",jar3:"#BAE6FD"},
    orange:{name:"Orange",emoji:"🔥",dark:true,primary:"#FB923C",primaryDim:"#FB923C22",primaryBorder:"rgba(251,146,60,0.3)",bg:"#0D0600",card:"#1A0E00",cardAlt:"#221400",text:"#FFF0E0",textMuted:"#C4956A",header:"linear-gradient(135deg,#221400,#0D0600)",chore:"rgba(251,146,60,0.08)",choreBorder:"rgba(251,146,60,0.15)",jar1:"#FB923C",jar2:"#FDBA74",jar3:"#FED7AA"},
    night:{name:"Night",emoji:"🌙",dark:true,primary:"#818CF8",primaryDim:"#818CF822",primaryBorder:"rgba(129,140,248,0.3)",bg:"#020204",card:"#0C0C14",cardAlt:"#12121C",text:"#E8E8FF",textMuted:"#7070A0",header:"linear-gradient(135deg,#12121C,#020204)",chore:"rgba(129,140,248,0.08)",choreBorder:"rgba(129,140,248,0.15)",jar1:"#818CF8",jar2:"#A5B4FC",jar3:"#C7D2FE"},
    // ── LIGHT ──
    sunshine:{name:"Sunshine",emoji:"☀️",dark:false,primary:"#D97706",primaryDim:"#D9770618",primaryBorder:"rgba(217,119,6,0.3)",bg:"#FFFBEB",card:"#FEF3C7",cardAlt:"#FDE68A55",text:"#78350F",textMuted:"#92400E",header:"linear-gradient(135deg,#FDE68A,#FEF3C7)",chore:"rgba(217,119,6,0.08)",choreBorder:"rgba(217,119,6,0.25)",jar1:"#F59E0B",jar2:"#FBBF24",jar3:"#FCD34D"},
    candy:{name:"Candy",emoji:"🍬",dark:false,primary:"#DB2777",primaryDim:"#DB277718",primaryBorder:"rgba(219,39,119,0.3)",bg:"#FFF0F6",card:"#FCE7F3",cardAlt:"#FBCFE855",text:"#831843",textMuted:"#9D174D",header:"linear-gradient(135deg,#FBCFE8,#FCE7F3)",chore:"rgba(219,39,119,0.08)",choreBorder:"rgba(219,39,119,0.25)",jar1:"#DB2777",jar2:"#EC4899",jar3:"#F472B6"},
    sky:{name:"Sky",emoji:"🌤️",dark:false,primary:"#0284C7",primaryDim:"#0284C718",primaryBorder:"rgba(2,132,199,0.3)",bg:"#F0F9FF",card:"#E0F2FE",cardAlt:"#BAE6FD55",text:"#0C4A6E",textMuted:"#075985",header:"linear-gradient(135deg,#BAE6FD,#E0F2FE)",chore:"rgba(2,132,199,0.08)",choreBorder:"rgba(2,132,199,0.25)",jar1:"#0284C7",jar2:"#0EA5E9",jar3:"#38BDF8"},
    meadow:{name:"Meadow",emoji:"🌼",dark:false,primary:"#15803D",primaryDim:"#15803D18",primaryBorder:"rgba(21,128,61,0.3)",bg:"#F0FDF4",card:"#DCFCE7",cardAlt:"#BBF7D055",text:"#14532D",textMuted:"#166534",header:"linear-gradient(135deg,#BBF7D0,#DCFCE7)",chore:"rgba(21,128,61,0.08)",choreBorder:"rgba(21,128,61,0.25)",jar1:"#15803D",jar2:"#16A34A",jar3:"#22C55E"},
    lavender:{name:"Lavender",emoji:"💐",dark:false,primary:"#7C3AED",primaryDim:"#7C3AED18",primaryBorder:"rgba(124,58,237,0.3)",bg:"#F5F3FF",card:"#EDE9FE",cardAlt:"#DDD6FE55",text:"#3B0764",textMuted:"#5B21B6",header:"linear-gradient(135deg,#DDD6FE,#EDE9FE)",chore:"rgba(124,58,237,0.08)",choreBorder:"rgba(124,58,237,0.25)",jar1:"#7C3AED",jar2:"#8B5CF6",jar3:"#A78BFA"},
    peach:{name:"Peach",emoji:"🍑",dark:false,primary:"#C2410C",primaryDim:"#C2410C18",primaryBorder:"rgba(194,65,12,0.3)",bg:"#FFF7ED",card:"#FFEDD5",cardAlt:"#FED7AA55",text:"#7C2D12",textMuted:"#9A3412",header:"linear-gradient(135deg,#FED7AA,#FFEDD5)",chore:"rgba(194,65,12,0.08)",choreBorder:"rgba(194,65,12,0.25)",jar1:"#C2410C",jar2:"#EA580C",jar3:"#F97316"},
  };

  const THEMES_KEYS=Object.keys(THEMES);

  const [activeTheme,setActiveTheme]=useState(()=>{
    try{
      // URL param takes priority (fresh share link), then localStorage, then kidData, then pink
      const urlTheme=params.get("t");
      if(urlTheme&&THEMES_KEYS.includes(urlTheme))return urlTheme;
      const stored=localStorage.getItem("flourish_kid_theme_"+code);
      if(stored&&THEMES_KEYS.includes(stored))return stored;
      if(kidData?.theme)return kidData.theme;
      return"pink";
    }catch{return"pink";}
  });
  const saveTheme=(t)=>{
    setActiveTheme(t);
    try{localStorage.setItem("flourish_kid_theme_"+code,t);}catch{}
  };
  const theme=THEMES[activeTheme]||THEMES.pink;
  const primary=theme.primary;

  const [kidAge,setKidAge]=useState(kidData?.age||"8-12");
  const [chores,setChores]=useState(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("flourish_kid_chores_"+code)||"null");
      if(saved)return saved;
      return kidData?.chores||[];
    }catch{return[];}
  });

  const jars=kidData?.jars||{spend:0,save:0,give:0};
  const goal=kidData?.goal||{name:"",amount:"",emoji:"🎯"};
  const streak=kidData?.streak||0;
  const goalAmt=parseFloat(goal.amount)||0;
  const goalPct=goalAmt>0?Math.min(100,Math.round(((jars.save||0)/goalAmt)*100)):0;
  const totalJars=(jars.spend||0)+(jars.save||0)+(jars.give||0);
  const earned=chores.filter(c=>c.done).reduce((a,c)=>a+(c.reward||0),0);
  const total=chores.reduce((a,c)=>a+(c.reward||0),0);
  const FREQ={daily:"Daily",few:"Few/week",weekly:"Weekly",monthly:"Monthly"};

  // ── Sounds ──────────────────────────────────────────────────────────────────
  const playSound=(type)=>{
    try{
      const ctx=new(window.AudioContext||window.webkitAudioContext)();
      if(type==="chore"){
        const freqs=[[523,0],[659,0.1],[784,0.2]];
        freqs.forEach(([freq,t])=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.connect(g);g.connect(ctx.destination);
          o.type="sine";o.frequency.value=freq;
          g.gain.setValueAtTime(0.22,ctx.currentTime+t);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.28);
          o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.3);
        });
      } else if(type==="complete"){
        [523,659,784,1047,1319].forEach((freq,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.connect(g);g.connect(ctx.destination);
          o.type="triangle";o.frequency.value=freq;
          g.gain.setValueAtTime(0.18,ctx.currentTime+i*0.09);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.09+0.55);
          o.start(ctx.currentTime+i*0.09);o.stop(ctx.currentTime+i*0.09+0.6);
        });
      } else if(type==="goal"){
        // Fanfare
        const notes=[523,659,784,659,1047];
        const times=[0,0.1,0.2,0.3,0.45];
        notes.forEach((freq,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.connect(g);g.connect(ctx.destination);
          o.type="square";o.frequency.value=freq;
          g.gain.setValueAtTime(0.15,ctx.currentTime+times[i]);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+times[i]+0.35);
          o.start(ctx.currentTime+times[i]);o.stop(ctx.currentTime+times[i]+0.4);
        });
      }
    }catch(e){}
  };

  const toggle=(id)=>{
    const updated=chores.map(c=>c.id===id?{...c,done:!c.done}:c);
    const wasUndone=chores.find(c=>c.id===id)?.done===false;
    setChores(updated);
    if(wasUndone){
      const allNowDone=updated.filter(c=>c.reward>0).every(c=>c.done);
      if(allNowDone) playSound("complete"); else playSound("chore");
    }
    try{localStorage.setItem("flourish_kid_chores_"+code,JSON.stringify(updated));}catch{}
  };

  const kidName=kidData?.name||"Your";
  const kidEmoji=kidData?.emoji||"🌱";

  const lessons={
    "4-7":[
      {emoji:"🪙",title:"Money is for trading",body:"When you want something at the store, you give money and get the thing. Money is like a trade ticket!",activity:"Play store at home. Use toy coins to 'buy' snacks from a parent.",key:"Money is how we trade for things we want."},
      {emoji:"🐷",title:"Saving means waiting",body:"If a toy costs $10 and you have $3, you need to save $7 more. Saving means keeping money safe until you have enough.",activity:"Put $1 in a piggy bank each day and count it every 3 days.",key:"Waiting for something makes it even better."},
    ],
    "8-12":[
      {emoji:"🏦",title:"What banks do",body:"A bank keeps your money safe and pays you a little extra called interest. Like a super-safe piggy bank that rewards you for saving.",key:"Banks keep money safe AND pay you to use them."},
      {emoji:"💳",title:"Credit cards are loans",body:"A credit card lets you buy now and pay later. But if you don't pay it all back quickly, they charge you extra. That's how people get into trouble.",key:"Pay your credit card in full every month."},
      {emoji:"📈",title:"Money can grow",body:"$100 at 7% interest becomes $386 in 20 years — without doing anything extra! This is compound interest — money making more money.",key:"Start saving young. Time is the secret ingredient."},
    ],
    "13+":[
      {emoji:"💰",title:"Budget like a boss",body:"50% needs, 30% wants, 20% savings. Without a budget, money just disappears. A budget is a plan for the life you actually want.",key:"A budget gives your money direction."},
      {emoji:"🚫",title:"Debt borrows from your future self",body:"When you go into debt, you're spending money you haven't earned yet — and paying extra for the privilege.",key:"Debt is expensive. Use it wisely or not at all."},
      {emoji:"📊",title:"Start investing at your first job",body:"$50/month at 7% starting at 16 = $245,000 at retirement. Starting at 30 = only $68,000. Starting early nearly triples your outcome.",key:"Invest with your very first paycheck."},
    ],
  };

  return(
    <div style={{minHeight:"100dvh",background:theme.bg,fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"0 0 80px",transition:"background .4s"}}>

      {/* Header */}
      <div style={{background:theme.header,padding:"28px 20px 16px",borderBottom:`1px solid ${theme.primaryBorder}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <div style={{width:48,height:48,borderRadius:14,background:theme.primaryDim,border:`1.5px solid ${theme.primaryBorder}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <FlourishMarkKids size={32}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:900,color:theme.text,lineHeight:1}}>{kidData?.name?`${kidName}'s Flourish`:"Flourish Kids"}</div>
            <div style={{color:theme.textMuted,fontSize:12,marginTop:2}}>Your money zone <span style={{color:primary}}>♥</span></div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:primary,fontWeight:900,fontSize:18,fontFamily:"'Playfair Display',serif"}}>${totalJars.toFixed(2)}</div>
            <div style={{color:theme.textMuted,fontSize:10}}>total saved</div>
          </div>
        </div>
        {streak>0&&(
          <div style={{background:"rgba(255,140,66,0.15)",border:"1px solid rgba(255,140,66,0.3)",borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:18}}>🔥</span>
            <span style={{color:"#FF8C42",fontWeight:700,fontSize:13}}>{streak} week streak! Keep it going!</span>
          </div>
        )}
        {/* Theme picker — visual swatch grid */}
        <div style={{marginTop:10}}>
          <span style={{color:theme.dark?"rgba(255,255,255,0.55)":"rgba(0,0,0,0.45)",fontSize:11,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",display:"block",marginBottom:8}}>🎨 Theme</span>
          <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
            {Object.entries(THEMES).map(([key,t])=>(
              <button key={key} onClick={()=>saveTheme(key)}
                style={{flexShrink:0,width:54,padding:"8px 4px 6px",borderRadius:14,background:t.card,border:`2px solid ${activeTheme===key?t.primary:"transparent"}`,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,boxShadow:activeTheme===key?`0 0 14px ${t.primary}77`:"0 2px 6px rgba(0,0,0,0.25)",transition:"all .2s",outline:"none"}}>
                <span style={{fontSize:18,lineHeight:1}}>{t.emoji}</span>
                <span style={{fontSize:9,fontWeight:700,color:t.text,fontFamily:"inherit",lineHeight:1,textAlign:"center",letterSpacing:0.2}}>{t.name}</span>
                <div style={{width:20,height:4,borderRadius:99,background:t.primary,marginTop:2}}/>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{padding:"16px 16px 0",display:"flex",flexDirection:"column",gap:14}}>

        {/* Goal */}
        <KidsGoal goal={goal} jars={jars} code={code} theme={theme} primary={primary} playSound={playSound}/>

        {/* Jar balances */}
        <div style={{background:theme.card,borderRadius:18,padding:"18px",border:`1px solid rgba(255,255,255,0.08)`}}>
          <div style={{color:primary,fontWeight:800,fontSize:14,marginBottom:12}}>🫙 My Jars</div>
          <div style={{display:"flex",gap:10}}>
            {(()=>{
            const split=kidData?.jarSplit||{spend:50,save:30,give:20};
            return [{key:"spend",name:"Spend",emoji:"🎮",color:theme.jar1,pct:split.spend+"%"},{key:"save",name:"Save",emoji:"🏦",color:theme.jar2,pct:split.save+"%"},{key:"give",name:"Give",emoji:"❤️",color:theme.jar3,pct:split.give+"%"}];
          })().map(j=>(
              <div key={j.key} style={{flex:1,background:j.color+"22",border:`1px solid ${j.color}44`,borderRadius:14,padding:"14px 8px",textAlign:"center"}}>
                <div style={{fontSize:24,marginBottom:4}}>{j.emoji}</div>
                <div style={{color:j.color,fontWeight:900,fontSize:17,fontFamily:"'Playfair Display',serif"}}>${(jars[j.key]||0).toFixed(2)}</div>
                <div style={{color:theme.text,fontWeight:700,fontSize:11,marginTop:2}}>{j.name}</div>
                <div style={{color:theme.textMuted,fontSize:9,marginTop:1}}>{j.pct}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chore Chart */}
        <div style={{background:theme.card,borderRadius:18,padding:"18px",border:`1px solid ${theme.primaryBorder}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:primary,fontWeight:800,fontSize:14}}>🏡 My Chores</div>
            {total>0&&<div style={{color:theme.jar2,fontWeight:800,fontSize:14}}>${earned.toFixed(2)} earned</div>}
          </div>
          {total>0&&(
            <div style={{height:8,background:"rgba(255,255,255,0.06)",borderRadius:4,overflow:"hidden",marginBottom:14}}>
              <div style={{height:"100%",width:`${total>0?(earned/total)*100:0}%`,background:`linear-gradient(90deg,${theme.jar1},${theme.jar2})`,borderRadius:4,transition:"width .4s"}}/>
            </div>
          )}
          {chores.length===0&&(
            <div style={{color:theme.textMuted,fontSize:13,textAlign:"center",padding:"12px 0"}}>No chores yet — ask a parent to add some!</div>
          )}
          {chores.map(ch=>(
            <div key={ch.id} onClick={()=>toggle(ch.id)} style={{display:"flex",gap:12,alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${theme.chore}`,cursor:"pointer"}}>
              <div style={{width:28,height:28,borderRadius:8,border:`2px solid ${ch.done?primary:"rgba(255,255,255,0.15)"}`,background:ch.done?primary:"none",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
                {ch.done&&<span style={{color:theme.bg,fontSize:14,fontWeight:900}}>✓</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{color:ch.done?theme.textMuted:theme.text,fontSize:14,fontWeight:600,textDecoration:ch.done?"line-through":"none"}}>{ch.task}</div>
                {ch.freq&&ch.freq!=="weekly"&&<div style={{color:theme.textMuted,fontSize:10}}>{FREQ[ch.freq]||ch.freq}</div>}
              </div>
              <span style={{color:theme.jar1,fontWeight:800,fontSize:13}}>+${(ch.reward||0).toFixed(2)}</span>
            </div>
          ))}
          {chores.some(c=>c.done)&&earned===total&&total>0&&(
            <div style={{marginTop:14,background:theme.primaryDim,borderRadius:12,padding:"14px",textAlign:"center",border:`1px solid ${theme.primaryBorder}`}}>
              <div style={{fontSize:28,marginBottom:4}}>🎉</div>
              <div style={{color:primary,fontWeight:800,fontSize:14}}>All done! Ask a parent for payday!</div>
            </div>
          )}
        </div>

        {/* Money Lessons */}
        <div style={{background:theme.card,borderRadius:18,padding:"18px",border:`1px solid ${theme.primaryBorder}`}}>
          <div style={{color:primary,fontWeight:800,fontSize:14,marginBottom:12}}>📚 Money Lessons</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {["4-7","8-12","13+"].map(age=>(
              <button key={age} onClick={()=>setKidAge(age)}
                style={{flex:1,background:kidAge===age?theme.primaryDim:theme.cardAlt,border:`1px solid ${kidAge===age?primary:theme.choreBorder}`,color:kidAge===age?primary:theme.textMuted,borderRadius:10,padding:"9px 0",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",transition:"all .2s"}}>
                {age==="4-7"?"🐣 4–7":age==="8-12"?"🌱 8–12":"🌳 13+"}
              </button>
            ))}
          </div>
          {(lessons[kidAge]||[]).map((l,i)=>(
            <div key={i} style={{background:theme.cardAlt,borderRadius:14,padding:"16px",marginBottom:10,border:`1px solid ${theme.choreBorder}`}}>
              <div style={{fontSize:26,marginBottom:8}}>{l.emoji}</div>
              <div style={{color:theme.text,fontWeight:800,fontSize:14,marginBottom:8}}>{l.title}</div>
              <div style={{color:theme.textMuted,fontSize:12,lineHeight:1.65,marginBottom:l.activity?10:0}}>{l.body}</div>
              {l.activity&&<div style={{background:theme.primaryDim,border:`1px solid ${theme.primaryBorder}`,borderRadius:10,padding:"8px 12px",marginBottom:8}}>
                <div style={{color:primary,fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Try this</div>
                <div style={{color:theme.text,fontSize:12}}>{l.activity}</div>
              </div>}
              <div style={{background:theme.primaryDim,border:`1px solid ${theme.primaryBorder}`,borderRadius:8,padding:"6px 10px",color:primary,fontSize:11,fontWeight:600}}>💡 {l.key}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [betaCode, setBetaCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [factorId, setFactorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showAuth, setShowAuth] = useState(false);

  const BETA_CODES = ["BETA100","FLOURISH2026","FOUNDER"];
  const BETA_CAP = 30;

  const handleSignup = async () => {
    setLoading(true); setError("");
    // Validate beta code
    if(!BETA_CODES.includes(betaCode.trim().toUpperCase())) {
      setError("Invalid beta code. Request one at hello@flourishmoney.app");
      setLoading(false); return;
    }
    // Check beta cap server-side
    try {
      const res = await fetch("/api/beta", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"check"})
      });
      const cap = await res.json();
      if(cap.allowed === false) {
        setError(`Beta is full (${BETA_CAP}/${BETA_CAP} testers). Join the waitlist at hello@flourishmoney.app`);
        setLoading(false); return;
      }
    } catch {
      // If check fails, allow signup so an error doesn't block testers
    }
    const { error } = await supabase.auth.signUp({
      email, password,
      options:{ data:{ beta:true, signed_up:new Date().toISOString() } }
    });
    if (error) {
      if(error.message?.toLowerCase().includes("user already registered")) {
        setError("This email is already registered. Try logging in instead.");
      } else {
        setError(error.message);
      }
      setLoading(false); return;
    }
    setSuccess("Check your email to confirm your account, then log in.");
    setMode("login"); setLoading(false);
  };

  const handleLogin = async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totpFactor = factors?.totp?.[0];
    if (!totpFactor) {
      const { data: enroll, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Flourish Money" });
      if (enrollErr) { setError(enrollErr.message); setLoading(false); return; }
      setQrUrl(enroll.totp.qr_code);
      setFactorId(enroll.id);
      setMode("mfa_setup");
    } else if (totpFactor.status === "verified") {
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
      setFactorId(totpFactor.id);
      setMode("mfa_verify");
    } else {
      onAuth(data.user);
    }
    setLoading(false);
  };

  const handleMFASetup = async () => {
    setLoading(true); setError("");
    const { data: challenge } = await supabase.auth.mfa.challenge({ factorId });
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: mfaCode });
    if (error) { setError("Invalid code — try again."); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    onAuth(user);
    setLoading(false);
  };

  const handleMFAVerify = async () => {
    setLoading(true); setError("");
    const { data: challenge } = await supabase.auth.mfa.challenge({ factorId });
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: mfaCode });
    if (error) { setError("Invalid code — try again."); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    onAuth(user);
    setLoading(false);
  };

  const inpStyle = {
    width: "100%", padding: "14px 16px", borderRadius: 14,
    background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)",
    color: "#EDE9E2", fontSize: 15, fontFamily: "'Plus Jakarta Sans',sans-serif",
    outline: "none", boxSizing: "border-box", marginBottom: 12
  };

  const btnStyle = (active) => ({
    width: "100%", padding: "15px", borderRadius: 14, border: "none",
    background: active ? "linear-gradient(135deg,#00D68F,#00B37A)" : "rgba(0,214,143,0.3)",
    color: "#021208", fontWeight: 800, fontSize: 15,
    fontFamily: "'Plus Jakarta Sans',sans-serif", cursor: active ? "pointer" : "not-allowed",
    boxShadow: active ? "0 4px 20px rgba(0,214,143,0.4)" : "none"
  });

  const goSignup = () => { setMode("signup"); setError(""); setSuccess(""); setShowAuth(true); };
  const goLogin  = () => { setMode("login");  setError(""); setSuccess(""); setShowAuth(true); };

  return (
    <div style={{ minHeight: "100dvh", background: "#050D09", fontFamily: "'Plus Jakarta Sans',sans-serif", overflowX: "hidden" }}>

      {!showAuth ? (

        /* ───────────────── LANDING PAGE ───────────────── */
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>

          {/* Nav */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", position: "sticky", top: 0, background: "rgba(5,13,9,0.92)", backdropFilter: "blur(12px)", zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FlourishMark size={32} />
              <span style={{ color: "#EDE9E2", fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>Flourish</span>
            </div>
            <button onClick={goLogin} style={{ background: "rgba(0,214,143,0.1)", border: "1px solid rgba(0,214,143,0.3)", color: "#00D68F", borderRadius: 99, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Log In
            </button>
          </div>

          {/* Hero */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "52px 28px 40px", textAlign: "center" }}>

            <div style={{ display: "inline-block", background: "rgba(0,214,143,0.1)", border: "1px solid rgba(0,214,143,0.25)", borderRadius: 99, padding: "6px 16px", fontSize: 12, fontWeight: 700, color: "#00D68F", letterSpacing: 0.5, marginBottom: 28 }}>
              🇨🇦🇺🇸 Built for Canada & the US
            </div>
            <div style={{ display: "inline-block", background: "rgba(240,196,66,0.1)", border: "1px solid rgba(240,196,66,0.25)", borderRadius: 99, padding: "6px 16px", fontSize: 12, fontWeight: 700, color: "#F0C442", letterSpacing: 0.5, marginBottom: 28, marginLeft: 8 }}>
              🔒 Beta — limited spots
            </div>

            <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(30px,9vw,52px)", fontWeight: 900, color: "#EDE9E2", lineHeight: 1.1, marginBottom: 18, letterSpacing: -0.5, maxWidth: 560 }}>
              Know before you spend.{" "}
              <span style={{ color: "#00D68F", fontStyle: "italic" }}>Finally.</span>
            </h1>

            <p style={{ color: "#6B7A6E", fontSize: 16, lineHeight: 1.75, maxWidth: 380, marginBottom: 40 }}>
              Finally know if you can afford it. One safe-to-spend number, calculated from your real accounts — updated every day.
            </p>

            {/* Hero product card */}
            <div style={{ width: "100%", maxWidth: 340, background: "#0D1F12", border: "1px solid rgba(0,214,143,0.2)", borderRadius: 24, padding: "28px 24px", marginBottom: 36, boxShadow: "0 0 80px rgba(0,214,143,0.07)" }}>
              <div style={{ color: "#6B7A6E", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>Safe to spend today</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 56, fontWeight: 900, color: "#00D68F", lineHeight: 1, marginBottom: 6 }}>$247</div>
              <div style={{ color: "rgba(237,233,226,0.35)", fontSize: 12, marginBottom: 24 }}>After bills · After buffer · From your real balance</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[["🏦  Chequing / Checking","$1,843.22"],["💳  Credit Card","−$612.00"],["📅  Upcoming bills","−$984.00"]].map(([label,amount]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 12, fontSize: 13 }}>
                    <span style={{ color: "#6B7A6E" }}>{label}</span>
                    <span style={{ color: "#EDE9E2", fontWeight: 600 }}>{amount}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Primary CTA */}
            <button onClick={goSignup} style={{ width: "100%", maxWidth: 340, padding: "17px", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#00D68F,#00B37A)", color: "#021208", fontWeight: 800, fontSize: 16, cursor: "pointer", marginBottom: 12, boxShadow: "0 8px 32px rgba(0,214,143,0.35)", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Know Before You Spend — Free
            </button>
            <div style={{ color: "#6B7A6E", fontSize: 12, marginBottom: 52 }}>No credit card · Connects RBC, TD, Chase, Wells Fargo + thousands more</div>

            {/* Trust row */}
            <div style={{ display: "flex", gap: 28, justifyContent: "center", flexWrap: "wrap", marginBottom: 64 }}>
              {[["🔒","Bank-level security"],["🌎","CA & US accounts"],["⚡","Live in 60 seconds"]].map(([icon,label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B7A6E", fontSize: 12, fontWeight: 600 }}>
                  <span>{icon}</span><span>{label}</span>
                </div>
              ))}
            </div>

            {/* Pain section */}
            <div style={{ width: "100%", maxWidth: 560, marginBottom: 64, textAlign: "left" }}>
              <div style={{ color: "#6B7A6E", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", textAlign: "center", marginBottom: 28 }}>Sound familiar?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "You close the banking app the second it opens because the number stresses you out.",
                  "You tap your card and genuinely don't know if it'll go through.",
                  "You have accounts at 3 different banks and no idea what the real total is.",
                  "You've tried budgeting apps before and quit within a week."
                ].map((text) => (
                  <div key={text} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 18px", background: "#0D1F12", borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color: "#00D68F", fontSize: 16, flexShrink: 0, marginTop: 1 }}>✓</span>
                    <span style={{ color: "#6B7A6E", fontSize: 14, lineHeight: 1.6 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div style={{ width: "100%", maxWidth: 560, marginBottom: 64 }}>
              <div style={{ color: "#6B7A6E", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", textAlign: "center", marginBottom: 28 }}>How it works</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  ["1","Connect your banks","Plaid securely links RBC, TD, Chase, Wells Fargo and thousands more. Your login is never stored — Plaid is used by millions of financial apps worldwide."],
                  ["2","See your real number","One safe-to-spend number calculated from your real balance, upcoming bills, and a protective buffer."],
                  ["3","Know before you tap","Check it every morning. Stop guessing. Stop dreading. Just know."]
                ].map(([num,title,body]) => (
                  <div key={num} style={{ display: "flex", gap: 16, padding: "18px", background: "#0D1F12", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 99, background: "rgba(0,214,143,0.15)", border: "1px solid rgba(0,214,143,0.3)", color: "#00D68F", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{num}</div>
                    <div>
                      <div style={{ color: "#EDE9E2", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
                      <div style={{ color: "#6B7A6E", fontSize: 13, lineHeight: 1.65 }}>{body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Features */}
            <div style={{ width: "100%", maxWidth: 560, marginBottom: 64 }}>
              <div style={{ color: "#6B7A6E", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", textAlign: "center", marginBottom: 28 }}>Everything in one place</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  [<DollarSign size={20} color="#00D68F" strokeWidth={1.8}/>, "Safe-to-spend number", "One clear daily number that accounts for bills and buffer."],
                  [<Sparkles size={20} color="#00D68F" strokeWidth={1.8}/>, "AI Financial Coach", "Ask anything. Get honest, personalised financial advice for Canada & the US."],
                  [<CreditCard size={20} color="#00D68F" strokeWidth={1.8}/>, "All your accounts", "RBC, TD, Chase, Wells Fargo, and thousands more — all in one dashboard."],
                  [<TrendingUp size={20} color="#00D68F" strokeWidth={1.8}/>, "Investment tracking", "Know exactly where you stand on RRSP, TFSA, 401k, and more."],
                  [<Calendar size={20} color="#00D68F" strokeWidth={1.8}/>, "Bill forecasting", "See what's coming before it hits. Never be surprised."],
                  [<Target size={20} color="#00D68F" strokeWidth={1.8}/>, "Goal tracking", "Set savings goals and watch them grow with 30-year projections."]
                ].map(([icon,title,body]) => (
                  <div key={title} style={{ padding: "16px", background: "#0D1F12", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ marginBottom: 10, display:"flex", alignItems:"center", justifyContent:"center", width:38, height:38, borderRadius:10, background:"rgba(0,214,143,0.1)", border:"1px solid rgba(0,214,143,0.2)" }}>{icon}</div>
                    <div style={{ color: "#EDE9E2", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{title}</div>
                    <div style={{ color: "#6B7A6E", fontSize: 11, lineHeight: 1.6 }}>{body}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing */}
            <div style={{ width: "100%", maxWidth: 400, marginBottom: 64 }}>
              <div style={{ color: "#6B7A6E", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", textAlign: "center", marginBottom: 28 }}>Simple pricing</div>
              <div style={{ background: "#0D1F12", border: "1px solid rgba(0,214,143,0.25)", borderRadius: 24, padding: "32px 28px", textAlign: "center" }}>
                <div style={{ color: "#6B7A6E", fontSize: 13, marginBottom: 8 }}>After free trial</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 48, fontWeight: 900, color: "#EDE9E2", lineHeight: 1, marginBottom: 4 }}>$14.99</div>
                <div style={{ color: "#6B7A6E", fontSize: 13, marginBottom: 28 }}>per month · Cancel anytime</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28, textAlign: "left" }}>
                  {["All accounts connected","Safe-to-spend number daily","AI Financial Coach","Investment & retirement tracking","Bill forecasting","Goal tracking with projections"].map(f => (
                    <div key={f} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ color: "#00D68F", fontSize: 14 }}>✓</span>
                      <span style={{ color: "#EDE9E2", fontSize: 13 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button onClick={goSignup} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#00D68F,#00B37A)", color: "#021208", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 8px 32px rgba(0,214,143,0.3)", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Start Free Trial
                </button>
                <div style={{ color: "#6B7A6E", fontSize: 11, marginTop: 12 }}>No credit card required</div>
              </div>
            </div>

            {/* Bottom CTA */}
            <div style={{ width: "100%", maxWidth: 400, textAlign: "center", marginBottom: 64 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 900, color: "#EDE9E2", lineHeight: 1.2, marginBottom: 16 }}>
                Stop guessing.<br />
                <span style={{ color: "#00D68F", fontStyle: "italic" }}>Start knowing.</span>
              </div>
              <button onClick={goSignup} style={{ width: "100%", padding: "17px", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#00D68F,#00B37A)", color: "#021208", fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: "0 8px 32px rgba(0,214,143,0.35)", fontFamily: "'Plus Jakarta Sans',sans-serif", marginBottom: 10 }}>
                Know Before You Spend — Free
              </button>
              <div style={{ color: "#6B7A6E", fontSize: 12 }}>No credit card · Takes 60 seconds</div>
            </div>

          </div>

          {/* Footer */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span style={{ color: "#6B7A6E", fontSize: 11 }}>© 2026 GrowSmart Inc. · Flourish Money</span>
            <div style={{ display: "flex", gap: 24 }}>
              {[["Privacy Policy","/privacy"],["Terms of Service","/terms"]].map(([label,href]) => (
                <a key={label} href={href} style={{ color: "#6B7A6E", fontSize: 11, textDecoration: "none" }}>{label}</a>
              ))}
            </div>
          </div>

        </div>

      ) : (

        /* ───────────────── AUTH FORM ───────────────── */
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 400, animation: "fadeUp .5s ease both" }}>

            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <button onClick={() => setShowAuth(false)}
                style={{ background: "none", border: "none", color: "#6B7A6E", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, margin: "0 auto 16px", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                ← Back
              </button>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><FlourishMark size={80} /></div>
              <div style={{ color: "#6B7A6E", fontSize: 13, marginTop: 4 }}>
                {mode === "signup" ? "Create your free account" : "Welcome back"}
              </div>
            </div>

            <div style={{ background: "#0D1F12", borderRadius: 24, padding: 28, border: "1px solid rgba(255,255,255,0.08)" }}>

              {mode === "mfa_setup" && (
                <div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 900, color: "#EDE9E2", marginBottom: 6 }}>Set up 2-factor auth</div>
                  <div style={{ color: "#6B7A6E", fontSize: 13, fontFamily: "'Plus Jakarta Sans',sans-serif", marginBottom: 20, lineHeight: 1.6 }}>Scan this QR code with Google Authenticator, then enter the 6-digit code.</div>
                  {qrUrl && <img src={qrUrl} alt="MFA QR" style={{ width: "100%", borderRadius: 12, marginBottom: 16, background: "#fff", padding: 8 }} />}
                  <input style={{ ...inpStyle, letterSpacing: 6, textAlign: "center", fontSize: 22 }} placeholder="000000" value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,""))} maxLength={6} />
                  {error && <div style={{ color: "#FF6B6B", fontSize: 12, marginBottom: 12 }}>{error}</div>}
                  <button style={btnStyle(!loading && mfaCode.length === 6)} onClick={handleMFASetup} disabled={loading || mfaCode.length !== 6}>{loading ? "Verifying..." : "Verify & Continue"}</button>
                </div>
              )}

              {mode === "mfa_verify" && (
                <div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 900, color: "#EDE9E2", marginBottom: 6 }}>Enter your code</div>
                  <div style={{ color: "#6B7A6E", fontSize: 13, fontFamily: "'Plus Jakarta Sans',sans-serif", marginBottom: 20 }}>Open Google Authenticator and enter the 6-digit code for Flourish Money.</div>
                  <input style={{ ...inpStyle, letterSpacing: 6, textAlign: "center", fontSize: 22 }} placeholder="000000" value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,""))} maxLength={6} />
                  {error && <div style={{ color: "#FF6B6B", fontSize: 12, marginBottom: 12 }}>{error}</div>}
                  <button style={btnStyle(!loading && mfaCode.length === 6)} onClick={handleMFAVerify} disabled={loading || mfaCode.length !== 6}>{loading ? "Verifying..." : "Log In"}</button>
                </div>
              )}

              {(mode === "login" || mode === "signup") && (
                <div>
                  <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 3, marginBottom: 24 }}>
                    {["login","signup"].map(m => (
                      <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                        style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 13, background: mode === m ? "#00D68F" : "transparent", color: mode === m ? "#021208" : "#6B7A6E" }}>
                        {m === "login" ? "Log In" : "Sign Up"}
                      </button>
                    ))}
                  </div>
                  {success && <div style={{ color: "#00D68F", fontSize: 13, marginBottom: 16, background: "rgba(0,214,143,0.1)", padding: "10px 14px", borderRadius: 10 }}>{success}</div>}
                  <input style={inpStyle} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" name="email" />
                  <input style={{ ...inpStyle, marginBottom: mode==="signup"?12:20 }} type="password" placeholder="Password (min 8 characters)" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" name="password" />
                  {mode==="signup"&&(
                    <input style={{ ...inpStyle, marginBottom: 20, textTransform:"uppercase", letterSpacing:2 }} type="text" placeholder="Beta access code" value={betaCode} onChange={e => setBetaCode(e.target.value)} autoComplete="off" name="betacode" maxLength={20}/>
                  )}
                  {error && <div style={{ color: "#FF6B6B", fontSize: 12, marginBottom: 12 }}>{error}</div>}
                  <button style={btnStyle(!loading && email && password.length >= 8 && (mode==="login"||betaCode.trim().length>0))} onClick={mode === "login" ? handleLogin : handleSignup} disabled={loading || !email || password.length < 8 || (mode==="signup"&&!betaCode.trim())}>
                    {loading ? "..." : mode === "login" ? "Log In" : "Create Account"}
                  </button>
                  {mode === "signup" && (
                    <div style={{ color: "#6B7A6E", fontSize: 11, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
                      By signing up you agree to our{" "}
                      <a href="/terms" style={{ color: "#00D68F", textDecoration: "none" }}>Terms of Service</a>
                      {" "}and{" "}
                      <a href="/privacy" style={{ color: "#00D68F", textDecoration: "none" }}>Privacy Policy</a>.
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

      )}
    </div>
  );
}


// ─── BUDGET SCREEN ─────────────────────────────────────────────────────────────
function BudgetScreen({data, setAppData, setScreen}) {
  const isDesktop = window.innerWidth >= 960;
  const [editMode, setEditMode] = useState(false);
  const [editVals, setEditVals] = useState({});
  const [customCat, setCustomCat] = useState("");
  const [showAddCat, setShowAddCat] = useState(false);
  const [saved, setSaved] = useState(false);

  const {
    suggestions, netMo, fixedMo, discret, savingsMo, savingsRate,
    grossMo, goalsMo, canAfford, shortfall, cutSuggestions,
    hSize, numKids, totalSugg
  } = generateBudgetSuggestions(data);
  const budgets = data.budgets || {};
  const hasBudgets = Object.keys(budgets).length > 0;
  const isCA = (data.profile?.country || "CA") === "CA";

  // Month label
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en", { month: "long", year: "numeric" });

  // discret already accounts for goals (from generateBudgetSuggestions)
  // Current month spending per category — excludes bill categories (tracked separately) and CC payments
  const catOverrides = (() => { try { return JSON.parse(localStorage.getItem("flourish_cat_overrides") || "{}"); } catch { return {}; } })();
  const monthTxns = (data.transactions || []).filter(t => {
    try { const d = new Date(t.date + "T12:00:00"); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && t.amount > 0; } catch { return false; }
  });
  const monthSpend = {};
  monthTxns.forEach(t => {
    const cat = catOverrides[t.id] || t.cat;
    // Only track discretionary categories — bills excluded to prevent double-counting
    if(!NON_SPEND_CATS.has(cat) && !CC_PAYMENT_KEYWORDS.some(kw=>(t.name||"").toLowerCase().includes(kw))) {
      monthSpend[cat] = (monthSpend[cat] || 0) + t.amount;
    }
  });

  const totalBudgeted = Object.values(budgets).reduce((s, v) => s + v, 0);
  const totalSpentBudgeted = Object.entries(budgets).reduce((s, [cat]) => s + (monthSpend[cat] || 0), 0);
  const overallPct = totalBudgeted > 0 ? Math.min(100, Math.round(totalSpentBudgeted / totalBudgeted * 100)) : 0;
  const overBudgetCats = Object.entries(budgets).filter(([cat, limit]) => (monthSpend[cat] || 0) > limit);
  const totalOver = overBudgetCats.reduce((s, [cat, limit]) => s + ((monthSpend[cat] || 0) - limit), 0);

  // Where to save suggestions
  // Where to save — categories over budget this month
  const saveSuggestions = Object.entries(budgets).map(([cat, limit]) => {
    const spent = monthSpend[cat] || 0;
    const over = Math.round(spent - limit);
    if (limit > 0 && over >= 5) return { cat, spent, limit, over };
    return null;
  }).filter(Boolean).sort((a, b) => b.over - a.over).slice(0, 3);

  const catEmoji = { "Groceries": "🛒", "Coffee & Dining": "☕", "Gas & Transport": "🚗", "Shopping": "🛍️", "Clothing": "👗", "Subscriptions": "📱", "Health": "💊", "Personal Care": "🧴", "Entertainment": "🎬", "Hobbies & Sports": "🎯", "Kids & Extracurricular": "🧒", "Travel": "✈️", "Home": "🏠", "Education": "📚", "Fees": "🏦", "Services": "🔧", "Other": "📌" };
  const catColor = { "Groceries": C.green, "Coffee & Dining": C.orange, "Gas & Transport": C.blue, "Shopping": C.pink, "Clothing": C.purple, "Subscriptions": C.teal, "Health": C.teal, "Personal Care": C.gold, "Entertainment": C.pink, "Hobbies & Sports": C.blue, "Kids & Extracurricular": C.green, "Travel": C.purple, "Home": C.orange, "Education": C.blue, "Fees": C.gold, "Services": C.blue, "Other": C.muted };

  // Edit mode helpers
  const openEdit = () => {
    const seed = {};
    // 1. Existing saved budgets — always preserved
    Object.entries(budgets).forEach(([k, v]) => { seed[k] = String(v); });
    // 2. Situation-based suggestions for categories not yet budgeted
    Object.entries(suggestions).forEach(([k, v]) => { if (!seed[k]) seed[k] = String(v); });
    // 3. Any custom categories that have actual spending this month — auto-appear in budget
    const catOv = (()=>{ try{return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}");} catch{return{};} })();
    const customCats = JSON.parse(localStorage.getItem("flourish_custom_cats")||"[]");
    const now2 = new Date();
    (data.transactions||[]).filter(t => {
      if(t.amount <= 0 || !t.date) return false;
      const d = new Date(t.date + "T12:00:00");
      return d.getFullYear() === now2.getFullYear() && d.getMonth() === now2.getMonth();
    }).forEach(t => {
      const cat = catOv[t.id] || t.cat;
      // Include if: it's a custom category OR it's any spend category not already seeded
      if(!seed[cat] && !NON_SPEND_CATS.has(cat) && !BILL_CATS.has(cat)) {
        seed[cat] = "50"; // default starting budget for new categories
      }
    });
    // 4. Any custom categories ever created — even if no spend yet this month
    customCats.forEach(cat => {
      if(!seed[cat] && !NON_SPEND_CATS.has(cat) && !BILL_CATS.has(cat)) {
        seed[cat] = "50";
      }
    });
    setEditVals(seed);
    setEditMode(true);
    setSaved(false);
    setShowAddCat(false);
  };
  const saveEdit = () => {
    const nb = {};
    Object.entries(editVals).forEach(([cat, v]) => {
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) nb[cat] = n;
    });
    if (setAppData) setAppData(prev => ({ ...prev, budgets: nb }));
    setSaved(true);
    setTimeout(() => { setEditMode(false); setSaved(false); }, 1000);
  };
  const deleteCat = cat => setEditVals(prev => { const n = { ...prev }; delete n[cat]; return n; });
  const addCustom = () => {
    const cat = customCat.trim();
    if (!cat) return;
    setEditVals(prev => ({ ...prev, [cat]: "50" }));
    setCustomCat(""); setShowAddCat(false);
  };

  const totalEdited = Object.values(editVals).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const overDiscret = totalEdited > discret;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ScreenHeader
        title="Budget"
        subtitle={monthLabel}
        onBack={setScreen ? () => setScreen("home") : null}
        cta={editMode ? (saved ? "✓ Saved!" : "Save Plan") : (hasBudgets ? "Edit Plan" : "Build Plan")}
        onCta={editMode ? saveEdit : openEdit}
        ctaColor={editMode ? C.green : C.purple}
      />

      {/* Money math strip */}
      <div style={{ background: C.card, borderRadius: 18, padding: "14px 16px", border: `1px solid ${C.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["Take-home", `$${Math.round(netMo).toLocaleString()}/mo`, C.green, "💵"],
            ["Fixed bills & debt", `−$${Math.round(fixedMo).toLocaleString()}/mo`, C.red, "🏠"],
            ["Savings target", `−$${Math.round(savingsMo).toLocaleString()}/mo`, C.teal, "💰"],
            ...(goalsMo > 0 ? [["Goal savings", `−$${Math.round(goalsMo).toLocaleString()}/mo`, C.purple, "🎯"]] : []),
            ["Available to spend", `$${Math.round(discret).toLocaleString()}/mo`, C.greenBright, "✅"],
          ].map(([label, val, color, emoji]) => (
            <div key={label} style={{ background: C.cardAlt, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <span style={{ fontSize: 12 }}>{emoji}</span>
                <span style={{ color: C.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{label}</span>
              </div>
              <div style={{ color, fontWeight: 800, fontSize: 14, fontFamily: "'Playfair Display',serif" }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── EDIT MODE ───────────────────────────────────────────────── */}
      {/* ── SETUP MODE — 3-step plan builder ─────────────────── */}
      {editMode && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Step 1 — Fixed commitments (read-only, auto-filled) */}
          <div style={{background:C.card,borderRadius:18,padding:"16px",border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:C.green,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:"#041810",flexShrink:0}}>1</div>
              <div>
                <div style={{color:C.cream,fontWeight:800,fontSize:14}}>Your fixed commitments</div>
                <div style={{color:C.muted,fontSize:11,marginTop:1}}>These come out first — before anything else is planned</div>
              </div>
            </div>
            {(data.bills||[]).length===0&&(data.debts||[]).length===0?(
              <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"10px 0"}}>
                No bills or debts added yet. Add them in <strong style={{color:C.green}}>Settings → Bills</strong> to auto-fill this section.
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(data.bills||[]).map((b,idx)=>(
                <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:C.cardAlt,borderRadius:10,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,flex:1,minWidth:0}}>
                    <span style={{fontSize:14}}>{b.type==="variable"?"🔄":"📌"}</span>
                    <div style={{minWidth:0}}>
                      <div style={{color:C.cream,fontSize:12,fontWeight:600}}>{b.name}</div>
                      {b.category&&<div style={{color:C.muted,fontSize:9}}>{b.category}</div>}
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.teal}44`,borderRadius:8,overflow:"hidden",flexShrink:0}}>
                    <span style={{color:C.muted,padding:"0 4px 0 8px",fontSize:11}}>$</span>
                    <input type="number" defaultValue={parseFloat(b.amount||0).toFixed(0)}
                      onBlur={e=>{
                        const val=parseFloat(e.target.value);
                        if(!isNaN(val)&&val>=0&&setAppData){
                          setAppData(prev=>({...prev,bills:(prev.bills||[]).map((bill,bi)=>bi===idx?{...bill,amount:String(val)}:bill)}));
                        }
                      }}
                      style={{width:56,background:"none",border:"none",padding:"6px 2px",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none",fontWeight:700}}/>
                    <span style={{color:C.muted,padding:"0 6px",fontSize:9}}>/mo</span>
                  </div>
                </div>
              ))}
                {(data.debts||[]).map((d,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:C.cardAlt,borderRadius:10,border:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontSize:14}}>💳</span>
                      <div>
                        <div style={{color:C.cream,fontSize:12,fontWeight:600}}>{d.name||"Debt"}</div>
                        <div style={{color:C.muted,fontSize:9}}>minimum payment</div>
                      </div>
                    </div>
                    <span style={{color:C.muted,fontWeight:700,fontSize:12}}>${parseFloat(d.min||0).toFixed(0)}/mo</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",borderTop:`1px solid ${C.border}`,marginTop:2}}>
                  <span style={{color:C.muted,fontSize:11}}>Total fixed</span>
                  <span style={{color:C.cream,fontWeight:800,fontSize:13}}>${Math.round(fixedMo).toLocaleString()}/mo</span>
                </div>
              </div>
            )}
          </div>

          {/* Step 2 — Your spending plan (situation-based, all adjustable) */}
          <div style={{background:C.card,borderRadius:18,padding:"16px",border:`1px solid ${C.green}33`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:C.green,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:"#041810",flexShrink:0}}>2</div>
              <div>
                <div style={{color:C.cream,fontWeight:800,fontSize:14}}>Your spending plan</div>
                <div style={{color:C.muted,fontSize:11,marginTop:1}}>Based on your household — adjust any amount</div>
              </div>
            </div>
            <div style={{background:C.green+"10",borderRadius:10,padding:"8px 12px",marginBottom:12,border:`1px solid ${C.green}22`}}>
              <div style={{color:C.greenBright,fontSize:11,fontWeight:700}}>
                ${Math.round(discret).toLocaleString()}/mo available after bills + savings{goalsMo>0?` + goal savings`:""} 
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
              {Object.entries(editVals).map(([cat,val])=>{
                const color = catColor[cat]||C.muted;
                const emoji = catEmoji[cat]||"📌";
                const isSugg = !!suggestions[cat];
                return (
                  <div key={cat} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",background:C.cardAlt,borderRadius:10,border:`1px solid ${C.border}`}}>
                    <span style={{fontSize:15,flexShrink:0}}>{emoji}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:C.cream,fontSize:12,fontWeight:600}}>{cat}</div>
                      {isSugg&&<div style={{color:C.muted,fontSize:9,marginTop:1}}>Suggested for your household</div>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${color}55`,borderRadius:8,overflow:"hidden",flexShrink:0}}>
                      <span style={{color:C.muted,padding:"0 4px 0 8px",fontSize:11}}>$</span>
                      <input type="number" value={val}
                        onChange={e=>setEditVals(prev=>({...prev,[cat]:e.target.value}))}
                        style={{width:54,background:"none",border:"none",padding:"7px 2px",color:C.cream,fontSize:13,fontFamily:"inherit",outline:"none",fontWeight:700}}/>
                      <span style={{color:C.muted,padding:"0 4px",fontSize:9}}>/mo</span>
                    </div>
                    <button onClick={()=>deleteCat(cat)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:2,flexShrink:0,opacity:0.6,lineHeight:1}}>×</button>
                  </div>
                );
              })}

              {showAddCat?(
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:C.cardAlt,borderRadius:10,border:`1px dashed ${C.green}55`}}>
                  <input value={customCat} onChange={e=>setCustomCat(e.target.value)}
                    placeholder="Category (e.g. Gym, Art Classes)"
                    onKeyDown={e=>e.key==="Enter"&&addCustom()}
                    style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",color:C.cream,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
                  <button onClick={addCustom} style={{background:C.green,border:"none",borderRadius:8,padding:"7px 12px",color:"#041810",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Add</button>
                  <button onClick={()=>{setShowAddCat(false);setCustomCat("");}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:0}}>✕</button>
                </div>
              ):(
                <button onClick={()=>setShowAddCat(true)} style={{background:"none",border:`1px dashed ${C.green}44`,borderRadius:10,padding:"9px 12px",color:C.green,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                  ＋ Add a category
                </button>
              )}
            </div>

            {/* Running total */}
            <div style={{padding:"10px 12px",background:totalEdited>discret?C.red+"18":C.green+"10",borderRadius:10,border:`1px solid ${totalEdited>discret?C.red:C.green}33`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:C.muted,fontSize:11}}>Total budgeted</span>
                <span style={{color:totalEdited>discret?C.redBright:C.greenBright,fontWeight:800,fontSize:14}}>${Math.round(totalEdited).toLocaleString()}/mo</span>
              </div>
              {totalEdited>discret&&<div style={{color:C.muted,fontSize:10,marginTop:3}}>
                ${Math.round(totalEdited-discret).toLocaleString()} over — see suggested cuts below
              </div>}
              {totalEdited<=discret&&totalEdited>0&&<div style={{color:C.muted,fontSize:10,marginTop:3}}>
                ${Math.round(discret-totalEdited).toLocaleString()} unallocated — consider adding to savings
              </div>}
            </div>
          </div>

          {/* Step 3 — Affordability check */}
          {totalEdited>discret&&(()=>{
            // Generate live cut suggestions based on current editVals
            const CUT_PRIORITY=["Subscriptions","Entertainment","Coffee & Dining","Shopping","Personal Care","Groceries","Clothing"];
            const liveCuts=[];
            let remaining=Math.round(totalEdited-discret);
            for(const cat of CUT_PRIORITY){
              if(remaining<=0) break;
              const current=parseFloat(editVals[cat]||0);
              if(!current) continue;
              const maxCut=cat==="Groceries"?Math.floor(current*0.15):cat==="Personal Care"?Math.floor(current*0.3):Math.floor(current*0.5);
              const cut=Math.min(remaining,maxCut);
              if(cut>=5){liveCuts.push({cat,current,suggested:Math.max(10,Math.round((current-cut)/5)*5),saving:cut});remaining-=cut;}
            }
            return(
              <div style={{background:C.red+"10",border:`1px solid ${C.red}33`,borderRadius:18,padding:"16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <div style={{width:24,height:24,borderRadius:"50%",background:C.red,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:"#fff",flexShrink:0}}>3</div>
                  <div>
                    <div style={{color:C.redBright,fontWeight:800,fontSize:14}}>This doesn't quite fit</div>
                    <div style={{color:C.muted,fontSize:11,marginTop:1}}>You're ${Math.round(totalEdited-discret).toLocaleString()} over — here's what to trim</div>
                  </div>
                </div>
                {liveCuts.length>0?(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {liveCuts.map(({cat,current,suggested,saving})=>(
                      <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
                        <div>
                          <div style={{color:C.cream,fontSize:12,fontWeight:600}}>{catEmoji[cat]||"📌"} {cat}</div>
                          <div style={{color:C.muted,fontSize:10,marginTop:1}}>${current} → ${suggested}/mo</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{color:C.green,fontWeight:700,fontSize:13}}>−${saving}/mo</div>
                          <button onClick={()=>setEditVals(prev=>({...prev,[cat]:String(suggested)}))}
                            style={{background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:6,padding:"3px 8px",color:C.greenBright,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:3}}>
                            Apply
                          </button>
                        </div>
                      </div>
                    ))}
                    {remaining>0&&<div style={{color:C.muted,fontSize:10,textAlign:"center",padding:"4px"}}>
                      ${remaining} still to cut — consider reducing more categories or removing one
                    </div>}
                  </div>
                ):(
                  <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"8px 0"}}>
                    Consider removing a category or reducing your savings rate temporarily.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Save button */}
          <button onClick={saveEdit} disabled={totalEdited>discret}
            style={{width:"100%",background:totalEdited<=discret?`linear-gradient(135deg,${C.green},${C.greenBright})`:"rgba(255,255,255,0.06)",
              border:"none",borderRadius:12,padding:"14px",color:totalEdited<=discret?"#041810":C.muted,
              fontWeight:800,fontSize:14,cursor:totalEdited<=discret?"pointer":"not-allowed",fontFamily:"inherit",transition:"all .2s"}}>
            {saved?"✅ Budget Plan Saved!":"✓ Save My Budget Plan"}
          </button>
          {totalEdited>discret&&<div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:-8}}>Apply the suggested cuts above to unlock saving</div>}

        </div>
      )}

      {/* ── TRACK MODE ──────────────────────────────────────────────── */}

      {/* ── TRACK MODE ──────────────────────────────────────────────── */}
      {!editMode && (
        <>
          {/* No budgets set — inline build prompt */}
          {!hasBudgets && (
            <div style={{ background: `linear-gradient(135deg,${C.green}14 0%,${C.teal}0A 100%)`, border: `1px solid ${C.green}44`, borderRadius: 18, padding: "20px" }}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
                <div style={{ fontFamily: "'Playfair Display',serif", color: C.cream, fontWeight: 900, fontSize: 20, marginBottom: 6 }}>Build Your Budget Plan</div>
                <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>
                  We analyze your income, bills, and spending to suggest how much to allocate to groceries, dining, clothing, and more — then track it in real time.
                </div>
              </div>
              <div style={{ background: C.cardAlt, borderRadius: 12, padding: "12px 14px", marginBottom: 14, border: `1px solid ${C.border}` }}>
                <div style={{ color: C.cream, fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Based on your situation:</div>
                {[
                  [`💵 $${Math.round(netMo).toLocaleString()}/mo take-home`, C.green],
                  [`🏠 $${Math.round(fixedMo).toLocaleString()}/mo in fixed bills`, C.muted],
                  [`✅ $${Math.round(discret).toLocaleString()}/mo available for variable spending`, C.greenBright],
                ].map(([txt, color]) => (
                  <div key={txt} style={{ color, fontSize: 12, marginBottom: 4 }}>• {txt}</div>
                ))}
              </div>
              <button onClick={openEdit} style={{ width: "100%", background: `linear-gradient(135deg,${C.green},${C.greenBright})`, border: "none", borderRadius: 12, padding: "14px", color: "#041810", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                ✨ Build My Budget Plan
              </button>
            </div>
          )}

          {/* Budget exists — tracking view */}
          {hasBudgets && (
            <>
              {/* ── BILLS SECTION ─────────────────────────────── */}
              {(()=>{
                const allBills = data.bills||[];
                if(allBills.length === 0) return null;

                // Match transactions to bills via vendorBillMap
                const vendorBillMap = data.vendorBillMap||{};
                const catOverridesLocal = (()=>{try{return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}");}catch{return {};}})();
                const billsWithStatus = allBills.map(bill => {
                  // Find a transaction this month that pays this bill
                  const linkedTxn = monthTxns.find(t => {
                    const vendor = (t.name||"").toLowerCase().trim();
                    const billVendor = (bill.vendorPattern||bill.name||"").toLowerCase().trim();
                    return vendorBillMap[vendor]?.toLowerCase() === bill.name.toLowerCase() ||
                           (billVendor.length >= 4 && (vendor.includes(billVendor.substring(0,6)) || billVendor.includes(vendor.substring(0,6))));
                  });
                  const isVariable = bill.type === "variable";
                  const expectedAmt = parseFloat(bill.amount||0);
                  const actualAmt = linkedTxn ? Math.abs(parseFloat(linkedTxn.amount||0)) : null;
                  return { ...bill, linkedTxn, isVariable, expectedAmt, actualAmt, paid: !!linkedTxn };
                });

                const paidCount = billsWithStatus.filter(b=>b.paid).length;
                const totalBillsAmt = billsWithStatus.reduce((s,b)=>s+b.expectedAmt,0);
                const variableBills = billsWithStatus.filter(b=>b.isVariable);

                return (
                  <div style={{background:C.card,borderRadius:18,padding:"16px 18px",border:`1px solid ${C.border}`,marginBottom:4}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <div>
                        <div style={{color:C.cream,fontWeight:800,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Monthly Bills</div>
                        <div style={{color:C.muted,fontSize:11,marginTop:2}}>{paidCount}/{billsWithStatus.length} paid · ${Math.round(totalBillsAmt).toLocaleString()}/mo</div>
                      </div>
                      {variableBills.length>0&&(
                        <div style={{background:C.gold+"18",border:`1px solid ${C.gold}33`,borderRadius:8,padding:"4px 8px"}}>
                          <span style={{color:C.goldBright,fontSize:10,fontWeight:700}}>🔄 {variableBills.length} variable</span>
                        </div>
                      )}
                    </div>
                    {billsWithStatus.map((bill,i)=>{
                      const color = bill.paid ? C.green : C.muted;
                      const amtDiff = bill.actualAmt !== null ? bill.actualAmt - bill.expectedAmt : null;
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<billsWithStatus.length-1?`1px solid ${C.border}`:"none"}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:bill.paid?C.green:C.muted,flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{color:C.cream,fontSize:13,fontWeight:600}}>{bill.name}</span>
                              {bill.isVariable&&<span style={{background:C.teal+"18",color:C.tealBright,fontSize:9,padding:"2px 5px",borderRadius:99,border:`1px solid ${C.teal}33`}}>variable</span>}
                              {bill.category&&<span style={{color:C.muted,fontSize:10}}>{bill.category}</span>}
                            </div>
                            {bill.paid&&bill.linkedTxn&&(
                              <div style={{color:C.muted,fontSize:10,marginTop:1}}>
                                Paid {new Date(bill.linkedTxn.date+"T12:00:00").toLocaleDateString("en",{month:"short",day:"numeric"})}
                                {amtDiff!==null&&Math.abs(amtDiff)>2&&(
                                  <span style={{color:amtDiff>0?C.redBright:C.greenBright,marginLeft:6}}>
                                    {amtDiff>0?`+$${Math.round(amtDiff)} more than usual`:`$${Math.round(Math.abs(amtDiff))} less than usual`}
                                  </span>
                                )}
                              </div>
                            )}
                            {!bill.paid&&(
                              <div style={{color:C.muted,fontSize:10,marginTop:1}}>No payment found this month</div>
                            )}
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div style={{color:bill.paid?C.green:C.cream,fontWeight:700,fontSize:13}}>
                              {bill.actualAmt!==null?`$${Math.round(bill.actualAmt)}`:`$${Math.round(bill.expectedAmt)}`}
                            </div>
                            {bill.paid&&<div style={{color:C.greenBright,fontSize:9}}>✓ paid</div>}
                          </div>
                        </div>
                      );
                    })}
                    {/* Variable bill update prompt */}
                    {variableBills.length>0&&(
                      <div style={{marginTop:10,background:C.teal+"10",border:`1px solid ${C.teal}28`,borderRadius:10,padding:"10px 12px"}}>
                        <div style={{color:C.tealBright,fontWeight:700,fontSize:11,marginBottom:6}}>🔄 Update variable bills</div>
                        {variableBills.map((bill,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:i<variableBills.length-1?6:0}}>
                            <span style={{color:C.muted,fontSize:12,flex:1}}>{bill.name}</span>
                            <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${C.teal}44`,borderRadius:8,overflow:"hidden"}}>
                              <span style={{color:C.muted,padding:"0 6px",fontSize:11}}>$</span>
                              <input type="number" defaultValue={bill.actualAmt||bill.expectedAmt||""}
                                placeholder={String(bill.expectedAmt||"")}
                                onBlur={e=>{
                                  const val = parseFloat(e.target.value);
                                  if(!isNaN(val)&&val>0&&setAppData) {
                                    setAppData(prev=>({...prev,bills:(prev.bills||[]).map((b,idx)=>
                                      idx===i+allBills.indexOf(allBills.find(bb=>bb.name===bill.name))?{...b,amount:String(val)}:b
                                    )}));
                                  }
                                }}
                                style={{width:60,background:"none",border:"none",padding:"6px 4px",color:C.tealBright,fontSize:13,fontFamily:"inherit",outline:"none",fontWeight:700}}/>
                              <span style={{color:C.muted,padding:"0 4px",fontSize:9}}>/mo</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:4,paddingLeft:2}}>Discretionary Spending</div>
              {/* Overall month progress */}
              <div style={{ background: C.card, borderRadius: 18, padding: "16px 18px", border: `1px solid ${overBudgetCats.length > 0 ? C.red + "44" : C.green + "33"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ color: overBudgetCats.length > 0 ? C.redBright : C.greenBright, fontWeight: 800, fontSize: 15, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                      {overBudgetCats.length > 0 ? `⚠️ Over budget in ${overBudgetCats.length} categor${overBudgetCats.length === 1 ? "y" : "ies"}` : "📊 On track this month"}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{monthLabel}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20, color: overBudgetCats.length > 0 ? C.redBright : C.cream }}>
                      ${Math.round(totalSpentBudgeted).toLocaleString()}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11 }}>of ${Math.round(totalBudgeted).toLocaleString()} budgeted</div>
                  </div>
                </div>
                {/* Overall progress bar */}
                <div style={{ height: 8, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", width: `${overallPct}%`, borderRadius: 99, transition: "width .5s ease", background: overBudgetCats.length > 0 ? C.red : overallPct > 80 ? C.orange : `linear-gradient(to right,${C.green},${C.greenBright})` }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.muted, fontSize: 10 }}>{overallPct}% used</span>
                  <span style={{ color: overBudgetCats.length > 0 ? C.redBright : C.muted, fontSize: 10 }}>
                    {overBudgetCats.length > 0 ? `$${Math.round(totalOver)} over total` : `$${Math.round(totalBudgeted - totalSpentBudgeted)} remaining`}
                  </span>
                </div>
              </div>

              {/* Where to save — only when over budget */}
              {saveSuggestions.length > 0 && (
                <div style={{ background: C.orange + "12", border: `1px solid ${C.orange}33`, borderRadius: 16, padding: "14px 16px" }}>
                  <div style={{ color: C.orange, fontWeight: 800, fontSize: 13, marginBottom: 10 }}>💡 Where you could cut back</div>
                  {saveSuggestions.map(({ cat, over, potential }) => (
                    <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <div style={{ color: C.cream, fontSize: 12, fontWeight: 600 }}>{catEmoji[cat] || "📌"} {cat}</div>
                        <div style={{ color: C.redBright, fontSize: 10, marginTop: 2 }}>${Math.round(over)} over budget this month</div>
                      </div>
                      {potential > 0 && <div style={{ textAlign: "right" }}>
                        <div style={{ color: C.green, fontSize: 12, fontWeight: 700 }}>Save ~${potential}</div>
                        <div style={{ color: C.muted, fontSize: 9 }}>per month</div>
                      </div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Goal savings reminder */}
              {goalsMo > 0 && (
                <div style={{ background: C.purple + "14", border: `1px solid ${C.purple}33`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ color: C.purpleBright, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>🎯 Saving toward {activeGoals.length} goal{activeGoals.length > 1 ? "s" : ""}</div>
                  {activeGoals.map((g, i) => {
                    const target = parseFloat(g.target || 0);
                    const current = parseFloat(g.saved || 0);
                    const mo = parseFloat(g.monthly || 0) || Math.ceil((target - current) / 24);
                    const pct = target > 0 ? Math.min(100, Math.round(current / target * 100)) : 0;
                    return (
                      <div key={i} style={{ marginBottom: i < activeGoals.length - 1 ? 8 : 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ color: C.cream, fontSize: 12, fontWeight: 600 }}>{g.name || "Goal"}</span>
                          <span style={{ color: C.purpleBright, fontSize: 11, fontWeight: 700 }}>${Math.round(mo)}/mo · {pct}% saved</span>
                        </div>
                        <div style={{ height: 4, background: C.border, borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: C.purple, borderRadius: 99, transition: "width .4s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Per-category progress bars */}
              <div style={{ background: C.card, borderRadius: 18, padding: "16px 18px", border: `1px solid ${C.border}` }}>
                <div style={{ color: C.cream, fontWeight: 700, fontSize: 13, marginBottom: 14, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Category Breakdown</div>
                {Object.entries(budgets).sort(([, a], [, b]) => {
                  // Sort: over budget first, then by % used descending
                  const aSpent = monthSpend[Object.keys(budgets).find(k => budgets[k] === a) || ""] || 0;
                  const bSpent = monthSpend[Object.keys(budgets).find(k => budgets[k] === b) || ""] || 0;
                  return (bSpent / b) - (aSpent / a);
                }).map(([cat, limit]) => {
                  const spent = monthSpend[cat] || 0;
                  const pct = limit > 0 ? Math.min(100, Math.round(spent / limit * 100)) : 0;
                  const over = spent > limit;
                  const color = catColor[cat] || C.muted;
                  const barColor = over ? C.red : pct > 80 ? C.orange : color;
                  return (
                    <div key={cat} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 15 }}>{catEmoji[cat] || "📌"}</span>
                          <span style={{ color: C.cream, fontSize: 13, fontWeight: 600 }}>{cat}</span>
                          {over && <span style={{ background: C.red + "22", color: C.redBright, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 99, border: `1px solid ${C.red}44` }}>OVER</span>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: over ? C.redBright : C.cream, fontWeight: 700, fontSize: 13 }}>${Math.round(spent).toLocaleString()}</span>
                          <span style={{ color: C.muted, fontSize: 11 }}> / ${Math.round(limit).toLocaleString()}</span>
                        </div>
                      </div>
                      <div style={{ height: 7, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 3 }}>
                        <div style={{ height: "100%", width: `${over ? 100 : pct}%`, borderRadius: 99, transition: "width .4s ease", background: over ? `linear-gradient(to right,${C.orange},${C.red})` : pct > 80 ? C.orange : `linear-gradient(to right,${color}88,${color})` }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.muted, fontSize: 9 }}>{pct}% used</span>
                        <span style={{ color: over ? C.redBright : C.muted, fontSize: 9 }}>
                          {over ? `$${Math.round(spent - limit)} over` : `$${Math.round(limit - spent)} left`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Categories spending but not budgeted */}
              {(() => {
                const unbudgeted = Object.entries(monthSpend).filter(([cat, amt]) => !budgets[cat] && amt > 20 && cat !== "Transfer" && cat !== "Income");
                if (unbudgeted.length === 0) return null;
                return (
                  <div style={{ background: C.cardAlt, borderRadius: 14, padding: "12px 14px", border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.mutedHi, fontWeight: 700, fontSize: 12, marginBottom: 8 }}>📋 Spending outside your budget</div>
                    {unbudgeted.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cat, amt]) => (
                      <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ color: C.muted, fontSize: 12 }}>{catEmoji[cat] || "📌"} {cat}</span>
                        <span style={{ color: C.mutedHi, fontSize: 12, fontWeight: 600 }}>${Math.round(amt).toLocaleString()}</span>
                      </div>
                    ))}
                    <button onClick={openEdit} style={{ marginTop: 6, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", color: C.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                      + Add these to my budget
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}


export default function FlourishApp(){
  // ── Hydrate from localStorage on first render ──────────────────
  const saved = loadState();
  const [onboarded,setOnboarded]=useState(()=>saved?.onboarded||false);
  const [firstVisitDone,setFirstVisitDone]=useState(()=>{
    try{return localStorage.getItem("flourish_first_visit_done")==="1";}catch{return false;}
  });
  const dismissFirstVisit=()=>{
    try{localStorage.setItem("flourish_first_visit_done","1");}catch{}
    setFirstVisitDone(true);
  };
  const [appData,setAppData]=useState(()=>saved?.appData||null);
  // Read URL path on load so /privacy and /terms work as direct links
  const initialScreen = (() => {
    const path = window.location.pathname.replace(/\/+$/,"").toLowerCase();
    if (path === "/privacy") return "privacy";
    if (path === "/terms")   return "terms";
    if (path === "/kids")    return "kids";
    return "home";
  })();
  const [screen,setScreen]=useState(initialScreen);
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [showNotifs,setShowNotifs]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [showFeedback,setShowFeedback]=useState(false);
  const [tourStep,setTourStep]=useState(()=>{ try{return localStorage.getItem("flourish_tour_done")==="1"?null:0;}catch{return 0;} });
  const dismissTour=()=>{ try{localStorage.setItem("flourish_tour_done","1");}catch{} setTourStep(null); };
  const [household,setHousehold]=useState(()=>saved?.household||null);
  const [isPremium,setIsPremium]=useState(()=>saved?.isPremium||false);
  const [showPaywall,setShowPaywall]=useState(false);
  // ── Plaid reconnect state ─────────────────────────────────────
  // Multi-bank: store array of {id, token, institution}
  const [plaidTokens,setPlaidTokens]=useState(()=>{
    try{
      // Migrate legacy single token
      const legacy = localStorage.getItem("flourish_plaid_token");
      const arr = JSON.parse(localStorage.getItem("flourish_plaid_tokens")||"null");
      if(arr) return arr;
      if(legacy) return [{id:"bank_0",token:legacy,institution:"Your Bank"}];
      return [];
    }catch{return [];}
  });
  // Keep legacy plaidAccessToken for reconnect compatibility
  const plaidAccessToken = plaidTokens[0]?.token || null;
  const [needsReconnect,setNeedsReconnect]=useState(false);
  const [reconnectToken,setReconnectToken]=useState(null);
  const [reconnectLoading,setReconnectLoading]=useState(false);
  // ── Trial timer ──────────────────────────────────────────────
  const [trialStart]=useState(()=>{
    try{
      const s=localStorage.getItem("flourish_trial_start");
      if(s)return new Date(s);
      const now=new Date().toISOString();
      localStorage.setItem("flourish_trial_start",now);
      return new Date(now);
    }catch{return new Date();}
  });
  const trialDaysUsed=Math.floor((Date.now()-trialStart.getTime())/(1000*60*60*24));
  const trialDaysLeft=Math.max(0,14-trialDaysUsed);
  const trialExpired=trialDaysUsed>=14&&!isPremium;
  // ── AI Coach free message count ──────────────────────────────
  const [coachMsgCount,setCoachMsgCount]=useState(()=>{
    try{return parseInt(localStorage.getItem("flourish_coach_msgs")||"0");}catch{return 0;}
  });
  const bumpCoachMsg=()=>setCoachMsgCount(n=>{const v=n+1;try{localStorage.setItem("flourish_coach_msgs",String(v));}catch{}return v;});
  const [checkInBonus,setCheckInBonus]=useState(()=>saved?.checkInBonus||0);
  const [showCheckIn,setShowCheckIn]=useState(false);
  const [showWhatIf,setShowWhatIf]=useState(false);
  const [showWrapped,setShowWrapped]=useState(false);
  const [isOnline,setIsOnline]=useState(()=>navigator.onLine);
  const [dashLayout,setDashLayout]=useState(()=>{
    try{ const s=localStorage.getItem('flourish_dash_layout'); if(s) return JSON.parse(s); }catch{}
    return DASH_TILES.map(t=>({id:t.id,visible:true,locked:false}));
  });
  const [goalsTab,setGoalsTab]=useState("sim");
  // ── Theme ───────────────────────────────────────────────────────
  const [theme,setTheme]=useState(()=>{
    try{ const t=localStorage.getItem("flourish_theme"); if(t==="light"||t==="dark")return t; }catch{}
    return window.matchMedia?.("(prefers-color-scheme: light)").matches?"light":"dark";
  });
  const {w}=useWindowSize();
  const isDesktop=w>=960;

  // ── Supabase auth session check ────────────────────────────────
  useEffect(()=>{
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Persist state changes to localStorage ──────────────────────
  // Persist plaid tokens array
  useEffect(()=>{
    try{ localStorage.setItem("flourish_plaid_tokens", JSON.stringify(plaidTokens)); }catch{}
  },[plaidTokens]);

  useEffect(()=>{ saveState({onboarded,appData,household,isPremium,checkInBonus}); },
    [onboarded,appData,household,isPremium,checkInBonus]);

  // ── Fetch transactions on first dashboard load after bank connect ──
  // Onboarding only fetches accounts (fast). Transactions are fetched here silently.
  useEffect(()=>{
    if(!onboarded || !appData?.bankConnected) return;
    if(appData?.transactions?.length > 0) return; // already have transactions
    const tokens = JSON.parse(localStorage.getItem("flourish_plaid_tokens")||"[]");
    const legacyToken = localStorage.getItem("flourish_plaid_token");
    const allTokens = tokens.length > 0 ? tokens : (legacyToken ? [{id:"bank_0",token:legacyToken,institution:"Your Bank"}] : []);
    if(allTokens.length === 0) return;
    // Small delay so dashboard renders first
    const timer = setTimeout(async()=>{
      try {
        // Fetch transactions from ALL connected banks in parallel
        const results = await Promise.allSettled(
          allTokens.map(t => callPlaid("get_transactions",{access_token:t.token,days:90}))
        );
        const allTxns = results
          .filter(r => r.status === "fulfilled")
          .flatMap(r => normaliseTxns(r.value.transactions||[]));
        // Sort combined transactions by date
        allTxns.sort((a,b) => a.date < b.date ? 1 : -1);
        if(allTxns.length === 0) return;
        // Also refresh account balances with real-time data now that we have time
        try {
          const tokens2 = JSON.parse(localStorage.getItem("flourish_plaid_tokens")||"[]");
          const legacyToken2 = localStorage.getItem("flourish_plaid_token");
          const allTok = tokens2.length > 0 ? tokens2 : (legacyToken2 ? [{id:"b0",token:legacyToken2}] : []);
          const balResults = await Promise.allSettled(
            allTok.map(t => callPlaid("get_accounts",{access_token:t.token}))
          );
          const freshAccounts = balResults
            .filter(r=>r.status==="fulfilled")
            .flatMap(r=>r.value.accounts.map(a=>({
              id:a.id,
              name:a.name,
              type:a.subtype||a.type,
              balance:a.type==="credit"?-(a.balance.current||0):(a.balance.current??a.balance.available??0),
              institution:a.institution||"Bank",
            })));
          // Dedup by account id — multiple tokens from same bank cause duplicates
          const seenIds = new Set();
          const dedupedAccounts = freshAccounts.filter(a => {
            if (seenIds.has(a.id)) return false;
            seenIds.add(a.id);
            return true;
          });
          if(dedupedAccounts.length > 0) {
            setAppData(prev=>{
              // Sync new credit card accounts into debts
              const creditAccts = dedupedAccounts.filter(a =>
                a.type === "credit" || a.type === "credit card" || a.subtype === "credit card" || a.type === "line of credit"
              );
              const existingDebtNames = new Set((prev.debts||[]).map(d => (d.name||"").toLowerCase()));
              const newCCDebts = creditAccts
                .filter(a => !existingDebtNames.has((a.name||"").toLowerCase()))
                .map(a => ({
                  name: a.name || "Credit Card",
                  balance: Math.abs(a.balance||0).toFixed(2),
                  rate: "", min: "", fromBank: true,
                }));
              return {
                ...prev,
                accounts: dedupedAccounts,
                debts: newCCDebts.length > 0
                  ? [...(prev.debts||[]).filter(d => d.name || d.balance), ...newCCDebts]
                  : prev.debts,
              };
            });
          }
        } catch(e) { /* silent — cached balances still shown */ }
        // Auto-detect income and bills from combined data
        const detectedIncome = detectIncomeFromTxns(allTxns);
        const detectedBills = detectRecurringBills(allTxns);
        setAppData(prev=>({
          ...prev,
          transactions: allTxns,
          incomes: (() => {
            // Only auto-set income if user hasn't entered any real income yet
            const hasRealIncome = (prev.incomes||[]).some(i => parseFloat(i.amount||0) > 0);
            if (!detectedIncome || hasRealIncome) return prev.incomes;
            return [{id:1,label:detectedIncome.label,amount:String(detectedIncome.typical),freq:"biweekly",type:"employment",isVariable:detectedIncome.isVariable,typicalAmount:String(detectedIncome.typical),lowAmount:String(detectedIncome.low),highAmount:String(detectedIncome.high),autoDetected:true}];
          })(),
          bills: detectedBills?.length > 0 && (!prev.bills?.some(b=>b.name))
            ? detectedBills.map(b=>({name:b.name,amount:b.amount,date:b.date}))
            : prev.bills,
        }));
      } catch(e) {
        console.warn("[Flourish] Background transaction fetch failed:", e.message);
      }
    }, 1500);
    return ()=>clearTimeout(timer);
  },[onboarded, appData?.bankConnected, appData?.transactions?.length]);

  // ── Detect needs_reconnect from any Plaid API error in child components ──
  // Components can call window.__flourishReconnect() to trigger the banner
  useEffect(()=>{
    window.__flourishReconnect=()=>setNeedsReconnect(true);
    return()=>{ delete window.__flourishReconnect; };
  },[]);

  // Allow child components to open Settings via custom event
  useEffect(()=>{
    const handler = () => setShowSettings(true);
    window.addEventListener("flourish:settings", handler);
    return () => window.removeEventListener("flourish:settings", handler);
  },[]);
  useEffect(()=>{ try{localStorage.setItem("flourish_theme",theme);}catch{} },[theme]);
  useEffect(()=>{ try{localStorage.setItem('flourish_dash_layout',JSON.stringify(dashLayout));}catch{} },[dashLayout]);

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

  // ── Plaid reconnect success handler (must be before early returns — Rules of Hooks) ──
  const onReconnectSuccess = useCallback((publicToken, metadata)=>{
    callPlaid("exchange_token",{ public_token: publicToken, institution_name: metadata?.institution?.name||"Your Bank" })
      .then(ex=>{
        try{
        // Multi-bank: save to array
        const existing = JSON.parse(localStorage.getItem("flourish_plaid_tokens")||"[]");
        const bankId = "bank_" + Date.now();
        const updated = [...existing, {id:bankId,token:ex.access_token,institution:ex.institution_name||"Your Bank"}];
        localStorage.setItem("flourish_plaid_tokens", JSON.stringify(updated));
        // Keep legacy key for backwards compatibility
        localStorage.setItem("flourish_plaid_token", ex.access_token);
      }catch{}
        setPlaidAccessToken(ex.access_token);
        return Promise.all([
          callPlaid("get_accounts",{ access_token: ex.access_token }),
          callPlaid("get_transactions",{ access_token: ex.access_token, days: 90 }),
        ]);
      })
      .then(([acctData, txnData])=>{
        const instName = metadata?.institution?.name||"Your Bank";
        const accounts = acctData.accounts.map(a=>({
          id:a.id,
          name:`${instName} ••${a.mask||"????"}`,
          type:a.subtype||a.type,
          balance: a.type==="credit"?-(a.balance.current||0):(a.balance.current??a.balance.available??0),
          institution: instName,
        }));
        const transactions = normaliseTxns(txnData.transactions||[]);
        setAppData(d=>{
          // Auto-add credit card accounts to debts — don't overwrite existing debt entries
          const creditAccts = accounts.filter(a =>
            a.type === "credit" || a.type === "credit card" ||
            a.subtype === "credit card" || a.type === "line of credit"
          );
          const existingDebtNames = new Set((d.debts||[]).map(debt => (debt.name||"").toLowerCase()));
          const newCCDebts = creditAccts
            .filter(a => !existingDebtNames.has((a.name||"").toLowerCase()))
            .map(a => ({
              name: a.name || "Credit Card",
              balance: Math.abs(a.balance || 0).toFixed(2),
              rate: "",
              min: "",
              fromBank: true,
            }));
          return {
            ...d,
            accounts,
            transactions,
            bankConnected: true,
            debts: [...(d.debts||[]).filter(d => d.name || d.balance), ...newCCDebts],
          };
        });
        setNeedsReconnect(false);
        setReconnectToken(null);
      })
      .catch(err=>{ console.error("Reconnect failed", err); });
  },[]);
  const { openPlaidLink: openReconnectLink } = usePlaidLinkSDK(reconnectToken, onReconnectSuccess);
  useEffect(()=>{ if(reconnectToken) openReconnectLink(); },[reconnectToken]); // eslint-disable-line

  // ── Background refresh — Plus only, fires 2s after bank data is ready ─────────
  const [isRefreshing, setIsRefreshing] = useState(false);
  useEffect(()=>{
    if(!appData?.bankConnected) return;
    const timer = setTimeout(async ()=>{
      const lastFetch = parseInt(localStorage.getItem("flourish_last_refresh")||"0");
      const THIRTY_MIN = 30 * 60 * 1000;
      // Only show shimmer if we're actually going to refresh
      const willRefresh = appData?.bankConnected && isPremium && (Date.now()-lastFetch >= THIRTY_MIN);
      if(willRefresh) setIsRefreshing(true);
      await backgroundRefresh(isPremium, setAppData);
      setIsRefreshing(false);
    }, 2000);
    return ()=>clearTimeout(timer);
  },[appData?.bankConnected, isPremium]);

  // ── Legal screens — always accessible, even before auth/onboarding ──
  if(screen==="privacy")return <PrivacyPolicy onBack={()=>{window.history.replaceState(null,"","/");setScreen("home");}}/>;
  if(screen==="terms")return <TermsOfService onBack={()=>{window.history.replaceState(null,"","/");setScreen("home");}}/>;
  if(screen==="kids")return <KidsMiniSite/>;

  // ── Auth gate ───────────────────────────────────────────────────
  if(authLoading)return <div style={{minHeight:"100dvh",background:"#050D09",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{animation:"pulse 1.5s infinite"}}><FlourishMark size={72}/></div></div>;
  if(!user)return <AuthScreen onAuth={u=>setUser(u)}/>;

  if(showWrapped)return <MoneyWrapped data={appData||{}} onClose={()=>setShowWrapped(false)}/>;
  if(showWhatIf)return <WhatIfSimulator data={appData||{}} onClose={()=>setShowWhatIf(false)}/>;
  if(showCheckIn)return <WeeklyCheckInModal data={appData||{}} onClose={()=>setShowCheckIn(false)} onComplete={(pts)=>{setCheckInBonus(prev=>Math.min(20,prev+pts));setShowCheckIn(false);}}/>;
  if(!onboarded)return <Onboarding onComplete={d=>{setAppData(d);setOnboarded(true);}} onViewLegal={s=>setScreen(s)} userId={user?.id}/>;
  // First-visit focused screen — shown once after onboarding, dismissed permanently
  if(!firstVisitDone&&appData)return <FirstVisitScreen data={appData} onDismiss={dismissFirstVisit}/>;
  if(showPaywall)return <Paywall onClose={()=>setShowPaywall(false)} onUpgrade={()=>{setIsPremium(true);setShowPaywall(false);}} country={appData?.profile?.country||"CA"}/>;

  const unread = (() => {
    try {
      const readIds = new Set(JSON.parse(localStorage.getItem("flourish_read_notifs")||"[]"));
      const all = [...INIT_NOTIFS, ...(appData ? buildLiveNotifs(appData) : [])];
      return all.filter(n=>!readIds.has(n.id)).length;
    } catch { return 0; }
  })();
  const dataWithHousehold={...appData,household,isPremium};

  // ── Pass isOnline down to AICoach + reset helper ──────────────
  const handleReset = () => { clearState(); window.location.reload(); };

  // ── Plaid Update Mode (re-auth expired bank sessions) ─────────
  const handleReconnectBank = ()=>{
    // UPDATE MODE: reconnect existing expired item
    if(reconnectLoading) return;
    setReconnectLoading(true);
    const country = appData?.profile?.country || "CA";
    const payload = plaidAccessToken ? { access_token: plaidAccessToken } : { country };
    callPlaid("create_link_token", payload)
      .then(d=>{ setReconnectToken(d.link_token); setReconnectLoading(false); })
      .catch(()=>{ setReconnectLoading(false); alert("Could not reconnect — please try again."); });
  };

  const handleAddNewBank = ()=>{
    // FRESH LINK: always creates new connection, never update mode
    if(reconnectLoading) return;
    setReconnectLoading(true);
    const country = appData?.profile?.country || "CA";
    callPlaid("create_link_token", { country, user_id: user?.id })
      .then(d=>{ setReconnectToken(d.link_token); setReconnectLoading(false); })
      .catch(()=>{ setReconnectLoading(false); alert("Could not start bank connection — please try again."); });
  };


  // ── Plaid Offboarding — remove Item from Plaid when user disconnects ───────
  const disconnectBank = async ()=>{
    if(!plaidAccessToken) return;
    try{ await callPlaid("remove_item",{ access_token: plaidAccessToken }); }catch(e){ console.warn("remove_item:", e.message); }
    try{ localStorage.removeItem("flourish_plaid_token"); }catch{}
    setPlaidAccessToken(null);
    setNeedsReconnect(false);
    setAppData(d=>({...d, accounts:[{id:"m1",name:"Chequing",type:"checking",balance:0,institution:"Manual"}], transactions: d.transactions||[], bankConnected:false }));
  };

  const deleteAllData = async ()=>{
    if(!window.confirm("Delete all your data? This cannot be undone.")) return;
    // Plaid offboarding: revoke access token before wiping local data
    if(plaidAccessToken){
      try{ await callPlaid("remove_item",{ access_token: plaidAccessToken }); }catch{}
    }
    clearState();
    try{ localStorage.removeItem("flourish_plaid_token"); }catch{}
    window.location.reload();
  };

  const content=()=>{
    if(showNotifs)return <Notifications onClose={()=>setShowNotifs(false)} data={appData}/>;
    if(showSettings)return <Settings data={appData} setAppData={setAppData} onClose={()=>setShowSettings(false)} onReset={handleReset} theme={theme} toggleTheme={toggleTheme} onOpenWidget={()=>{setShowSettings(false);setScreen("widget");}} onDisconnectBank={disconnectBank} onAddBank={handleAddNewBank} onDeleteData={deleteAllData} bankConnected={appData?.bankConnected||false} needsReconnect={needsReconnect} reconnectLoading={reconnectLoading} onReconnect={handleReconnectBank} setScreen={s=>{setShowSettings(false);setScreen(s);}}/>;
    if(screen==="home")return <Dashboard data={dataWithHousehold} setScreen={setScreen} setShowNotifs={setShowNotifs} isDesktop={isDesktop} onUpgrade={()=>setShowPaywall(true)} checkInBonus={checkInBonus} onCheckIn={()=>setShowCheckIn(true)} onWhatIf={()=>setShowWhatIf(true)} onWrapped={()=>setShowWrapped(true)} dashLayout={dashLayout} setDashLayout={setDashLayout} setGoalsTab={setGoalsTab} isRefreshing={isRefreshing}/>;
    if(screen==="plan")return <PlanAhead data={dataWithHousehold} setAppData={setAppData} setScreen={setScreen}/>;
    if(screen==="spend")return <SpendScreen data={dataWithHousehold} setAppData={setAppData} setScreen={setScreen}/>;
  if(screen==="budget")return <BudgetScreen data={dataWithHousehold} setAppData={setAppData} setScreen={setScreen}/>;
    if(screen==="coach"){const freeCoachAllowed=!isPremium&&coachMsgCount<5&&!trialExpired;const showCoach=isPremium||freeCoachAllowed;if(showCoach)return <AICoach data={dataWithHousehold} isOnline={isOnline} isPremium={isPremium} coachMsgCount={coachMsgCount} onSend={bumpCoachMsg} onUpgrade={()=>setShowPaywall(true)} setScreen={setScreen}/>; if(!isPremium&&coachMsgCount>=5)return <PremiumGate feature="AI Coach" desc={`You've used your 5 free messages. Upgrade to Flourish Plus for unlimited coaching.`} onUpgrade={()=>setShowPaywall(true)}/>; return <PremiumGate feature="AI Coach" desc="Get personalized coaching from your real transaction data." onUpgrade={()=>setShowPaywall(true)}/>;}
    if(screen==="family")return <Family data={dataWithHousehold} household={household} setHousehold={setHousehold} setScreen={setScreen}/>;
    if(screen==="goals")return <Goals data={dataWithHousehold} setAppData={setAppData} onUpgrade={()=>setShowPaywall(true)} initialTab={goalsTab} setScreen={setScreen}/>;
    if(screen==="credit")return isPremium?<CreditScreen data={dataWithHousehold} setScreen={setScreen}/>:<PremiumGate feature="Credit Coaching" desc="Full credit score breakdown, factor analysis, and a personalized improvement plan." onUpgrade={()=>setShowPaywall(true)}/>;
    if(screen==="widget")return <WidgetScreen data={dataWithHousehold} onBack={()=>setScreen("home")}/>;
    // privacy and terms handled before auth gate above
    return <Dashboard data={dataWithHousehold} setScreen={setScreen} setShowNotifs={setShowNotifs} isDesktop={isDesktop} onUpgrade={()=>setShowPaywall(true)} checkInBonus={checkInBonus} onCheckIn={()=>setShowCheckIn(true)} onWhatIf={()=>setShowWhatIf(true)} onWrapped={()=>setShowWrapped(true)} dashLayout={dashLayout} setDashLayout={setDashLayout} setGoalsTab={setGoalsTab} isRefreshing={isRefreshing}/>;
  };

  const ALL_NAV=[
    {id:"home",  icon:"home",    label:"Today"},
    {id:"plan",  icon:"calendar",label:"Plan"},
    {id:"spend", icon:"card",    label:"Activity"},
    {id:"budget",icon:"chartUp", label:"Budget"},
    {id:"coach", icon:"sparkles",label:"Guidance"},
    {id:"family",icon:"users",   label:"Family"},
    {id:"goals", icon:"target",  label:"Goals"},
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
          {/* Trial status in sidebar */}
          {!isPremium&&(
            <div onClick={()=>setShowPaywall(true)} style={{background:trialExpired?"#180800":trialDaysLeft<=2?C.orange+"18":C.purple+"18",border:`1px solid ${trialExpired?C.red+"44":trialDaysLeft<=2?C.orange+"44":C.purple+"33"}`,borderRadius:12,padding:"10px 14px",marginBottom:8,cursor:"pointer",transition:"all .18s"}}>
              <div style={{color:trialExpired?C.redBright:trialDaysLeft<=2?C.orangeBright:C.purpleBright,fontWeight:700,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:2}}>
                {trialExpired?"Trial ended 🔒":trialDaysLeft===0?"Trial ends today ⚠️":`${trialDaysLeft} day${trialDaysLeft===1?"":"s"} left`}
              </div>
              <div style={{color:C.muted,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Upgrade to Flourish Plus →</div>
              {!trialExpired&&<div style={{height:3,background:C.border,borderRadius:99,marginTop:6,overflow:"hidden"}}>
                <div style={{width:`${Math.max(4,(trialDaysLeft/14)*100)}%`,height:"100%",background:trialDaysLeft<=2?C.orange:C.purple,borderRadius:99}}/>
              </div>}
            </div>
          )}
          {appData&&<div style={{background:C.card,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,borderRadius:99,background:C.green+"22",border:`1px solid ${C.green}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}><Icon id="user" size={15} color={C.green} strokeWidth={1.5}/></div>
              <div>
                <div style={{color:C.cream,fontWeight:700,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{appData.profile?.name||"User"}</div>
                {household&&<div style={{color:C.green,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>🏠 Household connected</div>}
                {isPremium&&<div style={{color:C.goldBright,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>✦ Flourish Plus</div>}
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
              {showNotifs?"Notifications":showSettings?"Settings":screen==="home"?"Today":screen==="plan"?"Plan":screen==="spend"?"Activity":screen==="coach"?"Guidance":screen==="family"?"Family":screen==="goals"||screen==="credit"?"Goals & Wealth":"Today"}
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
            <div><Dashboard data={dataWithHousehold} setScreen={setScreen} setShowNotifs={setShowNotifs} isDesktop={true} checkInBonus={checkInBonus} onCheckIn={()=>setShowCheckIn(true)} onWhatIf={()=>setShowWhatIf(true)} onWrapped={()=>setShowWrapped(true)} dashLayout={dashLayout} setDashLayout={setDashLayout} setGoalsTab={setGoalsTab} isRefreshing={isRefreshing}/></div>
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
        {/* ── TRIAL BANNER ─────────────────────────── */}
        {!isPremium&&!trialExpired&&trialDaysLeft<=7&&(
          <div style={{background:trialDaysLeft<=2?"#1A0800":`linear-gradient(90deg,${C.purple}22,${C.purpleDim})`,borderBottom:`1px solid ${trialDaysLeft<=2?C.orange+"55":C.purple+"44"}`,padding:"8px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <span style={{fontSize:13}}>{trialDaysLeft<=2?"⚠️":"✨"}</span>
            <span style={{color:trialDaysLeft<=2?C.orangeBright:C.purpleBright,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,fontWeight:700,flex:1}}>
              {trialDaysLeft===0?"Trial ends today":"Trial: "+trialDaysLeft+" day"+(trialDaysLeft===1?"":"s")+" left"}
            </span>
            <button onClick={()=>setShowPaywall(true)} style={{background:trialDaysLeft<=2?"linear-gradient(135deg,"+C.orange+","+C.gold+")":"linear-gradient(135deg,"+C.purple+","+C.purpleBright+")",border:"none",borderRadius:8,padding:"5px 12px",color:"#fff",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              Upgrade →
            </button>
          </div>
        )}
        {trialExpired&&(
          <div style={{background:"#180800",borderBottom:`2px solid ${C.red}55`,padding:"10px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <span style={{fontSize:13}}>🔒</span>
            <span style={{color:C.redBright,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,fontWeight:700,flex:1}}>Your free trial has ended</span>
            <button onClick={()=>setShowPaywall(true)} style={{background:`linear-gradient(135deg,${C.purple},${C.purpleBright})`,border:"none",borderRadius:8,padding:"6px 14px",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
              Upgrade Now
            </button>
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

        {/* ── FEEDBACK FLOATING BUTTON ──────────────────── */}
        {!showNotifs&&!showSettings&&(
          <button onClick={()=>setShowFeedback(true)}
            style={{position:"fixed",bottom:84,right:16,zIndex:60,
              background:`linear-gradient(135deg,${C.purple}CC,${C.purpleDim}CC)`,
              backdropFilter:"blur(8px)",border:`1px solid ${C.purple}55`,
              borderRadius:99,padding:"7px 13px",display:"flex",alignItems:"center",gap:5,
              boxShadow:"0 4px 20px rgba(0,0,0,0.4)",cursor:"pointer",
              color:C.purpleBright,fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            <span style={{fontSize:13}}>💬</span> Feedback
          </button>
        )}

        {/* ── ONBOARDING TOUR ──────────────────────────── */}
        {tourStep!==null&&onboarded&&!showNotifs&&!showSettings&&(()=>{
          const TOUR=[
            {screen:"home",   emoji:"🏠", title:"Today Screen",        body:"Your financial snapshot — safe-to-spend, balance, and daily insights. This is your home base."},
            {screen:"spend",  emoji:"📊", title:"Activity & Budgets",   body:"See where your money goes, set budgets per category, and track trends over time."},
            {screen:"coach",  emoji:"✨", title:"AI Financial Guidance", body:"Ask anything — tax tips, debt strategy, savings plans. Powered by your real data."},
            {screen:"goals",  emoji:"🎯", title:"Goals & Credit",        body:"Set savings goals, track your debt payoff, and monitor your credit score health."},
          ];
          const step=TOUR[tourStep];
          const isLast=tourStep===TOUR.length-1;
          return(
            <div style={{position:"fixed",inset:0,zIndex:200,pointerEvents:"none"}}>
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.72)",pointerEvents:"auto"}}
                onClick={()=>{if(isLast) dismissTour();}}/>
              <div style={{position:"absolute",bottom:100,left:"50%",transform:"translateX(-50%)",
                width:"calc(100% - 40px)",maxWidth:390,
                background:C.surface,borderRadius:20,padding:"20px 20px 16px",
                border:`1px solid ${C.green}44`,boxShadow:`0 8px 40px rgba(0,0,0,0.6)`,
                pointerEvents:"auto",animation:"slideUp .3s ease",zIndex:201}}>
                <div style={{display:"flex",gap:5,marginBottom:14,justifyContent:"center"}}>
                  {TOUR.map((_,i)=>(
                    <div key={i} style={{width:i===tourStep?20:6,height:6,borderRadius:99,transition:"width .3s",
                      background:i<=tourStep?C.green:C.border}}/>
                  ))}
                </div>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:14}}>
                  <div style={{fontSize:28,lineHeight:1,flexShrink:0}}>{step.emoji}</div>
                  <div>
                    <div style={{color:C.greenBright,fontWeight:800,fontSize:15,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4}}>
                      {step.title}
                    </div>
                    <div style={{color:C.mutedHi,fontSize:13,lineHeight:1.6}}>{step.body}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={dismissTour}
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px",
                      color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",flex:"0 0 auto"}}>
                    Skip Tour
                  </button>
                  <button onClick={()=>{ if(isLast){dismissTour();}else{setTourStep(t=>t+1);setScreen(TOUR[tourStep+1].screen);}}}
                    style={{flex:1,background:`linear-gradient(135deg,${C.green},${C.greenBright})`,
                      border:"none",borderRadius:12,padding:"10px",color:"#041810",
                      fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                    {isLast?"Done ✓":"Next →"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── FEEDBACK MODAL ──────────────────────────── */}
        {showFeedback&&<FeedbackModal onClose={()=>setShowFeedback(false)}/>}
      </div>
    </div>
  );
}
