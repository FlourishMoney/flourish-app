import { useState, useEffect, useRef, useCallback } from "react";
import {
  Home, Calendar, CreditCard, Sparkles, Users, User,
  Bell, Settings as LucideSettings, ShoppingCart, Coffee,
  Zap, Package, Film, Music, Pill, Shirt,
  TrendingUp, Shield, CheckCircle,
  Target, PiggyBank, DollarSign,
  ShoppingBag, Flame, Star, Car, BarChart2
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
      ["cpp","🏛️ CPP / QPP / Pension"],["ei","📋 EI Benefits"],
      ["odsp","♿ ODSP / Ontario Works"],["ccb","👶 Canada Child Benefit"],
      ["rental","🏠 Rental Income"],["gig","🚗 Gig / Freelance"],["other","➕ Other"],
    ],
    debtTypes:["Credit Card","Line of Credit","HELOC","Car Loan","OSAP / Student Loan","Personal Loan","Mortgage","Buy Now Pay Later","Other"],
    taxTips:[
      {title:"RRSP Contribution",body:"Every RRSP dollar reduces your taxable income. At a 30% marginal rate, putting in $5,000 gets you ~$1,500 back at tax time. Contributions made in the first 60 days of the calendar year count toward the prior tax year — check CRA My Account for the exact deadline each year.",savings:"Up to 33%",flag:"🇨🇦",priority:"high",action:"Check My RRSP Room"},
      {title:"TFSA — You're Probably Under-Using It",body:"Your TFSA isn't just for savings — it's for investing. Any growth inside is 100% tax-free forever. If you opened one at 18, you may have $75,000+ of contribution room sitting unused.",savings:"Tax-free growth",flag:"🇨🇦",priority:"high",action:"Calculate My Room"},
      {title:"FHSA (First Home Savings Account)",body:"If you've never owned a home, you can contribute up to $8,000/year and get a tax deduction — like an RRSP. Unused room carries forward. Withdraw tax-free to buy your first home.",savings:"Up to $8,000/yr",flag:"🇨🇦",priority:"high",action:"Open an FHSA"},
      {title:"GST/HST Credit",body:"Filing your taxes means CRA automatically checks if you qualify for quarterly GST/HST credits. Under ~$50k income? You likely qualify and may not know it. File every year even if you owe nothing.",savings:"Up to $519/yr",flag:"🇨🇦",priority:"medium",action:"File Your Taxes"},
      {title:"Canada Child Benefit (CCB)",body:"Tax-free monthly payments if you have children under 18. A family earning $50k with two kids can get $12,000+/year. Apply on CRA My Account or when registering the birth.",savings:"Up to $7,787/child",flag:"🇨🇦",priority:"high",action:"Apply on CRA"},
      {title:"Home Office Deduction",body:"Work from home? For 2023 onwards, employees use the detailed method — the temporary flat-rate $2/day method is no longer available. You need Form T2200 signed by your employer and must meet the 50%-of-time test. Self-employed workers can deduct the business-use share of eligible expenses like rent, internet, and utilities.",savings:"Varies",flag:"🇨🇦",priority:"medium",action:"Get Form T2200"},
      {title:"Ontario Trillium Benefit",body:"Ontario residents: combines the Ontario Sales Tax Credit, Ontario Energy Credit, and Northern Ontario Energy Credit into one monthly payment. Low-to-mid income earners often miss this.",savings:"Up to $1,421/yr",flag:"🏙️ ON",priority:"medium",action:"Apply on CRA"},
      {title:"Disability Tax Credit (DTC)",body:"If you or a dependent has a severe disability, the DTC provides up to ~$1,300/year in federal tax credits, plus retroactive claims. Often missed — a doctor fills out T2201.",savings:"Up to $1,300/yr",flag:"🇨🇦",priority:"medium",action:"Get T2201 Form"},
      {title:"Child Care Expense Deduction",body:"Daycare, after-school programs, summer camp — most childcare costs are deductible from the lower-income spouse's return. Families earning $50k often leave $2,000–$4,000 on the table.",savings:"$1,200–$4,000",flag:"🇨🇦",priority:"high",action:"Gather Receipts"},
      {title:"RESP — Free Government Money",body:"Open an RESP for your child and the government adds 20% on the first $2,500/year = $500 free per child. Canada Learning Bond adds another $500 for lower-income families.",savings:"$500–$1,000/yr free",flag:"🇨🇦",priority:"high",action:"Open an RESP"},
      {title:"Working Income Tax Benefit (CWB)",body:"Working but earning under ~$36k? CRA may owe you a refundable tax credit just for filing. Many low-income workers miss this entirely.",savings:"Up to $1,428",flag:"🇨🇦",priority:"medium",action:"Check Eligibility"},
    ],
    learnCards:[
      {emoji:"🏦",title:"TFSA vs RRSP — The Real Difference",body:"RRSP lowers your taxes now but you pay tax when you withdraw. TFSA has no upfront deduction but all growth and withdrawals are 100% tax-free. Rule of thumb: lower income now often favors TFSA, higher income often favors RRSP — but check first if you expect income to drop soon (parental leave, early retirement), have large RRSP carry-forward room, get an employer RRSP match, or are a first-time buyer who should use an FHSA first.",key:"Usually: lower income → TFSA, higher income → RRSP. Check future income, carry-forward room, employer match, and FHSA eligibility first."},
      {emoji:"🏠",title:"The FHSA: Best Account Most Canadians Don't Have",body:"The First Home Savings Account opened in 2023. You get an RRSP-style deduction going in AND tax-free withdrawals for a first home. Up to $40,000 lifetime room. If you're not a homeowner, this should be your first account.",key:"Open an FHSA before your RRSP if you want to buy a home."},
      {emoji:"👶",title:"Canada Child Benefit vs US Child Tax Credit",body:"The CCB is more generous than most Canadians realize. A single parent earning $40k with two kids under 6 can receive over $14,000/year. Unlike US credits, CCB is completely tax-free and paid monthly.",key:"Apply at birth — retroactive claims are possible but painful."},
      {emoji:"📋",title:"What EI Actually Covers",body:"Employment Insurance isn't just for job loss. It also covers maternity (15 weeks), parental (up to 35 weeks standard or 61 weeks extended), sickness (26 weeks), and compassionate care. Many employees don't claim what they're entitled to.",key:"Know your EI benefits before you need them."},
      {emoji:"💳",title:"Why minimum payments are a trap",body:"If you owe $3,000 at 20% and pay only the minimum, it takes 8+ years and costs nearly $3,000 extra. You buy everything twice.",key:"Never just pay the minimum."},
      {emoji:"🆘",title:"The emergency fund rule",body:"Start with a $1,000 buffer to stop new credit card debt, then build a fuller fund. Salaried households can target 3 months of core expenses. Self-employed, variable-income, or single-income households often need 6 months or more — income disruption is harder to predict. In Canada, keep it accessible in a TFSA HISA.",key:"Start with $1,000, then build 3–6+ months based on income stability and household risk."},
    ],
    retirementAccounts:[
      {id:"rrsp",name:"RRSP",fullName:"Registered Retirement Savings Plan",icon:"🏦",color:"#2E8B2E",annualLimit:"18% of income (max $32,490)",taxNote:"Contributions deductible. Withdrawals taxed as income.",tip:"Contribute in high-income years. Use spousal RRSP for income splitting."},
      {id:"tfsa",name:"TFSA",fullName:"Tax-Free Savings Account",icon:"🛡️",color:"#2FADA6",annualLimit:"$7,000 (2025). Unused room accumulates.",taxNote:"No deduction on contribution. All growth and withdrawals tax-free.",tip:"Invest in ETFs inside your TFSA — don't just park cash."},
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
      {title:"HSA: The Triple Tax Advantage",body:"If you have a high-deductible health plan, an HSA lets you contribute pre-tax, grow tax-free, and withdraw tax-free for medical expenses. It's legally the most tax-advantaged account available.",savings:"Up to $4,300/yr",flag:"🇺🇸",priority:"high",action:"Open an HSA"},
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
      {id:"hsa",name:"HSA",fullName:"Health Savings Account",icon:"🏥",color:"#CFA03E",annualLimit:"$4,300 single / $8,550 family (2025)",taxNote:"Triple tax advantage: pre-tax in, tax-free growth, tax-free for medical expenses.",tip:"After 65, HSA funds can be used for anything (taxed like a 401k). Best account in the US tax code."},
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

// ─── PERSONALIZED TAX CREDIT ENGINE ─────────────────────────────────────────
// Returns a filtered + enriched tax tip array based on profile.
// Surfaces only credits that apply to the user's life stage, province/state,
// income types, and family situation.
function getPersonalizedTaxCredits(profile) {
  const country   = profile?.country   || "CA";
  const province  = profile?.province  || "ON";
  // lifeStages is now an array — support both old string format and new array format
  const rawLifeStage = profile?.lifeStages || profile?.lifeStage || "employed";
  const lifeStages = Array.isArray(rawLifeStage) ? rawLifeStage : [rawLifeStage];
  // Helper: check if any life stage matches
  const hasStage = (...stages) => stages.some(s => lifeStages.includes(s));
  // For backwards compat, keep lifeStage as the primary one for block-level checks
  const lifeStage = lifeStages[0] || "employed";
  const hasKids   = profile?.hasKids   || false;
  const status    = profile?.status    || "single";
  const incomeTypes = (profile?.incomeTypes || []).map(t => t.toLowerCase());
  const cfg = CC[country] || CC.CA;

  // Start with base country tips, then add life-stage + province specific ones
  let tips = [...(cfg.taxTips || [])];

  // ── FILTER: remove tips that clearly don't apply ──────────────────────────
  tips = tips.filter(tip => {
    const t = tip.title.toLowerCase();
    // Kids-only tips
    if ((t.includes("child") || t.includes("ccb") || t.includes("resp") || t.includes("dependent care") || t.includes("childcare") || t.includes("child care")) && !hasKids) return false;
    // Homeowner tips — FHSA only for non-seniors/non-retired
    if (t.includes("fhsa") && hasStage("senior", "retired")) return false;
    // RESP only for people with kids
    if (t.includes("resp") && !hasKids) return false;
    // Student loan deduction only for students or recent grads
    if (t.includes("student loan interest") && !hasStage("student", "employed")) return false;
    // Home office — self-employed or employed (remote)
    if (t.includes("home office") && hasStage("student") && !hasStage("employed", "selfemployed")) return false;
    // Working income / CWB — not for retired/senior on fixed income
    if ((t.includes("working income") || t.includes("cwb")) && hasStage("retired") && !hasStage("employed", "selfemployed")) return false;
    return true;
  });

  // ── ADD: Student-specific credits ────────────────────────────────────────
  if (hasStage("student")) {
    if (country === "CA") {
      tips.unshift(
        {title:"Tuition Tax Credit",body:"Your T2202 slip from your school lets you claim every dollar of tuition as a federal tax credit (15% federal rate). Unused amounts carry forward indefinitely — you can use them in future high-income years. Transfer up to $5,000 unused amount to a parent or spouse.",savings:"15% of tuition paid",flag:"🇨🇦",priority:"high",action:"Get Your T2202"},
        {title:"Canada Training Credit",body:"You accumulate $250/year in Canada Training Credit room (up to $5,000 lifetime). This is a refundable credit — you get money back even if you owe nothing. Claim on line 45350 of your return.",savings:"Up to $250/yr",flag:"🇨🇦",priority:"high",action:"Check CTC Room on CRA"},
        {title:"GST/HST Credit — Students Almost Always Qualify",body:"If your income is low (most students qualify), file your taxes and CRA automatically pays you quarterly GST/HST credits. No application needed — just file. Many students skip filing because they 'don't earn much' and miss hundreds.",savings:"Up to $519/yr",flag:"🇨🇦",priority:"high",action:"File Your Taxes"},
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
        {title:"OAS & GIS — Are You Getting Everything?",body:"Old Age Security ($742.31/mo at 65) is automatic, but the Guaranteed Income Supplement (GIS) is not — you must apply. Low-income seniors leave GIS unclaimed every year. If your income is under ~$21,624, apply immediately.",savings:"Up to $1,065/mo (GIS)",flag:"🇨🇦",priority:"high",action:"Apply at Service Canada"},
        {title:"Delay CPP/QPP and OAS for a 42% boost",body:"Taking CPP (or QPP in Quebec) at 65 is the default, but deferring to 70 permanently increases your monthly payment by 42%. Deferring OAS to 70 adds another 36%. If you have other income to draw on between 65 and 70 and expect to live past 83, delaying is usually worth it. Run the math before you claim.",savings:"Up to 42% more CPP/QPP + 36% more OAS",flag:"🇨🇦",priority:"high",action:"Model your CPP/QPP start date"},
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
      tips.push({title:"Ontario Trillium Benefit",body:"Ontario residents: combines the Ontario Sales Tax Credit, Ontario Energy Credit, and Northern Ontario Energy Credit into one monthly payment. Low-to-mid income earners often miss this.",savings:"Up to $1,421/yr",flag:"🏙️ ON",priority:"medium",action:"Apply on CRA"});
    }
    if (province === "QC") {
      tips.push(
        {title:"Quebec Solidarity Tax Credit",body:"Quebec's refundable solidarity tax credit combines housing, QST, and northern village components. Apply on your Quebec TP-1 return. Many Quebecers eligible for $300–$2,000+ per year.",savings:"$300–$2,000+",flag:"🏙️ QC",priority:"high",action:"Claim on TP-1 Return"},
        {title:"Quebec Child Assistance Payment",body:"Quebec provides a refundable tax credit for families with children — separate from the federal CCB. Amounts depend on income and number of children, paid quarterly.",savings:"Varies by family",flag:"🏙️ QC",priority:"high",action:"Apply via Revenu Québec"}
      );
    }
    if (province === "AB") {
      tips.push({title:"Alberta Tax Planning",body:"Alberta has provincial income tax, but rates are among the lowest in Canada — a flat 10% on all taxable income, with no surtax. Combined with federal rates, Alberta residents often pay less total income tax than other provinces. Focus on RRSP, TFSA, FHSA, and the Alberta Child and Family Benefit if applicable.",savings:"Lower combined rate vs most provinces",flag:"🏙️ AB",priority:"medium",action:"Review Federal + Alberta Credits"});
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

const DEMO = {
  balance:     1_243.88,
  income:      1_847.50,
  netWorthAdd:   1_840,   // mock savings/TFSA for net worth calc
};

// ─── PLAID API HELPERS ────────────────────────────────────────────────────────
async function callPlaid(action, params={}) {
  try {
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
  } catch(err) {
    throw err instanceof Error ? err : new Error("Plaid request failed");
  }
}

// Plaid Personal Finance Category (PFC) primary values → Flourish display meta
// Shared keyword list for detecting credit card payments in transactions.
// Used by income detection, spending calc, and transparency panel — single source of truth.
const CC_PAYMENT_KEYWORDS = ["payment","autopay","amex","visa","mastercard","credit card","card payment","minimum payment","balance payment","customer transfer","mb-cr","mb-credit","loc pay","line of credit","credit/loc","bill payment mb","bill payment rbc","bill payment td","bill payment bmo","bill payment cibc","bill payment scotia","balance transfer","cc payment","crd pmt"];

// ─── CC PAYMENT DETECTOR ──────────────────────────────────────────────────────
// Identifies transactions that are credit card payments (not spending).
// Plaid shows CC payments as: Transfer category OR matching CC keywords in name.
// Also detects by amount matching a known debt balance (±$5 tolerance).
function isCCPayment(txn, debts=[]) {
  if(!txn || txn.amount <= 0) return false;
  const name = (txn.name || "").toLowerCase();
  const cat  = (txn.cat  || "").toUpperCase();
  // Direct keyword match
  if(CC_PAYMENT_KEYWORDS.some(kw => name.includes(kw))) return true;
  // Also check the transaction category — LOAN_PAYMENTS from Plaid = CC payment
  if(cat === "BILLS" || cat === "TRANSFER" || cat.includes("TRANSFER") || cat.includes("LOAN")) {
    // Additional signal: amount matches a known debt minimum or round payment
    if(debts.length > 0) {
      const matchesDet = debts.some(d => {
        const min = parseFloat(d.min||0);
        const bal = parseFloat(d.balance||0);
        return (min > 0 && Math.abs(txn.amount - min) < 5) ||
               (bal > 0 && Math.abs(txn.amount - bal) < 5);
      });
      if(matchesDet) return true;
    }
    // Large transfer/payment-category transaction → likely CC or loan payment
    if(txn.amount >= 20 && (cat.includes("TRANSFER") || cat.includes("LOAN") || cat === "BILLS")) return true;
  }
  return false;
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
  LOAN_PAYMENTS:             { cat:"Transfer",        icon:"💳", color:"#888"    }, // CC/loan payments — excluded from spending
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
  "Payment":                 { cat:"Transfer",        icon:"💳", color:"#888"    }, // CC/loan payments — excluded from spending
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
                        <span style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>−${(avgDaily*0.8).toFixed(0)}</span>
                      </div>
                    )}
                    {/* Divider + balance result */}
                    <div style={{borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:C.cream,fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                        {ev.day===0?"Current balance":"Projected balance"}
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
                        <span style={{color:C.greenBright,fontWeight:700,fontSize:12}}>+${(ev.income||0).toFixed(0)}</span>
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
                        <span style={{color:C.muted,fontSize:12}}>−${(avgDaily*0.8).toFixed(0)}</span>
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

  const bal = parseFloat((data.accounts?.[0]?.balance || DEMO.balance).toString().replace(/,/g,""));
  const monthlyIncome = ((data.incomes||[]).reduce((s,i)=>s+parseFloat(i.amount||0),0) || DEMO.income);
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
  const t = txns || [];
  const neg = t.filter(x => x.amount > 0);  // expenses are positive
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
  const txns = data.transactions || [];
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
  const toMonthlyAmt = (amt, freq) => { const a=parseFloat(amt||0); return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:a; };
    const monthlyIncome = (data.incomes||[]).filter(i=>parseFloat(i.amount)>0).reduce((s,i)=>s+toMonthlyAmt(i.amount,i.freq),0) || 4200;
  const totalDebt = (data.debts||[]).reduce((s,d)=>s+parseFloat(d.balance||0),0);
  const bal = parseFloat((data.accounts?.[0]?.balance||0).toString().replace(/,/g,""));
  const invBal = (data.accounts||[]).filter(a=>a.type==="investment").reduce((s,a)=>s+parseFloat(a.balance||0),0);
  const savingsRate = 0.10; // assume 10% baseline savings
  const monthlyInvest = monthlyIncome * savingsRate + extra;
  const annualReturn = 0.07; // long-term equity assumption — disclosed in UI below
  // Note: 7% is a historical long-term equity average. Conservative investors
  // and those within 10 years of retirement should use the retirement tab
  // projection tool which has Conservative (3%) / Moderate (5%) / Aggressive (7%) modes.

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

  const fmt = n => { const v=n||0; return v >= 1000000 ? `$${(v/1000000).toFixed(2)}M` : `$${(v/1000).toFixed(0)}k`; };

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
      <div style={{marginTop:10,color:C.muted,fontSize:10,textAlign:"center",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.5}}>
        Assumes 7% avg annual return · estimates only · not financial advice · actual returns vary.
        For conservative or near-retirement projections, use the <span style={{color:C.teal,fontWeight:700}}>Retirement tab</span> with adjustable assumption modes.
      </div>
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
  const _oppCatOv = (() => { try { return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}"); } catch { return {}; } })();
  const _getOppCat = (t) => _oppCatOv[t.id] || t.cat;
  const subTxns = txns.filter(t => _getOppCat(t) === "Subscriptions" && t.amount > 0);  // expenses are positive
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
      detail:`At ${highRateDebt.rate}% this debt is expensive. If you qualify for a lower-rate consolidation loan, compare the APR, fees, and total repayment carefully — a lower rate doesn't always mean lower total cost.`,
      action:"Debt Plan", screen:"goals", tab:"sim", badge:"Save $"+saving+"/yr"
    });
  }

  // Tax benefits (country-specific)
  if (cc.currency === "CAD") {
    // RRSP room opportunity — highest value if they have unused room
    const rrspRoomCalc = RRSPRoomEngine.calculate(data);
    if(rrspRoomCalc?.remainingRoom > 500 && rrspRoomCalc?.maxRefund > 100) {
      opportunities.push({
        id:"rrsp_room", icon:"🏦", color:"#2E8B2E",
        title:`$${rrspRoomCalc.remainingRoom.toLocaleString()} of RRSP room unused`,
        detail:`Contributing your remaining room could get you ~$${rrspRoomCalc.maxRefund.toLocaleString()} back at tax time. At ${Math.round(rrspRoomCalc.marginalRate*100)}% marginal rate, every $1,000 contributed = $${rrspRoomCalc.refundPer1k} refund.`,
        action:"RRSP Tracker", screen:"goals", tab:"retire", badge:"Claim it"
      });
    }
    opportunities.push({
      id:"tax", icon:"🍁", color:C.red,
      title:"Tax benefits you may qualify for",
      detail:`Based on your profile you may be eligible for the Canada Workers Benefit, GST/HST credit${data.profile?.province==="ON" ? ", or Ontario Trillium Benefit" : ", or province-specific refundable credits"}.`,
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
  const _toMoW = (amt,freq) => { const a=parseFloat(amt||0); return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:a; };
  const income = ((data.incomes||[]).reduce((s,i)=>s+_toMoW(i.amount,i.freq),0) || 4200) * 12;
  const totalSpent = txns.reduce((s,t)=>s+Math.abs(t.amount||0),0) || 0;
  const totalDebt = (data.debts||[]).reduce((s,d)=>s+parseFloat(d.balance||0),0);
  const invBal = (data.accounts||[]).filter(a=>a.type==="investment").reduce((s,a)=>s+parseFloat(a.balance||0),0);
  const bal = parseFloat((data.accounts?.[0]?.balance||0).toString().replace(/,/g,""));

  // Category analysis
  const cats = {};
  txns.forEach(t => { cats[t.cat||"Other"] = (cats[t.cat||"Other"]||0) + Math.abs(t.amount); });
  const topCat = Object.entries(cats).sort((a,b)=>b[1]-a[1])[0] || ["Food","340"];
  const lowestCat = Object.entries(cats).sort((a,b)=>a[1]-b[1])[0] || ["Transport","45"];
  const biggestTxn = txns.sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount))[0];
  const netWorthChange = Math.round(invBal + bal - totalDebt);
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
      src={`data:image/png;base64,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`}
      width={size}
      height={size}
      alt="Flourish"
      style={{ flexShrink: 0, display: "block", borderRadius: size > 30 ? Math.round(size * 0.28) : 0, ...style }}
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
  const SKIP_CATS = new Set(["Transfer","Income","Fees"]);
  // Use catOverrides so user-reassigned categories appear in breakdown
  const getC = (t) => catOverrides[t.id] || t.cat;
  const sp = txns.filter(t=>t.amount>0 && !SKIP_CATS.has(getC(t)));
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
  const totalSpent=sp.reduce((a,t)=>a+t.amount,0); // sp already excludes Transfer/Income via SKIP_CATS
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
    // Liabilities: credit card balances from accounts + any manually entered debts
    const creditFromAccounts = accounts
      .filter(a => a.type === "credit" || a.type === "credit card" || a.subtype === "credit card" || a.type === "line of credit")
      .reduce((s,a) => s + Math.abs(parseFloat(a.balance||0)), 0);
    const manualDebts = debts.reduce((s,d) => s + parseFloat(d.balance||0), 0);
    // Avoid double-counting: use max of manual debts vs credit accounts
    // (user may have added credit cards both ways)
    const liabilities = Math.max(creditFromAccounts, manualDebts);
    return { assets, liabilities, netWorth: assets - liabilities };
  },

  /** Monthly cash flow = income − (bills + avg transaction spend) */
  cashFlow(data) {
    const incomes = (data.incomes || []).filter(i => parseFloat(i.amount) > 0);
    const bills   = data.bills || [];
    // Filter to current month only — 90 days of txns ≠ 1 month of spending
    const now = new Date();
    const txns = (data.transactions || []).filter(t => {
      if(t.amount <= 0) return false; // expenses are positive
      if(!t.date) return false;
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
    const monthlyBills    = bills.reduce((s,b) => s + parseFloat(b.amount||0), 0);
    // monthlySpend: this month's transactions excluding transfers, income, fees, and credit card payments
    // Credit card payments must be excluded — they are not spending, they are liability settlement.
    // If included, paying a $3,000 Amex bill would show as $3,000 of "spending" on top of the
    // underlying purchases already counted.
    const monthlySpend    = txns.filter(t =>
      t.cat !== "Transfer" &&
      t.cat !== "Income" &&
      t.cat !== "Fees" &&
      !CC_PAYMENT_KEYWORDS.some(kw => (t.name||"").toLowerCase().includes(kw))
    ).reduce((s,t) => s + t.amount, 0) || monthlyIncome * 0.68;
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
      .filter(a => ["savings","checking","depository"].includes(a.type))
      .reduce((s,a) => s + parseFloat(a.balance||0), 0) || 0;
    return totalExpenses > 0 ? liquidSavings / totalExpenses : 0;
  },

  /** Average daily spend from transaction history */
  avgDailySpend(data) {
    const txns = (data.transactions || []).filter(t =>
      t.amount > 0 &&
      t.cat !== "Transfer" &&
      t.cat !== "Income" &&
      t.cat !== "Fees"
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
    const billingMonth = currentBillingMonth();
    const upcomingBills = bills
      .filter(b => {
        if(b.paidMonth === billingMonth) return false; // paid this month — exclude
        const dueDay = parseInt(b.date);
        if(!dueDay) return false;
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
        if(b.paidMonth === billingMonth) return false; // paid — don't show as upcoming
        const dueDay = parseInt(b.date);
        if(!dueDay) return false;
        const thisMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), dueDay);
        const nextMonth = new Date(todayDate.getFullYear(), todayDate.getMonth()+1, dueDay);
        return (thisMonth >= todayDate && thisMonth <= in10Days) ||
               (nextMonth >= todayDate && nextMonth <= in10Days);
      }),
    };
  }
};

// ─── RRSP ROOM ENGINE ────────────────────────────────────────────────────────
// Calculates RRSP contribution room, remaining room, estimated refund,
// and over-contribution risk. Canadian users only.

const RRSP_ANNUAL_LIMIT = 32490; // 2025

// Simplified Canadian marginal tax rates by province + income bracket
// Returns combined federal + provincial marginal rate
const getCanadianMarginalRate = (annualIncome, province = "ON") => {
  const inc = parseFloat(annualIncome) || 0;
  // Federal brackets 2025 (simplified)
  let fed = 0.205; // default 20.5%
  if(inc > 246752) fed = 0.33;
  else if(inc > 173205) fed = 0.29;
  else if(inc > 111733) fed = 0.26;
  else if(inc > 57375)  fed = 0.205;
  else fed = 0.15;

  // Provincial surtax (simplified top brackets per province)
  const provRates = {
    ON: inc > 102894 ? 0.1316 : inc > 51446 ? 0.0915 : 0.0505,
    BC: inc > 113158 ? 0.1670 : inc > 85650 ? 0.1490 : 0.0770,
    AB: 0.10, // flat
    QC: inc > 119910 ? 0.2575 : inc > 51780 ? 0.20 : 0.14,
    MB: inc > 100000 ? 0.1750 : inc > 36842 ? 0.1275 : 0.1080,
    SK: inc > 145955 ? 0.1450 : inc > 49720 ? 0.1275 : 0.105,
    NS: inc > 150000 ? 0.21 : inc > 93000 ? 0.1900 : 0.0879,
    NB: inc > 185064 ? 0.2030 : inc > 47715 ? 0.1482 : 0.0940,
    PE: inc > 105000 ? 0.1800 : inc > 32656 ? 0.1580 : 0.0965,
    NL: inc > 260000 ? 0.2100 : inc > 72000 ? 0.1580 : 0.0870,
  };
  const prov = provRates[province] || provRates.ON;
  return Math.min(0.54, fed + prov); // cap at 54%
};

const RRSPRoomEngine = {
  calculate(data) {
    const ret         = data.profile?.retirement || {};
    const profile     = data.profile || {};
    const province    = profile.province || "ON";
    const isCA        = (profile.country || "CA") === "CA";
    if(!isCA) return null;

    // ── Inputs ──────────────────────────────────────────────────────────────
    // Room from CRA/NOA — the number on your notice of assessment
    const roomFromCRA     = parseFloat(ret.rrspRoom || 0);
    // What you've contributed so far this year
    const contribThisYear = parseFloat(ret.rrspContribThisYear || 0);
    // Last year's earned income — used to calculate new room earned this year
    const prevIncome      = parseFloat(ret.rrspPrevIncome || 0);
    // Current RRSP balance (already entered)
    const balance         = parseFloat(ret.rrspBalance || 0);
    // Monthly contribution (already entered)
    const monthly         = parseFloat(ret.rrspMonthly || 0);

    // ── New room earned this year (18% of last year's earned income) ────────
    const newRoomThisYear = prevIncome > 0
      ? Math.min(prevIncome * 0.18, RRSP_ANNUAL_LIMIT)
      : 0;

    // ── Total available room ─────────────────────────────────────────────────
    // If user entered CRA room, use it (it already includes carry-forward + this year's new room)
    // If not, estimate from prevIncome only
    const totalRoom = roomFromCRA > 0 ? roomFromCRA : newRoomThisYear;
    const remainingRoom = Math.max(0, totalRoom - contribThisYear);
    const isOverContrib = contribThisYear > totalRoom + 2000; // $2k lifetime buffer

    // ── Estimated tax refund ──────────────────────────────────────────────────
    const annualIncome    = parseFloat(data.incomes?.[0] && data.incomes[0].amount
      ? data.incomes[0].amount * 2.167 * 12 / 12
      : 0) || 0;
    const incomeForRate   = annualIncome || prevIncome || 0;
    const marginalRate    = getCanadianMarginalRate(incomeForRate, province);
    // Refund if they contribute the full remaining room
    const maxRefund       = Math.round(remainingRoom * marginalRate);
    // Refund per $1,000 contributed
    const refundPer1k     = Math.round(1000 * marginalRate);

    // ── How many years of monthly contribs to fill room ─────────────────────
    const monthsToFill = monthly > 0 ? Math.ceil(remainingRoom / monthly) : null;

    // ── Usage percentage ─────────────────────────────────────────────────────
    const usagePct = totalRoom > 0 ? Math.min(100, Math.round(contribThisYear / totalRoom * 100)) : 0;

    return {
      roomFromCRA, contribThisYear, prevIncome,
      newRoomThisYear, totalRoom, remainingRoom,
      isOverContrib, marginalRate, maxRefund,
      refundPer1k, monthsToFill, usagePct,
      hasCRAData: roomFromCRA > 0,
      hasEnoughData: roomFromCRA > 0 || prevIncome > 0,
    };
  }
};

// ─── BILL STATUS ENGINE ──────────────────────────────────────────────────────
// paidMonth: "YYYY-MM" stored on a bill when user (or auto-detect) marks it paid.
// Auto-resets every month — no cleanup logic needed.

const currentBillingMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};

// Returns "paid" | "overdue" | "upcoming"
const getBillStatus = (bill) => {
  const month = currentBillingMonth();
  if(bill.paidMonth === month) return "paid";
  const today = new Date().getDate();
  const dueDay = parseInt(bill.date||0);
  if(dueDay > 0 && dueDay < today) return "overdue";
  return "upcoming";
};

// Auto-detect paid bills from transactions — fuzzy name match + amount within 15%
const autoDetectPaidBills = (bills, transactions) => {
  if(!bills?.length || !transactions?.length) return bills;
  const month = currentBillingMonth();
  const now = new Date();
  const monthTxns = transactions.filter(t => {
    if(!t.date) return false;
    const d = new Date(t.date + "T12:00:00");
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && t.amount > 0;
  });
  // Generic payment keywords — e-transfers, withdrawals, and auto-debits
  // often have names that don't match the bill name at all
  const GENERIC_PAYMENT_WORDS = ["e-transfer","interac","withdrawal","autopay","auto pay",
    "preauthorized","pre-auth","direct debit","automatic payment","auto-debit","bill payment"];
  return bills.map(bill => {
    if(bill.paidMonth === month) return bill;
    const billAmt  = parseFloat(bill.amount||0);
    const billName = (bill.name||"").toLowerCase().trim();
    // Already matched an earlier bill with this exact txn? Track used txn IDs to avoid double-match
    const matched = monthTxns.find(t => {
      const txnName = (t.name||"").toLowerCase();
      const txnAmt  = parseFloat(t.amount||0);
      if(billAmt <= 0 || txnAmt <= 0) return false;
      // Tight amount match: within 5% — amount is the most reliable signal
      const tightAmt = Math.abs(txnAmt - billAmt) / billAmt < 0.05;
      // Loose amount match: within 15%
      const looseAmt = Math.abs(txnAmt - billAmt) / billAmt < 0.15;
      // Name match: bill name appears in transaction or vice versa (first 4 chars min)
      const nameMatch = billName.length >= 3 && (
        txnName.includes(billName.slice(0,4)) ||
        billName.includes(txnName.slice(0,4))
      );
      // Generic payment: e-transfer or auto-debit keywords — amount alone is enough
      const isGenericPayment = GENERIC_PAYMENT_WORDS.some(kw => txnName.includes(kw));
      // Match if: tight amount alone, OR loose amount + name, OR tight amount + generic payment
      return tightAmt || (looseAmt && nameMatch) || (tightAmt && isGenericPayment) || (looseAmt && isGenericPayment && tightAmt);
    });
    if(matched) return {...bill, paidMonth: month};
    return bill;
  });
};

// ── ENGINE 3: 90-DAY CASH FLOW FORECAST ENGINE ────────────────────────────────
// Projects daily balance for 90 days with overdraft risk detection.

const ForecastEngine = {
  generate(data, days = 90) {
    const { balance }       = SafeSpendEngine.calculate(data);
    const { monthlyIncome } = FinancialCalcEngine.cashFlow(data);
    const billingMonth      = currentBillingMonth();
    const avgDaily          = FinancialCalcEngine.avgDailySpend(data);
    const bills             = data.bills || [];
    const today             = new Date();
    const todayNum          = today.getDate();

    let running = balance;
    const forecast = [];
    const overdraftRisk = [];
    const lowBalanceWarnings = [];

    // Compute pay schedule — use primary income source for frequency,
    // but calculate actual deposit amounts per income source correctly.
    // This fixes the bug where monthlyIncome (full month) was shown instead
    // of the actual deposit amount per paycheck.
    const incomes = (data.incomes||[]).filter(i=>parseFloat(i.amount)>0);
    const primaryIncome = incomes[0];
    const primaryFreq = primaryIncome?.freq || "biweekly";
    // Per-paycheque amount for each income source
    const perPaycheque = (inc) => {
      const amt = parseFloat(inc.amount||0);
      const f = inc.freq||"biweekly";
      // amt is already the per-paycheque amount for most freq types
      // EXCEPT monthly — convert to per-deposit
      if(f==="monthly")     return amt;      // paid once per month
      if(f==="semimonthly") return amt;      // paid twice per month
      if(f==="biweekly")    return amt;      // already per paycheck
      if(f==="weekly")      return amt;      // already per week
      return amt;
    };
    // Primary income deposit amount
    // If no income entered: paycheque=0, no simulated paydays (avoids phantom deposits)
    const paycheque = primaryIncome ? perPaycheque(primaryIncome) : 0;
    const hasRealIncome = incomes.length > 0;
    // Secondary incomes on monthly schedule (e.g. CCB, rental income)
    const secondaryMonthly = incomes.slice(1).filter(i=>i.freq==="monthly"||i.freq==="semimonthly");
    const getIsPayday = (dayNum,i) => {
      if(i===0) return false;
      if(!hasRealIncome) return false; // no income entered → no simulated paydays
      if(primaryFreq==="monthly")     return dayNum===1;
      if(primaryFreq==="semimonthly") return dayNum===1||dayNum===15;
      if(primaryFreq==="biweekly")    return i%14===0;
      if(primaryFreq==="weekly")      return i%7===0;
      return dayNum===1||dayNum===15;
    };
    const getSecondaryIncome = (dayNum) => {
      // Monthly secondary incomes hit on the 1st
      return secondaryMonthly.filter(i=>{
        if(i.freq==="monthly") return dayNum===1;
        if(i.freq==="semimonthly") return dayNum===1||dayNum===15;
        return false;
      }).reduce((s,i)=>s+perPaycheque(i),0);
    };

    for (let i = 0; i <= days; i++) {
      const d = new Date(today); d.setDate(todayNum + i);
      const dayNum  = d.getDate();
      const isPayday = getIsPayday(dayNum, i);
      const dayBills = bills.filter(b => {
        const bd = parseInt(b.date);
        if(bd !== dayNum || bd <= 0) return false;
        // Skip paid bills for the current month in today's forecast
        if(i === 0 && b.paidMonth === billingMonth) return false;
        return true;
      });
      const inc  = (isPayday ? paycheque : 0) + getSecondaryIncome(dayNum);
      // Day 0 = today: balance is already current, don't deduct spending again
      // All other days: deduct daily spend regardless of payday (you still spend on paydays)
      const dailySpend = i === 0 ? 0 : avgDaily; // full spend — 0.8 discount was masking real overdraft risk
      const out  = dayBills.reduce((s,b) => s + parseFloat(b.amount||0), 0) + dailySpend;
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
    const _behCatOv = (() => { try { return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}"); } catch { return {}; } })();
    const _getBehCat = (t) => _behCatOv[t.id] || t.cat;
    const subTxns  = txns.filter(t => _getBehCat(t) === "Subscriptions");
    const subTotal = subTxns.reduce((s,t) => s + Math.abs(t.amount), 0);
    if (subTxns.length >= 3 && subTotal > 35) {
      insights.push({
        type:"warning", icon:"📱", priority:"medium", color: C.teal,
        title:"Subscription creep detected",
        body:`${subTxns.length} recurring subscriptions totalling $${(subTotal||0).toFixed(0)}/mo${income>0?`. That's ${Math.round(subTotal/income*100)}% of your income`:""}.`,
        saving: `$${Math.round(subTotal * 0.35)}/mo potential saving`
      });
    }

    // ③ Dining / delivery inflation
    const diningTxns  = txns.filter(t => ["Food","Coffee","Dining","Coffee & Dining"].includes(_getBehCat(t)));
    const diningTotal = diningTxns.reduce((s,t) => s + Math.abs(t.amount), 0);
    if (diningTotal > income * 0.18) {
      insights.push({
        type:"pattern", icon:"🍔", priority:"medium", color: C.gold,
        title:"Food spending above benchmark",
        body:`Food & dining is $${diningTotal.toFixed(0)}/mo${income>0?` — ${Math.round(diningTotal/income*100)}% of income`:``}. Benchmark is under 15%.`,
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
    } else if (freq === "semimonthly") {
      // Twice a month: 1st and 15th
      daysLeft = todayNum < 15 ? (15 - todayNum) : (new Date(today.getFullYear(), today.getMonth()+1, 1) - today) / 86400000;
    } else {
      // Monthly: next 1st
      daysLeft = Math.ceil((new Date(today.getFullYear(), today.getMonth()+1, 1) - today) / 86400000);
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




// ─── DASHBOARD TILE REGISTRY ──────────────────────────────────────────────────
const DASH_TILES = [
  {id:"today_move", label:"Today's Move"},
  { id: 'networth',    label: 'Net Worth Trend',    icon: '📈' },
  { id: 'decision',   label: 'Decision Engine',     icon: '🧠' },
  { id: 'autopilot',  label: 'Autopilot',           icon: '✈️' },
  { id: 'forecast',   label: 'Cash Flow Forecast',  icon: '📅' },
  { id: 'opportunity',label: 'Opportunities',       icon: '💡' },
  { id: 'health',     label: 'Health Score',        icon: '💚' },
  { id: 'credit',     label: 'Credit Score',        icon: '💳' },
  { id: 'quicknav',   label: 'Quick Navigation',    icon: '⚡' },
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

// ─── DASH CUSTOMIZE SHEET ─────────────────────────────────────────────────────
function DashCustomize({ layout, onChange, onClose }) {
  const [items, setItems] = useState(layout);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const save = () => { onChange(items); onClose(); };
  const toggle = (id) => setItems(prev => prev.map(t => t.id===id ? {...t, visible:!t.visible} : t));
  const toggleLock = (id) => setItems(prev => prev.map(t => t.id===id ? {...t, locked:!t.locked} : t));
  const onDragStart = (id) => setDragging(id);
  const onDragEnter = (id) => {
    if (!dragging || dragging === id) return;
    // Don't move locked tiles
    const dragItem = items.find(t=>t.id===dragging);
    const targetItem = items.find(t=>t.id===id);
    if(dragItem?.locked || targetItem?.locked) return;
    setDragOver(id);
    setItems(prev => {
      const from = prev.findIndex(t=>t.id===dragging);
      const to   = prev.findIndex(t=>t.id===id);
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  };
  const onDragEnd = () => { setDragging(null); setDragOver(null); };
  const meta = id => DASH_TILES.find(t=>t.id===id)||{label:id,icon:'□'};

  return (
    <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex',alignItems:'flex-end',justifyContent:'center',background:'rgba(0,0,0,0.55)',backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div style={{width:'100%',maxWidth:430,background:C.card,borderRadius:'24px 24px 0 0',maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 -8px 48px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,borderRadius:99,background:C.border,margin:'0 auto 20px'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div style={{color:C.cream,fontWeight:800,fontSize:18,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Customize Dashboard</div>
          <span style={{color:C.muted,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Drag ☰ to reorder · tap 🔓 to lock</span>
        </div>
        </div>
        <div style={{overflowY:'auto',flex:1,paddingBottom:8}}>
        {items.map(tile => {
          const m = meta(tile.id);
          return (
            <div key={tile.id}
              draggable={!tile.locked}
              onDragStart={()=>!tile.locked&&onDragStart(tile.id)}
              onDragEnter={()=>onDragEnter(tile.id)}
              onDragEnd={onDragEnd}
              style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:14,marginBottom:8,
                background: dragOver===tile.id ? C.green+'14' : tile.locked ? C.gold+'08' : C.cardAlt,
                border:`1px solid ${tile.locked ? C.gold+'44' : tile.visible ? C.green+'33' : C.border}`,
                cursor:tile.locked?'default':'grab',transition:'all .15s',opacity:tile.visible?1:0.5}}>
              <span style={{fontSize:18,cursor:tile.locked?'default':'grab',color:tile.locked?C.gold:C.muted,userSelect:'none'}}>{tile.locked?'📌':'☰'}</span>
              <span style={{fontSize:20}}>{m.icon}</span>
              <div style={{flex:1,color:C.cream,fontWeight:600,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{m.label}</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>toggleLock(tile.id)} title={tile.locked?"Unlock":"Lock position"}
                  style={{background:tile.locked?C.gold+'22':'transparent',border:`1px solid ${tile.locked?C.gold+'55':C.border}`,borderRadius:10,width:44,height:44,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                  {tile.locked?'🔒':'🔓'}
                </button>
                <div onClick={()=>toggle(tile.id)}
                  style={{width:40,height:22,borderRadius:99,background:tile.visible?C.green:'rgba(255,255,255,0.08)',border:`1px solid ${tile.visible?C.green:C.border}`,position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
                  <div style={{position:'absolute',top:2,left:tile.visible?20:2,width:16,height:16,borderRadius:'50%',background:'white',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}/>
                </div>
              </div>
            </div>
          );
        })}
        </div>
        <div style={{padding:'0 0 8px',flexShrink:0}}>
        <button onClick={save} style={{width:'100%',background:`linear-gradient(135deg,${C.green},${C.greenBright})`,border:'none',borderRadius:14,padding:'14px',color:'#fff',fontWeight:800,fontSize:15,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:'pointer',marginTop:8}}>Save Layout</button>
        <button onClick={()=>{setItems(DASH_TILES.map(t=>({id:t.id,visible:true})));}} style={{width:'100%',background:'none',border:'none',color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:'pointer',marginTop:8,padding:'6px'}}>Reset to default</button>
      </div>
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function Onboarding({onComplete,onViewLegal,userId}){
  const [step,setStep]=useState(0);
  const [p,setP]=useState({name:"",country:"CA",province:"ON",status:"single",hasKids:false,partnerName:"",creditScore:680,creditKnown:false,lifeStages:["employed"]});
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
  const finish=()=>{
    const filteredBills = bills.filter(b=>b.name&&b.amount);
    const filteredTxns  = plaidTxns.length ? plaidTxns : [];
    onComplete({profile:p,incomes:incomes.filter(i=>i.amount),bills:autoDetectPaidBills(filteredBills, filteredTxns),debts:debts.filter(d=>d.name&&d.balance),accounts:connAccts,transactions:filteredTxns,bankConnected:connAccts.some(a=>a.institution!=="Manual")});
  };

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

      <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:14}}>Free to start · Available in 🇨🇦 Canada & 🇺🇸 USA</div>

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
      <div style={{color:C.muted,fontSize:14,marginBottom:20,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Just the basics. Everything stays on your device.</div>
      <Inp label="First Name" value={p.name} onChange={v=>setP({...p,name:v})} placeholder="First name"/>
      <Sel label="Country" value={p.country} onChange={v=>setP({...p,country:v,province:v==="CA"?"ON":"CA"})} options={[{value:"CA",label:"🇨🇦 Canada"},{value:"US",label:"🇺🇸 United States"}]}/>
      <Sel label={p.country==="CA"?"Province":"State"} value={p.province} onChange={v=>setP({...p,province:v})}
        options={p.country==="CA"?[{value:"ON",label:"Ontario"},{value:"BC",label:"British Columbia"},{value:"AB",label:"Alberta"},{value:"QC",label:"Quebec"},{value:"MB",label:"Manitoba"},{value:"OTHER",label:"Other"}]:[{value:"CA",label:"California"},{value:"TX",label:"Texas"},{value:"NY",label:"New York"},{value:"FL",label:"Florida"},{value:"OTHER",label:"Other"}]}/>
      <Sel label="Relationship Status" value={p.status} onChange={v=>setP({...p,status:v})} options={[{value:"single",label:"Single"},{value:"couple",label:"Married"},{value:"cohabit",label:"Common Law"}]}/>
      {p.status!=="single"&&<Inp label="Partner's Name (optional)" value={p.partnerName} onChange={v=>setP({...p,partnerName:v})} placeholder="Partner's first name"/>}
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:8,fontWeight:700}}>Do you have kids?</div>
        <div style={{display:"flex",gap:10}}>
          {["Yes","No"].map(opt=><button key={opt} onClick={()=>setP({...p,hasKids:opt==="Yes"})} style={{flex:1,background:(opt==="Yes"?p.hasKids:!p.hasKids)?C.green+"33":C.cardAlt,border:`1px solid ${(opt==="Yes"?p.hasKids:!p.hasKids)?C.green:C.border}`,color:(opt==="Yes"?p.hasKids:!p.hasKids)?C.greenBright:C.muted,borderRadius:12,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:"inherit"}}>{opt}</button>)}
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.4,marginBottom:4,fontWeight:700}}>Which best describes you?</div>
        <div style={{color:C.muted,fontSize:11,marginBottom:10}}>Select all that apply</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {[["💼","employed","Employed"],["🎓","student","Student"],["🧾","selfemployed","Self-Employed"],["🏛️","senior","Senior (65+)"],["🌅","retired","Retired"],["➕","other","Other"]].map(([emoji,val,label])=>{
            const selected=(p.lifeStages||[]).includes(val);
            const toggle=()=>{
              const cur=p.lifeStages||[];
              const next=selected?cur.filter(v=>v!==val):[...cur,val];
              setP({...p,lifeStages:next.length>0?next:["other"]});
            };
            return(
              <button key={val} onClick={toggle} style={{background:selected?C.green+"33":C.cardAlt,border:`1px solid ${selected?C.green:C.border}`,color:selected?C.greenBright:C.muted,borderRadius:12,padding:"10px 14px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,transition:"all .15s"}}>
                <span style={{fontSize:15}}>{emoji}</span>
                {label}
                {selected&&<span style={{fontSize:10,opacity:0.8}}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>
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
          : "Add every source of income — employment, freelance, benefits, rental, your partner's pay. We map it all."}
      </div>
      {incomes.map((inc,i)=>(
        <div key={inc.id} style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.border}`,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{color:C.cream,fontWeight:700,fontSize:14}}>{inc.label||`Income Source ${i+1}`}</div>
              {inc.autoDetected&&<span style={{background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:99,padding:"2px 8px",color:C.greenBright,fontSize:10,fontWeight:700}}>Auto-detected ✓</span>}
            </div>
            {incomes.length>1&&<button onClick={()=>setIncomes(incomes.filter(x=>x.id!==inc.id))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:0}}>×</button>}
          </div>
          <div style={{marginBottom:10}}>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>Label</div>
            <input value={inc.label} onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,label:e.target.value}:x))}
              placeholder="e.g. Full-time job, Freelance"
              style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.cream,fontSize:14,fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          {/* Variable income — auto flag or manual toggle */}
          {/* Income amount — single field only. App calculates everything else. */}
          {inc.autoDetected ? (
            // Bank connected — show detected amount, allow adjustment
            <div style={{marginBottom:10}}>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>
                {inc.isVariable ? "Average Monthly Take-Home" : "Monthly Take-Home (detected)"}
              </div>
              <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.green}44`,borderRadius:10,overflow:"hidden"}}>
                <span style={{color:C.muted,padding:"0 10px",fontSize:14}}>$</span>
                <input value={inc.amount} onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,amount:e.target.value,typicalAmount:e.target.value}:x))}
                  type="number"
                  style={{flex:1,background:"none",border:"none",padding:"10px 12px 10px 0",color:C.greenBright,fontSize:16,fontFamily:"inherit",outline:"none",fontWeight:700}}/>
                <span style={{color:C.green,fontSize:11,fontWeight:700,paddingRight:10}}>Auto ✓</span>
              </div>
              {inc.isVariable&&<div style={{color:C.muted,fontSize:11,marginTop:6}}>📊 Income varies — we detected your range and will use it for planning.</div>}
            </div>
          ) : (
            // No bank — ask for last paycheque only
            <div style={{marginBottom:10}}>
              <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>Your Last Paycheque (take-home)</div>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                    <span style={{color:C.muted,padding:"0 10px",fontSize:14}}>$</span>
                    <input value={inc.amount} onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,amount:e.target.value}:x))}
                      type="number" placeholder="e.g. 2100"
                      style={{flex:1,background:"none",border:"none",padding:"10px 12px 10px 0",color:C.cream,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
                  </div>
                </div>
                <div style={{flex:1}}>
                  <select value={inc.freq} onChange={e=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,freq:e.target.value}:x))}
                    style={{width:"100%",height:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.cream,fontSize:13,fontFamily:"inherit"}}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="semimonthly">Twice a month</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10}}>
                <div style={{color:C.muted,fontSize:11}}>Income varies month to month?</div>
                <button onClick={()=>setIncomes(incomes.map(x=>x.id===inc.id?{...x,isVariable:!inc.isVariable}:x))}
                  style={{width:44,height:24,borderRadius:99,background:inc.isVariable?C.green:C.cardAlt,border:`1px solid ${inc.isVariable?C.green:C.border}`,cursor:"pointer",position:"relative",transition:"all .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:2,left:inc.isVariable?22:2,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"all .2s"}}/>
                </button>
              </div>
              {inc.isVariable&&<div style={{color:C.muted,fontSize:11,marginTop:6,lineHeight:1.5}}>💡 No problem — enter your typical paycheque. We'll use it for planning and adjust as we learn your patterns.</div>}
            </div>
          )}
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
  // Load custom category overrides so notifications reflect user's own category names
  const notifCatOverrides = (() => { try { return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}"); } catch { return {}; } })();
  const getNotifCat = (t) => notifCatOverrides[t.id] || t.cat || "Spend";

  // Overdue bills — past due date, not paid this month
  // Re-run auto-detect inline using current transactions in case background refresh hasn't run
  const txnsForDetect = data?.transactions || [];
  const billsWithAutoDetect = autoDetectPaidBills(bills, txnsForDetect);
  const overdueBills = billsWithAutoDetect.filter(b => getBillStatus(b) === "overdue");
  overdueBills.forEach((b, i) => {
    notifs.push({
      id: `overdue_${i}`,
      icon: "calendar",
      title: `${b.name} is overdue`,
      body: `$${parseFloat(b.amount||0).toFixed(2)} was due on the ${b.date}${["th","st","nd","rd"][parseInt(b.date)%10]||"th"} — mark as paid once you've paid it.`,
      read: false,
      time: "Overdue",
      type: "bill",
      color: NOTIF_COLORS.urgent,
    });
  });

  // Bill due soon notifications — use auto-detected bill state (same as overdue check)
  billsWithAutoDetect.filter(b=>b.name&&b.amount&&getBillStatus(b)!=="paid").forEach((b,i) => {
    const dueDay = parseInt(b.date||0);
    if(!dueDay) return;
    const daysUntil = dueDay >= todayDate ? dueDay - todayDate : (30 - todayDate + dueDay);
    if(daysUntil <= 5) {
      const covers = balance >= parseFloat(b.amount||0);
      notifs.push({
        id: `bill_${i}`,
        icon:"calendar",
        title:`${b.name} due in ${daysUntil === 0 ? "today" : daysUntil + " day" + (daysUntil===1?"":"s")}`,
        body:`$${parseFloat(b.amount||0).toFixed(2)}. ${covers ? "Your balance covers it — you're good." : "You may want to transfer funds before this hits."}`,
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

  // RRSP room reminder — fire once in Q1 (Jan-Mar) if significant room unused
  const rrspCalcNotif = RRSPRoomEngine.calculate(data);
  if(rrspCalcNotif?.remainingRoom > 1000 && rrspCalcNotif?.maxRefund > 200) {
    const isQ1 = today.getMonth() < 3; // Jan, Feb, Mar — RRSP deadline season
    const rrspNotifKey = `flourish_rrsp_notif_${today.getFullYear()}`;
    const rrspNotifShown = (() => { try { return localStorage.getItem(rrspNotifKey) === "1"; } catch { return false; } })();
    if(isQ1 && !rrspNotifShown) {
      notifs.push({
        id: `rrsp_room_${today.getFullYear()}`,
        icon: "trending-up",
        title: `$${rrspCalcNotif.remainingRoom.toLocaleString()} RRSP room before March 1`,
        body: `RRSP deadline is March 1. Contributing your remaining room could return ~$${rrspCalcNotif.maxRefund.toLocaleString()} at tax time.`,
        read: false,
        time: "RRSP Season",
        type: "opportunity",
        color: NOTIF_COLORS.opportunity,
      });
    }
  }

  // Large transaction alerts
  // Fires when a single transaction is 3× the user's average OR > $200 AND no prior alert this month
  const txns = data?.transactions || [];
  const today_ym = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const monthTxns = txns.filter(t => {
    if(!t.date || t.amount <= 0) return false;
    const d = new Date(t.date + "T12:00:00");
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  });
  if(monthTxns.length >= 3) {
    const avgSpend = monthTxns.reduce((s,t) => s + t.amount, 0) / monthTxns.length;
    const LARGE_THRESHOLD = Math.max(200, avgSpend * 3);
    const alerted = (() => { try { return new Set(JSON.parse(localStorage.getItem("flourish_alerted_txns")||"[]")); } catch { return new Set(); } })();
    // CC payment keywords — these are not unusual spend, never alert on them
    const CC_ALERT_EXCLUDE = ["payment","autopay","amex","visa","mastercard","credit card",
      "card payment","minimum payment","balance payment","loc pay","line of credit",
      "customer transfer","mb-cr","mb-credit","bill payment"];
    // Bill amounts — transactions matching a known bill are bill payments, not unusual spend
    const billAmounts = bills.map(b => parseFloat(b.amount||0)).filter(a => a > 0);
    const isBillPayment = (txnAmt) => billAmounts.some(ba => Math.abs(txnAmt - ba) / ba < 0.10);
    const largeTxns = monthTxns
      .filter(t => {
        if(t.amount < LARGE_THRESHOLD) return false;
        if(alerted.has(t.id)) return false;
        // Exclude CC payments
        const name = (t.name||"").toLowerCase();
        if(CC_ALERT_EXCLUDE.some(kw => name.includes(kw))) return false;
        // Exclude transactions the user categorized as Bills or Transfer
        const cat = getNotifCat(t);
        if(cat === "Bills" || cat === "Transfer") return false;
        // Exclude transactions matching a known bill amount
        if(isBillPayment(t.amount)) return false;
        return true;
      })
      .sort((a,b) => b.amount - a.amount)
      .slice(0, 3);
    largeTxns.forEach(t => {
      const multiple = (t.amount / avgSpend).toFixed(1);
      const catLabel = getNotifCat(t); // uses custom categories
      notifs.push({
        id: `large_txn_${t.id}`,
        icon: "alert-circle",
        title: `Large ${catLabel} — $${t.amount.toFixed(0)}`,
        body: `${t.name} was ${multiple}× your usual transaction size. Is this expected? If not, check your account.`,
        read: false,
        time: t.date || "Recently",
        type: "behavior",
        color: NOTIF_COLORS.behavior,
      });
    });
  }

  // Shortfall alert — safe-to-spend went negative this month
  const { safeAmount, overdraft: isOverdraft } = SafeSpendEngine.calculate(data);
  const shortfallKey = `flourish_shortfall_${today_ym}`;
  const shortfallAlerted = (() => { try { return localStorage.getItem(shortfallKey) === "1"; } catch { return false; } })();
  if(isOverdraft && !shortfallAlerted) {
    notifs.push({
      id: `shortfall_${today_ym}`,
      icon: "trending-down",
      title: "Upcoming bills exceed your balance",
      body: `You have bills due soon that your balance can't cover. Tap to see exactly which ones and when.`,
      read: false,
      time: "Now",
      type: "urgent",
      color: NOTIF_COLORS.urgent,
    });
  }

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
      <div key={n.id} onClick={()=>{
        setReadIds(ids=>{ const s=new Set(ids); s.add(n.id); try{localStorage.setItem("flourish_read_notifs",JSON.stringify([...s]));}catch{} return s; });
        // Mark large-txn alerts as seen so they don't re-appear
        if(n.id.startsWith("large_txn_")) {
          try {
            const txnId = n.id.replace("large_txn_","");
            const prev = new Set(JSON.parse(localStorage.getItem("flourish_alerted_txns")||"[]"));
            prev.add(txnId);
            localStorage.setItem("flourish_alerted_txns", JSON.stringify([...prev]));
          } catch {}
        }
        if(n.id.startsWith("shortfall_")) {
          try { localStorage.setItem(n.id.replace("shortfall_","flourish_shortfall_"), "1"); } catch {}
        }
      }}
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
      const updatedTxns = normalisedTxns.length > 0 ? normalisedTxns : prev.transactions;
      const updatedBills = autoDetectPaidBills(prev.bills||[], updatedTxns);
      return {
        ...prev,
        accounts: freshAccounts,
        transactions: updatedTxns,
        bills: updatedBills,
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:999,display:"flex",alignItems:"flex-end",backdropFilter:"blur(4px)"}}
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
  const totalDebt=(data.debts||[]).reduce((a,d)=>a+parseFloat(d.balance||0),0);
  const netWorth=bal+((data?.accounts||[]).filter(a=>a.type==="savings"||a.type==="investment").reduce((s,a)=>s+(a.balance||0),0))-totalDebt;
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
  // 7-day forecast — must be declared BEFORE heroColor uses sevenDayOverdraft
  const { overdraftRisk: sevenDayRisk, willGoNegative: sevenDayOverdraft } = ForecastEngine.generate(data, 7);
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
  const allBills = data.bills||[];
  const paidCount = allBills.filter(b=>getBillStatus(b)==="paid").length;
  const overdueCount = allBills.filter(b=>getBillStatus(b)==="overdue").length;
  const isPayday   = today===15||today===1; // simple heuristic
  // Combined overdraft signal (placeholder — sevenDayOverdraft declared above now)
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
              const billSummaryLine = (() => {
                if(!allBills.length) return null;
                if(overdueCount > 0) return { text: `${overdueCount} bill${overdueCount>1?"s":""} overdue`, color: C.red };
                if(paidCount === allBills.length) return { text: `All ${allBills.length} bills paid ✓`, color: C.green };
                if(paidCount > 0) return { text: `${paidCount} of ${allBills.length} bills paid`, color: C.muted };
                return null;
              })();
              return (
                <div style={{marginBottom:14}}>
                  <div style={{color:heroColorBright+"66",fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:0.2,lineHeight:1.5}}>
                    {proofLine} → <strong style={{color:heroColorBright+"99"}}>${Math.max(0,safe).toFixed(0)} today</strong>
                  </div>
                  {billSummaryLine&&(
                    <div style={{color:billSummaryLine.color,fontSize:10,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4,letterSpacing:0.3}}>
                      {billSummaryLine.text}
                    </div>
                  )}
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

        {/* ── BENTO ROW 1: 3 mini stat tiles inside 2-col span ──────────── */}
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

        {/* ── HEALTH + STREAK — 2-col row ─────────────────────────────────── */}
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

        </div>{/* end health+streak 2-col */}
        {/* ── SINGLE VOICE: priority-filtered action tile ──────────────────
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

          // Priority 1.5 — overdue bill (past due, not paid)
          if (overdueCount > 0) {
            const overdueBill = allBills.find(b=>getBillStatus(b)==="overdue");
            return (
              <div style={{...anim(170),background:"rgba(255,79,106,0.08)",border:`1px solid ${C.red}44`,borderRadius:20,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>setScreen("plan")}>
                <div style={{width:44,height:44,borderRadius:14,background:C.red+"18",border:`1px solid ${C.red}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>⚠️</div>
                <div style={{flex:1}}>
                  <div style={{color:C.redBright||C.red,fontWeight:800,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{overdueBill?.name || "A bill"} is overdue</div>
                  <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>{overdueCount > 1 ? `${overdueCount} bills past due` : `$${overdueBill?.amount} past due`} · Mark as paid in Your Bills</div>
                </div>
                <span style={{color:C.red,fontSize:18}}>→</span>
              </div>
            );
          }

          // Priority 1.6 — unusual large transaction this month
          const alertTxns = (() => {
            const now2 = new Date();
            const mt = (data.transactions||[]).filter(t => {
              if(!t.date || t.amount <= 0) return false;
              const d = new Date(t.date + "T12:00:00");
              return d.getFullYear() === now2.getFullYear() && d.getMonth() === now2.getMonth();
            });
            if(mt.length < 3) return [];
            const avg = mt.reduce((s,t)=>s+t.amount,0) / mt.length;
            const threshold = Math.max(200, avg * 3);
            const alerted = (() => { try { return new Set(JSON.parse(localStorage.getItem("flourish_alerted_txns")||"[]")); } catch { return new Set(); } })();
            const dashCatOverrides = (() => { try { return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}"); } catch { return {}; } })();
            const dashGetCat = (t) => dashCatOverrides[t.id] || t.cat || "";
            const CC_DASH_EXCLUDE = ["payment","autopay","amex","visa","mastercard","credit card","loc pay","line of credit","e-transfer","interac"];
            const dashBillAmts = (data.bills||[]).map(b=>parseFloat(b.amount||0)).filter(a=>a>0);
            return mt.filter(t => {
              if(t.amount < threshold || alerted.has(t.id)) return false;
              const name = (t.name||"").toLowerCase();
              if(CC_DASH_EXCLUDE.some(kw=>name.includes(kw))) return false;
              const cat = dashGetCat(t);
              if(cat==="Bills"||cat==="Transfer") return false;
              if(dashBillAmts.some(ba=>Math.abs(t.amount-ba)/ba<0.10)) return false;
              return true;
            }).sort((a,b)=>b.amount-a.amount);
          })();
          if(alertTxns.length > 0) {
            const at = alertTxns[0];
            return (
              <div style={{...anim(170),background:"rgba(255,140,66,0.08)",border:`1px solid ${C.orange}44`,borderRadius:20,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>setScreen("activity")}>
                <div style={{width:44,height:44,borderRadius:14,background:C.orange+"18",border:`1px solid ${C.orange}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>🔔</div>
                <div style={{flex:1}}>
                  <div style={{color:C.orange,fontWeight:800,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Unusual spend — ${at.amount.toFixed(0)}</div>
                  <div style={{color:C.mutedHi,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>{at.name} · {(at.amount / ((() => { const mt2=(data.transactions||[]).filter(t=>{if(!t.date||t.amount<=0)return false;const d=new Date(t.date+"T12:00:00");const n=new Date();return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth();});return mt2.length>0?mt2.reduce((s,t)=>s+t.amount,0)/mt2.length:1;})())).toFixed(1)}× your average · Tap to review</div>
                </div>
                <span style={{color:C.orange,fontSize:18}}>→</span>
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

        {/* ── TODAY'S 1 MOVE ─────────────────────────────────────────────────
             One decisive, tappable action per session.
             Backed by SafeSpendEngine + OpportunityDetector + RRSP engine.
             Only shown when user is fully set up (bank + income).
        ─────────────────────────────────────────────────────────────────── */}
        {isVisible('today_move')&&monthlyIncome>0&&bal>0&&!overdraft&&(()=>{
          // Pick the single best action right now — highest value, lowest friction
          const rrspR = RRSPRoomEngine.calculate(data);
          const hasRRSPRoom = rrspR?.remainingRoom > 500 && rrspR?.maxRefund > 100;
          const topDebt = (data.debts||[]).filter(d=>parseFloat(d.balance||0)>0)
            .sort((a,b)=>parseFloat(b.rate||0)-parseFloat(a.rate||0))[0];
          const hasHighDebt = topDebt && parseFloat(topDebt.rate||0) >= 15;
          const savingsGoal = (data.goals||[]).find(g=>g.name&&parseFloat(g.target||0)>0&&parseFloat(g.saved||0)<parseFloat(g.target||0));
          const extraSafe = Math.max(0, safe - 50); // keep $50 buffer

          // Decision tree — pick one move in priority order
          const move = (() => {
            // 1. High-interest debt — mathematically best ROI
            if(hasHighDebt && extraSafe >= 50) {
              const extra = Math.min(extraSafe, 150);
              const savedInterest = Math.round(extra * parseFloat(topDebt.rate||0) / 100 / 12 * 12);
              return {
                icon: "💳",
                color: C.red,
                title: `Pay extra on ${topDebt.name}`,
                detail: `Add $${extra} to your ${topDebt.rate}% debt → save ~$${savedInterest} in interest this year`,
                cta: "See debt payoff",
                screen: "goals",
                tab: "debt",
                amount: extra,
              };
            }
            // 2. RRSP room — tax refund is guaranteed return
            if(hasRRSPRoom && extraSafe >= 100) {
              const contrib = Math.min(extraSafe, 500);
              const refund = Math.round(contrib * rrspR.marginalRate);
              return {
                icon: "🏦",
                color: "#2E8B2E",
                title: "Contribute to your RRSP",
                detail: `Put $${contrib} in your RRSP today → get ~$${refund} back at tax time`,
                cta: "See RRSP room",
                screen: "goals",
                tab: "retire",
                amount: contrib,
              };
            }
            // 3. Active savings goal
            if(savingsGoal && extraSafe >= 25) {
              const contrib = Math.min(extraSafe, parseFloat(savingsGoal.monthly||50)||50);
              const remaining = parseFloat(savingsGoal.target||0) - parseFloat(savingsGoal.saved||0);
              const months = contrib > 0 ? Math.ceil(remaining / contrib) : null;
              return {
                icon: "🎯",
                color: C.purple,
                title: `Add to ${savingsGoal.name}`,
                detail: `Contribute $${contrib.toFixed(0)} now${months?` → reach your goal in ~${months} month${months===1?"":"s"}`:""}.`,
                cta: "See goals",
                screen: "goals",
                tab: "goals",
                amount: contrib,
              };
            }
            // 4. Build emergency buffer — always valuable
            if(extraSafe >= 25 && monthlyIncome > 0) {
              const target = monthlyIncome * 0.5; // half a month as starter
              return {
                icon: "🛡️",
                color: C.teal,
                title: "Add to your emergency fund",
                detail: `Move $${Math.min(extraSafe, 100).toFixed(0)} to savings today. A buffer stops small surprises from becoming debt.`,
                cta: "See goals",
                screen: "goals",
                tab: "goals",
                amount: Math.min(extraSafe, 100),
              };
            }
            return null;
          })();

          if(!move) return null;

          return (
            <div style={{...anim(185),...tileStyle('today_move')}}>
              <div style={{background:`linear-gradient(135deg,${move.color}12 0%,${C.card} 100%)`,border:`1px solid ${move.color}33`,borderRadius:22,padding:"16px 18px",position:"relative",overflow:"hidden"}}>
                {/* Accent line */}
                <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${move.color},${move.color}44)`}}/>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <div style={{width:44,height:44,borderRadius:14,background:move.color+"18",border:`1px solid ${move.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>
                    {move.icon}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:C.muted,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1.4,marginBottom:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                      Today's move
                    </div>
                    <div style={{color:C.cream,fontWeight:800,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4,lineHeight:1.3}}>
                      {move.title}
                    </div>
                    <div style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.55,marginBottom:12}}>
                      {move.detail}
                    </div>
                    <button onClick={()=>{setScreen(move.screen);}}
                      style={{background:move.color,border:"none",borderRadius:10,padding:"9px 18px",color:move.color==="#2E8B2E"||move.color===C.teal||move.color===C.green?"#fff":"#fff",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"inline-flex",alignItems:"center",gap:6}}>
                      {move.cta} →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

                {/* ── NET WORTH SPARKLINE — full width ──────────────────────────── */}
        {isVisible('networth')&&<div style={{...anim(190),...tileStyle('networth'),...glass(C.teal),borderRadius:22,padding:"18px 20px 16px"}}>
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
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
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
                const status = getBillStatus(b);
                const isPaid = status === "paid";
                const isOverdue = status === "overdue";
                const statusColor = isPaid ? C.green : isOverdue ? C.red : C.gold;
                const statusLabel = isPaid ? "✓ Paid" : isOverdue ? "Overdue" : "Upcoming";
                const borderColor = isPaid ? C.green+"33" : isOverdue ? C.red+"44" : hasArrears ? C.gold+"44" : C.border;
                const togglePaid = () => {
                  const month = currentBillingMonth();
                  updateBill(i, "paidMonth", isPaid ? null : month);
                };
                return (
                <div key={i} style={{background:C.card,borderRadius:16,marginBottom:10,border:`1px solid ${borderColor}`,overflow:"hidden",opacity:isPaid?0.75:1,transition:"all 0.2s"}}>
                  {/* Status bar */}
                  <div style={{background:isPaid?C.green+"14":isOverdue?C.red+"14":"transparent",padding:"6px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${borderColor}`}}>
                    <span style={{color:statusColor,fontSize:10,fontWeight:800,letterSpacing:0.5}}>{statusLabel}</span>
                    <button onClick={togglePaid}
                      style={{background:isPaid?"none":C.green+"22",border:`1px solid ${isPaid?C.border:C.green}`,borderRadius:99,padding:"3px 12px",color:isPaid?C.muted:C.greenBright,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:24,transition:"all 0.15s"}}>
                      {isPaid ? "Mark unpaid" : "✓ Mark paid"}
                    </button>
                  </div>
                  {/* Main row */}
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:C.cream,fontWeight:700,fontSize:13}}>{b.name}</div>
                      {hasArrears&&(
                        <div style={{color:C.goldBright,fontSize:10,fontWeight:700,marginTop:2}}>
                          ⚠ ${parseFloat(b.arrears||0).toFixed(2)} in arrears
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
  const doConnect=p=>{
    if(connected.includes(p.name)) return;
    setConnected(c=>[...c,p.name]);
    if(setAppData) setAppData(prev=>({
      ...prev,
      bills:[...(prev.bills||[]),{name:p.name,amount:p.amount,date:"1",icon:p.icon,autoAdded:true}]
    }));
  };
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
        <div><div style={{color:C.tealBright,fontWeight:700,fontSize:14}}>📅 Bill Tracking</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{(data.bills||[]).length} bills tracked</div></div>
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
                {day.idx>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}><span style={{color:C.mutedHi,fontSize:12}}>🛒 Est. daily spend <span style={{color:C.muted,fontSize:9}}>(30d avg)</span></span><span style={{color:C.muted,fontSize:12}}>−${(avgDailySpend*0.8).toFixed(0)}</span></div>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:4}}>
                  <span style={{color:C.cream,fontWeight:700,fontSize:13}}>{isToday?"Current balance":"Projected balance"}</span>
                  <span style={{color:neg?C.redBright:low?C.goldBright:C.greenBright,fontWeight:900,fontSize:16,fontFamily:"'Playfair Display',serif"}}>{neg?"−":""}${Math.abs(day.balance||0).toFixed(0)}</span>
                </div>
                {day.idx>0&&<div style={{marginTop:6,color:C.muted,fontSize:10,lineHeight:1.7}}>${(prevBalance||0).toFixed(0)}{day.income>0&&<span style={{color:C.green}}> +${(day.income||0).toFixed(0)}</span>}{billsTotal>0&&<span style={{color:C.gold}}> −${billsTotal.toFixed(0)} bills</span>}<span style={{color:C.muted}}> −${(avgDailySpend*0.8).toFixed(0)} spend</span><span style={{color:neg?C.redBright:C.greenBright}}> = ${(day.balance||0).toFixed(0)}</span></div>}
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
  const QUICK_CATS = ["Business","Reimbursement","GrowSmart","Family","Medical","Gym","Pet","Gifts"];
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

function ExpandableCatCard({cat, amt, totalSpent, color, catTxns, budget, onSetBudget, yoyLabel=null, yoyColor=null}){
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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:yoyLabel?4:8}}>
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
      {/* Year-over-year label */}
      {yoyLabel&&(
        <div style={{color:yoyColor||C.muted,fontSize:10,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4}}>
          {yoyLabel}
        </div>
      )}
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
            : (() => {
                // Expenses first (descending), refunds at bottom (ascending by abs)  
                const sorted = [...catTxns].sort((a,b)=>{if(a.amount>0&&b.amount<0)return -1;if(a.amount<0&&b.amount>0)return 1;return Math.abs(b.amount)-Math.abs(a.amount);});
                const visible = showAllTxns ? sorted : sorted.slice(0, TXN_LIMIT);
                const hiddenCount = sorted.length - TXN_LIMIT;
                return (
                  <div>
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
                          <span style={{color:t.amount<0?C.greenBright:linkedBill?C.greenBright:color,fontWeight:700,fontSize:13,flexShrink:0,marginLeft:8}}>
                            {t.amount<0?`+$${Math.abs(t.amount).toFixed(2)}`:`$${(t.amount||0).toFixed(2)}`}
                          </span>
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
                  </div>
                );
              })()
          }
        </div>
      )}
    </Card>
  );
}

function SpendScreen({data, setAppData, setScreen}){
  // ── ALL HOOKS FIRST — no non-hook code before the last hook (TDZ prevention) ──
  const [tab,setTab]=useState("txn");
  const [catFilter,setCatFilter]=useState("All");
  const [dismissed,setDismissed]=useState([]);
  const [period,setPeriod]=useState("month");
  const [accountFilter,setAccountFilter]=useState("All");
  const [recatTxn,setRecatTxn]=useState(null);
  const [markBillTxn,setMarkBillTxn]=useState(null);
  const [linkBillTxn,setLinkBillTxn]=useState(null); // transaction to manually link to a bill
  const [expandedTxn,setExpandedTxn]=useState(null); // tapped transaction for inline detail
  const [billForm,setBillForm]=useState({name:"",amount:"",date:"1"});
  const [arrearsPayTxn,setArrearsPayTxn]=useState(null);
  const [applyAllPrompt, setApplyAllPrompt] = useState(null);

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
      // Apply to every transaction from the same merchant
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
        const cat=getCat(t);
        if(cat==="Transfer") return t.amount<0; // show incoming transfers (e-transfers in), hide outgoing
        return true;
      })
    : catFilter==="Received"
      ? acctFiltered.filter(t=>getCat(t)==="Transfer"&&t.amount<0)
      : acctFiltered.filter(t=>getCat(t)===catFilter);
  const totalSpent=acctFiltered.filter(t=>t.amount>0&&!EXCLUDE_CATS.has(getCat(t))&&!isCCPayment(t,data.debts||[])).reduce((a,t)=>a+t.amount,0);
  const totalIn=acctFiltered.filter(t=>t.amount<0).reduce((a,t)=>a+Math.abs(t.amount),0);

  // Smart Cuts — data-driven, income-aware, ruthless
  // Only show cuts where the user is actually overspending
  const monthlyIncomeSC = FinancialCalcEngine.cashFlow(data).monthlyIncome || 0;
  const byCat = stats.byCat || {};

  // Benchmark thresholds as % of income (or absolute floor)
  const dining    = (byCat["Coffee & Dining"] || 0) + (byCat["Coffee"] || 0) + (byCat["Dining"] || 0);
  const groceries = byCat["Groceries"] || 0;
  const shopping  = (byCat["Shopping"] || 0);
  const subs      = stats.subs || 0;
  const transport = byCat["Gas & Transport"] || 0;
  const entertain = byCat["Entertainment"] || 0;

  const diningBenchmark    = monthlyIncomeSC > 0 ? monthlyIncomeSC * 0.10 : 200;
  const groceryBenchmark   = monthlyIncomeSC > 0 ? monthlyIncomeSC * 0.08 : 400;
  const shoppingBenchmark  = monthlyIncomeSC > 0 ? monthlyIncomeSC * 0.05 : 150;
  const subsBenchmark      = monthlyIncomeSC > 0 ? monthlyIncomeSC * 0.03 : 75;
  const entertainBenchmark = monthlyIncomeSC > 0 ? monthlyIncomeSC * 0.04 : 100;

  const cuts=[
    // Coffee — only if actual spend detected
    stats.coffee>0&&{id:1,icon:"coffee",title:"Coffee shops: real cost",
      body:`${stats.coffeeCount} visit${stats.coffeeCount===1?"":"s"} this month · $${stats.coffee.toFixed(0)} total · $${(stats.coffee*12).toFixed(0)}/year. At-home coffee costs ~$0.30/cup vs $5–7 out. Cutting 3 days a week saves $${Math.round(stats.coffee*0.5)}/month reliably.`,
      saving:`$${Math.round(stats.coffee*0.5)}/mo`,effort:"Low",color:C.orange},

    // Dining/food delivery — only if over benchmark
    dining>diningBenchmark&&{id:2,icon:"food",title:`Dining is ${monthlyIncomeSC>0?Math.round(dining/monthlyIncomeSC*100)+"% of income — over the 10% benchmark":"above a healthy level"}`,
      body:`$${dining.toFixed(0)} on dining and delivery this month. Benchmark is ~10% of income ($${diningBenchmark.toFixed(0)}). You're $${(dining-diningBenchmark).toFixed(0)} over. One fewer restaurant meal and one fewer delivery per week typically closes this gap.`,
      saving:`$${Math.round(dining-diningBenchmark)}/mo`,effort:"Low",color:C.orange},

    // Delivery specifically — only if detected
    stats.delivery>0&&dining<=diningBenchmark&&{id:3,icon:"package",title:"Food delivery fees add up fast",
      body:`$${stats.delivery.toFixed(0)} on delivery this month. After fees, tips, and markups, delivery typically costs 40–60% more than pickup or cooking the same meal. One fewer order per week saves $${Math.round(stats.delivery*0.4)}/month.`,
      saving:`$${Math.round(stats.delivery*0.4)}/mo`,effort:"Low",color:C.orange},

    // Subscriptions — only if over benchmark with specific amount
    subs>subsBenchmark&&{id:4,icon:"zap",title:`$${subs.toFixed(0)}/mo in subscriptions — audit time`,
      body:`You're spending $${subs.toFixed(0)}/month on subscriptions vs a $${subsBenchmark.toFixed(0)} benchmark (3% of income). That's $${(subs*12).toFixed(0)}/year. Go through each one: used it last month? If not, cancel today — not "soon."`,
      saving:`$${Math.round(subs-subsBenchmark)}/mo`,effort:"Low",color:C.purple},

    // Shopping overspend — only if measurably over benchmark
    shopping>shoppingBenchmark&&{id:5,icon:"bag",title:`Shopping is $${shopping.toFixed(0)} — ${Math.round(shopping/Math.max(shoppingBenchmark,1)*100-100)}% over benchmark`,
      body:`$${shopping.toFixed(0)} on shopping this month vs a $${shoppingBenchmark.toFixed(0)} benchmark. The 48-hour rule: add to cart, wait 2 days. Most impulse purchases get abandoned without regret. Apply it for 30 days.`,
      saving:`$${Math.round(shopping-shoppingBenchmark)}/mo`,effort:"Low",color:C.pink},

    // Entertainment overspend
    entertain>entertainBenchmark&&{id:6,icon:"film",title:`Entertainment: $${entertain.toFixed(0)}/mo`,
      body:`$${entertain.toFixed(0)} on entertainment — $${(entertain-entertainBenchmark).toFixed(0)} over the 4% benchmark. Identify one recurring entertainment expense that could be rotated, paused, or shared.`,
      saving:`$${Math.round(entertain-entertainBenchmark)}/mo`,effort:"Low",color:C.blue},

    // Groceries — only if significantly over
    groceries>groceryBenchmark*1.4&&{id:7,icon:"cart",title:`Grocery bill is high: $${groceries.toFixed(0)}/mo`,
      body:`$${groceries.toFixed(0)} on groceries this month — about $${(groceries-groceryBenchmark).toFixed(0)} above benchmark. Meal planning and a fixed weekly list typically cut grocery spend by 20–25% with minimal effort.`,
      saving:`$${Math.round((groceries-groceryBenchmark)*0.5)}/mo`,effort:"Low",color:C.green},

    // Busiest day — only if strongly meaningful
    monthlyIncomeSC>0&&{id:8,icon:"chartUp",title:`${stats.busiest}s cost you the most`,
      body:`You spend more on ${stats.busiest}s than any other day. Checking your balance before you go out on ${stats.busiest}s takes 10 seconds and typically reduces spending that day by 20–30%.`,
      saving:"$30–60/mo",effort:"Very Low",color:C.blue},

  ].filter(Boolean).filter(s=>!dismissed.includes(s.id));

  const ALL_CATS = ["Food & Drink","Groceries","Transport","Shopping","Entertainment","Bills & Utilities","Health","Income","Subscriptions","Travel","Other"];

    if(!isDemo && txns.length === 0) return <EmptyState icon="💳" title="No transactions yet" body="Your transactions are loading from your bank. Check back in a moment — or pull to refresh." action="Refresh" onAction={()=>window.location.reload()} color={C.orange}/>;

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <ScreenHeader title="Transactions" subtitle={monthLabel} onBack={setScreen?()=>setScreen("home"):null} cta="Ask Coach" onCta={setScreen?()=>setScreen("coach"):null} ctaColor={C.purple}/>
    {/* Mark as Bill modal */}
    {markBillTxn&&(
      <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)"}} onClick={()=>setMarkBillTxn(null)}>
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
            <div style={{background:C.teal+"12",border:`1px solid ${C.teal}33`,borderRadius:12,padding:"10px 14px",marginBottom:16}}>
              <div style={{color:C.tealBright,fontSize:12,fontWeight:600}}>💡 This will also update your cash-flow forecast</div>
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>Your Plan screen will now include ${billForm.amount}/month on the {billForm.date}{([11,12,13].includes(parseInt(billForm.date))?"th":["st","nd","rd"][parseInt(billForm.date||0)%10-1]||"th")}.</div>
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
                      setAppData(prev=>({...prev,bills:[...(prev.bills||[]),{name:billForm.name.trim(),amount:billForm.amount,date:billForm.date}]}));
                    } // end if(!alreadyExists)
                    // Also recategorise the transaction as Bills
                    const overrides=JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}");
                    localStorage.setItem("flourish_cat_overrides",JSON.stringify({...overrides,[markBillTxn.id]:"Bills"}));
                  }
                  setMarkBillTxn(null);setBillForm({name:"",amount:"",date:"1"});
                }}
                style={{flex:1,background:billForm.name&&billForm.amount?C.green:"rgba(255,255,255,0.08)",border:"none",borderRadius:12,padding:"13px",color:"#fff",fontWeight:800,fontSize:14,cursor:billForm.name&&billForm.amount?"pointer":"default",fontFamily:"inherit",opacity:!billForm.name||!billForm.amount?0.4:1}}>
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
      {/* Manual bill-transaction link sheet */}
      {linkBillTxn&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setLinkBillTxn(null)}>
          <div style={{width:"100%",maxWidth:520,background:C.bg,borderRadius:"24px 24px 0 0",maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"14px 20px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{width:36,height:4,borderRadius:99,background:C.border,margin:"0 auto 12px"}}/>
              <div style={{color:C.cream,fontWeight:800,fontSize:16}}>Which bill did this pay?</div>
              <div style={{color:C.muted,fontSize:12,marginTop:3}}>
                <span style={{color:C.cream,fontWeight:700}}>{linkBillTxn.name}</span> · ${Math.abs(linkBillTxn.amount).toFixed(2)} · {linkBillTxn.date}
              </div>
            </div>
            <div style={{overflowY:"auto",padding:"12px 20px 32px",display:"flex",flexDirection:"column",gap:8}}>
              {(data.bills||[]).map((b,i)=>{
                const isPaid = getBillStatus(b) === "paid";
                return (
                  <button key={i} onClick={()=>{
                    const month = currentBillingMonth();
                    if(setAppData) setAppData(prev=>({
                      ...prev,
                      bills:(prev.bills||[]).map((bill,bi)=>bi===i?{...bill,paidMonth:month}:bill)
                    }));
                    setLinkBillTxn(null);
                  }}
                  style={{background:isPaid?"rgba(0,204,133,0.08)":C.card,border:`1px solid ${isPaid?"rgba(0,204,133,0.3)":C.border}`,borderRadius:14,padding:"12px 16px",cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{color:C.cream,fontWeight:700,fontSize:14}}>{b.name}</div>
                      <div style={{color:C.muted,fontSize:11,marginTop:2}}>${parseFloat(b.amount||0).toFixed(2)}/mo · due {b.date}{["th","st","nd","rd"][parseInt(b.date)%10]||"th"}</div>
                    </div>
                    <div style={{color:isPaid?C.green:C.muted,fontSize:11,fontWeight:700,flexShrink:0,marginLeft:12}}>
                      {isPaid?"✓ Already paid":"Tap to mark paid"}
                    </div>
                  </button>
                );
              })}
              <div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:4,lineHeight:1.6}}>
                Marking a bill paid removes it from your forecast and clears overdue alerts.
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
      <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)"}} onClick={()=>setArrearsPayTxn(null)}>
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
      <div style={{position:"fixed",inset:0,zIndex:1001,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)"}} onClick={()=>setApplyAllPrompt(null)}>
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

    {/* Re-categorize modal — centered bubble */}
    {recatTxn&&(
      <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",padding:"20px 16px"}} onClick={()=>setRecatTxn(null)}>
        <div style={{background:C.card,borderRadius:24,width:"100%",maxWidth:520,border:`1px solid ${C.border}`,boxShadow:"0 24px 64px rgba(0,0,0,0.6)",display:"flex",flexDirection:"column",maxHeight:"85vh"}} onClick={e=>e.stopPropagation()}>
          {/* Fixed header */}
          <div style={{padding:"16px 20px 12px",flexShrink:0,borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:36,height:4,borderRadius:99,background:C.border,margin:"0 auto 14px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.cream,fontWeight:800,fontSize:15}}>Change Category</div>
                <div style={{color:C.muted,fontSize:11,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:240}}>{recatTxn.name}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                {setAppData&&recatTxn.amount>0&&<button onClick={()=>{
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
          <div style={{height:8,flexShrink:0}}/>
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
        const isExpanded = expandedTxn?.id === txn.id;
        // Check if this transaction is already linked to a bill
        const linkedBillName = (() => {
          const billingMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
          return (data.bills||[]).find(b => b.paidMonth === billingMonth &&
            Math.abs(parseFloat(b.amount||0) - txn.amount) < 5)?.name || null;
        })();
        return (
        <div key={txn.id}
          style={{background:isExpanded?C.cardAlt:C.card,borderRadius:18,border:`1px solid ${isExpanded?C.borderHi:C.border}`,transition:"all .2s",cursor:"pointer",overflow:"hidden"}}
          onClick={()=>setExpandedTxn(isExpanded?null:txn)}>
          {/* ── Main row ── */}
          <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:13}}>
            <div style={{width:42,height:42,borderRadius:14,background:txn.color+"18",border:`1px solid ${txn.color}28`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon id={txnIcon(txn)} size={19} color={txn.color} strokeWidth={1.5}/></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:C.cream,fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{txn.name}</div>
              <div style={{display:"flex",gap:6,marginTop:3,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{background:txn.amount<0?C.green+"18":txn.color+"18",border:`1px solid ${txn.amount<0?C.green+"33":txn.color+"33"}`,borderRadius:99,padding:"2px 8px",color:txn.amount<0?C.greenBright:txn.color,fontSize:10,fontWeight:700}}>
                  {txn.amount<0&&getCat(txn)==="Transfer"?"Received":getCat(txn)}
                </span>
                <span style={{color:C.muted,fontSize:10}}>{txn.date}</span>
                {txn.account_id&&accountFilter==="All"&&accountMap[txn.account_id]&&(
                  <span style={{color:C.muted,fontSize:9,background:"rgba(255,255,255,0.04)",borderRadius:99,padding:"1px 7px",border:`1px solid ${C.border}`,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {accountMap[txn.account_id]?.name||"Bank"}
                  </span>
                )}
                {txn.pending&&<Chip label="Pending" color={C.gold} size={9}/>}
                {linkedBillName&&<span style={{background:C.green+"18",border:`1px solid ${C.green}33`,borderRadius:99,padding:"2px 8px",color:C.greenBright,fontSize:10,fontWeight:700}}>✓ {linkedBillName}</span>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{color:txn.amount<0?C.greenBright:C.cream,fontWeight:800,fontSize:15,fontFamily:"'Playfair Display',serif"}}>
                {txn.amount<0?"+":"–"}${Math.abs(txn.amount).toFixed(2)}
              </div>
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>{isExpanded?"▲":"▼"}</div>
            </div>
          </div>

          {/* ── Expanded detail ── */}
          {isExpanded&&(
            <div style={{borderTop:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",gap:8,flexWrap:"wrap"}} onClick={e=>e.stopPropagation()}>
              {/* Recategorise */}
              <button onClick={()=>setRecatTxn(txn)}
                style={{background:txn.color+"18",border:`1px solid ${txn.color}33`,borderRadius:10,padding:"8px 14px",color:txn.color,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:14}}>✎</span> Change category
              </button>
              {/* Link to bill — only for expenses, only if bills exist */}
              {txn.amount>0&&(data.bills||[]).length>0&&(
                <button onClick={()=>{setLinkBillTxn(txn);setExpandedTxn(null);}}
                  style={{background:"rgba(0,204,133,0.12)",border:"1px solid rgba(0,204,133,0.25)",borderRadius:10,padding:"8px 14px",color:C.greenBright,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:14}}>📅</span> Link to a bill
                </button>
              )}
              {/* Add as tracked bill — only for expenses */}
              {txn.amount>0&&(
                <button onClick={()=>{setBillForm({name:txn.name,amount:String(txn.amount),date:"1"});setMarkBillTxn(txn);setExpandedTxn(null);}}
                  style={{background:C.teal+"14",border:`1px solid ${C.teal}33`,borderRadius:10,padding:"8px 14px",color:C.tealBright,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:14}}>+</span> Track as bill
                </button>
              )}
            </div>
          )}
        </div>
        );
      })}
    </>}
    {tab==="breakdown"&&<>
      {(()=>{
        // Breakdown uses the same period-filtered set as the Transactions tab
        // Include recategorised credits: refunds/deposits the user moved to a spending category
        // These reduce category spend (e.g. Amazon refund → Shopping reduces Shopping total)
        const bdTxns = acctFiltered.filter(t=>{
          const cat = getCat(t);
          const isCredit = t.amount < 0;
          if(!isCredit) return t.amount>0&&!EXCLUDE_CATS.has(cat)&&!isCCPayment(t,data.debts||[]);
          // Credit: only include if user explicitly recategorised it away from Transfer/Income
          const originalCat = t.cat || "";
          const wasTransfer = originalCat==="Transfer"||originalCat==="Income";
          const nowSpendCat = !EXCLUDE_CATS.has(cat)&&cat!=="Transfer";
          return wasTransfer && nowSpendCat; // user moved it → track it
        });
        const bdIn   = acctFiltered.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
        const bdTotal= bdTxns.reduce((s,t)=>s+t.amount,0);
        const bdByCat= {};
        bdTxns.forEach(t=>{
          const c=getCat(t);
          // Positive = expense (add), Negative = refund/credit (subtract from category spend)
          bdByCat[c]=(bdByCat[c]||0)+t.amount;
        });
        // Show ALL spending categories — custom cats must never be hidden by a slice limit
        const bdTopCats=Object.entries(bdByCat).sort((a,b)=>b[1]-a[1]);
        const periodLabel = period==="week"?"This week":period==="month"?monthLabel:period==="last"?"Last month":period==="3mo"?"Last 3 months":"Last 90 days";

        // ── Year-over-year comparison ─────────────────────────────────────
        // Compute the same date range but 1 year ago from all available transactions
        const allTxns = data.transactions || [];
        const yoyData = (() => {
          if(period==="week") return null; // weekly YoY not meaningful
          const now = new Date();
          let yStart, yEnd;
          if(period==="month") {
            yStart = new Date(now.getFullYear()-1, now.getMonth(), 1);
            yEnd   = new Date(now.getFullYear()-1, now.getMonth()+1, 0, 23, 59, 59);
          } else if(period==="last") {
            yStart = new Date(now.getFullYear()-1, now.getMonth()-1, 1);
            yEnd   = new Date(now.getFullYear()-1, now.getMonth(), 0, 23, 59, 59);
          } else if(period==="3mo") {
            yStart = new Date(now.getFullYear()-1, now.getMonth()-2, 1);
            yEnd   = new Date(now.getFullYear()-1, now.getMonth()+1, 0, 23, 59, 59);
          } else return null;
          const yTxns = allTxns.filter(t => {
            if(!t.date || t.amount <= 0) return false;
            if(EXCLUDE_CATS.has(getCat(t)) || isCCPayment(t, data.debts||[])) return false;
            const d = new Date(t.date + "T12:00:00");
            return d >= yStart && d <= yEnd;
          });
          if(yTxns.length === 0) return null; // no last-year data available
          const yTotal = yTxns.reduce((s,t)=>s+t.amount, 0);
          const yByCat = {};
          yTxns.forEach(t=>{const c=getCat(t);yByCat[c]=(yByCat[c]||0)+t.amount;});
          return { total: yTotal, byCat: yByCat, txnCount: yTxns.length };
        })();

        const yoyDelta = yoyData ? bdTotal - yoyData.total : null;
        const yoyPct   = yoyData && yoyData.total > 0 ? ((yoyDelta / yoyData.total) * 100) : null;
        const yoyColor = yoyDelta === null ? C.muted : yoyDelta <= 0 ? C.green : C.red;
        const yoyLabel = yoyDelta === null ? null
          : yoyDelta <= 0 ? `$${Math.abs(yoyDelta).toFixed(0)} less than last year ↓`
          : `$${Math.abs(yoyDelta).toFixed(0)} more than last year ↑`;

        return (<>
      <Card style={{background:`linear-gradient(135deg,${C.orangeDim} 0%,${C.card} 100%)`,border:`1px solid ${C.orange}44`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Total Spent · {periodLabel}</div>
            <div style={{fontSize:38,fontWeight:900,color:C.orangeBright,fontFamily:"Georgia,serif"}}>{`$${(bdTotal||0).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2})}`}</div>
            {yoyLabel&&(
              <div style={{color:yoyColor,fontSize:11,fontWeight:700,marginTop:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                {yoyLabel}{yoyPct!==null?` (${Math.abs(yoyPct).toFixed(0)}% ${yoyDelta<=0?"less":"more"})`:""}
              </div>
            )}
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
      {bdTopCats.map(([cat,amt],i)=>{
        const colors=[C.orange,C.pink,C.green,C.blue,C.purple,C.gold];
        const catTxns=acctFiltered.filter(t=>{
          if(getCat(t)!==cat) return false;
          if(t.amount>0) return true;
          // Credit: include if user moved it to this spending category
          return t.amount<0 && !EXCLUDE_CATS.has(cat) && cat!=="Transfer" && (t.cat==="Transfer"||t.cat==="Income");
        });
        const budget = (data.budgets||{})[cat] || null;
        window.__flourishBills = data.bills||[];
        // YoY delta for this category
        const yoyCatAmt = yoyData?.byCat?.[cat] || 0;
        const catDelta  = yoyData ? amt - yoyCatAmt : null;
        const catDeltaLabel = catDelta===null ? null
          : catDelta <= 0 ? `↓ $${Math.abs(catDelta).toFixed(0)} less than last yr`
          : `↑ $${Math.abs(catDelta).toFixed(0)} more than last yr`;
        const catDeltaColor = catDelta===null ? null : catDelta<=0 ? C.green : C.red;
        return <ExpandableCatCard key={i} cat={cat} amt={amt} totalSpent={bdTotal} color={colors[i%6]} catTxns={catTxns}
          budget={budget} onSetBudget={(cat,val)=>{
            if(setAppData) setAppData(prev=>({...prev,budgets:{...(prev.budgets||{}),
              ...(val===null ? Object.fromEntries(Object.entries(prev.budgets||{}).filter(([k])=>k!==cat)) : {[cat]:val})
            }}));
          }}
          yoyLabel={catDeltaLabel} yoyColor={catDeltaColor}/>;
      })}
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
  // My Goals tab state — must be at component level, not inside IIFE
  const [showForm, setShowForm] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [goalForm, setGoalForm] = useState({name:"",target:"",saved:"",monthly:"",notes:""});
  const debts=data.debts||[];
  const noDebts = debts.length === 0;
  // Sort debts by selected method — this IS the payoff method logic
  const sortedDebts = [...debts].sort((a,b) =>
    method === "avalanche"
      ? parseFloat(b.rate||0) - parseFloat(a.rate||0)   // highest rate first
      : parseFloat(a.balance||0) - parseFloat(b.balance||0) // lowest balance first
  );
  const safeSelDebt=Math.min(selDebt,Math.max(0,sortedDebts.length-1));
  // Priority debt is always the first in the sorted order (the one to attack now)
  const priorityDebt = sortedDebts[0] || {name:"Credit Card",balance:"3420",rate:"19.99",min:"68"};
  const debt = sortedDebts.length>0 ? sortedDebts[safeSelDebt] : priorityDebt;
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
  const _allBal=(data?.accounts||[]).filter(a=>a.type!=="credit").reduce((s,a)=>s+(a.balance||0),0);
      const netWorth=_allBal-totalDebt;

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <ScreenHeader title="Goals & Wealth" onBack={setScreen?()=>setScreen("home"):null} cta={CC[data?.profile?.country||"CA"]?.flag+" "+CC[data?.profile?.country||"CA"]?.currency} ctaColor={CC[data?.profile?.country||"CA"]?.currency==="USD"?C.blue:C.green}/>
    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
      {[["goals","My Goals"],["sim","Debt Sim"],["worth","Net Worth"],["retire","Retirement"],["forecast","Wealth"],["personality","Personality"],["tax","Tax Tips"],["learn","Learn"]].map(([key,lbl])=>(
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
      const form = goalForm; const setForm = setGoalForm;
      const openAdd = () => { setGoalForm({name:"",target:"",saved:"",monthly:"",notes:""}); setEditIdx(null); setShowForm(true); };
      const openEdit = (g,i) => { setGoalForm({name:g.name||g.label||"",target:g.target||"",saved:g.saved||g.current||"",monthly:g.monthly||"",notes:g.notes||""}); setEditIdx(i); setShowForm(true); };
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
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{color:C.cream,fontWeight:700}}>Payoff Method</div>
          {sortedDebts.length>0&&<div style={{color:C.muted,fontSize:11}}>Attack: <span style={{color:C.purpleBright,fontWeight:700}}>{priorityDebt.name}</span></div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          {[["avalanche","Avalanche","Highest rate first · saves the most"],["snowball","Snowball","Smallest balance first · fastest wins"]].map(([key,lbl,desc])=>(
            <button key={key} onClick={()=>{setMethod(key);setSelDebt(0);}} style={{flex:1,background:method===key?C.purple+"22":C.cardAlt,border:`1px solid ${method===key?C.purple:C.border}`,borderRadius:12,padding:"12px 10px",cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
              <div style={{color:method===key?C.purpleBright:C.cream,fontWeight:700,fontSize:13}}>{lbl}</div>
              <div style={{color:C.muted,fontSize:11,marginTop:4,lineHeight:1.4}}>{desc}</div>
            </button>
          ))}
        </div>
      </Card>
      {debts.length>0&&<Card>
        <div style={{color:C.cream,fontWeight:700,marginBottom:12}}>All Debts ({debts.length})</div>
        {sortedDebts.map((d,i)=>{
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {(isCA?[
              ["rrspBalance","RRSP Balance","Current RRSP value"],
              ["rrspMonthly","RRSP Monthly Contribution","How much you add each month/paycheque"],
              ["tfsaBalance","TFSA Balance","Current TFSA value"],
              ["tfsaMonthly","TFSA Monthly Contribution","How much you add each month"],
              ["pensionMonthly","Pension / Other Monthly","Other retirement contributions"],
            ]:[
              ["401kBalance","401(k) Balance","Current 401(k) value"],
              ["401kMonthly","401(k) Monthly Contribution","How much you add per month"],
              ["iraBalance","IRA/Roth IRA Balance","Current IRA value"],
              ["iraMonthly","IRA Monthly Contribution","How much you add per month"],
              ["otherRetire","Other Retirement Monthly","HSA, pension, etc."],
            ]).map(([field,label,hint])=>(
              <div key={field}>
                <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</div>
                <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                  <span style={{color:C.muted,fontSize:11,padding:"0 5px 0 8px"}}>$</span>
                  <input value={ret[field]||""} onChange={e=>updateRet(field,e.target.value)}
                    type="number" inputMode="decimal" placeholder="0"
                    title={hint}
                    style={{flex:1,background:"none",border:"none",padding:"10px 8px 10px 0",color:C.tealBright,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",fontWeight:700,width:0}}/>
                </div>
                <div style={{color:C.muted,fontSize:9,marginTop:2,lineHeight:1.4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{hint}</div>
              </div>
            ))}
          </div>
          {/* Projection summary with assumption toggle */}
          {(()=>{
            const bal = parseFloat(ret[isCA?"rrspBalance":"401kBalance"]||0) + parseFloat(ret[isCA?"tfsaBalance":"iraBalance"]||0);
            const monthly = parseFloat(ret[isCA?"rrspMonthly":"401kMonthly"]||0) + parseFloat(ret[isCA?"tfsaMonthly":"iraMonthly"]||0) + parseFloat(ret[isCA?"pensionMonthly":"otherRetire"]||0);
            if(bal<=0&&monthly<=0) return null;

            // Assumption modes — stored in ret.projectionMode
            const mode = ret.projectionMode || "moderate";
            const MODES = [
              { key:"conservative", label:"Conservative", rate:0.03, color:C.teal,   desc:"3% / yr — near retirement or low risk tolerance" },
              { key:"moderate",     label:"Moderate",     rate:0.05, color:C.green,  desc:"5% / yr — balanced long-term portfolio" },
              { key:"aggressive",   label:"Aggressive",   rate:0.07, color:C.purple, desc:"7% / yr — equity-heavy, long time horizon" },
            ];
            const selected = MODES.find(m=>m.key===mode) || MODES[1];
            const r = selected.rate / 12;
            const n = 30 * 12;
            const fv = bal*Math.pow(1+r,n) + (monthly>0 ? monthly*((Math.pow(1+r,n)-1)/r) : 0);
            const realFv = fv / Math.pow(1.02, 30); // inflation-adjusted at 2%

            return (
              <div style={{marginTop:12}}>
                {/* Mode selector */}
                <div style={{display:"flex",gap:6,marginBottom:10}}>
                  {MODES.map(m=>(
                    <button key={m.key} onClick={()=>updateRet("projectionMode", m.key)}
                      style={{flex:1,background:mode===m.key?m.color+"22":C.cardAlt,border:`1px solid ${mode===m.key?m.color:C.border}`,borderRadius:10,padding:"7px 4px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.15s"}}>
                      <div style={{color:mode===m.key?m.color:C.muted,fontWeight:700,fontSize:10}}>{m.label}</div>
                      <div style={{color:mode===m.key?m.color+"bb":C.muted,fontSize:9,marginTop:1}}>{(m.rate*100).toFixed(0)}%/yr</div>
                    </button>
                  ))}
                </div>

                {/* Projection result */}
                <div style={{background:selected.color+"10",border:`1px solid ${selected.color}33`,borderRadius:12,padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div>
                      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>30-year projection</div>
                      <div style={{color:selected.color,fontWeight:900,fontSize:22,fontFamily:"'Playfair Display',serif"}}>~${(fv/1000).toFixed(0)}k</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>inflation-adjusted</div>
                      <div style={{color:C.mutedHi,fontWeight:700,fontSize:16,fontFamily:"'Playfair Display',serif"}}>~${(realFv/1000).toFixed(0)}k</div>
                    </div>
                  </div>
                  <div style={{color:C.muted,fontSize:10,lineHeight:1.5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                    {selected.desc} · {isCA?"RRSP + TFSA":"401(k) + IRA"} · ${bal.toLocaleString()} current + ${monthly}/mo
                  </div>
                  {mode==="aggressive"&&(
                    <div style={{color:C.gold,fontSize:10,marginTop:6,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.4}}>
                      ⚠️ 7% is optimistic — markets vary significantly year to year. Consider moderate for planning.
                    </div>
                  )}
                  {mode==="conservative"&&(
                    <div style={{color:C.teal,fontSize:10,marginTop:6,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.4}}>
                      💡 Good choice if you're within 10 years of retirement or prefer lower-risk investments.
                    </div>
                  )}
                </div>
                <div style={{color:C.muted,fontSize:9,marginTop:6,textAlign:"center",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  Estimates only · not financial advice · actual returns vary
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── RRSP Room Tracker (CA only) ───────────────────────────── */}
        {isCA&&(()=>{
          const room = RRSPRoomEngine.calculate(data);
          return (
            <div style={{background:C.card,borderRadius:18,padding:"16px 18px",border:`1px solid #2E8B2E44`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <div style={{width:36,height:36,borderRadius:11,background:"#2E8B2E18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🏦</div>
                <div>
                  <div style={{color:"#2E8B2E",fontWeight:900,fontSize:15,fontFamily:"'Playfair Display',serif"}}>RRSP Contribution Room</div>
                  <div style={{color:C.muted,fontSize:11,marginTop:1}}>Track your room, estimate your refund</div>
                </div>
              </div>

              {/* ── Input row ── */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>

                <div>
                  <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Available Room (from CRA)</div>
                  <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                    <span style={{color:C.muted,fontSize:11,padding:"0 5px 0 8px"}}>$</span>
                    <input value={ret.rrspRoom||""} onChange={e=>updateRet("rrspRoom",e.target.value)}
                      type="number" inputMode="decimal" placeholder="e.g. 45000"
                      style={{flex:1,background:"none",border:"none",padding:"10px 8px 10px 0",color:"#4CAF50",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",fontWeight:700,width:0}}/>
                  </div>
                  <div style={{color:C.muted,fontSize:9,marginTop:2,lineHeight:1.4}}>Find on your CRA Notice of Assessment or CRA My Account</div>
                </div>

                <div>
                  <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Contributed This Year</div>
                  <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                    <span style={{color:C.muted,fontSize:11,padding:"0 5px 0 8px"}}>$</span>
                    <input value={ret.rrspContribThisYear||""} onChange={e=>updateRet("rrspContribThisYear",e.target.value)}
                      type="number" inputMode="decimal" placeholder="0"
                      style={{flex:1,background:"none",border:"none",padding:"10px 8px 10px 0",color:"#4CAF50",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",fontWeight:700,width:0}}/>
                  </div>
                  <div style={{color:C.muted,fontSize:9,marginTop:2,lineHeight:1.4}}>Total RRSP contributions Jan 1–now</div>
                </div>

                <div style={{gridColumn:"1/-1"}}>
                  <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Last Year's Earned Income</div>
                  <div style={{display:"flex",alignItems:"center",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                    <span style={{color:C.muted,fontSize:11,padding:"0 5px 0 8px"}}>$</span>
                    <input value={ret.rrspPrevIncome||""} onChange={e=>updateRet("rrspPrevIncome",e.target.value)}
                      type="number" inputMode="decimal" placeholder="e.g. 85000"
                      style={{flex:1,background:"none",border:"none",padding:"10px 8px 10px 0",color:C.cream,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",fontWeight:700,width:0}}/>
                  </div>
                  <div style={{color:C.muted,fontSize:9,marginTop:2,lineHeight:1.4}}>Used to calculate this year's new room (18% of earned income, max $32,490)</div>
                </div>
              </div>

              {/* ── Results ── */}
              {room?.hasEnoughData&&<>

                {/* Over-contribution warning */}
                {room.isOverContrib&&(
                  <div style={{background:"rgba(255,79,106,0.12)",border:"1px solid rgba(255,79,106,0.35)",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
                    <div style={{color:C.redBright||C.red,fontWeight:800,fontSize:12}}>⚠️ Over-contribution detected</div>
                    <div style={{color:C.mutedHi,fontSize:11,marginTop:2,lineHeight:1.5}}>
                      You've contributed ${(room.contribThisYear - room.totalRoom).toLocaleString()} over your limit.
                      CRA charges 1%/month on excess over $2,000. File a T1-OVP immediately.
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                {!room.isOverContrib&&(
                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                      <span style={{color:C.muted,fontSize:10,fontWeight:600}}>Room used</span>
                      <span style={{color:"#4CAF50",fontSize:12,fontWeight:800}}>{room.usagePct}% of ${room.totalRoom.toLocaleString()}</span>
                    </div>
                    <div style={{height:8,background:C.cardAlt,borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${room.usagePct}%`,background:`linear-gradient(90deg,#2E8B2E,#4CAF50)`,borderRadius:99,transition:"width 0.6s ease"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                      <span style={{color:C.muted,fontSize:10}}>Used: ${room.contribThisYear.toLocaleString()}</span>
                      <span style={{color:"#4CAF50",fontSize:10,fontWeight:700}}>Remaining: ${room.remainingRoom.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {/* New room this year */}
                {room.newRoomThisYear>0&&(
                  <div style={{background:"#2E8B2E12",border:"1px solid #2E8B2E33",borderRadius:10,padding:"8px 12px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:C.muted,fontSize:11}}>New room earned this year (18% of ${room.prevIncome.toLocaleString()})</span>
                    <span style={{color:"#4CAF50",fontWeight:800,fontSize:12}}>+${room.newRoomThisYear.toLocaleString()}</span>
                  </div>
                )}

                {/* Tax refund estimator */}
                {room.remainingRoom>0&&room.maxRefund>0&&(
                  <div style={{background:"rgba(77,168,255,0.08)",border:"1px solid rgba(77,168,255,0.25)",borderRadius:12,padding:"12px 14px",marginBottom:12}}>
                    <div style={{color:C.blueBright,fontWeight:800,fontSize:13,marginBottom:8}}>💰 Tax Refund Estimator</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:C.mutedHi,fontSize:12}}>Contribute your full remaining room</span>
                        <span style={{color:C.blueBright,fontWeight:800,fontSize:14}}>≈ ${room.maxRefund.toLocaleString()} back</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:C.muted,fontSize:11}}>Your marginal rate (est.)</span>
                        <span style={{color:C.muted,fontSize:11,fontWeight:700}}>{Math.round(room.marginalRate*100)}%</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:C.muted,fontSize:11}}>Refund per $1,000 contributed</span>
                        <span style={{color:C.muted,fontSize:11,fontWeight:700}}>${room.refundPer1k}</span>
                      </div>
                      {room.monthsToFill&&(
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{color:C.muted,fontSize:11}}>Months to fill room at current rate</span>
                          <span style={{color:C.muted,fontSize:11,fontWeight:700}}>{room.monthsToFill} months</span>
                        </div>
                      )}
                    </div>
                    <div style={{color:C.muted,fontSize:10,marginTop:8,lineHeight:1.4,borderTop:`1px solid rgba(255,255,255,0.06)`,paddingTop:8}}>
                      Estimate only — based on simplified federal + provincial brackets for {data.profile?.province||"ON"}. Actual refund depends on all income sources. Consult a tax professional for exact amounts.
                    </div>
                  </div>
                )}

                {/* Room all used up */}
                {room.remainingRoom===0&&!room.isOverContrib&&(
                  <div style={{background:"rgba(0,204,133,0.10)",border:"1px solid rgba(0,204,133,0.25)",borderRadius:12,padding:"10px 14px"}}>
                    <div style={{color:C.greenBright,fontWeight:800,fontSize:12}}>✓ Full room used — great work!</div>
                    <div style={{color:C.mutedHi,fontSize:11,marginTop:2,lineHeight:1.5}}>
                      You've maximized your RRSP contributions this year. New room resets in January.
                    </div>
                  </div>
                )}

                {/* No room data yet */}
                {!room.hasCRAData&&(
                  <div style={{color:C.muted,fontSize:11,lineHeight:1.6,marginTop:-4}}>
                    💡 <strong style={{color:C.cream}}>Get your exact room:</strong> Log in to{" "}
                    <span style={{color:C.teal,textDecoration:"underline"}}>CRA My Account</span>{" "}
                    → RRSP and FHSA → Contribution room. It's the most accurate number.
                  </div>
                )}
              </>}

              {/* No data entered yet */}
              {!room?.hasEnoughData&&(
                <div style={{color:C.muted,fontSize:12,lineHeight:1.7,textAlign:"center",padding:"8px 0"}}>
                  Enter your CRA room above to see your refund potential.<br/>
                  Or enter last year's income and we'll estimate your room.
                </div>
              )}
            </div>
          );
        })()}

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
  const [kidAge,setKidAge]=useState("8-12");
  // Chore tracking removed — keep Family focused on household finances
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
  const earned=chores.filter(c=>c.done).reduce((a,c)=>a+c.reward,0);

  const choreIntegrations=[
    {name:"Skylight Calendar",icon:"🗓️",color:"#4A8FCC",desc:"Add chores as recurring tasks on your family's Skylight display.",url:"https://www.skylightframe.com",note:"Open Skylight app → Family Tasks → Add Task"},
    {name:"Alexa Routines",icon:"🔵",color:"#00CAFF",desc:"Trigger chore reminders through Amazon Echo devices.",url:"https://alexa.amazon.com",note:"Alexa app → More → Routines → Create Routine"},
    {name:"Cozi Family Organizer",icon:"📋",color:"#E85D26",desc:"Share chore lists across the whole family with Cozi.",url:"https://www.cozi.com",note:"Cozi app → To-Do Lists → Add family chore list"},
    {name:"OurHome App",icon:"🏠",color:"#6B4FA0",desc:"Dedicated chore and reward tracking for families.",url:"https://ourhomeapp.com",note:"OurHome → Chores → Import or create tasks"},
    {name:"Google Home",icon:"🏡",color:"#4285F4",desc:"Broadcast chore reminders on Google Nest speakers.",url:"https://home.google.com",note:"Google Home app → Routines → Add announcement"},
  ];

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

      {/* Chore Chart */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{color:C.greenBright,fontWeight:700}}>🏡 Chore Chart</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{color:C.greenBright,fontWeight:800}}>${(earned||0).toFixed(2)} earned</div>
            <button onClick={()=>setShowChoreIntegrations(v=>!v)} style={{background:C.teal+"22",border:`1px solid ${C.teal}44`,borderRadius:8,padding:"4px 10px",color:C.tealBright,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,cursor:"pointer"}}>🔗 Connect app</button>
          </div>
        </div>
        <Bar v={earned} max={Math.max(chores.reduce((a,c)=>a+c.reward,0),0.01)} color={C.green} h={6}/>
        <div style={{marginTop:12}}>
          {chores.map(ch=>(
            <div key={ch.id} onClick={()=>setChores(c=>c.map(x=>x.id===ch.id?{...x,done:!x.done}:x))} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
              <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${ch.done?C.green:C.border}`,background:ch.done?C.green:"none",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
                {ch.done&&<span style={{color:C.bg,fontSize:12,fontWeight:900}}>✓</span>}
              </div>
              <span style={{flex:1,color:C.cream,fontSize:14,textDecoration:ch.done?"line-through":"none"}}>{ch.task}</span>
              <span style={{color:C.gold,fontWeight:700}}>+${(ch.reward||0).toFixed(2)}</span>
            </div>
          ))}
        </div>
        {/* Add custom chore */}
        <div style={{marginTop:12,display:"flex",gap:8,alignItems:"center"}}>
          <input value={customChore.task} onChange={e=>setCustomChore(v=>({...v,task:e.target.value}))} placeholder="New chore…"
            style={{flex:2,background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.cream,fontSize:13,fontFamily:"inherit"}}/>
          <input value={customChore.reward} onChange={e=>setCustomChore(v=>({...v,reward:e.target.value}))} placeholder="$" type="number"
            style={{flex:1,background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.cream,fontSize:13,fontFamily:"inherit"}}/>
          <button onClick={()=>{if(!customChore.task)return;setChores(c=>[...c,{id:Date.now(),task:customChore.task,reward:parseFloat(customChore.reward)||0.50,done:false}]);setCustomChore({task:"",reward:""}); }}
            style={{background:C.green,border:"none",borderRadius:8,padding:"8px 12px",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13}}>+</button>
        </div>
      </Card>

      {/* Chore Integrations panel */}
      {showChoreIntegrations&&<Card style={{border:`1px solid ${C.teal}44`,background:C.tealDim}}>
        <div style={{color:C.tealBright,fontWeight:700,fontSize:14,marginBottom:4}}>🔗 Connect to Chore Apps</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Flourish can't push directly to these apps yet — but here's exactly how to sync your chore list to each platform.</div>
        {choreIntegrations.map((ci,i)=>(
          <div key={i} style={{background:C.card,borderRadius:14,padding:"12px 14px",marginBottom:8,border:`1px solid ${ci.color}22`}}>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:20}}>{ci.icon}</span>
              <div style={{flex:1}}>
                <div style={{color:C.cream,fontWeight:700,fontSize:13}}>{ci.name}</div>
                <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{ci.desc}</div>
              </div>
            </div>
            <div style={{background:ci.color+"14",borderRadius:8,padding:"7px 10px",color:ci.color,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,marginBottom:8}}>📱 {ci.note}</div>
            <a href={ci.url} target="_blank" rel="noopener noreferrer" style={{color:ci.color,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,textDecoration:"none"}}>Open {ci.name} →</a>
          </div>
        ))}
        <div style={{color:C.muted,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4,fontStyle:"italic"}}>Native 2-way sync is on the roadmap — vote for it in the app store review!</div>
      </Card>}
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
              <div style={{color:C.greenBright,fontWeight:900,fontSize:34,fontFamily:"'Playfair Display',serif",letterSpacing:5,marginBottom:8}}>{household?.code || "FLRSH" + Math.random().toString(36).slice(2,4).toUpperCase()}</div>
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
          <div style={{display:"flex",alignItems:"center",gap:7}}><FlourishMark size={20}/><span style={{color:"rgba(237,233,226,0.6)",fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>flourish</span></div>
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
          <div style={{display:"flex",alignItems:"center",gap:7}}><FlourishMark size={20}/><span style={{color:"rgba(237,233,226,0.65)",fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700}}>flourish</span></div>
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

  const [wSize,setWSize]=useState("medium");
  const [wContent,setWContent]=useState({safe:true,balance:true,health:true,nextBill:true,streak:false,cashFlow:false});
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

    {/* Native widget roadmap note removed — show only shipping features */}
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

// ── FEEDBACK CARD ─────────────────────────────────────────────────────────────
function FeedbackCard({onSend}){
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  if(sent) return (
    <div style={{background:C.teal+"12",border:`1px solid ${C.teal}33`,borderRadius:18,padding:"16px 18px",textAlign:"center",marginBottom:8}}>
      <div style={{fontSize:28,marginBottom:8}}>🙏</div>
      <div style={{color:C.tealBright,fontWeight:700,fontSize:14}}>Feedback received!</div>
      <div style={{color:C.muted,fontSize:12,marginTop:4}}>We read everything. Thank you.</div>
    </div>
  );
  return (
    <div style={{background:C.card,borderRadius:18,padding:"16px 18px",border:`1px solid ${C.border}`,marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:36,height:36,borderRadius:11,background:C.teal+"18",border:`1px solid ${C.teal}28`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>💬</div>
        <div>
          <div style={{color:C.cream,fontWeight:700,fontSize:14}}>Send feedback</div>
          <div style={{color:C.muted,fontSize:11,marginTop:1}}>Bug, idea, or anything — we read every message</div>
        </div>
      </div>
      <textarea
        value={text}
        onChange={e=>setText(e.target.value)}
        placeholder="What's on your mind?"
        rows={3}
        style={{width:"100%",background:C.cardAlt,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px",color:C.cream,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",resize:"vertical",boxSizing:"border-box",lineHeight:1.5,marginBottom:10}}
      />
      <button
        disabled={!text.trim()||sending}
        onClick={async()=>{
          if(!text.trim()) return;
          setSending(true);
          await onSend(text.trim());
          setSent(true);
          setSending(false);
        }}
        style={{width:"100%",background:text.trim()?C.teal:"rgba(255,255,255,0.06)",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:700,fontSize:13,cursor:text.trim()?"pointer":"default",fontFamily:"'Plus Jakarta Sans',sans-serif",opacity:text.trim()?1:0.4,transition:"all 0.2s"}}>
        {sending?"Sending…":"Send feedback →"}
      </button>
    </div>
  );
}

function Settings({data,setAppData,setScreen:navToScreen,onClose,onReset,theme,toggleTheme,onOpenWidget,onDisconnectBank,onAddBank,onDeleteData,bankConnected,needsReconnect,reconnectLoading,onReconnect,onSendFeedback}){
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
    {/* ── Feedback ────────────────────────────────────────────── */}
    {onSendFeedback&&<FeedbackCard onSend={onSendFeedback}/>}

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
    const income = FinancialCalcEngine.cashFlow(data).monthlyIncome || DEMO.income;
    const balance = parseFloat((accounts[0]?.balance||DEMO.balance).toString().replace(/,/g,""));
    const spending = txns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const coachCatOverrides = (() => { try { return JSON.parse(localStorage.getItem("flourish_cat_overrides")||"{}"); } catch { return {}; } })();
    const getCoachCat = (t) => coachCatOverrides[t.id] || t.cat;
    const topCats = Object.entries(
      txns.filter(t=>t.amount>0 && getCoachCat(t)!=="Income")
        .reduce((acc,t)=>{const c=getCoachCat(t);acc[c]=(acc[c]||0)+t.amount;return acc;},{})
    ).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: $${(v||0).toFixed(0)}`).join(", ");

    const goals = (data.goals||[]).map(g=>`${g.name}: $${parseFloat(g.saved||0).toFixed(0)} saved of $${parseFloat(g.target||0).toFixed(0)} target${g.monthly?`, $${g.monthly}/mo contribution`:""}`).join("; ")||"none set";
    const bills = (data.bills||[]).map(b=>`${b.name} $${b.amount}/mo${b.arrears?` (arrears: $${b.arrears})`:""}` ).join("; ")||"none tracked";
    const debts = (data.debts||[]).map(d=>`${d.name} $${parseFloat(d.balance||0).toFixed(0)}${d.rate?` @ ${d.rate}%`:""}`).join("; ")||"none";
    const ret = data.profile?.retirement||{};
    const retInfo = Object.entries(ret).filter(([,v])=>parseFloat(v)>0).map(([k,v])=>`${k}: $${v}`).join(", ")||"none entered";
    // RRSP room data
    const rrspRoomData = (() => {
      const r = RRSPRoomEngine.calculate(data);
      if(!r || !r.hasEnoughData) return "not entered";
      const parts = [];
      if(r.totalRoom>0) parts.push(`total room $${r.totalRoom.toLocaleString()}`);
      if(r.remainingRoom>0) parts.push(`$${r.remainingRoom.toLocaleString()} remaining`);
      if(r.maxRefund>0) parts.push(`potential refund ~$${r.maxRefund.toLocaleString()}`);
      if(r.isOverContrib) parts.push("WARNING: over-contributed");
      return parts.join(", ") || "not entered";
    })();
    return `You are a warm, expert personal finance coach for Flourish Money (${country==="CA"?"Canada":"USA"}).
User financial snapshot:
- Chequing balance: $${(balance||0).toFixed(2)}
- Monthly income: $${(income||0).toFixed(2)}${(data.incomes||[]).some(i=>i.isVariable) ? " (variable income — recommend wider cash buffers)" : ""}
- Recent spending total: $${(spending||0).toFixed(2)}
- Top spending categories: ${topCats||"no data"}
- Accounts: ${accounts.map(a=>`${a.name} (${a.type}) $${a.balance}`).join("; ")||"none linked"}
- Bills: ${bills}
- Debts: ${debts}
- Savings goals: ${goals}
- Retirement accounts: ${retInfo}
- RRSP contribution room: ${rrspRoomData}
- Country: ${country}

When the user discusses or agrees to a goal, contribution amount, or financial plan, end your reply with a JSON block on its own line so the app can auto-update:
FLOURISH_UPDATE:{"action":"update_goal","name":"<goal name>","target":<number>,"saved":<number>,"monthly":<number>}
Or to add a new goal:
FLOURISH_UPDATE:{"action":"add_goal","name":"<name>","target":<number>,"saved":<number>,"monthly":<number>}
Only include this block when the user has explicitly agreed to a specific number or plan.

Keep responses concise (3-5 sentences max), practical, and friendly. Use $ amounts when relevant. Never be preachy.
CRITICAL RULES:
- The balances and transactions shown are synced from the user's bank, but they may occasionally be delayed by a few hours, missing pending charges, or have a transaction miscategorised. If the user's question depends on exact current figures, you can say "this is based on your last sync" and suggest refreshing their connection in Settings — that is helpful, not a sign of unreliability.
- If a user says their balance looks wrong, acknowledge it, suggest refreshing in Settings, and adjust your confidence in any advice that depends on that figure.
- Never mention Plaid by name to users.`;
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
  const PROMO_CODES=["FOUNDER","BETA100"];
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
function FirstVisitScreen({data, onDismiss, setScreen}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { safeAmount } = SafeSpendEngine.calculate(data);
  const toMo = (amt,freq)=>{const a=parseFloat(amt||0);return freq==="weekly"?a*4.333:freq==="biweekly"?a*2.167:freq==="semimonthly"?a*2:freq==="monthly"?a:a*2.167;};
  const incomeAmt = (data.incomes||[]).filter(i=>parseFloat(i.amount)>0).reduce((s,i)=>s+toMo(i.amount,i.freq),0);
  const billsAmt = (data.bills||[]).reduce((s,b)=>s+parseFloat(b.amount||0),0);
  const safeFloor = incomeAmt * 0.15;
  const name = data.profile?.name || "there";

  // ── State-based CTA logic ─────────────────────────────────────────────────
  // Determine exactly where the user is and what one action they need next
  const hasBankConnected = data.bankConnected;
  const hasIncome        = incomeAmt > 0;
  const hasEnoughData    = hasBankConnected && hasIncome;

  const ctaState = !hasBankConnected ? "connect_bank"
                 : !hasIncome        ? "add_income"
                 :                     "see_number";

  const ctaConfig = {
    connect_bank: {
      icon:    "🏦",
      title:   "Connect your bank",
      body:    "Flourish needs your live balance and transactions to calculate your safe-to-spend number accurately.",
      cta:     "Connect your bank →",
      color:   C.teal,
      action:  () => { onDismiss(); if(setScreen) setScreen("settings"); },
    },
    add_income: {
      icon:    "💰",
      title:   "Add your income",
      body:    "Your bank is connected. Enter how much you earn to unlock your personalised safe-to-spend number.",
      cta:     "Add your income →",
      color:   C.gold,
      action:  () => { onDismiss(); if(setScreen) setScreen("settings"); },
    },
    see_number: {
      icon:    null,
      title:   null,
      body:    "After bills, savings buffer, and upcoming expenses",
      cta:     "Go to my dashboard →",
      color:   C.green,
      action:  onDismiss,
    },
  };

  const cta = ctaConfig[ctaState];

  // Progress indicator — shows user how close they are to the full picture
  const steps = [
    { label: "Bank connected",  done: hasBankConnected },
    { label: "Income entered",  done: hasIncome },
    { label: "Ready",           done: hasEnoughData },
  ];

  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 28px",textAlign:"center"}}>
      {/* Ambient glow */}
      <div style={{position:"absolute",top:"20%",left:"50%",transform:"translateX(-50%)",width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${cta.color}14 0%,transparent 65%)`,pointerEvents:"none"}}/>

      <div style={{position:"relative",width:"100%",maxWidth:360}}>

        {/* Welcome */}
        <div style={{color:C.muted,fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:16,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
          Welcome, {name}
        </div>

        {/* The Number — only shown when data is ready */}
        {ctaState === "see_number" ? (
          <div style={{marginBottom:8}}>
            <div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4}}>You can safely spend</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:900,lineHeight:1}}>
              <span style={{fontSize:22,color:C.greenBright+"88",verticalAlign:"top",marginTop:12,display:"inline-block"}}>$</span>
              <span style={{fontSize:88,color:C.greenBright,letterSpacing:-4,textShadow:`0 0 80px ${C.green}40`}}>
                {Math.max(0,safeAmount).toFixed(0)}
              </span>
            </div>
            <div style={{color:C.muted,fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:4}}>today</div>
          </div>
        ) : (
          <div style={{marginBottom:8}}>
            <div style={{fontSize:64,marginBottom:12}}>{cta.icon}</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:900,color:cta.color,marginBottom:8,lineHeight:1.2}}>
              {cta.title}
            </div>
          </div>
        )}

        {/* Body text */}
        <div style={{color:C.mutedHi,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6,maxWidth:280,margin:"0 auto 24px"}}>
          {cta.body}
        </div>

        {/* Setup progress — shown when not fully set up */}
        {ctaState !== "see_number" && (
          <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:24,alignItems:"center"}}>
            {steps.map((s,i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{
                  width:20,height:20,borderRadius:"50%",
                  background:s.done?C.green:"rgba(255,255,255,0.08)",
                  border:`1.5px solid ${s.done?C.green:C.border}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10,fontWeight:800,color:s.done?"#000":"transparent",
                  transition:"all 0.3s",flexShrink:0
                }}>{s.done?"✓":""}</div>
                <span style={{color:s.done?C.cream:C.muted,fontSize:10,fontWeight:s.done?700:400,fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap"}}>
                  {s.label}
                </span>
                {i < steps.length-1 && <div style={{width:16,height:1,background:C.border,marginLeft:2}}/>}
              </div>
            ))}
          </div>
        )}

        {/* Breakdown — progressive disclosure (only when data is ready) */}
        {ctaState === "see_number" && showBreakdown && (
          <div style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:18,padding:"16px 20px",marginBottom:24,textAlign:"left"}}>
            <div style={{color:C.muted,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>How this is calculated</div>
            {[
              ["💰","Monthly income",`$${incomeAmt.toFixed(0)}`,C.greenBright],
              ["📅","Bills this period",billsAmt>0?`−$${billsAmt.toFixed(0)}`:"None tracked",billsAmt>0?C.gold:C.muted],
              ["🛡️","Safety buffer (15%)",`−$${safeFloor.toFixed(0)}`,C.teal],
              ["✅","Available to spend",`$${Math.max(0,safeAmount).toFixed(0)}`,C.greenBright],
            ].map(([icon,label,val,col],i,arr)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}22`:"none"}}>
                <span style={{color:C.mutedHi,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{icon} {label}</span>
                <span style={{color:col,fontWeight:700,fontSize:13,fontFamily:"'Playfair Display',serif"}}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Primary CTA — state-driven */}
        {ctaState === "see_number" && !showBreakdown ? (
          <button onClick={()=>setShowBreakdown(true)}
            style={{width:"100%",background:`linear-gradient(135deg,${C.green},${C.greenBright})`,border:"none",borderRadius:16,padding:"18px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:`0 8px 32px ${C.green}40`,marginBottom:12}}>
            See how this works →
          </button>
        ) : (
          <button onClick={cta.action}
            style={{width:"100%",background:`linear-gradient(135deg,${cta.color},${cta.color}cc)`,border:"none",borderRadius:16,padding:"18px",color:ctaState==="see_number"?"#fff":"#000",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:`0 8px 32px ${cta.color}40`,marginBottom:12}}>
            {cta.cta}
          </button>
        )}

        <button onClick={onDismiss} style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"8px"}}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const NAV=[
  {id:"home",  icon:"home",     label:"Today"},
  {id:"plan",  icon:"calendar", label:"Future"},
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
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [factorId, setFactorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSignup = async () => {
    setLoading(true); setError("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
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
    color: "#EDE9E2", fontSize: 15, fontFamily: "Plus Jakarta Sans,sans-serif",
    outline: "none", boxSizing: "border-box", marginBottom: 12
  };

  const btnStyle = (active) => ({
    width: "100%", padding: "15px", borderRadius: 14, border: "none",
    background: active ? "linear-gradient(135deg,#00D68F,#00B37A)" : "rgba(0,214,143,0.3)",
    color: "#021208", fontWeight: 800, fontSize: 15,
    fontFamily: "Plus Jakarta Sans,sans-serif", cursor: active ? "pointer" : "not-allowed",
    boxShadow: active ? "0 4px 20px rgba(0,214,143,0.4)" : "none"
  });

  return (
    <div style={{ minHeight: "100dvh", background: "#050D09", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400, animation: "fadeUp .5s ease both" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}><FlourishMark size={120}/></div>
          <div style={{ color: "#6B7A6E", fontSize: 13, fontFamily: "Plus Jakarta Sans,sans-serif", marginTop: 4 }}>Your financial coach</div>
        </div>
        <div style={{ background: "#0D1F12", borderRadius: 24, padding: 28, border: "1px solid rgba(255,255,255,0.08)" }}>
          {mode === "mfa_setup" && (
            <div>
              <div style={{ fontFamily: "Playfair Display,serif", fontSize: 20, fontWeight: 900, color: "#EDE9E2", marginBottom: 6 }}>Set up 2-factor auth</div>
              <div style={{ color: "#6B7A6E", fontSize: 13, fontFamily: "Plus Jakarta Sans,sans-serif", marginBottom: 20, lineHeight: 1.6 }}>Scan this QR code with Google Authenticator, then enter the 6-digit code.</div>
              {qrUrl && <img src={qrUrl} alt="MFA QR" style={{ width: "100%", borderRadius: 12, marginBottom: 16, background: "#fff", padding: 8 }} />}
              <input style={{ ...inpStyle, letterSpacing: 6, textAlign: "center", fontSize: 22 }} placeholder="000000" value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,""))} maxLength={6} />
              {error && <div style={{ color: "#FF6B6B", fontSize: 12, marginBottom: 12 }}>{error}</div>}
              <button style={btnStyle(!loading && mfaCode.length === 6)} onClick={handleMFASetup} disabled={loading || mfaCode.length !== 6}>{loading ? "Verifying..." : "Verify & Continue"}</button>
            </div>
          )}
          {mode === "mfa_verify" && (
            <div>
              <div style={{ fontFamily: "Playfair Display,serif", fontSize: 20, fontWeight: 900, color: "#EDE9E2", marginBottom: 6 }}>Enter your code</div>
              <div style={{ color: "#6B7A6E", fontSize: 13, fontFamily: "Plus Jakarta Sans,sans-serif", marginBottom: 20 }}>Open Google Authenticator and enter the 6-digit code for Flourish Money.</div>
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
                    style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "Plus Jakarta Sans,sans-serif", fontWeight: 700, fontSize: 13,
                      background: mode === m ? "#00D68F" : "transparent", color: mode === m ? "#021208" : "#6B7A6E" }}>
                    {m === "login" ? "Log In" : "Sign Up"}
                  </button>
                ))}
              </div>
              {success && <div style={{ color: "#00D68F", fontSize: 13, marginBottom: 16, background: "rgba(0,214,143,0.1)", padding: "10px 14px", borderRadius: 10 }}>{success}</div>}
              <input style={inpStyle} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" name="email" />
              <input style={{ ...inpStyle, marginBottom: 20 }} type="password" placeholder="Password (min 8 characters)" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" name="password" />
              {error && <div style={{ color: "#FF6B6B", fontSize: 12, marginBottom: 12 }}>{error}</div>}
              <button style={btnStyle(!loading && email && password.length >= 8)} onClick={mode === "login" ? handleLogin : handleSignup} disabled={loading || !email || password.length < 8}>
                {loading ? "..." : mode === "login" ? "Log In" : "Create Account"}
              </button>
              {mode === "signup" && <div style={{ color: "#6B7A6E", fontSize: 11, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>By signing up you agree to our Terms of Service and Privacy Policy.</div>}

            </div>
          )}
        </div>
      </div>
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
    return "home";
  })();
  const [screen,setScreen]=useState(initialScreen);
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [showNotifs,setShowNotifs]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
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

  // ── Cross-device sync via Supabase ───────────────────────────
  // On login: pull saved state from Supabase and hydrate localStorage
  useEffect(()=>{
    if(!user) return;
    (async()=>{
      try {
        const { data, error } = await supabase
          .from("user_data")
          .select("state")
          .eq("user_id", user.id)
          .single();
        if(error || !data?.state) return; // no saved state yet
        const remote = typeof data.state === "string" ? JSON.parse(data.state) : data.state;
        if(!remote || typeof remote !== "object") return;
        // Only hydrate if remote is more complete than local
        if(remote.onboarded) {
          setOnboarded(true);
          if(remote.appData) setAppData(remote.appData);
          if(remote.household) setHousehold(remote.household);
          if(remote.isPremium) setIsPremium(true);
          if(remote.checkInBonus) setCheckInBonus(remote.checkInBonus);
          saveState(remote); // write to localStorage for offline use
        }
      } catch(e) { /* sync failure is non-fatal */ }
    })();
  }, [user?.id]); // eslint-disable-line

  // On state change: push to Supabase (debounced — only when settled)
  useEffect(()=>{
    if(!user || !onboarded) return;
    const timer = setTimeout(async()=>{
      try {
        const state = JSON.stringify({onboarded,appData,household,isPremium,checkInBonus});
        await supabase.from("user_data").upsert(
          { user_id: user.id, state, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      } catch(e) { /* sync failure is non-fatal — localStorage is the source of truth */ }
    }, 3000); // 3s debounce — don't hammer on every keystroke
    return () => clearTimeout(timer);
  }, [onboarded, appData, household, isPremium, checkInBonus]); // eslint-disable-line

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
            bills: autoDetectPaidBills(d.bills||[], transactions),
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

  // ── Auth gate ───────────────────────────────────────────────────
  if(authLoading)return <div style={{minHeight:"100dvh",background:"#050D09",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{animation:"pulse 1.5s infinite"}}><FlourishMark size={72}/></div></div>;
  if(!user)return <AuthScreen onAuth={u=>setUser(u)}/>;

  if(showWrapped)return <MoneyWrapped data={appData||{}} onClose={()=>setShowWrapped(false)}/>;
  if(showWhatIf)return <WhatIfSimulator data={appData||{}} onClose={()=>setShowWhatIf(false)}/>;
  if(showCheckIn)return <WeeklyCheckInModal data={appData||{}} onClose={()=>setShowCheckIn(false)} onComplete={(pts)=>{setCheckInBonus(prev=>Math.min(20,prev+pts));setShowCheckIn(false);}}/>;
  if(!onboarded)return <Onboarding onComplete={d=>{setAppData(d);setOnboarded(true);}} onViewLegal={s=>setScreen(s)} userId={user?.id}/>;
  // First-visit focused screen — shown once after onboarding, dismissed permanently
  if(!firstVisitDone&&appData)return <FirstVisitScreen data={appData} onDismiss={dismissFirstVisit} setScreen={setScreen}/>;
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
    const handleFeedback = async (msg) => {
      try {
        await supabase.from("feedback").insert({
          user_id: user?.id||null,
          email: user?.email||null,
          message: msg,
          created_at: new Date().toISOString(),
          app_version: "v1-beta",
        });
      } catch(e) {
        // Fallback — open email client
        window.open(`mailto:hello@flourishmoney.app?subject=Flourish Feedback&body=${encodeURIComponent(msg)}`);
      }
    };
    if(showSettings)return <Settings data={appData} setAppData={setAppData} onClose={()=>setShowSettings(false)} onReset={handleReset} theme={theme} toggleTheme={toggleTheme} onOpenWidget={()=>{setShowSettings(false);setScreen("widget");}} onDisconnectBank={disconnectBank} onAddBank={handleAddNewBank} onDeleteData={deleteAllData} bankConnected={appData?.bankConnected||false} needsReconnect={needsReconnect} reconnectLoading={reconnectLoading} onReconnect={handleReconnectBank} setScreen={s=>{setShowSettings(false);setScreen(s);}} onSendFeedback={handleFeedback}/>;
    if(screen==="home")return <Dashboard data={dataWithHousehold} setScreen={setScreen} setShowNotifs={setShowNotifs} isDesktop={isDesktop} onUpgrade={()=>setShowPaywall(true)} checkInBonus={checkInBonus} onCheckIn={()=>setShowCheckIn(true)} onWhatIf={()=>setShowWhatIf(true)} onWrapped={()=>setShowWrapped(true)} dashLayout={dashLayout} setDashLayout={setDashLayout} setGoalsTab={setGoalsTab} isRefreshing={isRefreshing}/>;
    if(screen==="plan")return <PlanAhead data={dataWithHousehold} setAppData={setAppData} setScreen={setScreen}/>;
    if(screen==="spend")return <SpendScreen data={dataWithHousehold} setAppData={setAppData} setScreen={setScreen}/>;
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
    {id:"plan",  icon:"calendar",label:"Future"},
    {id:"spend", icon:"card",    label:"Activity"},
    {id:"coach", icon:"sparkles",label:"Guidance"},
    {id:"family",icon:"users",   label:"Family"},
    {id:"goals", icon:"chartUp", label:"Goals"},
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
              {showNotifs?"Notifications":showSettings?"Settings":screen==="home"?"Today":screen==="plan"?"Future":screen==="spend"?"Activity":screen==="coach"?"Guidance":screen==="family"?"Family":screen==="goals"||screen==="credit"?"Goals & Wealth":"Today"}
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
      </div>
    </div>
  );
}
