import { parse as parseCsv } from "@std/csv";
import * as cheerio from "cheerio";
import getStream from "get-stream";

import {
  defineDriver,
  type FrameLocator,
  Logger,
  type NotifyFn,
  type Page,
  parseFloatSafely,
  Transaction,
  type TransactionMeta,
} from "../lib.ts";

const DRIVER_NAME = "dbs.com.sg";

const TRANSACTION_CODES: Record<string, string> = {
  "ABHP": "Bill Payment to Abwin Hire Purchase",
  "ABW": "Bill Payment to Abwin Insurance",
  "AC": "Administrative Charge",
  "ACCT": "ATM CashCard or FlashPay Top Up",
  "ACO / ACOE": "Cashier's Order Equivalent",
  "ACR": "Accounting & Corporate Regulatory Authority",
  "ACS": "Bill Payment to Anglo Chinese School (Indep)",
  "ACT": "CashCard/FlashPay Top-up",
  "ADJ": "Adjustment",
  "ADP": "Deposit",
  "ADV": "Advice",
  "ADVE": "Error Correction of Advice",
  "AFD": "Fixed Deposit Placement",
  "AG": "Accountant General",
  "AHL": "Agency Housing Loan",
  "AHP": "Bill Payment to Abwin Hire Purchase",
  "AIA": "Bill Payment to AIA",
  "AIC": "Purchase International Calling Card",
  "ALEX / ALX": "Bill Payment to Alexandra Hospital",
  "AMEX": "Bill Payment to American Express Intl Inc",
  "AMK": "Donation to AMKFSC Community Services",
  "ANN-FEE": "Annual Fee For Credit Facilities",
  "APC": "CIRRUS Purchase",
  "APP": "Top-up Mobile Pre-paid Card",
  "ARC": "Donation to Arc(S) - E2C Donation",
  "AS": "Purchase / Sale of Shares",
  "ASC / A-SC": "Cash Withdrawal Service Charge",
  "ASH": "Donation to Assisi Hospice",
  "ASN": "Associations",
  "ATFEE": "Monthly Account Fee",
  "ATINT": "Interest Earned",
  "ATM": "ATM Transactions",
  "ATR": "Funds Transfer",
  "AVA": "Agri-food & Veterinary Authority of Singapore (AVA)",
  "AWF": "ATM Withdrawal Fee",
  "AWL": "Cash Withdrawal",
  "AWW": "Donation to AWWA",
  "BAA": "Debit Card Annual Fee",
  "BAM": "Debit Card Retrieval",
  "BAR": "Debit Card Replacement/Lost",
  "BAST": "Debit Card Settlement Amount",
  "BAT": "Debit Card Transaction",
  "BAT TRAANSIT / BAT TRANSIT": "Debit Card Transaction for Transit Expenses",
  "BB": "Baby Bonus Scheme",
  "BILL": "Bill Payment",
  "BINT": "Bonus Interest",
  "BITI": "Bonus Interest - FAST Receipt",
  "BITU": "Bonus Interest Payout",
  "BL": "Custodian Service Charges",
  "BLTL": "Term Loan",
  "BNK": "Banks (financing loans, safe deposit box rental,etc)",
  "BOA": "Bill Payment to Bank of America Cards",
  "BOC": "Bill Payment to BOC Credit Cards",
  "BP to SHB": "Bill Payment to Starhub",
  "BP to SPS": "Bill Payment to SP Services",
  "BP to ST": "Bill Payment to Singtel",
  "BRCF": "Revolving Credit Facility",
  "BSP": "Bill Payment to Bayshore Park â€“ MCST 1272",
  "BSTL": "Short Term Loan",
  "CAB": "Bill Payment to Cabcharge Asia Pte Ltd",
  "CAD": "Corporate Actions - Local (by Investor Services)",
  "CAF": "Corporate Actions - Foreign (by Investor Services)",
  "CAM": "Cash Deposit Machine",
  "CAN": "Cancellation Transfer",
  "CAS": "Donation to CASA Raudha Women Home",
  "CB": "Postage Charge for Cheque Book",
  "CBC": "Foreign Cheques For Collection",
  "CBC A / CBC AGT": "Foreign Cheques For Collection Agent Charges",
  "CBC C / CBC CHG": "Foreign Cheques For Collection Comm & Charges",
  "CBP": "Foreign Cheques Purchased",
  "CBP A / CBP AGT": "Foreign Cheques Purchased Agent Charges",
  "CBP C / CBP CHG": "Foreign Cheques Purchased Comm & Charges",
  "CBT": "Bill Payment to Chan Brothers Travel",
  "CCC": "Credit Card Companies",
  "CCCC": "NETS Proceeds",
  "CCF": "Donation to Children's Cancer Foundation",
  "CCO": "Charitable Organisation",
  "CCR": "CashCard/FlashPay Refund",
  "CCT": "CashCard/FlashPay Top-up",
  "CDC": "Community Development Councils",
  "CDE": "ComfortDelGro Engineering Pte Ltd",
  "CDF": "Coin Deposit Fee",
  "CDM": "Coin Deposit Machine",
  "CDP": "Dividends/Cash Distribution",
  "CES": "Inland Revenue Authority of Singapore (Cess)",
  "CF": "Cancellation Fee",
  "CFAF / CRCF / CRPT / CSTL / CTLF": "Commitment Fee",
  "CFC": "ATM Card/CashCard Fee",
  "CFL": "Donation to Catholic Foundation",
  "CGH": "Bill Payment to Changi General Hospital",
  "CGI": "SAYE Cash Gift Interest",
  "CHA":
    "Donation to Community Chest of Singapore / People's Association Community Development Fund (PACDF) / SINDA / SINDA - IBR / World Vision International",
  "CHAR": "Donation to People's Association Community Development Fund (PACDF)",
  "CHD": "Child Care Services",
  "Cheers": "ESSO Petrol Station, SPC Petrol Station",
  "CHN / CHNE": "Donation",
  "CHP": "Bill Payment to Chuan Park â€“ MCST 1278",
  "CHQ": "Cheque",
  "CHQ-": "Error Correction of Cheque",
  "CHQBK": "Cheque Book Fee/Charge",
  "CHQFEE": "Cheque Fee",
  "CHQ-L": "Late Cheque",
  "CHR": "Returned Cheque",
  "CHRE": "Error Correction of Returned Cheque",
  "CHW": "Cheque Writing",
  "CHW CHG": "Cheque Writing Comm & Charges",
  "CIM": "Bill Payment to CIMB Credit Cards",
  "CIS / CISC": "Bill Payment to Certis CISCO Security Pte Ltd",
  "CIT": "Bill Payment to City Index",
  "CIV": "CPF Investment Account Transaction",
  "CL": "Computer Loan",
  "Claim": "Dividend Claim",
  "CLB": "Private Clubs",
  "CLFN / CLPA / CLPN / CLVA / CLVN / CLXA / CLXN": "Term Loan",
  "CMC ": "Bill Payment to CMC Market(s) Pte Ltd ",
  "CML": "Club Membership Loan",
  "CO": "Cashier's Order",
  "CO C / CO CHG": "Cashier's Order Comm & Charges",
  "COE": "LTA COE Bidding",
  "COS": "Cashcard Proceeds",
  "CPA": "Donation to Cerebal Palsy Alliance",
  "CPF": "Central Provident Fund Board",
  "CPF INV": "CPF Investment Account Transaction",
  "CPF MSS PAYMENT": "CPF Minimum Sum Scheme Payment",
  "CPK": "Carpark Charges",
  "CPP": "CashCard Purchase (NETS)",
  "C-PUR": "CIRRUS Purchase",
  "CRA": "CreditAssist",
  "CRD": "Bill Payment to Cordlife Group Limited",
  "CRE": "Creation Transfer",
  "CRINT": "Credit Interest",
  "CSC": "Cash Withdrawal Service Charge",
  "CSG": "Bill Payment to Castle Green â€“ MCST 2178",
  "CSH": "Cash",
  "CSHE": "Error Correction for Cash Transaction",
  "CSL": "Consolidated Amount for Unposted Transactions",
  "CSR": "Bill Payment to Cold Storage Retail ",
  "CST": "Bill Payment to CISCO Security Technology",
  "CSW / CSWC": "Bill Payment to Chinese Swimming Club ",
  "CTC": "Bill Payment to CTC Travel",
  "CTP": "Bill Payment to China Taiping Insurance (S) Pte Ltd",
  "CTS": "Bill Payment to Courts (S) Pte Ltd",
  "CTU": "Cash Top Up",
  "CUS": "Singapore Customs",
  "CUT": "Call Centre Unit Trust",
  "C-WDL": "CIRRUS Cash Withdrawal",
  "D2P":
    "D2Pay transaction, <a href='bank-payment-enets-d2pay-application.html' target='_blank' style='color:black'>Learn More</a>",
  "DBS One": "Unit Trust from DBS One Customer",
  "DBSC": "Bill Payment to DBS/POSB Credit Cards",
  "DBSF": "Bill Payment to DBS SF",
  "DBSLine": "Unit Trust from DBSLine Customer",
  "DBSV": "Bill Payment to DBS Vickers Securities (S) Pte Ltd",
  "DCL": "Bill Payment to DBS Cashline",
  "DCPL": "Bill Payment to DCS Card Centre",
  "DCR / DCRT": "Instant Direct Credit",
  "DDBT": "Instant Direct Debit",
  "DED": "Social Development Unit",
  "DEFI / DEFP": "Interest",
  "DELAP / DELAPMT": "Delivery Against Payment",
  "Delivery Hero": "Food Panda",
  "DEP": "Deposit",
  "DEP CCR": "CashCard/FlashPay Refund",
  "DEP CCT": "Reversal of CashCard or FlashPay Top-up",
  "DEP CPP": "Reversal of CashCard or FlashPay Sales",
  "DEP HCT": "Reversal of HomeNETS CashCard Top-up ",
  "DEP IPS": "Reversal of Interlink Transaction ",
  "DEP SHR": "Reversal of Share Transaction",
  "DEP-L": "Deposit (Late)",
  "DFS Ventures": "Duty Free (DFS)",
  "DIN / DINT": "Overdraft Interest",
  "DIV": "Dividends Payment",
  "DNT": "Donations",
  "DOS": "Department of Statistics,Ministry of Trade and Industry",
  "DPH": "Donation to Dover Park Hospice",
  "DSA": "Donation to Down Syndrome Association (S)",
  "E / EC": "Error Correction",
  "EAS": "Bill Payment to East Asia Institute of Management",
  "ECM": "E-Commerce Transactions",
  "EDB": "Economic Development Board",
  "EDU":
    "Bill Payment to Mgt Devt Institute of Singapore / Singapore Indian Development Association (SINDA) - Step Tuition Fees , Project Teach Fee",
  "EFX": "Donation to Evangel Family Church",
  "EHD": "Environmental Health Department",
  "ENV": "Ministry of the Environment (all other payments)",
  "EPS": "Share Payment",
  "EQM": "Payments for Equipment and Machinery",
  "ERS": "ERS",
  "ESA": "IPO",
  "ESA ATM": "IPO Refund",
  "ESP": "Bill Payment to ES Power by Environmental Solutions (Asia) Pte Ltd",
  "ETIC": "Bill Payment to Easy Tickets",
  "EZF": "Convenience Fee To EZ-Link Pte Ltd",
  "EZT": "EZ-Link Card Top-up",
  "FAFY": "Fixed Advance Facility",
  "FCA / FCCA": "Foreign Currency Current Account",
  "FCB / FCBC": "Donation to Faith Community Baptist Church ",
  "FCD": "Food Control Department",
  "FCHL": "Foreign Currency Housing Loan",
  "FCNOT": "Foreign Currency Note",
  "FD": "Fixed Deposit Placement",
  "FD PLMT": "Fixed Deposit Placement",
  "FD WDL": "Fixed Deposit Withdrawal",
  "FDD": "Fixed Deposit Placement",
  "FDI": "Fixed Deposit Interest",
  "FDP / FDW": "Fixed Deposit Principal Amount",
  "FEE": "Instant Direct Debit Fee",
  "FIN": "Finance Companies",
  "FPF": "Flash Pay Fee",
  "FPN": "Flash Pay Fee to NETS",
  "FPR": "Flash Pay Refund",
  "FPT": "Flash Pay Top-up",
  "FR CDA": "CDA closure proceeds",
  "FR03 / FR035 / FR039 / FR55 / FR551OT":
    "Ad hoc payment/debit transactions charged by the bank",
  "FRIC": "Foreign Remittance Inward Collection",
  "FSA": "Further StudyAssist",
  "FSEC": "Bill Payment to KGI Securities (Singapore)",
  "FSG": "Bill Payment to Fund Singapore",
  "FTP": "Bill Payment to Flame Tree Park â€“ MCST 1584 / Brandsfever Pte Ltd",
  "FWL": "Central Provident Fund Board (Foreign Workers' Levy)",
  "FXG": "Hedging Gain",
  "FXL": "Hedging Loss",
  "GAS": "Petroleum (use of card issued by petroleum cos)",
  "GC": "GST Credits",
  "GD": "Growth Dividend",
  "GEL": "Bill Payment to Great Eastern Life",
  "GELL": "Bill Payment to Great Eastern Life (Life Policy)",
  "GFT": "Gift Deposit",
  "GKGS": "Bill Payment to CIMB Securities Pte Ltd",
  "GNI": "Bill Payment to Philip Securities (Pte) Ltd",
  "GNIF": "Guaranteed Notes Issuance Facility",
  "GOV / GOVT PAYOUT": "Government Payout",
  "GR / GRO": "Payments or Collections via GIRO",
  "GRB": "Bill Payment to GrabTaxi Pte Ltd",
  "GRC": "Collection",
  "GRF": "GIRO Returned Fee",
  "GRP": "Payment",
  "GRR": "GIRO Returned Fee Refund",
  "GRS": "Payroll",
  "GSE": "GSTV Seniors",
  "GSI": "Singapore Government Securities Interest",
  "GSP": "Singapore Government Securities Principal",
  "GST": "Inland Revenue Authority of Singapore (GST)",
  "GSV": "GST VOUCHER",
  "GSX": "GSTV SPECIAL",
  "GTR": "Fund transfer from linked-SA to CA",
  "GTR-CB": "Transfer from linked SA for cheque book related charges",
  "GTR-CHQ": "Transfer from linked SA for cheques issued",
  "GTR-GR": "Transfer from linked SA for Giro deduction",
  "GVR": "Gift Voucher",
  "HAD": "Ministry of the Environment (Hawkers Dept)",
  "HAM": "Bill Payment to Havenport AM Trust A/C",
  "HANBAOBAO PTE. LTD": "Macdonalds",
  "HCCT": "CashCard Top Up (HomeNETS)",
  "HCT": "HomeNETS CashCard Top-up",
  "HDB": "Bill Payment to Housing & Development Board",
  "HDS": "Home Delivery Services",
  "HGC": "Donation to Heart of God Church",
  "HHL": "HDB Housing Loan",
  "HL": "Mortgage Loan",
  "HLFN / HLPA / HLPN / HLVA / HLVN / HLXA / HLXN": "Term Loan",
  "HOS": "Hospitals",
  "HP": "Hire Purchase",
  "HPN": "Handphone",
  "HSB": "Bill Payment to HSBC Credit Cards",
  "HSC": "HomeNETS CashCard Top-up Service Charge",
  "HSL / HSLI":
    "Bill Payment to HSBC LIFE (SINGAPORE) PTE LTD for Policy Premium",
  "I-BANK": "Internet Banking",
  "IBAS": "Settlement of Securities by Investor Services",
  "IBCL": "Online Account Closure",
  "IBG": "Payments / Collections via GIRO",
  "ICA followed by set of numbers (e.g. ICA CC1234567890)":
    "Immigration and Checkpoint Authority",
  "ICB":
    "Bill Payment to ICBC Singapore Credit Cards / Renminbi Credit Cards / VISA SGC Credit Cards / Visa USD Credit Cards",
  "ICS": "Premium for Fire Insurance Policy",
  "ICSG": "General Insurance",
  "ICSL": "Life Insurance",
  "ICT": "FAST or PayNow Payment / Receipt",
  "IDD": "Inward Demand Draft",
  "IDT": "FAST payment collected via GIRO setup",
  "IFA": "Bill Payment to IFast Financial Pte Ltd",
  "IFD": "Fixed Deposit Placement",
  "IG": "DBS Interest Guard",
  "IGA": "Bill Payment to IG",
  "Ikano Pte Ltd": "IKEA",
  "ILFN / ILPA / ILPN / ILVA / ILVN / ILXA / ILXN": "Term Loan",
  "IMH": "Bill Payment to Institute of Mental Hospital",
  "INC": "Cash-Point Incentive",
  "INS": "Insurance",
  "INS-L": "Life Insurance Premium",
  "INSPREM": "Insurance Premium",
  "INSTS / INS-TS": "Insurance-TravellerShield",
  "INT": "Interest Earned",
  "INV": "Investment (eg.unit trust, growth funds,bonds,etc)",
  "INW": "Inward Remittance",
  "IOF": "Investment of Funds",
  "IP": "Insurance Premium",
  "IPP": "Top-up Mobile Pre-paid Card - Internet Banking",
  "IRA": "Tax Due to IRAS",
  "ISE": "Bill Payment to Isetan (S) Pte Ltd",
  "ISTFEE": "Interest Statement Fee",
  "ITR": "Funds Transfer",
  "ITT": "Inward Telegraphic Transfer",
  "ITT C / ITT CHG": "Inward Telegraphic Transfer Comm & Charges",
  "ITX": "Bill Payment to IRAS (Income Tax)",
  "JBTC": "Bill Payment to Town Council - Jalan Besar",
  "JCU": "Bill Payment to James Cook University",
  "JHS": "Bill Payment to Ng Teng Fong General Hospital",
  "JOY": "Bill Payment to Joyalukkas Jewellery",
  "JSG": "Donation to Jamiyah Singapore",
  "JTC":
    "Bill Payment to Jurong Town Corporation (JTC) or Town Council - Jurong-Clementi",
  "KAP / KAPL": "Bill Payment to Kaplan Higher education",
  "KAYH": "Bill Payment to UOB Kay Hian",
  "KC": "Bill Payment to Keppel Club",
  "KER": "Bill Payment to Keppel Electric (Residents)",
  "KES": "Bill Payment to Maybank Kim Eng Securities Pte Ltd",
  "KKH": "Bill Payment to KK Hospital / KKH Med Report Fee",
  "KON": "Bill Payment to Konsortium Express & Tours Pte Ltd",
  "KTP": "Bill Payment to Khoo Teck Puat Hospital",
  "KTPH": "Bill Payment to Khoo Teck Puat Hospital",
  "KWS / KWSH": "Bill Payment / Donation to Kwong Wai Shiu Hospital",
  "LBS": "Donation to Lions Befrienders Service Association",
  "LCA": "Leverage Currency Account",
  "LCDP": "Leverage Currency Account Deposit",
  "LCLN": "Leverage Currency Account Loan",
  "LCR": "Bill Payment to Lion City Rentals",
  "LCS": "Donation to Life Community (LCSS)",
  "LEFS": "Local Enterprise Financing",
  "LGP": "Bill Payment to Laguna Park â€“ MCST 3271",
  "LH": "Legal Subsidy (HDB)",
  "LL": "Loans Under LC",
  "LLF": "Donation to Leukemia & Lymphoma",
  "LOD": "Ministry of Law - Land Office Dept",
  "LP": "Legal Subsidy (PTE)",
  "LSC": "Bill Payment to Laselle College of Arts",
  "LSLYDIS": "LoanShield Loyalty Bonus",
  "LSOGPRM": "LoanShield Original Premium",
  "LSPMBEN": "LoanShield Promotion Benefit",
  "LTA": "Bill Payment to LTA (Fine Payment)",
  "LTS": "Bill Payment to Lim & Tan Securities (S) Pte Ltd ",
  "M1": "Bill Payment to M1 Limited",
  "MACH": "MachineryAssist",
  "MAESTRO": "MAESTRO Transaction",
  "MAG": "Payments for Magazines & Publications Subscriptions",
  "MALAY AI": "Malaysian Airline System or Malaysia Airlines",
  "MAS": "Monetary Authority of Singapore",
  "MBL": "Singapore Telecom Mobilelink Pte Ltd",
  "MC": "Management Corporation",
  "MCD": "Ministry of Community Development",
  "MCO": "Monthly Savings Amount for MySavings/POSB SAYE Account",
  "MDA": "Media Development Authority of Singapore",
  "MDIS": "Bill Payment to Mgt Devt Institute of Singapore",
  "MED": "Medical Services and Equipment",
  "MEN": "Donation to Yayasan Mendaki Donation",
  "MEP": "MEPS Payment",
  "MEP C / MEP CHG": "MEPS Payment Comm & Charges",
  "MER": "MEPS Receipt",
  "MER C / MER CHG": "MEPS Receipt Comm & Charges",
  "MGT": "Management Fees",
  "MIN":
    "Donation to Movement for the Intellectually Disabled of Singapore (MINDS)",
  "MISC": "Miscellaneous Payment",
  "MMINT": "Interest on MMA Account",
  "MNS / MNSL": "Bill Payment to Manulife (S) Pte Ltd",
  "MOE": "Ministry of Education",
  "MOF": "Ministry of Finance",
  "MOH": "Ministry of Health",
  "MOL": "Ministry of Labour",
  "Montreal Pte Ltd": "ALDO or AEROPOSTALE",
  "MP3": "My Preferred Payment Plan from Credit Card",
  "MPA": "Maritime Port Authority",
  "MPL": "Bill Payment to DBS Mortgage / Personal Loans",
  "MPP": "Top-up Mobile Pre-paid Card - Mobile Banking",
  "MPTC": "Bill Payment to Town Council - Marine Parade",
  "MSA": "Debit Card Annual Fee",
  "MSC": "Miscellaneous",
  "MSCE": "Error Correction of Miscellaneous",
  "MSM": "Debit Card Misc",
  "MSR": "Debit Card Replacement",
  "MST": "Debit Card Transaction",
  "MTS": "Bill Payment to Yayasan Mendaki (Education)",
  "MUI": "Donation to Muis Zakat-Iras Auto-Incl / Muis Zakat-No Auto-Incl",
  "MUS": "Bill Payment to Mustafa Air Travel Pte Ltd",
  "MWS": "Donation to Methodist Welfare Services",
  "MYB": "Bill Payment to Maybank Credit Cards",
  "MYTC": "Bill Payment to Town Council - Marsiling-Yew Tee",
  "NAF / NAFA": "Bill Payment to NAFA (Student Bill) / Donation to NAFA",
  "NCC": "Bill Payment to National Cancer Centre",
  "NCD": "Cash Deposit",
  "NCHG": "Custody related charges",
  "NDC": "Bill Payment to National Cdental Centre",
  "NDF": "Cash Deposit Others Service Charge",
  "NDIV": "Dividend Payment (by SFS Ops)",
  "NEC": "Bill Payment to Singapore National Eye Centre",
  "NET": "Network For Electronics Transfers (NETS)",
  "NETS": "Point-of-Sale Transaction",
  "NEW": "Newspaper Subscription",
  "NHC":
    "Bill Payment to National Heart Centre / Donation to New Hope Community Services",
  "NHG / NHGP": "Bill Payment to NHG Polyclinic",
  "NIF": "Notes Issuance Facility",
  "NINT": "Interest Payment (by SFS Ops)",
  "NKF": "Donation to NKF (Singapore)",
  "NNL": "Bill Payment to Navigator Trust Account",
  "NPW": "Purchase with Cash Withdrawal",
  "NSEC": "Corporate Actions related Payment (by SFS Ops)",
  "NSS": "NSS-New Singapore Shares",
  "NTC": "Non-Transferable Cheques for Collection",
  "NTU": "Bill Payment to NTU Application Fee",
  "NTUC Fairprice": "ESSO Petrol Station",
  "NUH": "Bill Payment to National University Hospital",
  "NUP": "Bill Payment to National University Polyclinics",
  "NUS": "Bill Payment to NUS Society / NUS (Student Bill)",
  "NWL": "Cash Withdrawal Others",
  "OA": "Official Assignee",
  "OAP": "Bill Payment to Oanda Asia Pacific",
  "OCB": "Bill Payment to OCBC Credit Cards",
  "OCC": "Bill Payment to Orchid Country Club",
  "OD": "Overdraft",
  "ODD": "Outward Demand Draft",
  "ODD C / ODD CHG": "Outward Demand Draft Comm & Charges",
  "ONI Global": "GNC",
  "OSA": "Overseas StudentAssist",
  "OTRF": "Funds Transfer",
  "OTT": "Outward Telegraphic Transfer",
  "OTT A / OTT AGT": "Outward Telegraphic Transfer Agent Charges",
  "OTT C / OTT CHG": "Outward Telegraphic Transfer Comm & Charges",
  "PAY": "Salary",
  "PayPal": "Bill Payment to PayPal",
  "PDV": "Bill Payment to Pandan Valley â€“ MCST 581",
  "PF": "Processing Fee",
  "PGL": "Singapore Telecom Pagelink Pte Ltd",
  "PGNI": "Bill Payment to Philip Futures (Pte) Ltd",
  "PGR": "Pager",
  "PL": "Personal Loan",
  "PMS": "Bill Payment to Philip Morris Singapore Pte Ltd",
  "POS": "Point-of-Sale Transaction or Proceeds",
  "POS-SHR": "NETS Share Transaction",
  "PP*(numbers)CODE (e.g. PP*1234CODE)": "Paypal Code",
  "PPD": "Primary Production Dept",
  "PPE": "Bill Payment to Prudential PruAccess E-Top Up",
  "PPF": "Youth Olympic Games Prepaid Card Convenience Fee",
  "PPR": "Youth Olympic Games Prepaid Card Refund",
  "PPT": "Youth Olympic Games Prepaid Card Top Up",
  "PRT / PRTC": "Bill Payment to Town Council - Pasir Ris-Punggol",
  "PRUD": "Bill Payment to Prudential Assurance Company Singapore (Pte) Ltd",
  "PS": "SP Services or Power Supply",
  "PSA": "Port of Singapore Authority",
  "PSB": "Bill Payment to PSB Academy Pte Ltd",
  "PSC": "Public Service Commission",
  "PSEC": "Bill Payment to RHB Sec Singapore",
  "PTA": "POSBkids-Trust Account",
  "PTR": "Requisition Fees Property Tax Department",
  "PTX ": "Bill Payment to IRAS (Property Tax)",
  "PUB": "Public Utilities Board",
  "PWD": "Public Works Department",
  "QCD": "Quick Cheque Deposit",
  "QCDE": "Error Correction of Quick Cheque Deposit",
  "QCDM": "Quick Cheque Deposit",
  "QW": "Counter Card-Operated Transaction",
  "QWA": "Advice Withdrawal (Counter ATM Card-Operated Trans)",
  "QWC": "Cash Withdrawal (Counter ATM Card-Operated Trans)",
  "RAF": "Revolving advance Facility",
  "RASC": "Regional Cash Withdrawal Service Charge",
  "RBC": "Donation to Rainbow Centre",
  "RBOW": "Donation to Club Rainbow (Singapore) (Authorised Corporation)",
  "RCF / RCFN / RCPN": "Revolving Credit Facility",
  "R-CHQ": "Returned Cheque",
  "RCM": "Refuse and Cleansing Maintenance Services",
  "REB": "POSB Cashback Bonus Rebate",
  "RECAP / RECAPMT": "Receipt Against Payment",
  "RED": "Donation to Singapore Red Cross",
  "REM": "Remittance Payment",
  "REV": "Reversal",
  "REV SC": "Reversal of Service Charge",
  "RF": "Repricing Fee",
  "RFT": "Regional Funds Transfer",
  "R-GR": "GIRO Return",
  "RIC": "Remittance Inward Collection",
  "RIS": "Retail Instalment Scheme",
  "RL": "Renovation Loan",
  "RPT": "Reports",
  "RRCF": "Risk Participation",
  "RSC": "Rights Application CDP Charge",
  "RSCRG": "Refund Service Charge for Return GIRO",
  "RSF / R-SF": "IPO Financing A/c Fund Transfer - Rev",
  "RSYC": "Bill Payment to Republic of Singapore Yacht Club",
  "RT": "Reimbursement Transaction",
  "RTD": "Reg. Of Land Titles & Deeds",
  "RTF": "Remittance Transfer of Funds",
  "RTF C / RTF CHG": "Remittance Transfer of Funds Comm & Charges",
  "RTL": "Rental",
  "RTLN": "Risk Participation",
  "RTR / R-TRF": "Returned Interbank Funds Transfer",
  "RTS": "Rights",
  "RTSA": "Rights Application",
  "RTSC": "CDP Charge-Rights Application",
  "RUF": "Revolving Underwriting Facility",
  "RWDL": "Regional Cash Withdrawal",
  "S PORE POOLS followed by a set of numbers (e.g. S PORE POOLS 1234567890)":
    "Singapore Pools",
  "SAFR": "Bill Payment to SAFRA National Service",
  "SAL": "Salary",
  "SALES / SALES-A": "Sales At ATM",
  "SBA": "Singapore Broadcasting Authority",
  "SBTC": "Bill Payment to Town Council - Sembawang",
  "SC": "Service Charge",
  "SC AC / SC-AC / SCAC": "Service Charge for Audit Confirmation",
  "SCB": "Singapore Board of Commissioners of Currency",
  "SCC": "Bill Payment to Singapore Cricket Club or SCB Credit Cards",
  "SC-CPS": "Service Charge For Processing of Masnet or Online GIRO Txns",
  "SC-D": "Service Charge for Document Retrieval",
  "SC-DISK": "Service Charge For Processing of Diskette or Listings Trans",
  "SC-DOC": "Service Charge for Retrieval of Documents",
  "SC-EDI": "Service Charge for Processing of SNS-EDI Transactions",
  "SCF": "Staff Course Financing Loan",
  "SC-FEDI": "Service Charge for Processing of NETS-FEDI Transactions",
  "SC-FS": "Service Charge for Statement of Financial Standing",
  "SCH": "Schools",
  "SC-I2": "Service Charge for Processing of I2 Transaction",
  "SCICT": "Service Charge for FAST Payment",
  "SCIDEAL": "Service Charge for Processing of Ideal Transactions",
  "SCIDT": "Service Charge for FAST Collection",
  "SCL": "Staff Computer Loan",
  "SC-MCHQ / SCMCHQ / SC MCHQ": "Service Charge for Marked Cheque",
  "SC-NTC / SCNTC / SC NTC": "Service Charge for Non-Transferable Cheque",
  "SC-PRM": "Service Charge for Processing of PRIME Transaction",
  "SC-RCHQ / SCRCHQ / SC RCHQ": "Service Charge for Returned Cheque",
  "SC-RG / SC-RGR": "Service Charge For Return GIRO Transactions",
  "SCS": "Donation to Students Care Service",
  "SC-S2S": "Service Charge for Processing of S2S Transaction",
  "SC-SCHQ / SC SCHQ": "Service Charge for Stopped Cheque",
  "SC-SI": "Service Charge for Standing Instruction",
  "SCSMS": "Service Charge for Personalised SMS",
  "SC-SP": "Service Charge for Processing of Stop-Payment Transactions",
  "SC-STOR": "NETS-FEDI Storage Fees",
  "SC-TAPE": "Service Charge for Processing of Tape/Cartridge Transactions",
  "SCTR": "Service Fee - Treasures",
  "SCV": "Singapore Cable Vision",
  "SD": "Structured Deposit",
  "SDA": "Structured Deposit ATM Application",
  "SDB": "Singapore Dental Board",
  "SDR": "Safe Deposit Box",
  "SEC": "Security Houses",
  "SEL": "Bill Payment to Seletar Country Club",
  "SEN": "Bill Payment to Geneco - Seraya Energy",
  "SEW": "Ministry of the Environment (Sewerage Dept)",
  "SF": "IPO Financing A/c Fund Transfer",
  "SFA": "Share Financing Loan",
  "SFA-INT": "Interest on Share Financing Loan",
  "SFA-TRF": "Refund of Share Application Monies",
  "SGCC": "Bill Payment to Serangoon Gardens Country Club",
  "SGH": "Bill Payment to Singapore General Hospital",
  "SGI": "SAF Personnel Services Centre",
  "SGLF": "Bill Payment to Singapore Life Ltd.",
  "SGR": "Refund Arising from SGS Discount or Premium",
  "SGS": "Singapore Government Securities (SGS) Application",
  "SGSI": "Singapore Government Securities Interest",
  "SGSP": "Singapore Government Securities Principal",
  "SGT": "Refund arising from SGS Tender",
  "SH": "Clawback Of Subsidy (HDB)",
  "SHA / SHAH": "Bill Payment to Shahidah Travel & Tours Pte Ltd",
  "SHB": "Bill Payment to StarHub Ltd",
  "SHG": "Self-Help Groups",
  "SHHL": "HDB Housing Loan",
  "SHL": "Housing Loan",
  "SHP": "Bill Payment to SingHealth Polyclinics",
  "SHR": "Share Transaction",
  "SHUB": "Top-up StarHub Prepaid Card",
  "SI": "Standing Instruction",
  "SICC": "Bill Payment to Singapore Island Country Club",
  "SIND":
    "Donation to SINDA - IBR / Bill Payment to Singapore Indian Development Association (SINDA) - Step Tuition Fees, Project Teach Fee",
  "SINDA": "Donation to SINDA",
  "SINGAPORE followed by set of numbers (e.g. SINGAPORE1234567890)":
    "Singapore Airlines",
  "Singpost": "SAM Machine",
  "SINV / SIV": "Bill Payment to Shareinvestor.com Pte Ltd",
  "SIR": "Self-Employed Person Income Relief Scheme",
  "SKC": "Bill Payment to SingHealth Comms Hospitals - SKCH",
  "SKH": "Bill Payment to Sengkang General Hospital",
  "SL": "Student Loan",
  "SLA": "Bill Payment to SLA Rental TOL / Land Premium",
  "SLR ": "Donation to Silra Home Donation",
  "SMC": "Singapore Medical Council",
  "SMG": "Bill Payment to Simei Green â€“ MCST 2454",
  "SMST": "MoneySmart Settlement Amount",
  "SMT": "Singapore Mint",
  "SNB": "Singapore Nursing Board",
  "SNEC": "Bill Payment to Singapore National Eye Centre",
  "SNS": "Singapore Network Services",
  "SOC": "Society",
  "SP": "Clawback Of Subsidy (PTE)",
  "SPB": "Singapore Pharmacy Board",
  "SPD": "Donation to SPD",
  "SPE": "Donation to Spectra Secondary School",
  "SPH / SPHM":
    "Bill Payment to SPH Media Limited - Advertisement/Subscription",
  "SPL": "Staff Personal Loan",
  "SPM / SPMF": "Donation to ST School Pocket Money Fund",
  "SPP": "Top-up Mobile Pre-paid Card - SMS Banking",
  "SPS": "Bill Payment to SP Services Ltd",
  "SRC ": "Bill Payment to Singapore Recreation Club",
  "SRCC": "Bill Payment to National Service Resort & Country Club",
  "SRD": "Special Reward",
  "SRL": "Staff Renovation Loan",
  "SRS": "Supplementary Retirement Scheme",
  "SRWD": "Savings Reward",
  "SS": "Sheng Shiong",
  "SSB": "Singapore Savings Bond",
  "SSC": "Bill Payment to Singapore Swimming Club",
  "SSS": "Silver Support Scheme",
  "ST": "Bill Payment to Singtel",
  "STAF": "Short Term Advance Facility",
  "Star Mart": "Caltex Petrol Station",
  "STC": "Singapore Turf Club",
  "STE / STEG": "Bill Payment to ST Engg (Staff Options)",
  "Stevetay Pte Ltd": "Cash Converters",
  "STF": "Short Term Facilities",
  "STFA / STLN / STPA / STPN": "Short Term Loan",
  "STL": "Staff Top-Up Loan",
  "STLF ": "Donation to Singtel Touching Lives Fund",
  "STMT SC": "Charge For SWIFT Statements Of Account",
  "STN": "Fixed Income Securities",
  "STY": "Study Loan",
  "SUT": "Donation to SUTD",
  "SUT / SUTD": "Bill Payment to SUTD Alumnni, Academy / Donation to SUTD",
  "SVCH": "Service Charge",
  "SVL": "Staff Vehicle Loan",
  "SW": "Switching Funds",
  "SYE": "Save-As-You-Earn (SAYE) Account",
  "TAC": "Bill Payment to The American Club",
  "TC": "Town Councils",
  "TCA": "Training Commitment Award",
  "TCC": "Concession Card Top Up",
  "TCF": "Concession Card Top Up Convenience Fee",
  "TCHR": "Donation to Trinity Christian Centre Ltd",
  "TCS": "Donation to Touch Community Services",
  "TCT": "CashCard/FlashPay Top-Up (NETS)",
  "TDB": "Trade Development Board",
  "TFD": "Fixed Deposit Placement",
  "TFL": "Tuition Fee Loan",
  "TIC": "Bill Payment to Easy Tickets",
  "TIL": "Bill Payment to Telechoice Int Ltd",
  "TINT": "Top up Interest",
  "TL / TLFN / TLPA / TLPN / TLVA / TLVN / TLXA / TLXN": "Term Loan",
  "TL-ABT": "Transitlink",
  "TLG": "Transit Link",
  "TLL": "Bill Payment to The Learning Lab",
  "TM1": "Top-up M Card Voucher at ATM",
  "TMCC": "Bill Payment to Tanah Merah Country Club",
  "TML": "Bill Payment to Tokio Marine Life Insurance",
  "TOD": "Temporary Overdraft",
  "TPQ": "Traffic Police",
  "TPTC": "Bill Payment to Town Council - Tanjong Pagar",
  "TRF / TTR": "Funds Transfer",
  "TRF-CPF": "CPF Profit Transfer",
  "TRFPT / TRFBB / TRFBDB / TRFKV / TRFPY / TRFPSM / TRFFHV / TRFGW / TRFJP / TRFLCTL / TRFHG":
    "Transfer made at Branch",
  "TRS": "Trusts Services",
  "TSH ": "Donation to The Singapore Cheshire Home",
  "TTC": "Bill Payment to Tanglin Club / Town Council - Tampines",
  "TTS / TTSH": "Bill Payment to Tan Tock Seng Hospital",
  "TUP": "Top-Up Loan",
  "Uber": "Uber / Uber Eats",
  "UKH": "Bill Payment to UOB Kay Hian",
  "UMC / UMC-S": "Debit Card Transaction",
  "UMCS": "Debit Card Replacement Fee",
  "UMS": "Union Membership",
  "UOB": "Bill Payment to UOB Credit Cards",
  "UPD": "Update on Latest Balance",
  "URA": "Urban Redevelopment Authority",
  "UTA / UTAA / UTCA / UTCA-NETF / UTSA / UTSA-NETF": "Unit Trust Application",
  "UTR": "Redemption of Units",
  "V-ATM": "PLUS Cash Withdrawal",
  "VEH": "Vehicles - rental, finance or lease",
  "Velox Digital Singapore": "GoJek Transactions",
  "VFC": "Donation to VIVA Foundation for Children",
  "VL": "Car Financing",
  "VM": "Virgin Mobile Top-Up",
  "W20": "Workfare Special Payment",
  "WBB": "Workfare Bicentennial Bonus",
  "WBS": "Workfare Bonus Scheme",
  "WCA": "Bill Payment to Town Council - West Coast",
  "WDL": "Withdrawal",
  "WDL CCT": "CashCard Top-up",
  "WDL CPP": "CashCard Sales",
  "WDL HCT": "HomeNETS CashCard Top-up",
  "WDL HSC": "HomeNETS CashCard Top-up Service Charge",
  "WDL IPS": "Interlink Transaction",
  "WDL SHR / WDL-SHR": "Share Transaction",
  "WGC / WGCC": "Bill Payment to Warren Golf & Country Club",
  "WIS": "Workfare Income Supplement Scheme",
  "WSB": "Workfare Special Bonus",
  "WT": "FD Withdrawal",
  "WTAX": "Withholding Tax",
  "WVIN": "Donation to World Vision International",
  "YINT": "Total Interest Earned in a Year",
  "YMSL": "Bill Payment to Yayasan Mendaki (Study Loans)",
  "YRF": "Donation to Yellow Ribbon Fund",
  "01AAC": "Import LC Actual Acceptance",
  "01ACP": "Import LC Acceptance",
  "01ADJ": "Import LC Adjustment",
  "01AMD": "Import LC Amendment",
  "01APA": "Import LC Actual Payment",
  "01BKF": "Import LC Book Off",
  "01ISS": "Import LC Issuance",
  "01MSC": "Import LC Miscellaneous",
  "01PAY": "Import LC Payment",
  "01POA": "Import LC Payment of Acceptance",
  "02AAC": "Import Guarantees Actual Acceptance",
  "02ACP": "Import Guarantees Acceptance",
  "02ADJ": "Import Guarantees Adjustment",
  "02AMD": "Import Guarantees Amendment",
  "02APA": "Import Guarantees Actual Payment",
  "02BKF": "Import Guarantees Book Off",
  "02ISS": "Import Guarantees Issuance",
  "02MSC": "Import Guarantees Miscellaneous",
  "02PAY": "Import Guarantees Payment",
  "02POA": "Import Guarantees Payment of Acceptance",
  "03AAC": "Import Doc Collection Actual Acceptance",
  "03ACP": "Import Doc Collection Acceptance",
  "03ADJ": "Import Doc Collection Adjustment",
  "03AMD": "Import Doc Collection Amendment",
  "03APA": "Import Doc Collection Actual Payment",
  "03BKF": "Import Doc Collection Book Off",
  "03ISS": "Import Doc Collection Issuance",
  "03MSC": "Import Doc Collection Miscellaneous",
  "03PAY": "Import Doc Collection Payment",
  "03POA": "Import Doc Collection Payment of Acceptance",
  "06AAC": "Import Clean Payment Actual Acceptance",
  "06ACP": "Import Clean Payment Acceptance",
  "06ADJ": "Import Clean Payment Adjustment",
  "06AMD": "Import Clean Payment Amendment",
  "06APA": "Import Clean Payment Actual Payment",
  "06BKF": "Import Clean Payment Book Off",
  "06ISS": "Import Clean Payment Issuance",
  "06MSC": "Import Clean Payment Miscellaneous",
  "06PAY": "Import Clean Payment Payment",
  "06POA": "Import Clean Payment Payment of Acceptance",
  "11AAC": "Export LC Actual Acceptance",
  "11ACP": "Export LC Acceptance",
  "11ADJ": "Export LC Adjustment",
  "11AMD": "Export LC Amendment",
  "11APA": "Export LC Actual Payment",
  "11BKF": "Export LC Book Off",
  "11ISS": "Export LC Issuance",
  "11MSC": "Export LC Miscellaneous",
  "11PAY": "Export LC Payment",
  "11POA": "Export LC Payment of Acceptance",
  "12AAC": "Export Guarantees Actual Acceptance",
  "12ACP": "Export Guarantees Acceptance",
  "12ADJ": "Export Guarantees Adjustment",
  "12AMD": "Export Guarantees Amendment",
  "12APA": "Export Guarantees Actual Payment",
  "12BKF": "Export Guarantees Book Off",
  "12ISS": "Export Guarantees Issuance",
  "12MSC": "Export Guarantees Miscellaneous",
  "12PAY": "Export Guarantees Payment",
  "12POA": "Export Guarantees Payment of Acceptance",
  "13AAC": "Export Doc Collection Actual Acceptance",
  "13ACP": "Export Doc Collection Acceptance",
  "13ADJ": "Export Doc Collection Adjustment",
  "13AMD": "Export Doc Collection Amendment",
  "13APA": "Export Doc Collection Actual Payment",
  "13BKF": "Export Doc Collection Book Off",
  "13ISS": "Export Doc Collection Issuance",
  "13MSC": "Export Doc Collection Miscellaneous",
  "13PAY": "Export Doc Collection Payment",
  "13POA": "Export Doc Collection Payment of Acceptance",
  "15AAC": "Export Credit Bills Actual Acceptance",
  "15ACP": "Export Credit Bills Acceptance",
  "15ADJ": "Export Credit Bills Adjustment",
  "15AMD": "Export Credit Bills Amendment",
  "15APA": "Export Credit Bills Actual Payment",
  "15BKF": "Export Credit Bills Book Off",
  "15ISS": "Export Credit Bills Issuance",
  "15MSC": "Export Credit Bills Miscellaneous",
  "15PAY": "Export Credit Bills Payment",
  "15POA": "Export Credit Bills Payment of Acceptance",
  "20AAC": "Reimbursement Actual Acceptance",
  "20ACP": "Reimbursement Acceptance",
  "20ADJ": "Reimbursement Adjustment",
  "20AMD": "Reimbursement Amendment",
  "20APA": "Reimbursement Actual Payment",
  "20BKF": "Reimbursement Book Off",
  "20ISS": "Reimbursement Issuance",
  "20MSC": "Reimbursement Miscellaneous",
  "20PAY": "Reimbursement Payment",
  "20POA": "Reimbursement Payment of Acceptance",
  "32AAC": "SAF Packing Credit Actual Acceptance",
  "32ACP": "SAF Packing Credit Acceptance",
  "32ADJ": "SAF Packing Credit Adjustment",
  "32AMD": "SAF Packing Credit Amendment",
  "32APA": "SAF Packing Credit Actual Payment",
  "32BKF": "SAF Packing Credit Book Off",
  "32ISS": "SAF Packing Credit Issuance",
  "32MSC": "SAF Packing Credit Miscellaneous",
  "32PAY": "SAF Packing Credit Payment",
  "32POA": "SAF Packing Credit Payment of Acceptance",
  "33AAC": "SAF Loan to Cust Actual Acceptance",
  "33ACP": "SAF Loan to Cust Acceptance",
  "33ADJ": "SAF Loan to Cust Adjustment",
  "33AMD": "SAF Loan to Cust Amendment",
  "33APA": "SAF Loan to Cust Actual Payment",
  "33BKF": "SAF Loan to Cust Book Off",
  "33ISS": "SAF Loan to Cust Issuance",
  "33MSC": "SAF Loan to Cust Miscellaneous",
  "33PAY": "SAF Loan to Cust Payment",
  "33POA": "SAF Loan to Cust Payment of Acceptance",
  "34AAC": "SAF Loan to Bank Actual Acceptance",
  "34ACP": "SAF Loan to Bank Acceptance",
  "34ADJ": "SAF Loan to Bank Adjustment",
  "34AMD": "SAF Loan to Bank Amendment",
  "34APA": "SAF Loan to Bank Actual Payment",
  "34BKF": "SAF Loan to Bank Book Off",
  "34ISS": "SAF Loan to Bank Issuance",
  "34MSC": "SAF Loan to Bank Miscellaneous",
  "34PAY": "SAF Loan to Bank Payment",
  "34POA": "SAF Loan to Bank Payment of Acceptance",
  "7-Eleven": "Shell Petrol Station",
  "CIF ": "Cheque Issuance Fee",
  "CIW": "Cheque Issuance Fee Waiver",
  "UPI": "Debit Card Transaction",
};

export function parseRowMeta([r0, r1, r2, r3, r4]: string[]): TransactionMeta {
  r4 = r4.substring(5);

  let displayText;
  let payeeName = "";
  let reference = "";

  if (r0 === "ITR" || r0 === "ATINT") {
    displayText = "Interest";
  } else if (r2.startsWith("TOP-UP TO PAYLAH! :")) {
    payeeName = r3;
  } else if (r0 === "POS" && r1 === "NETS") {
    payeeName = r3;
  } else if (r0 === "MST") {
    payeeName = r2;
  } else if (
    (r1 === "POS" && r2.startsWith("NETS ")) ||
    (r1 === "ICT" && r2.startsWith("Incoming PayNow Ref ")) ||
    (r1 === "ICT" && r2.startsWith("PayNow Transfer "))
  ) {
    payeeName = r3?.substring(r3.indexOf(":") + 2);
    if (r4 && r4 !== "PayNow Transfer") reference = r4;
  } else if (
    (r0 === "ADV" && r1 === "ICT" && r3 === "Transfer") // FAST transfer
  ) {
    payeeName = r2.replace("CSL:", "").replace(":I-BANK", "");
    reference = r4;
  } else if (
    (r0 === "ADV" && r1 === "TRF")
  ) {
    payeeName = r2.replace(" : I-BANK", "");
    reference = r3;
  } else if (r0 === "ADV" && r1 === "IDT") {
    reference = `${r2} ${r3}`;
    if (r3.startsWith("TW")) {
      payeeName = "WISE";
    } else {
      payeeName = r3;
    }
  } else if (r0 === "ADV") {
    displayText = TRANSACTION_CODES[r1];
    reference = `${r2} ${r3}`;
  } else if (r0 === "GR" || r0 === "POS") {
    payeeName = r2;
  } else if (!r2 && TRANSACTION_CODES[r0]) {
    displayText = TRANSACTION_CODES[r0];
  } else {
    displayText = `${r2} ${r3}`;
  }

  return {
    displayText,
    payeeName,
    reference,
  };
}

async function processLogin(
  { page, username, password }: {
    page: Page;
    username: string;
    password: string;
  },
) {
  await page.goto("https://internet-banking.dbs.com.sg/IB/Welcome");

  await page.locator("#UID").click();
  await page.locator("#UID").fill(username);
  await page.locator("#PIN").click();
  await page.locator("#PIN").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
}

async function process2FA(
  { notify, key, frame, logger }: {
    notify: NotifyFn;
    key: string;
    frame: FrameLocator;
    logger: Logger;
  },
) {
  await notify({
    message: `Scraping ${key}. Please open the DBS app to authenticate.`,
  });
  await frame.getByRole("link", { name: "Authenticate now" }).click();
  logger.info("Waiting for digital token authentication...");

  await frame
    .locator("#userBar")
    .getByText("View Transaction History")
    .click({ timeout: 60000 });

  logger.info("Authenticated");
  await notify({ message: "Authentication successful." });
}

async function getAccounts(frame: FrameLocator) {
  const selectorHTML = await frame.locator("#account_number_select")
    .innerHTML();
  const $ = cheerio.load(selectorHTML, null, false);
  const options = $("option");
  const accounts: [string, string][] = [];
  options.each((_, option) => {
    const value = $(option).attr("value");
    const label = $(option).text().trim();
    if (value && label && !label.includes("Fixed")) {
      accounts.push([value, label]);
    }
  });

  return accounts;
}

interface HeaderIndices {
  ref0: number;
  ref0a: number | undefined;
  ref1: number;
  ref2: number;
  ref3: number;
  idxCreditAmount: number;
  idxDebitAmount: number;
}

function parseHeader(headerRow: string[]): HeaderIndices {
  const isPOSB = headerRow.includes("Transaction Ref1");

  let ref0: number,
    ref1: number,
    ref2: number,
    ref3: number,
    ref0a: number;

  if (isPOSB) {
    ref0 = ref0a = headerRow.indexOf("Reference");
    ref1 = headerRow.indexOf("Transaction Ref1");
    ref2 = headerRow.indexOf("Transaction Ref2");
    ref3 = headerRow.indexOf("Transaction Ref3");
  } else {
    ref0 = headerRow.indexOf("Statement Code");
    ref0a = headerRow.indexOf("Reference");
    ref1 = headerRow.indexOf("Client Reference");
    ref2 = headerRow.indexOf("Additional Reference");
    ref3 = headerRow.indexOf(" Misc Reference");
  }

  const idxCreditAmount = headerRow.indexOf("Credit Amount");
  const idxDebitAmount = headerRow.indexOf("Debit Amount");

  return { ref0, ref0a, ref1, ref2, ref3, idxCreditAmount, idxDebitAmount };
}

function buildDescription(row: string[], indices: HeaderIndices) {
  const { ref0, ref1, ref2, ref3 } = indices;
  const parts: string[] = [];
  if (row[ref0] !== "ITR") parts.push(row[ref0]);
  if (row[ref1]) parts.push(row[ref1]);
  if (row[ref2]) parts.push(row[ref2]);
  if (row[ref3]) parts.push(row[ref3]);

  if (!parts.length) return row[ref0];

  return parts.join(" ").replace(/\s+/g, " ");
}

function buildRaw(row: string[], indices: HeaderIndices): string[] {
  const { ref0, ref0a, ref1, ref2, ref3 } = indices;
  return [
    row[ref0],
    row[ref0a || ref0],
    row[ref1],
    row[ref2],
    row[ref3],
  ];
}

function* parseDbsCsv(contents: string): Generator<Transaction> {
  if (!contents.includes("Account Details For:")) {
    throw new Error("Invalid CSV");
  }

  const start = contents.indexOf("Transaction Date,");

  const head = contents.substring(0, start).trim().split("\n");
  const account = head[0].split(",")[1];

  const body = contents.substring(start).trim();
  const rows = parseCsv(body);
  const headerRow = rows.shift();

  if (!headerRow) {
    throw new Error("Invalid CSV");
  }

  const indices = parseHeader(headerRow);

  const transactions: Transaction[] = [];
  for (const cells of rows) {
    // trim each cell
    cells.forEach((v, i) => (cells[i] = v.trim()));

    // parse date
    const rawDate = new Date(cells[0]);
    const date = rawDate.toTemporalInstant().toZonedDateTimeISO(
      "Asia/Singapore",
    ).toPlainDate();

    const rawRefs = buildRaw(cells, indices);

    // parse desc
    const description = buildDescription(cells, indices);

    // parse amount
    const { idxCreditAmount, idxDebitAmount } = indices;
    const creditAmount = parseFloatSafely(cells[idxCreditAmount]);
    const debitAmount = parseFloatSafely(cells[idxDebitAmount]);
    const absoluteAmount = debitAmount || creditAmount;
    const isDebit = debitAmount > 0;

    yield new Transaction(
      account,
      date,
      description,
      absoluteAmount,
      isDebit,
      undefined,
      DRIVER_NAME,
      rawRefs,
    );
  }

  return transactions;
}

async function triggerDownloadCsv({ page, frame }: { page: Page, frame: FrameLocator }) {
  await page.waitForTimeout(1000);
  const downloadPromise = page.waitForEvent("download");
  await frame.getByRole("link", { name: "Download" }).click();
  const download = await downloadPromise;
  const downloadedString = getStream(await download.createReadStream());
  await page.waitForTimeout(1000);

  return downloadedString;
}

async function* processAccount(
  { frame, page, logger, storeArtifact, optionValue, label }: {
    frame: FrameLocator;
    page: Page;
    logger: Logger;
    storeArtifact: (name: string, contents: string) => Promise<void>;
    optionValue: string;
    label: string;
  },
): AsyncGenerator<Transaction> {
  logger.info(`Processing ${label}`, { optionValue, label });
  await frame.locator("#account_number_select").selectOption(optionValue);
  await frame.locator("#currency2").selectOption("SGD");
  await frame.locator("#transPeriod").click();
  await frame.locator("li").filter({ hasText: "Last 6 Months" }).click();
  await frame.getByRole("button", { name: "Go" }).click();
  await page.waitForTimeout(1000);

  const tabs = frame.locator("#main-tabs li");
  const tabCount = await tabs.count();
  if (tabCount === 0) {
    const csvString = await triggerDownloadCsv({ page, frame });
    await storeArtifact(`${label}.csv`, csvString);
    yield* parseDbsCsv(csvString);
  } else {
    for (let i = 0; i < tabCount; i++) {
      const element = tabs.nth(i);
      await element.click();
      const csvString = await triggerDownloadCsv({ page, frame });
      await storeArtifact(`${label} ${i}.csv`, csvString);
      yield* parseDbsCsv(csvString);
    }
  }
}

export default defineDriver({
  name: DRIVER_NAME,
  supportsSource: (source) => !!source.website?.includes("dbs.com.sg"),
  transactionMeta: (t) => parseRowMeta(t.raw as string[]),
  async pull({ source, page, storeArtifact, logger, notify }) {
    const { username, password } = source;
    if (!username || !password) {
      throw new Error("No username/password provided.");
    }

    logger.info("Logging in");
    await processLogin({ page, username, password });

    const frame = page
      .frameLocator('frame[name="user_area"]')
      .frameLocator('iframe[name="iframe1"]');

    logger.info("Initiating digital token prompt");
    await process2FA({ notify, key: source.key || "", frame, logger });

    // iterate through options under selector, but ignore deposits (0030)
    const accounts = await getAccounts(frame);

    const transactions: Transaction[] = [];
    const params = { frame, page, logger, storeArtifact };
    for (const [optionValue, label] of accounts) {
      const accountTransactions = await Array.fromAsync(
        processAccount({ ...params, optionValue, label }),
      );
      transactions.push(...accountTransactions);
    }

    await page.frameLocator('frame[name="user_area"]')
      .getByRole("link", { name: "Proceed to Logout" }).click();
    await frame.getByRole("button", { name: "Logout Now" }).click();

    return { transactions };
  },
});
