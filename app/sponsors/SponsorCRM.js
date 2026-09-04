"use client";
import ThemedSelect from '../components/ThemedSelect'
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
// Scripts loaded from API — lib/sponsor-scripts.js is still used by the API route for seeding
import PageHeader from "../components/PageHeader";
import LeadAI from "../components/LeadAI";
import CallButton from "../components/CallButton";
import VideoMeetButton from "../components/VideoMeetButton";
import BoardWorkbench from "../components/BoardWorkbench";
import ViewModeToggle from "../components/ViewModeToggle";
import { useActiveRecord } from "@/lib/active-record";
import QualifyWizard from "../leads/QualifyWizard";
import NewLeadBadge from "../components/NewLeadBadge";
import { CheckCircle2, ExternalLink, Mail, MapPin, Pencil, Phone, Search, Trash2, Video } from "lucide-react";

/* ── Data ── */
const M = [
  { id: "avl", n: "City, ST", p: "City, ST News", o: "Carl Farrington" },
  { id: "atl", n: "Atlanta, GA", p: "Atlanta News", o: "Chad LaMothe" },
  { id: "chi", n: "Chicago, IL", p: "Chicago News", o: "Carl Farrington" },
  { id: "cos", n: "Colorado Springs, CO", p: "Colorado Springs News", o: "Carl Farrington" },
  { id: "hhs", n: "Jonesboro, AR", p: "HardHat Sports", o: "Dagen" },
  { id: "kng", n: "Kingston, NY", p: "Kingston Times", o: "Marty Bstone" },
  { id: "mia", n: "Miami, FL", p: "Miami News", o: "Carl Farrington" },
  { id: "mpl", n: "Minneapolis, MN", p: "Minneapolis", o: "Carl Farrington" },
  { id: "ocn", n: "Oceanside, CA", p: "Oceanside News", o: "Josh Gorran" },
  { id: "oma", n: "Omaha, NE", p: "Omaha News", o: "Clint Jones" },
  { id: "phx", n: "Phoenix, AZ", p: "Phoenix Times", o: "Carl Farrington" },
  { id: "pdx", n: "Portland, OR", p: "Portland News", o: "Carl Farrington" },
  { id: "stp", n: "St. Petersburg, FL", p: "Saint Petersburg News", o: "Carl Farrington" },
  { id: "sdn", n: "San Diego, CA", p: "San Diego News", o: "Carl Farrington" },
  { id: "sea", n: "Seattle, WA", p: "Seattle News", o: "Carl Farrington" },
  { id: "xen", n: "Xenia, OH", p: "The 42", o: "Carl Farrington" },
  { id: "wnc", n: "City, ST", p: "WNC Times", o: "Carl Farrington" },
];

const CATS = [
  { name: "Local News", price: 5000, color: "#d97706" },
  { name: "Sports / Outdoors", price: 2500, color: "#16a34a" },
  { name: "Business / Economy", price: 2500, color: "#2563eb" },
  { name: "Lifestyle / Community", price: 2500, color: "#e11d48" },
  { name: "Opinion / Editorial", price: 2500, color: "#7c3aed" },
  { name: "Events / Entertainment", price: 2500, color: "#ea580c" },
];

const STS = [
  { v: "prospect", l: "Prospect", c: "#94a3b8" },
  { v: "called", l: "Called", c: "#2563eb" },
  { v: "voicemail", l: "Voicemail", c: "#7c3aed" },
  { v: "interested", l: "Interested", c: "#d97706" },
  { v: "email_sent", l: "Email Sent", c: "#0891b2" },
  { v: "follow_up", l: "Follow Up", c: "#ea580c" },
  { v: "closed", l: "Won", c: "#16a34a" },
  { v: "declined", l: "Declined", c: "#dc2626" },
];

const LEAD_TYPES = [
  { v: "business", l: "Business", script: "script-b" },
  { v: "chamber", l: "Chamber / Association", script: "script-c" },
  { v: "government", l: "Government Agency / TDA", script: "script-c" },
  { v: "nonprofit", l: "Nonprofit / Civic", script: "script-c" },
  { v: "education", l: "Education / Media", script: "script-a" },
  { v: "newspaper", l: "Newspaper", script: "script-a" },
  { v: "tda", l: "State TDA", script: "script-a" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];
const STATE_NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",DC:"Washington DC"};

const ACCESS_LEVELS = [
  { v: "direct", l: "Direct (owner answers)", c: "#16a34a" },
  { v: "gatekeeper", l: "Gatekeeper (1 step)", c: "#d97706" },
  { v: "multi", l: "Multi-step (board/committee)", c: "#dc2626" },
];

const TIERS = [
  { v: "1", l: "Tier 1 — Perfect Fit", c: "#16a34a" },
  { v: "2", l: "Tier 2 — Good Fit", c: "#2563eb" },
  { v: "3", l: "Tier 3 — Long Shot", c: "#94a3b8" },
];

// ═══════════════════════════════════════════════════════════════
// CAMPAIGNS
// ═══════════════════════════════════════════════════════════════





const metricLabels = { primary: "Pitched", secondary: "Closes" };

const CAMPAIGNS = [
  {
    id: "sponsors",
    name: "Founding Sponsors",
    icon: "💼",
    description: "Sell category sponsorship to local businesses",
    listFilter: "sponsors",
    outcomes: [
      { v: "no_answer", l: "No Answer" },
      { v: "voicemail", l: "Voicemail" },
      { v: "gatekeeper", l: "Gatekeeper" },
      { v: "pitched", l: "Pitched" },
      { v: "interested", l: "Interested" },
      { v: "closed", l: "Won" },
      { v: "declined", l: "Declined" },
    ],
    metricLabels,
  },
  {
    id: "newspaper_outreach",
    name: "Newspaper Upgrade",
    icon: "📰",
    description: "Get existing papers to sign up on ContentStudio",
    listFilter: "newspapers",
    outcomes: [
      { v: "no_answer", l: "No Answer" },
      { v: "voicemail", l: "Voicemail" },
      { v: "gatekeeper", l: "Gatekeeper" },
      { v: "pitched", l: "Pitched" },
      { v: "wants_demo", l: "Wants Demo" },
      { v: "email_sent", l: "Email Sent" },
      { v: "signed_up", l: "Signed Up" },
      { v: "not_interested", l: "Not Interested" },
      { v: "has_solution", l: "Already Has Solution" },
    ],
    metricLabels: { primary: "Pitched", secondary: "Sign-Ups" },
  },
  {
    id: "tda_outreach",
    name: "State TDAs",
    icon: "🏛️",
    description: "Pitch state tourism development authorities on ContentStudio",
    listFilter: "tdas",
    outcomes: [
      { v: "no_answer", l: "No Answer" },
      { v: "voicemail", l: "Voicemail" },
      { v: "gatekeeper", l: "Gatekeeper" },
      { v: "pitched", l: "Pitched" },
      { v: "interested", l: "Interested" },
      { v: "meeting_set", l: "Meeting Set" },
      { v: "proposal_sent", l: "Proposal Sent" },
      { v: "closed", l: "Won" },
      { v: "not_interested", l: "Not Interested" },
    ],
    metricLabels,
  },
  {
    id: "farrington_dev",
    name: "Farrington Development",
    icon: "🚀",
    description: "Web development, apps & consulting leads",
    listFilter: "farrington",
    outcomes: [
      { v: "no_answer", l: "No Answer" },
      { v: "voicemail", l: "Voicemail" },
      { v: "gatekeeper", l: "Gatekeeper" },
      { v: "discovery", l: "Discovery Call" },
      { v: "qualified", l: "Qualified" },
      { v: "proposal_sent", l: "Proposal Sent" },
      { v: "negotiation", l: "Negotiation" },
      { v: "closed", l: "Won" },
      { v: "declined", l: "Declined" },
    ],
    metricLabels: { primary: "Qualified", secondary: "Closes" },
  },
];

// Auto-classify business type to lead type
function guessLeadType(bt) {
  const lower = bt.toLowerCase();
  if (/tourism office|state tda|tourism department|tourism bureau|visitors bureau/i.test(lower)) return "tda";
  if (/chamber|alliance|association|trade org/i.test(lower)) return "chamber";
  if (/tda|tourism|county|city|municipal|regional council|government/i.test(lower)) return "government";
  if (/church|nonprofit|foundation|united way|habitat|red cross/i.test(lower)) return "nonprofit";
  if (/college|university|school|library|media|broadcast/i.test(lower)) return "education";
  return "business";
}

const SEEDS = {
  avl: [
    // Businesses
    { cat: "Local News", biz: "Mission Health / HCA", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Liberty Bicycles", type: "Bike shop", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "HomeTrust Bank", type: "Community bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "12 Bones Smokehouse", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Orange Peel", type: "Music venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Hunter Subaru", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Edward Jones City, ST", type: "Financial advisor", ph: "PHONE_REDACTED" },
    // Chambers / Associations
    { cat: "Opinion / Editorial", biz: "City, ST Area Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "City, ST Downtown Association", type: "Business association", ph: "PHONE_REDACTED" },
    // Government / TDA
    { cat: "Events / Entertainment", biz: "Buncombe County TDA", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "City of City, ST Economic Dev", type: "City government", ph: "PHONE_REDACTED" },
    // Nonprofits
    { cat: "Lifestyle / Community", biz: "United Way of City, ST", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Habitat for Humanity Buncombe", type: "Nonprofit housing", ph: "PHONE_REDACTED" },
    // Education
    { cat: "Opinion / Editorial", biz: "UNC City, ST", type: "University", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "AB Tech Community College", type: "Community college", ph: "PHONE_REDACTED" },
  ],
  atl: [
    { cat: "Local News", biz: "Piedmont Healthcare", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "REI Atlanta", type: "Outdoor outfitter", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Synovus Bank", type: "Regional bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Fox Bros Bar-B-Q", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Tabernacle Atlanta", type: "Concert venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Nalley BMW", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Metro Atlanta Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Buckhead Business Association", type: "Business association", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Atlanta Convention & Visitors Bureau", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Invest Atlanta", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Atlanta Community Food Bank", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Habitat for Humanity Atlanta", type: "Nonprofit housing", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Georgia State University", type: "University", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Atlanta Track Club", type: "Nonprofit sports org", ph: "PHONE_REDACTED" },
  ],
  chi: [
    { cat: "Local News", biz: "Northwestern Medicine", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Fleet Feet Chicago", type: "Running store", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Wintrust Financial", type: "Community bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Girl & The Goat", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Thalia Hall", type: "Music venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Perillo BMW Chicago", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Chicagoland Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Illinois Restaurant Association", type: "Trade association", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Choose Chicago (Tourism Bureau)", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "World Business Chicago", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Greater Chicago Food Depository", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "DePaul University", type: "University", ph: "PHONE_REDACTED" },
  ],
  cos: [
    { cat: "Local News", biz: "UCHealth Memorial", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Mountain Chalet", type: "Outdoor gear", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "ENT Credit Union", type: "Credit union", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Shuga's Restaurant", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Pikes Peak Center", type: "Event venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Phil Long Ford", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "CS Chamber & EDC", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Visit Colorado Springs (CVB)", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "City of CS Economic Dev", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Pikes Peak United Way", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "UCCS", type: "University", ph: "PHONE_REDACTED" },
  ],
  hhs: [
    { cat: "Local News", biz: "St. Bernards Healthcare", type: "Hospital", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Thompson CAT Rental", type: "Heavy equipment", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Centennial Bank", type: "Regional bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Skinny J's", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Forum Civic Center", type: "Event venue", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Jonesboro Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Jonesboro Tourism Commission", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "United Way of NE Arkansas", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Arkansas State University", type: "University", ph: "PHONE_REDACTED" },
  ],
  kng: [
    { cat: "Local News", biz: "HealthAlliance Hospital", type: "Hospital", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Kenco Outfitters", type: "Outdoor gear", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Ulster Savings Bank", type: "Community bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Duo Bistro", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "UPAC Kingston", type: "Theater", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Ulster County Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Visit Kingston / Ulster Tourism", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Ulster County Government", type: "County government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "United Way of Ulster County", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "SUNY Ulster", type: "Community college", ph: "PHONE_REDACTED" },
  ],
  mia: [
    { cat: "Local News", biz: "Baptist Health So FL", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Bike Generation Miami", type: "Bike shop", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Centennial Bank Miami", type: "Regional bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Versailles Restaurant", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "The Fillmore Miami", type: "Concert venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "South Motors BMW", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Greater Miami Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Coral Gables Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Greater Miami CVB", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Miami-Dade Beacon Council", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "United Way of Miami-Dade", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Florida International University", type: "University", ph: "PHONE_REDACTED" },
  ],
  mpl: [
    { cat: "Local News", biz: "Allina Health", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Penn Cycle", type: "Bike shop", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Bridgewater Bank", type: "Community bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Hai Hai Restaurant", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "First Avenue", type: "Music venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Borton Volvo", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Mpls Regional Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Meet Minneapolis (CVB)", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Minneapolis CPED", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Greater Twin Cities United Way", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "University of Minnesota", type: "University", ph: "PHONE_REDACTED" },
  ],
  ocn: [
    { cat: "Local News", biz: "Tri-City Medical Center", type: "Hospital", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Bicycle Warehouse", type: "Bike shop", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "North County Credit Union", type: "Credit union", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "That Boy Good BBQ", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Brooks Theater", type: "Theater", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Oceanside Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Visit Oceanside (Tourism)", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "City of Oceanside Econ Dev", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Oceanside Boys & Girls Club", type: "Nonprofit youth org", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "MiraCosta College", type: "Community college", ph: "PHONE_REDACTED" },
  ],
  oma: [
    { cat: "Local News", biz: "CHI Health", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Scheels Omaha", type: "Sporting goods", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "First National Bank", type: "Regional bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Block 16", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Orpheum Theater", type: "Theater", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Woodhouse Auto", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Greater Omaha Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Visit Omaha (CVB)", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Greater Omaha Econ Dev Partnership", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "United Way of the Midlands", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Creighton University", type: "University", ph: "PHONE_REDACTED" },
  ],
  phx: [
    { cat: "Local News", biz: "Banner Health", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "AZ Hiking Shack", type: "Outdoor gear", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "National Bank of AZ", type: "Regional bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Pizzeria Bianco", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "The Van Buren", type: "Music venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Earnhardt Auto Centers", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Greater Phoenix Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Arizona Restaurant Association", type: "Trade association", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Visit Phoenix (CVB)", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Phoenix Community Alliance", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Valley of the Sun United Way", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Arizona State University", type: "University", ph: "PHONE_REDACTED" },
  ],
  pdx: [
    { cat: "Local News", biz: "Providence Health", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "River City Bicycles", type: "Bike shop", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Umpqua Bank", type: "Community bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Screen Door Portland", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Crystal Ballroom", type: "Music venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Ron Tonkin Honda", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Portland Business Alliance", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Travel Portland (CVB)", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Prosper Portland", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "United Way Columbia-Willamette", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Portland State University", type: "University", ph: "PHONE_REDACTED" },
  ],
  stp: [
    { cat: "Local News", biz: "Bayfront Health", type: "Hospital", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "St Pete Running Co", type: "Running store", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Raymond James HQ", type: "Financial services", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Bodega DTSP", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Jannus Live", type: "Concert venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Crown Automotive", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "St Pete Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Visit St. Pete/Clearwater (TDA)", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "St Pete Economic Dev Corp", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Foundation for a Healthy St. Pete", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Eckerd College", type: "University", ph: "PHONE_REDACTED" },
  ],
  sdn: [
    { cat: "Local News", biz: "Scripps Health", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Trek Bicycle San Diego", type: "Bike shop", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "California Coast CU", type: "Credit union", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Juniper & Ivy", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Observatory North Park", type: "Music venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Kearny Mesa Toyota", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "SD Regional Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "San Diego Tourism Authority", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "SD Regional EDC", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "United Way of San Diego", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "San Diego State University", type: "University", ph: "PHONE_REDACTED" },
  ],
  sea: [
    { cat: "Local News", biz: "Swedish Medical Center", type: "Hospital system", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "REI Flagship Seattle", type: "Outdoor outfitter", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Washington Federal", type: "Regional bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Canlis Restaurant", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "The Showbox", type: "Music venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Autonation Honda Renton", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Seattle Metro Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Visit Seattle (CVB)", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Seattle Office of Econ Dev", type: "City government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "United Way of King County", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Seattle University", type: "University", ph: "PHONE_REDACTED" },
  ],
  xen: [
    { cat: "Local News", biz: "Kettering Health Xenia", type: "Hospital", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Greene County Parks", type: "Recreation", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Xenia Area FCU", type: "Credit union", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Jailhouse Grille", type: "Restaurant", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Xenia Towne Square", type: "Event venue", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Greene County Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Greene County CVB", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Greene County Commissioners", type: "County government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Greene County United Way", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Central State University", type: "University", ph: "PHONE_REDACTED" },
  ],
  wnc: [
    { cat: "Local News", biz: "Pardee UNC Health", type: "Hospital", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "The Hub Pisgah", type: "Bike shop", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Skyline National Bank", type: "Community bank", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Sierra Nevada Taproom", type: "Brewery", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Salvage Station", type: "Music venue", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Prestige Subaru Hendersonville", type: "Auto dealership", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Land of Sky Regional Council", type: "Regional council", ph: "PHONE_REDACTED" },
    { cat: "Business / Economy", biz: "Henderson County Chamber", type: "Chamber of Commerce", ph: "PHONE_REDACTED" },
    { cat: "Events / Entertainment", biz: "Explore City, ST CVB", type: "Tourism development authority", ph: "PHONE_REDACTED" },
    { cat: "Local News", biz: "Henderson County Econ Dev", type: "County government", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "Community Foundation of WNC", type: "Nonprofit foundation", ph: "PHONE_REDACTED" },
    { cat: "Lifestyle / Community", biz: "MANNA FoodBank", type: "Nonprofit food bank", ph: "PHONE_REDACTED" },
    { cat: "Opinion / Editorial", biz: "Western Carolina University", type: "University", ph: "PHONE_REDACTED" },
    { cat: "Sports / Outdoors", biz: "Blue Ridge Community College", type: "Community college", ph: "PHONE_REDACTED" },
  ],
};





function initLeads() {
  let id = 1;
  const out = [];
  Object.entries(SEEDS).forEach(([mk, arr]) => {
    arr.forEach(s => {
      const lt = guessLeadType(s.type);
      const al = lt === "government" || lt === "chamber" ? "multi" : lt === "business" ? "gatekeeper" : "direct";
      out.push({ id: String(id++), bn: s.biz, cn: "", ph: s.ph, em: "", mk, cat: s.cat, bt: s.type, st: "prospect", lt, al, tier: "2", notes: [], ts: new Date().toISOString(), lc: new Date().toISOString() });
    });
  });
  return out;
}

// Merge new SEEDS into existing leads (adds missing ones, keeps existing untouched)
function mergeSeeds(existing) {
  const seen = new Set(existing.map(l => `${l.mk}::${l.bn}`));
  let maxId = existing.reduce((mx, l) => Math.max(mx, parseInt(l.id) || 0), 0);
  const added = [];
  Object.entries(SEEDS).forEach(([mk, arr]) => {
    arr.forEach(s => {
      const key = `${mk}::${s.biz}`;
      if (!seen.has(key)) {
        const lt = guessLeadType(s.type);
        const al = lt === "government" || lt === "chamber" ? "multi" : lt === "business" ? "gatekeeper" : "direct";
        added.push({ id: String(++maxId), bn: s.biz, cn: "", ph: s.ph, em: "", mk, cat: s.cat, bt: s.type, st: "prospect", lt, al, tier: "2", notes: [], ts: new Date().toISOString(), lc: new Date().toISOString() });
        seen.add(key);
      }
    });
  });
  return added.length > 0 ? [...existing, ...added] : existing;
}

function emailBody(lead) {
  const m = M.find(x => x.id === lead.mk);
  const c = CATS.find(x => x.name === lead.cat);
  return `Subject: Founding Sponsor Opportunity — ${m?.p}\n\nHi ${lead.cn || "there"},\n\nThank you for taking my call. We're launching ${m?.p}, a news and community engagement platform for ${m?.n}.\n\nAs a Founding Sponsor, you OWN the entire ${lead.cat} section:\n- Header, sidebar, and footer ads on every page\n- Unlimited advertorials and sponsored content\n- Zero competitors in your category\n- 12 months of exclusive category domination\n\nInvestment: $${c?.price.toLocaleString()}/year ($${Math.round((c?.price || 2500) / 12)}/month)\n\nOnly 6 sponsor slots exist. Once your category is taken, it's gone.\n\nReply or call PHONE_REDACTED.\n\nCarl Farrington\nFarrington Development\ncompany.example.com | content.example.com | wnctimes.com`;
}

const gm = (id) => M.find(m => m.id === id);
const gc = (n) => CATS.find(c => c.name === n);
const gs = (v) => STS.find(s => s.v === v);
const fd = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

const EMPTY_LEAD = { bn: "", cn: "", ph: "", em: "", mk: "avl", cat: "Local News", bt: "", st: "prospect", lt: "business", al: "direct", tier: "2", campaign: "" };
const LEAD_VIEW_MODES = ["grid", "list", "kanban", "pipeline"];



function isFarringtonDevelopmentLead(lead) {
  return lead?.campaign === 'farrington_dev'
    || lead?.suggestedPipelineId === 'farrington_dev'
    || ['fd-website', 'command-center-consult', 'product-inquiry'].includes(lead?.source)
    || /farrington development|command center/i.test(`${lead?.serviceLine || ''} ${lead?.productOpportunity || ''}`)
}

const pipelineForLead = (lead) => {
  if (isFarringtonDevelopmentLead(lead)) return { pipelineId: 'farrington_dev', pipelineName: 'Farrington Development', stageId: 'discovery' }
  if (lead?.lt === 'tda')       return { pipelineId: 'tda',       pipelineName: 'State TDA Outreach',  stageId: 'cold_list' }
  if (lead?.lt === 'newspaper') return { pipelineId: 'newspaper', pipelineName: 'Newspaper Outreach',  stageId: 'cold_list' }
  return { pipelineId: 'sponsors', pipelineName: 'Sponsors', stageId: 'prospect' }
}

const normalizeLeadView = (mode) => {
  const value = String(mode || '').toLowerCase()
  if (value === 'card' || value === 'cards') return 'grid'
  if (value === 'table') return 'list'
  if (value === 'board') return 'kanban'
  return LEAD_VIEW_MODES.includes(value) ? value : 'kanban'
}

function LeadsHeaderIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8M8 13h5" />
      <circle cx="17" cy="15" r="2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 17l2 2" />
    </svg>
  )
}

async function readJsonResponse(response, label = 'Request') {
  const text = await response.text()
  let data = null
  if (text.trim()) {
    try {
      data = JSON.parse(text)
    } catch {
      const html = /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)
      throw new Error(`${label} ${html ? 'returned a web page instead of data' : 'returned invalid data'} (${response.status})`)
    }
  }
  if (!response.ok) throw new Error(data?.error || `${label} failed (${response.status})`)
  return data
}

export default function SponsorCRM({ onNavigate, activeLifecycleTab = 'leads' }) {
  const _sui = () => { try { return JSON.parse(localStorage.getItem('sponsor-crm-ui') || '{}') } catch { return {} } }
  const [campaign, setCampaign] = useState(() => _sui().campaign ?? "sponsors");
  const [leads, setLeads] = useState([]);
  const [qualToast, setQualToast] = useState('')
  const [qualifying, setQualifying] = useState(false)
  const [f, sf] = useState(() => {
    try {
      const s = typeof window !== 'undefined' && localStorage.getItem('sponsor-crm-filter')
      if (s) return { list: "all", mk: "all", cat: "all", st: "all", lt: "all", al: "all", tier: "all", ps: "all", leadList: "all", q: "", ...JSON.parse(s) }
    } catch {}
    return { list: "all", mk: "all", cat: "all", st: "all", lt: "all", al: "all", tier: "all", ps: "all", leadList: "all", q: "" }
  });
  // Reset page when filters change and persist filter to localStorage
  const setFilter = useCallback((updater) => {
    sf(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem('sponsor-crm-filter', JSON.stringify(next)) } catch {}
      return next
    })
    setPage(0);
  }, []);
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState(() => _sui().sort ?? { key: "mk", dir: "asc" });
  const [view, setRawView] = useState(() => normalizeLeadView(_sui().view ?? "list"));
  const [dragId, setDragId] = useState(null);
  const [colPageSize, setColPageSize] = useState(10);
  const [colShown, setColShown] = useState({});
  const [page, setPage] = useState(() => _sui().page ?? 0);
  const setView = useCallback((nextView) => {
    setRawView(normalizeLeadView(nextView));
    setPage(0);
  }, []);
  const PAGE_SIZE = 20;
  const [selected, setSelected] = useState(() => _sui().selected ?? null);

  useEffect(() => {
    try { localStorage.setItem('sponsor-crm-ui', JSON.stringify({ campaign, sort, view, page, selected })) } catch {}
  }, [campaign, sort, view, page, selected]);
  const [editing, setEditing] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [showEmail, setShowEmail] = useState(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailFiles, setEmailFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const fileInputRef = useRef(null);
  const ready = useRef(false);

  // Scripts
  const [scripts, setScripts] = useState([]);
  const [npScripts, setNpScripts] = useState([]);
  const [tdaScripts, setTdaScripts] = useState([]);
  const [devScripts, setDevScripts] = useState([]);
  const [showScript, setShowScript] = useState(null);
  const [showScriptManager, setShowScriptManager] = useState(false);
  const [editingScript, setEditingScript] = useState(null); // draft being edited
  const [activeScriptId, setActiveScriptId] = useState("script-a");
  const [callOutcome, setCallOutcome] = useState("pitched");
  const [callNote, setCallNote] = useState("");
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [pickingCampaign, setPickingCampaign] = useState(false);
  const [qualifyingLead, setQualifyingLead] = useState(null);
  const [pipelineList, setPipelineList] = useState([]);
  useEffect(() => { fetch('/api/pipelines').then(r => r.json()).then(d => setPipelineList(d.pipelines || [])).catch(() => {}) }, []);
  const [leadListOptions, setLeadListOptions] = useState([]);
  useEffect(() => { fetch('/api/lead-lists').then(r => r.json()).then(d => setLeadListOptions(d.leadLists || [])).catch(() => {}) }, []);
  const [csvPreview, setCsvPreview] = useState(null);
  const csvInputRef = useRef(null);

  // Inbound channels — dynamic project tabs, fetched once on mount
  const [channels, setChannels] = useState([]);
  useEffect(() => {
    fetch('/api/inbound-channels').then(r => r.json())
      .then(d => setChannels((d.channels || []).filter(c => c.enabled && c.targetCampaign)))
      .catch(() => {});
  }, []);
  const dynamicCampaigns = useMemo(() => channels.map(c => ({
    id: c.targetCampaign,
    name: c.label,
    icon: c.icon || '📥',
    description: `Inbound channel: ${c.label}`,
    listFilter: `channel:${c.targetCampaign}`,
    outcomes: CAMPAIGNS[0].outcomes,
    metricLabels: CAMPAIGNS[0].metricLabels,
    isDynamic: true,
    channelId: c.id,
  })), [channels]);
  const allCampaigns = useMemo(() => [...CAMPAIGNS, ...dynamicCampaigns], [dynamicCampaigns]);
  const dynamicCampaignIds = useMemo(() => dynamicCampaigns.map(c => c.id), [dynamicCampaigns]);

  // Active campaign config
  const activeCampaign = allCampaigns.find(c => c.id === campaign) || allCampaigns[0];
  const activeScripts = campaign === "sponsors" ? scripts : campaign === "tda_outreach" ? tdaScripts : campaign === "farrington_dev" ? devScripts : npScripts;
  const setActiveScripts = campaign === "sponsors" ? setScripts : campaign === "tda_outreach" ? setTdaScripts : campaign === "farrington_dev" ? setDevScripts : setNpScripts;

  // ── Persistence ──
  useEffect(() => {
    // Load scripts from API (seeds from hardcoded on first run)
    fetch('/api/scripts').then(r => r.json()).then(all => {
      if (!Array.isArray(all)) return;
      setScripts(all.filter(s => s.campaign === 'sponsors'));
      setNpScripts(all.filter(s => s.campaign === 'newspapers'));
      setTdaScripts(all.filter(s => s.campaign === 'tda_outreach'));
      setDevScripts(all.filter(s => s.campaign === 'farrington_dev'));
    }).catch(() => {});

    fetch("/api/sponsor-leads").then(r => {
      if (!r.ok) throw new Error(`Lead database failed (${r.status})`);
      return r.json();
    }).then(d => {
      const merged = Array.isArray(d) ? mergeSeeds(d) : [];
      setLeads(merged);
      localStorage.setItem("sponsor-leads", JSON.stringify(merged));
      ready.current = true;
    }).catch(() => {
      const s = localStorage.getItem("sponsor-leads");
      let loaded = null;
      if (s) { try { loaded = JSON.parse(s); } catch { } }
      const base = Array.isArray(loaded) ? loaded : [];
      setLeads(mergeSeeds(base));
      ready.current = true;
    });
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    localStorage.setItem("sponsor-leads", JSON.stringify(leads));
    setSaving(true); setTimeout(() => setSaving(false), 800);
  }, [leads]);

  const saveScript = async (script) => {
    await fetch('/api/scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', script }) });
  };
  const deleteScriptById = async (id) => {
    await fetch('/api/scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }) });
  };
  const createScript = async (campaign) => {
    const r = await fetch('/api/scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', campaign }) }).then(r => r.json());
    return r.script;
  };

  // ── Bulk actions ──
  const toggleBulk = (id) => setBulkSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleBulkAll = (ids) => setBulkSelected(prev => prev.size === ids.length ? new Set() : new Set(ids));
  const executeBulk = (action, value) => {
    if (bulkSelected.size === 0) return;
    if (action === "delete") {
      if (!confirm(`Delete ${bulkSelected.size} lead(s)?`)) return;
      const ids = [...bulkSelected]
      setLeads(p => p.filter(l => !bulkSelected.has(l.id)));
      fetch('/api/sponsor-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_delete', ids }) }).catch(() => {})
    } else if (action === "status") {
      const ids = [...bulkSelected]
      setLeads(p => p.map(l => bulkSelected.has(l.id) ? { ...l, st: value, lc: new Date().toISOString() } : l));
      fetch('/api/sponsor-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_update_status', ids, status: value }) }).catch(() => {})
    } else if (action === "tier") {
      setLeads(p => p.map(l => bulkSelected.has(l.id) ? { ...l, tier: value } : l));
    } else if (action === "market") {
      setLeads(p => p.map(l => bulkSelected.has(l.id) ? { ...l, mk: value } : l));
    }
    setBulkSelected(new Set());
  };

  // ── CRUD ──
  const upTimers = useRef({})
  const up = useCallback((id, u) => {
    setLeads(p => p.map(l => l.id === id ? { ...l, ...u, lc: new Date().toISOString() } : l))
    clearTimeout(upTimers.current[id])
    upTimers.current[id] = setTimeout(() => {
      fetch('/api/sponsor-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', lead: { id, ...u } }) }).catch(() => {})
      delete upTimers.current[id]
    }, 700)
  }, []);

  const logCall = useCallback((leadId) => {
    const script = activeScripts.find(s => s.id === activeScriptId);
    if (!script) return;
    const entry = { d: new Date().toISOString(), scriptId: activeScriptId, scriptTag: script.tag, outcome: callOutcome, note: callNote };
    setLeads(p => p.map(l => l.id === leadId ? { ...l, calls: [...(l.calls || []), entry], lc: new Date().toISOString() } : l));
    // Update script stats (campaign-aware)
    const isNp = activeScriptId.startsWith("np-");
    const updateFn = (p) => p.map(s => s.id === activeScriptId ? {
      ...s,
      stats: {
        calls: s.stats.calls + 1,
        interested: s.stats.interested + (["interested", "wants_demo"].includes(callOutcome) ? 1 : 0),
        closed: s.stats.closed + (["closed", "signed_up"].includes(callOutcome) ? 1 : 0),
      }
    } : s);
    if (activeScriptId.startsWith("dev-")) setDevScripts(updateFn);
    else if (activeScriptId.startsWith("tda-")) setTdaScripts(updateFn);
    else if (isNp) setNpScripts(updateFn);
    else setScripts(updateFn);
    setCallNote("");
    setCallOutcome("pitched");
  }, [activeScripts, activeScriptId, callOutcome, callNote]);
  const del = useCallback((id) => {
    setLeads(p => p.filter(l => l.id !== id))
    if (selected === id) setSelected(null)
    fetch('/api/sponsor-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) }).catch(() => {})
  }, [selected]);

  const qualifyToPipeline = async (lead) => {
    if (!lead || qualifying) return
    const { pipelineId, pipelineName, stageId } = pipelineForLead(lead)
    if (!confirm(`Move "${lead.bn || lead.cn}" into the "${pipelineName}" pipeline as an opportunity?`)) return
    setQualifying(true)
    try {
      const r = await fetch('/api/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'qualify',
          leadId: lead.id,
          pipelineId,
          stageId,
          opportunityName: `${lead.bn || lead.cn || 'New Opportunity'} — ${pipelineName}`,
        }),
      }).then(r => r.json())
      if (r.error) { setQualToast('⚠ ' + r.error); setQualifying(false); return }
      setQualToast(`✓ Qualified — moved to ${pipelineName} pipeline`)
      // Refresh leads from bridge
      try {
        const reload = await fetch('/api/sponsor-leads').then(r => r.json())
        if (Array.isArray(reload)) setLeads(mergeSeeds(reload))
        else if (reload.leads) setLeads(mergeSeeds(reload.leads))
      } catch {}
      setTimeout(() => { setSelected(null); setQualToast(''); setQualifying(false) }, 1600)
    } catch (e) {
      setQualToast('⚠ ' + e.message); setQualifying(false)
    }
  }
  const addNote = useCallback((id) => {
    if (!noteText.trim()) return;
    setLeads(p => p.map(l => l.id === id ? { ...l, notes: [...l.notes, { t: noteText, d: new Date().toISOString() }], lc: new Date().toISOString() } : l));
    setNoteText("");
  }, [noteText]);

  const saveLead = useCallback(async () => {
    if (!editing || !editing.bn.trim()) return;
    if (editing.id) {
      up(editing.id, { bn: editing.bn, cn: editing.cn, ph: editing.ph, em: editing.em, web: editing.web || '', address: editing.address || '', mk: editing.mk, cat: editing.cat, bt: editing.bt, st: editing.st, lt: editing.lt || "business", al: editing.al || "direct", tier: editing.tier || "2" });
    } else {
      const lt = editing.lt || guessLeadType(editing.bt);
      const newId = Date.now().toString();
      const draftLead = { ...editing, id: newId, lt, al: editing.al || "direct", tier: editing.tier || "2", notes: [], ts: new Date().toISOString(), lc: new Date().toISOString() };
      setLeads(p => [draftLead, ...p]);
      let savedLead = draftLead;
      try {
        const r = await fetch('/api/sponsor-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', lead: draftLead }),
        });
        const j = await r.json();
        if (j?.lead) {
          savedLead = j.lead;
          setLeads(p => p.map(l => l.id === newId ? savedLead : l));
        }
      } catch {}
      // Auto-research new lead in background (skip if user already filled phone+web+address)
      const needsResearch = !savedLead.ph || !savedLead.web || !savedLead.address;
      if (needsResearch) {
        setTimeout(() => {
          fetch('/api/harness/actions/lead-research', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId: savedLead.id, lead: savedLead }),
          }).then(r => readJsonResponse(r, 'Auto-Research')).then(res => {
            if (res?.updated?.length) {
              // Pull fresh data so UI reflects enriched fields
              fetch('/api/sponsor-leads').then(r => r.json()).then(d => {
                if (Array.isArray(d)) setLeads(mergeSeeds(d));
              }).catch(() => {});
            }
          }).catch(() => {});
        }, 1500);
      }
    }
    setEditing(null);
  }, [editing, up]);

  // ── Filter + Sort ──
  const filtered = useMemo(() => leads.filter(l => {
    // Dynamic channel tabs (e.g. f.list = "channel:ContentStudio_demos")
    if (typeof f.list === 'string' && f.list.startsWith('channel:')) {
      const cid = f.list.slice(8);
      if (l.campaign !== cid && l.source !== cid) return false;
    }
    // List filter: sponsors vs newspapers vs tdas vs farrington
    // Sponsors tab also excludes any lead that belongs to a dynamic inbound channel.
    const isFarringtonLead = isFarringtonDevelopmentLead(l);
    if (f.list === "sponsors" && (l.lt === "newspaper" || l.lt === "tda" || isFarringtonLead || dynamicCampaignIds.includes(l.campaign))) return false;
    if (f.list === "newspapers" && l.lt !== "newspaper") return false;
    if (f.list === "tdas" && l.lt !== "tda") return false;
    if (f.list === "farrington" && !isFarringtonLead) return false;
    // Paper state filter (newspapers and TDAs)
    if (f.ps !== "all" && (l.paperState || "") !== f.ps && (STATE_NAMES[f.ps] || "") !== (l.paperStateName || "")) return false;
    if (f.mk !== "all" && l.mk !== f.mk) return false;
    if (f.cat !== "all" && l.cat !== f.cat) return false;
    if (f.st !== "all" && l.st !== f.st) return false;
    if (f.lt !== "all" && (l.lt || "business") !== f.lt) return false;
    if (f.al !== "all" && (l.al || "direct") !== f.al) return false;
    if (f.tier !== "all" && (l.tier || "2") !== f.tier) return false;
    // Lead List filter (raw lead bucket assigned in Lead Lab / Lead Intake)
    if (f.leadList && f.leadList !== "all") {
      const lid = l.leadListId || l.suggestedPipelineId || "";
      if (f.leadList === "unassigned") { if (lid) return false; }
      else if (lid !== f.leadList) return false;
    }
    if (f.q) {
      const s = f.q.toLowerCase();
      return [
        l.bn,
        l.cn,
        l.em,
        l.ph,
        l.bt,
        l.serviceLine,
        l.productOpportunity,
        l.campaign,
        l.source,
        l.paperCity,
        l.paperStateName,
        ...(Array.isArray(l.searchAliases) ? l.searchAliases : []),
        ...(Array.isArray(l.tags) ? l.tags : []),
      ].filter(Boolean).join(' ').toLowerCase().includes(s);
    }
    return true;
  }), [leads, f, dynamicCampaignIds]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va = "", vb = "";
      if (sort.key === "bn") { va = a.bn; vb = b.bn; }
      else if (sort.key === "mk") { va = gm(a.mk)?.p || ""; vb = gm(b.mk)?.p || ""; }
      else if (sort.key === "cat") { va = a.cat; vb = b.cat; }
      else if (sort.key === "st") { va = STS.findIndex(s => s.v === a.st).toString(); vb = STS.findIndex(s => s.v === b.st).toString(); }
      else if (sort.key === "lc") { va = a.lc || "0"; vb = b.lc || "0"; }
      return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return arr;
  }, [filtered, sort]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = useMemo(() => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sorted, page]);
  // Clamp page if filters reduce results
  useEffect(() => { if (page >= totalPages) setPage(Math.max(0, totalPages - 1)); }, [totalPages, page]);

  const stats = useMemo(() => {
    const cl = leads.filter(l => l.st === "closed");
    const pl = leads.filter(l => ["interested", "email_sent", "follow_up"].includes(l.st));
    return {
      total: leads.length,
      prospect: leads.filter(l => l.st === "prospect").length,
      called: leads.filter(l => l.st === "called").length,
      int: leads.filter(l => l.st === "interested").length,
      won: cl.length,
      declined: leads.filter(l => l.st === "declined").length,
      rev: cl.reduce((s, l) => s + (gc(l.cat)?.price || 0), 0),
      pipe: pl.reduce((s, l) => s + (gc(l.cat)?.price || 0), 0),
    };
  }, [leads]);

  const toggleSort = (key) => setSort(p => ({ key, dir: p.key === key && p.dir === "asc" ? "desc" : "asc" }));
  const sortIcon = (key) => sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  const selectedLead = selected ? leads.find(l => l.id === selected) : null;
  const refreshLeads = useCallback(async (keepSelectedId = selected) => {
    const data = await fetch('/api/sponsor-leads').then(r => r.json())
    if (!Array.isArray(data)) return
    const merged = mergeSeeds(data)
    setLeads(merged)
    localStorage.setItem('sponsor-leads', JSON.stringify(merged))
    if (keepSelectedId && merged.some(l => l.id === keepSelectedId)) setSelected(keepSelectedId)
  }, [selected])
  useActiveRecord('lead', selectedLead ? { id: selectedLead.id, name: selectedLead.bn, contact: selectedLead.cn, phone: selectedLead.ph, email: selectedLead.em, website: selectedLead.web, address: selectedLead.address, category: selectedLead.bt, sponsorshipSlot: selectedLead.cat, businessType: selectedLead.bt, status: selectedLead.st, campaign: selectedLead.campaign || 'sponsors', leadType: selectedLead.lt, notes: (selectedLead.notes || []).slice(-5), researchSummary: selectedLead.researchSummary } : null, [selected])

  // Voice-driven record selection
  useEffect(() => {
    const handler = (e) => {
      const r = e.detail
      if (r?.type !== 'lead') return
      if (leads.some(l => l.id === r.id)) setSelected(r.id)
    }
    window.addEventListener('fcc:select-record', handler)
    return () => window.removeEventListener('fcc:select-record', handler)
  }, [leads])

  // Voice-driven campaign filter (Matilda's filter_leads tool)
  useEffect(() => {
    const handler = (e) => {
      const c = typeof e.detail === 'string' ? e.detail : e.detail?.campaign
      if (!c) return
      if (allCampaigns.some(x => x.id === c)) setCampaign(c)
    }
    window.addEventListener('fcc:set-leads-campaign', handler)
    return () => window.removeEventListener('fcc:set-leads-campaign', handler)
  }, [allCampaigns])

  // Auto-match script to lead type when selection changes
  useEffect(() => {
    if (selectedLead) {
      if (selectedLead.lt === "tda") {
        setCampaign("tda_outreach");
        setActiveScriptId("tda-script-g");
      } else if (selectedLead.lt === "newspaper") {
        setCampaign("newspaper_outreach");
        setActiveScriptId("np-script-d");
      } else {
        const lt = LEAD_TYPES.find(t => t.v === (selectedLead.lt || "business"));
        if (lt) setActiveScriptId(lt.script);
      }
    }
  }, [selected, selectedLead]);

  const inp = "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition-colors";
  const inpStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' };
  const label = "block text-xs font-medium mb-1";
  const labelStyle = { color: 'var(--text-muted)' };
  const leadIconActionStyle = { width: 32, height: 32, minWidth: 32, borderRadius: 999, display: 'inline-grid', placeItems: 'center', fontSize: 0, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' };
  const leadIconTone = {
    primary: { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' },
    muted: { background: 'transparent', color: 'var(--text-muted)' },
    green: { background: 'var(--green-soft)', color: 'var(--green)', borderColor: 'var(--green)' },
    amber: { background: 'var(--amber-soft)', color: 'var(--amber)' },
    teal: { background: 'var(--teal-soft)', color: 'var(--teal)' },
    purple: { background: 'var(--purple-soft)', color: 'var(--purple)', borderColor: 'var(--purple)' },
    danger: { background: 'var(--red-soft)', color: 'var(--red)' },
  };
  const iconOnly = (Icon) => <Icon size={15} strokeWidth={2.2} aria-hidden="true" />;
  const stopAction = (event) => {
    event.stopPropagation();
    event.preventDefault();
  };
  const openLeadWebsite = (lead) => {
    const clean = (lead.web || '').replace(/\[\d+\]/g, '').replace(/[.)\]]+$/, '').trim();
    const url = clean ? (clean.startsWith('http') ? clean : 'https://' + clean) : `https://www.google.com/search?q=${encodeURIComponent((lead.bn || '') + ' ' + (lead.paperCity || lead.address || ''))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const openLeadPhoneSearch = (lead) => {
    window.open(`https://www.google.com/search?q=${encodeURIComponent((lead.bn || '') + ' phone number ' + (lead.paperCity || lead.address || ''))}`, '_blank', 'noopener,noreferrer');
  };
  const openLeadMap = (lead) => {
    if (lead.address) window.open(`https://www.google.com/maps/search/${encodeURIComponent(lead.address)}`, '_blank', 'noopener,noreferrer');
  };
  const leadQualifyPayload = (lead) => ({
    id: lead.id,
    businessName: lead.bn || '',
    name: lead.cn || '',
    email: lead.em || '',
    phone: lead.ph || '',
    title: '',
    notes: Array.isArray(lead.notes) ? lead.notes.map(n => typeof n === 'string' ? n : (n.text || '')).filter(Boolean).join('\n\n') : (lead.notes || ''),
    tags: lead.tags || [],
    suggestedPipelineId: pipelineForLead(lead).pipelineId || lead.campaign || 'sponsors',
  });
  const renderLeadTile = (lead, compact = false) => {
    const c = gc(lead.cat);
    const m = gm(lead.mk);
    const s = gs(lead.st);
    const isSelected = selected === lead.id;
    return (
      <article
        key={lead.id}
        onClick={() => setSelected(isSelected ? null : lead.id)}
        className="rounded-xl border p-3 cursor-pointer transition-colors"
        style={{
          borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
          background: isSelected ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--surface)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{lead.bn}</div>
            <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{lead.cn || lead.bt || 'No contact'}</div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full border shrink-0" style={{ color: s?.c, borderColor: `${s?.c || '#94a3b8'}33`, background: `${s?.c || '#94a3b8'}11` }}>
            {s?.l || lead.st}
          </span>
        </div>
        {!compact && (
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div className="truncate" style={{ color: 'var(--text-muted)' }}>{m?.p || lead.mk || 'No market'}</div>
            <div className="truncate text-right" style={{ color: c?.color || 'var(--text-muted)' }}>{lead.cat}</div>
            <div className="truncate" style={{ color: 'var(--text-muted)' }}>{pipelineForLead(lead).pipelineName}</div>
            <div className="text-right font-semibold text-green-600">{lead.lt === "tda" || lead.lt === "newspaper" ? "--" : `$${c?.price?.toLocaleString?.() || 0}`}</div>
          </div>
        )}
        <div
          className="flex items-center gap-1.5 mt-3 flex-wrap"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
        >
          {lead.ph && /\d{7,}/.test(lead.ph.replace(/\D/g, '')) ? (
            <CallButton phone={lead.ph} name={lead.cn || lead.bn} label={iconOnly(Phone)} inline stopPropagation className="inline-grid place-items-center" style={{ ...leadIconActionStyle, ...leadIconTone.primary }} />
          ) : (
            <button type="button" aria-label="Find phone" title="Find phone" onClick={e => { stopAction(e); openLeadPhoneSearch(lead); }} style={{ ...leadIconActionStyle, ...leadIconTone.amber }}>
              {iconOnly(Search)}
            </button>
          )}
          <button type="button" aria-label={lead.web ? 'Open website' : 'Search business'} title={lead.web ? 'Open website' : 'Search business'} onClick={e => { stopAction(e); openLeadWebsite(lead); }} style={{ ...leadIconActionStyle, ...leadIconTone.primary }}>
            {iconOnly(ExternalLink)}
          </button>
          {lead.em && (
            <button type="button" aria-label="Email lead" title="Email lead" onClick={e => { stopAction(e); setEmailTo(lead.em || ""); setShowEmail(lead.id); }} style={{ ...leadIconActionStyle, ...leadIconTone.muted }}>
              {iconOnly(Mail)}
            </button>
          )}
          {lead.em && (
            <VideoMeetButton to={lead.em} name={lead.cn || lead.bn} seed={lead.bn || lead.cn} linkedTo={{ leadId: lead.id }} instant stopPropagation label={iconOnly(Video)} className="inline-grid place-items-center" style={{ ...leadIconActionStyle, ...leadIconTone.purple }} />
          )}
          <button type="button" aria-label="Qualify lead" title="Qualify lead" onClick={e => { stopAction(e); setQualifyingLead(leadQualifyPayload(lead)); }} style={{ ...leadIconActionStyle, ...leadIconTone.green }}>
            {iconOnly(CheckCircle2)}
          </button>
          <button type="button" aria-label="Delete lead" title="Delete lead" onClick={e => { stopAction(e); if (confirm(`Delete "${lead.bn}"?`)) del(lead.id); }} style={{ ...leadIconActionStyle, ...leadIconTone.danger }}>
            {iconOnly(Trash2)}
          </button>
        </div>
      </article>
    );
  };
  const pipelineGroups = useMemo(() => {
    const groups = new Map();
    for (const lead of sorted) {
      const meta = pipelineForLead(lead);
      if (!groups.has(meta.pipelineId)) groups.set(meta.pipelineId, { ...meta, leads: [] });
      groups.get(meta.pipelineId).leads.push(lead);
    }
    return Array.from(groups.values());
  }, [sorted]);

  // Campaign lead counts for left-rail badges (covers static + dynamic channels)
  const campaignCounts = useMemo(() => {
    const c = {};
    for (const cm of allCampaigns) {
      if (cm.isDynamic) c[cm.id] = leads.filter(l => l.campaign === cm.id || l.source === cm.id).length;
      else if (cm.id === "farrington_dev") c[cm.id] = leads.filter(isFarringtonDevelopmentLead).length;
      else if (cm.id === "tda_outreach") c[cm.id] = leads.filter(l => l.lt === "tda").length;
      else if (cm.id === "newspaper_outreach") c[cm.id] = leads.filter(l => l.lt === "newspaper").length;
      else c[cm.id] = leads.filter(l => l.lt !== "newspaper" && l.lt !== "tda" && !isFarringtonDevelopmentLead(l) && !dynamicCampaignIds.includes(l.campaign)).length;
    }
    return c;
  }, [leads, allCampaigns, dynamicCampaignIds]);

  return (
    <section className="crm-themed leads-workspace command-workspace w-full min-w-0 max-w-full min-h-full flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 sm:px-6 pt-4" style={{ background: 'var(--surface)' }}>
        <PageHeader
          icon={<LeadsHeaderIcon />}
          title="Leads"
          subtitle={<>{leads.length} leads across {M.length} markets - calls, scripts, statuses, email, imports, and qualification{saving && <span className="text-green-600 ml-2 animate-pulse">Saving...</span>}</>}
          actions={(
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <div className="mr-2 flex items-center gap-2">
              <label className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: 'var(--text-muted)' }}>Lead List</label>
              <ThemedSelect
                value={f.leadList || 'all'}
                onChange={e => setFilter(p => ({ ...p, leadList: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', minWidth: 240, maxWidth: 380 }}>
                <option value="all">All Lead Lists</option>
                <option value="unassigned">No Lead List</option>
                {leadListOptions.map(list => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </ThemedSelect>
            </div>
            <div className="mr-2 flex items-center gap-2">
              <label className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: 'var(--text-muted)' }}>Campaign</label>
              <ThemedSelect
                value={campaign}
                onChange={e => {
                  const id = e.target.value;
                  const c = allCampaigns.find(x => x.id === id);
                  if (!c) return;
                  setCampaign(id);
                  setFilter(p => ({ ...p, list: c.listFilter }));
                  if (!c.isDynamic) {
                    setActiveScriptId(id === "sponsors" ? "script-a" : id === "tda_outreach" ? "tda-script-g" : id === "farrington_dev" ? "dev-script-a" : "np-script-d");
                  }
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', minWidth: 200, maxWidth: 340 }}>
                {allCampaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name} ({campaignCounts[c.id] || 0})</option>
                ))}
              </ThemedSelect>
            </div>
            <button onClick={() => setShowScriptManager(true)}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }}>
              Scripts &amp; Stats
            </button>
            {onNavigate && (
              <button onClick={() => onNavigate('lead-intake')}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--surface2)' }}>
                Intake / Qualify
              </button>
            )}
            <button onClick={() => setPickingCampaign(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
              + New Lead
            </button>
            <button onClick={() => setShowCsvImport(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--surface2)', color: 'var(--teal)', border: '1px solid var(--border)' }}>
              ⬆ Import CSV
            </button>
          </div>
          )}
          viewToggle={<ViewModeToggle value={view} onChange={setView} modes={LEAD_VIEW_MODES} />}
        />
      </div>

      {/* ── Stats Row ── */}
      <div className="px-4 sm:px-6 py-3 flex gap-2 sm:gap-3 overflow-x-auto border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        {[
          { l: "Total", v: stats.total, c: null },
          { l: "Prospect", v: stats.prospect, c: "var(--text-muted)" },
          { l: "Called", v: stats.called, c: "#2563eb" },
          { l: "Interested", v: stats.int, c: "#d97706" },
          { l: "Won", v: stats.won, c: "#16a34a" },
          { l: "Declined", v: stats.declined, c: "#dc2626" },
          { l: "Potential", v: "$" + stats.pipe.toLocaleString(), c: "#d97706" },
          { l: "Revenue", v: "$" + stats.rev.toLocaleString(), c: "#16a34a" },
        ].map((s, i) => (
          <div key={i} className="min-w-[90px] px-4 py-2 rounded-lg border text-center shrink-0" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
            <div className="text-lg font-bold" style={{ color: s.c || 'var(--text)' }}>{s.v}</div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div className="px-4 sm:px-6 py-3 flex gap-2 flex-wrap items-center border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <input placeholder="Search businesses, contacts, types, cities..."
            value={f.q} onChange={e => setFilter(p => ({ ...p, q: e.target.value }))}
            className={`${inp} pl-9`} style={inpStyle} />
          <svg className="absolute left-3 top-2.5 w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        {(campaign === "newspaper_outreach" || campaign === "tda_outreach") && (
          <ThemedSelect value={f.ps} onChange={e => setFilter(p => ({ ...p, ps: e.target.value }))} className={`${inp} !w-auto`} style={inpStyle}>
            <option value="all">All States</option>
            {US_STATES.map(s => <option key={s} value={s}>{STATE_NAMES[s]} ({s})</option>)}
          </ThemedSelect>
        )}
        {campaign === "sponsors" && (
          <ThemedSelect value={f.mk} onChange={e => setFilter(p => ({ ...p, mk: e.target.value }))} className={`${inp} !w-auto`} style={inpStyle}>
            <option value="all">All Markets</option>
            {M.map(m => <option key={m.id} value={m.id}>{m.p}</option>)}
          </ThemedSelect>
        )}
        {campaign === "sponsors" && (
          <ThemedSelect value={f.cat} onChange={e => setFilter(p => ({ ...p, cat: e.target.value }))} className={`${inp} !w-auto`} style={inpStyle}>
            <option value="all">All Categories</option>
            {CATS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </ThemedSelect>
        )}
        <ThemedSelect value={f.st} onChange={e => setFilter(p => ({ ...p, st: e.target.value }))} className={`${inp} !w-auto`} style={inpStyle}>
          <option value="all">All Statuses</option>
          {STS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </ThemedSelect>
        {campaign === "sponsors" && (
          <ThemedSelect value={f.lt} onChange={e => setFilter(p => ({ ...p, lt: e.target.value }))} className={`${inp} !w-auto`} style={inpStyle}>
            <option value="all">All Types</option>
            {LEAD_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </ThemedSelect>
        )}
        {campaign !== "farrington_dev" && (
          <ThemedSelect value={f.al} onChange={e => setFilter(p => ({ ...p, al: e.target.value }))} className={`${inp} !w-auto`} style={inpStyle}>
            <option value="all">All Access</option>
            {ACCESS_LEVELS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
          </ThemedSelect>
        )}
        {campaign === "sponsors" && (
          <ThemedSelect value={f.tier} onChange={e => setFilter(p => ({ ...p, tier: e.target.value }))} className={`${inp} !w-auto`} style={inpStyle}>
            <option value="all">All Tiers</option>
            {TIERS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </ThemedSelect>
        )}
        {(f.q || f.list !== "all" || f.mk !== "all" || f.cat !== "all" || f.st !== "all" || f.lt !== "all" || f.al !== "all" || f.tier !== "all" || f.ps !== "all" || (f.leadList || "all") !== "all") && (
          <button onClick={() => setFilter({ list: "all", mk: "all", cat: "all", st: "all", lt: "all", al: "all", tier: "all", ps: "all", leadList: "all", q: "" })}
            className="px-3 py-2 text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>Clear filters</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="crm-muted text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} results</span>
          {view === "kanban" && (
            <ThemedSelect value={colPageSize} onChange={e => { setColPageSize(Number(e.target.value)); setColShown({}); }}
              className="text-xs px-2 py-1 rounded-lg" data-tooltip="Cards per column before 'Show more'"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <option value={10}>10 per col</option>
              <option value={25}>25 per col</option>
              <option value={50}>50 per col</option>
              <option value={100}>100 per col</option>
            </ThemedSelect>
          )}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden min-w-0 relative">

        {view === "grid" && (
          <div className="flex-1 overflow-auto min-w-0 p-4" style={{ background: 'var(--surface2)' }}>
            {paged.length === 0 ? (
              <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>No leads match your filters.</div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {paged.map(lead => renderLeadTile(lead))}
              </div>
            )}
            {totalPages > 1 && (
              <div className="mt-4 border rounded-xl px-4 py-2.5 flex items-center justify-between" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <span className="crm-muted text-xs" style={{ color: 'var(--text-muted)' }}>
                  {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(0)} disabled={page === 0}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-30 disabled:cursor-not-allowed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>First</button>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-30 disabled:cursor-not-allowed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Prev</button>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-30 disabled:cursor-not-allowed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Next</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-30 disabled:cursor-not-allowed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Last</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Table View ── */}
        {view === "list" && (
          <div className="flex-1 overflow-auto min-w-0" style={{ background: 'var(--surface)' }}>
            {/* Bulk action bar */}
            {bulkSelected.size > 0 && (
              <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                <span className="text-sm font-semibold">{bulkSelected.size} selected</span>
                <ThemedSelect className="text-xs rounded px-2 py-1" style={{ background: 'var(--surface)', color: 'var(--text)', border: 'none' }}
                  value="" onChange={e => { if (e.target.value) executeBulk("status", e.target.value); }}>
                  <option value="">Set Status...</option>
                  {STS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </ThemedSelect>
                <ThemedSelect className="text-xs rounded px-2 py-1" style={{ background: 'var(--surface)', color: 'var(--text)', border: 'none' }}
                  value="" onChange={e => { if (e.target.value) executeBulk("tier", e.target.value); }}>
                  <option value="">Set Tier...</option>
                  {TIERS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                </ThemedSelect>
                <button className="text-xs font-medium px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,0.2)' }}
                  onClick={() => executeBulk("delete")}>Delete</button>
                <button className="text-xs ml-auto" onClick={() => setBulkSelected(new Set())}>Cancel</button>
              </div>
            )}
            <table className="w-full text-sm table-fixed min-w-[700px]">
              <thead className="sticky top-0 z-10 border-b" style={{ background: 'var(--surface2)', borderColor: 'var(--border)', top: bulkSelected.size > 0 ? 40 : 0 }}>
                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  <th className="px-2 py-3 w-[36px]"><input type="checkbox" checked={paged.length > 0 && paged.every(l => bulkSelected.has(l.id))} onChange={() => toggleBulkAll(paged.map(l => l.id))} /></th>
                  <th className="px-4 py-3 w-[20%] cursor-pointer" onClick={() => toggleSort("bn")}>Business{sortIcon("bn")}</th>
                  <th className="px-4 py-3 w-[15%]">Contact</th>
                  <th className="px-4 py-3 w-[14%] cursor-pointer" onClick={() => toggleSort("mk")}>Market{sortIcon("mk")}</th>
                  <th className="px-4 py-3 w-[16%] cursor-pointer" onClick={() => toggleSort("cat")}>Sponsor Slot{sortIcon("cat")}</th>
                  <th className="px-4 py-3 w-[12%] cursor-pointer" onClick={() => toggleSort("st")}>Status{sortIcon("st")}</th>
                  <th className="px-4 py-3 w-[9%] text-right">Value</th>
                  <th className="px-4 py-3 w-[12%] cursor-pointer hover: text-right" onClick={() => toggleSort("lc")}>Last Contact{sortIcon("lc")}</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-16" style={{ color: 'var(--text-muted)' }}>No leads match your filters.</td></tr>
                ) : paged.map(lead => {
                  const m = gm(lead.mk); const c = gc(lead.cat); const s = gs(lead.st);
                  const isSelected = selected === lead.id;
                  return (
                    <tr key={lead.id}
                      onClick={() => setSelected(isSelected ? null : lead.id)}
                      className="border-b cursor-pointer transition-colors"
                      style={{
                        borderColor: 'var(--border)',
                        background: isSelected
                          ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                          : ((lead.st === 'new' || lead.st === 'prospect') ? 'rgba(34,197,94,0.12)' : undefined),
                        borderLeft: (lead.st === 'new' || lead.st === 'prospect') ? '4px solid #22c55e' : undefined,
                        position: 'relative',
                      }}>
                      <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={bulkSelected.has(lead.id)} onChange={() => toggleBulk(lead.id)} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-8 rounded-full shrink-0" style={{ background: c?.color || "#666" }} />
                          <div>
                            <div className="font-semibold flex items-center gap-1.5" style={{ color: (lead.st === 'new' || lead.st === 'prospect') ? '#22c55e' : 'var(--text)' }}>
                              {lead.bn}
                              {(lead.lt === "newspaper" || lead.lt === "tda") && lead.web && (
                                <a href={lead.web} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                  className="shrink-0" style={{ color: 'var(--accent)' }} data-tooltip="Visit website">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </a>
                              )}
                            </div>
                            <div className="crm-muted text-xs" style={{ color: 'var(--text-muted)' }}>{lead.lt === "tda" ? (lead.paperStateName || lead.paperState || "State TDA") : lead.lt === "newspaper" ? (lead.paperCity ? `${lead.paperCity}, ${lead.paperState}` : lead.paperStateName || "") : lead.bt}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div style={{ color: 'var(--text)' }}>{lead.cn || "—"}</div>
                        {lead.ph && /\d{7,}/.test(lead.ph.replace(/\D/g, '')) ? (
                          <CallButton
                            phone={lead.ph}
                            name={lead.cn || lead.bn}
                            label={iconOnly(Phone)}
                            className="inline-grid place-items-center"
                            style={{ ...leadIconActionStyle, ...leadIconTone.primary, width: 26, height: 26, minWidth: 26 }}
                            stopPropagation
                          />
                        ) : lead.ph ? (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{lead.ph}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{m?.p}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: c?.color }}><span className="w-2 h-2 rounded-full inline-block" style={{ background: c?.color }} />{lead.cat}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border"
                          style={{ color: s?.c, borderColor: s?.c + "33", backgroundColor: s?.c + "11" }}>
                          {s?.l}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{lead.lt === "tda" || lead.lt === "newspaper" ? "—" : `$${c?.price.toLocaleString()}`}</td>
                      <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--text-muted)' }}>{fd(lead.lc)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="sticky bottom-0 border-t px-4 py-2.5 flex items-center justify-between" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <span className="crm-muted text-xs" style={{ color: 'var(--text-muted)' }}>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(0)} disabled={page === 0}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-30 disabled:cursor-not-allowed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>««</button>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-30 disabled:cursor-not-allowed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>‹ Prev</button>
                  {/* Page numbers — show up to 7 */}
                  {(() => {
                    const pages = [];
                    let start = Math.max(0, page - 3);
                    let end = Math.min(totalPages - 1, start + 6);
                    start = Math.max(0, end - 6);
                    for (let i = start; i <= end; i++) pages.push(i);
                    return pages.map(p => (
                      <button key={p} onClick={() => setPage(p)}
                        className="px-2.5 py-1 text-xs rounded border"
                        style={p === page ? { background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                        {p + 1}
                      </button>
                    ));
                  })()}
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-30 disabled:cursor-not-allowed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Next ›</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-30 disabled:cursor-not-allowed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>»»</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Kanban / Pipeline View ── */}
        {view === "pipeline" && (
          <div className="flex-1 min-w-0 p-4">
            <BoardWorkbench label="Lead pipeline groups">
              {pipelineGroups.map(group => (
                <div key={group.pipelineId} className="board-column flex flex-col rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{group.pipelineName}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>{group.leads.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                    {group.leads.map(lead => renderLeadTile(lead, true))}
                  </div>
                </div>
              ))}
            </BoardWorkbench>
          </div>
        )}

        {view === "kanban" && (
          <div className="flex-1 min-w-0 p-4">
            <BoardWorkbench label="Lead pipeline board">
              {STS.map(status => {
                const col = filtered.filter(l => l.st === status.v);
                const colVal = col.reduce((s, l) => s + (gc(l.cat)?.price || 0), 0);
                const shown = colShown[status.v] ?? colPageSize;
                const visible = col.slice(0, shown);
                const hasMore = col.length > visible.length;
                return (
                  <div key={status.v}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={e => {
                      e.preventDefault();
                      const id = dragId || e.dataTransfer.getData('text/plain');
                      if (id) up(id, { st: status.v });
                      setDragId(null);
                    }}
                    className="board-column flex flex-col rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: status.c }} />
                        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{status.l}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>
                          {visible.length < col.length ? `${visible.length}/${col.length}` : col.length}
                        </span>
                      </div>
                      <span className="text-xs text-green-600">${colVal.toLocaleString()}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                      {visible.map(lead => {
                        const c = gc(lead.cat); const m = gm(lead.mk);
                        return (
                          <div key={lead.id}
                            draggable
                            onDragStart={e => { setDragId(lead.id); e.dataTransfer.setData('text/plain', lead.id); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => setDragId(null)}
                            onClick={() => setSelected(selected === lead.id ? null : lead.id)}
                            className="p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-all"
                            style={{
                              ...(selected === lead.id ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' } : { borderColor: 'var(--border)', background: 'var(--surface2)' }),
                              opacity: dragId === lead.id ? 0.4 : 1,
                            }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium text-sm" style={{ color: 'var(--text)' }}>{lead.bn}</div>
                              {lead.lt !== "tda" && lead.lt !== "newspaper" && <span className="text-xs font-semibold text-green-600 shrink-0">${c?.price.toLocaleString()}</span>}
                            </div>
                            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{lead.lt === "tda" ? (lead.paperStateName || lead.paperState || "") : (lead.cn || "No contact")}</div>
                            {lead.address && <div className="text-[10px] mt-1 truncate" style={{ color: 'var(--text-muted)' }} title={lead.address}>📍 {lead.address}</div>}
                            <div
                              className="flex items-center gap-1.5 mt-3 flex-wrap"
                              onClick={e => e.stopPropagation()}
                              onMouseDown={e => e.stopPropagation()}
                              onPointerDown={e => e.stopPropagation()}
                              draggable={false}
                            >
                              {lead.ph && /\d{7,}/.test(lead.ph.replace(/\D/g, '')) ? (
                                <CallButton
                                  phone={lead.ph}
                                  name={lead.cn || lead.bn}
                                  label={iconOnly(Phone)}
                                  inline
                                  stopPropagation
                                  className="inline-grid place-items-center"
                                  style={{ ...leadIconActionStyle, ...leadIconTone.primary }}
                                />
                              ) : (
                                <button type="button" aria-label="Find phone" title="Find phone" onClick={e => { stopAction(e); openLeadPhoneSearch(lead); }}
                                  onPointerDown={e => e.stopPropagation()}
                                  draggable={false}
                                  style={{ ...leadIconActionStyle, ...leadIconTone.amber }}>
                                  {iconOnly(Search)}
                                </button>
                              )}
                              <button type="button" aria-label={lead.web ? 'Open website' : 'Search business'} title={lead.web ? 'Open website' : 'Search business'} onClick={e => { stopAction(e); openLeadWebsite(lead); }}
                                onPointerDown={e => e.stopPropagation()}
                                draggable={false}
                                style={{ ...leadIconActionStyle, ...leadIconTone.primary }}>
                                {iconOnly(ExternalLink)}
                              </button>
                              {lead.em && (
                                <button type="button" aria-label="Email lead" title="Email lead" onClick={e => { stopAction(e); setEmailTo(lead.em || ""); setShowEmail(lead.id); }} style={{ ...leadIconActionStyle, ...leadIconTone.muted }}>
                                  {iconOnly(Mail)}
                                </button>
                              )}
                              {lead.em && (
                                <VideoMeetButton
                                  to={lead.em}
                                  name={lead.cn || lead.bn}
                                  seed={lead.bn || lead.cn}
                                  linkedTo={{ leadId: lead.id }}
                                  instant
                                  stopPropagation
                                  label={iconOnly(Video)}
                                  className="inline-grid place-items-center"
                                  style={{ ...leadIconActionStyle, ...leadIconTone.purple }}
                                />
                              )}
                              <button type="button" aria-label="Qualify lead" title="Qualify lead" onClick={e => { stopAction(e); setQualifyingLead(leadQualifyPayload(lead)); }} style={{ ...leadIconActionStyle, ...leadIconTone.green }}>
                                {iconOnly(CheckCircle2)}
                              </button>
                              {lead.address && <button type="button" aria-label="Open map" title="Open map" onClick={e => { stopAction(e); openLeadMap(lead); }}
                                onPointerDown={e => e.stopPropagation()}
                                draggable={false}
                                style={{ ...leadIconActionStyle, ...leadIconTone.teal }}>
                                {iconOnly(MapPin)}
                              </button>}
                              <button type="button" aria-label="Delete lead" title="Delete lead" onClick={e => { stopAction(e); if (confirm(`Delete "${lead.bn}"?`)) del(lead.id); }}
                                onPointerDown={e => e.stopPropagation()}
                                draggable={false}
                                style={{ ...leadIconActionStyle, ...leadIconTone.danger }}>
                                {iconOnly(Trash2)}
                              </button>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded">{lead.lt === "tda" ? "🏛️ TDA" : m?.p}</span>
                              <span className="text-[10px] font-medium" style={{ color: c?.color }}>{lead.lt === "tda" ? "State Tourism" : lead.cat.split(" / ")[0]}</span>
                            </div>
                            <ThemedSelect
                              className="board-card-move mt-3"
                              value=""
                              aria-label={`Move ${lead.bn} to another status`}
                              onClick={e => e.stopPropagation()}
                              onMouseDown={e => e.stopPropagation()}
                              style={{ width: '100%', maxWidth: 'none' }}
                              onChange={e => {
                                e.stopPropagation();
                                if (e.target.value) up(lead.id, { st: e.target.value });
                                e.target.value = "";
                              }}
                            >
                              <option value="">Move...</option>
                              {STS.filter(s => s.v !== status.v).map(s => (
                                <option key={s.v} value={s.v}>{s.l}</option>
                              ))}
                            </ThemedSelect>
                            {lead.notes.length > 0 && (
                              <div className="text-[10px] mt-1.5">{lead.notes.length} note{lead.notes.length > 1 ? "s" : ""}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {col.length > colPageSize && (
                      <div className="px-3 py-2 flex items-center gap-2 text-xs" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                        {hasMore ? (
                          <>
                            <button onClick={() => setColShown(p => ({ ...p, [status.v]: shown + colPageSize }))}
                              className="px-2 py-1 rounded font-medium"
                              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                              +{Math.min(colPageSize, col.length - shown)} more
                            </button>
                            <button onClick={() => setColShown(p => ({ ...p, [status.v]: col.length }))}
                              className="px-2 py-1 rounded"
                              style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                              All {col.length}
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setColShown(p => ({ ...p, [status.v]: colPageSize }))}
                            className="px-2 py-1 rounded"
                            style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            Collapse
                          </button>
                        )}
                        <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>{visible.length} of {col.length}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </BoardWorkbench>
          </div>
        )}

      </div>

      {/* ── Lead Detail Modal (centered) ── */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-40 p-5" onClick={() => setSelected(null)}>
          <div className="crm-modal rounded-2xl border shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-start justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-10 rounded-full" style={{ background: gc(selectedLead.cat)?.color || "#666" }} />
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    {selectedLead.bn}
                    {(selectedLead.lt === "newspaper" || selectedLead.lt === "tda") && selectedLead.web && (
                      <a href={selectedLead.web} target="_blank" rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700" data-tooltip="Visit website">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    )}
                  </h2>
                  <p className="text-sm">
                    {selectedLead.lt === "tda"
                      ? `🏛️ ${selectedLead.paperStateName || selectedLead.paperState || ""} — State Tourism Office`
                      : selectedLead.lt === "newspaper"
                      ? `📰 ${selectedLead.paperCity ? selectedLead.paperCity + ", " : ""}${selectedLead.paperStateName || ""}`
                      : `${selectedLead.bt} · ${gm(selectedLead.mk)?.p}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedLead.lt !== "tda" && selectedLead.lt !== "newspaper" && (
                <div className="text-right mr-2">
                  <div className="text-2xl font-bold text-green-600">${gc(selectedLead.cat)?.price.toLocaleString()}<span className="text-sm">/yr</span></div>
                </div>
                )}
                <button onClick={() => setSelected(null)} className="hover: p-1 rounded-md hover: transition-colors" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* ── CALL BAR ── */}
            <div className="px-6 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
              <svg className="w-5 h-5 shrink-0" style={{ color: selectedLead.ph && /\d{7,}/.test(selectedLead.ph.replace(/\D/g,'')) ? 'var(--green)' : 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              <input
                value={selectedLead.ph || ''}
                onChange={e => up(selectedLead.id, { ph: e.target.value })}
                placeholder="Enter phone number..."
                className="flex-1 text-sm px-3 py-2 rounded-lg font-mono"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
              {selectedLead.ph && /\d{7,}/.test(selectedLead.ph.replace(/\D/g,'')) ? (
                <CallButton
                  phone={selectedLead.ph}
                  name={selectedLead.cn || selectedLead.bn}
                  label={iconOnly(Phone)}
                  inline
                  className="inline-grid place-items-center shrink-0"
                  style={{ ...leadIconActionStyle, ...leadIconTone.primary }}
                />
              ) : (
                <button type="button" aria-label="Find phone" title="Find phone" onClick={() => openLeadPhoneSearch(selectedLead)} className="inline-grid place-items-center shrink-0" style={{ ...leadIconActionStyle, ...leadIconTone.amber }}>
                  {iconOnly(Search)}
                </button>
              )}
            </div>

            {/* ── QUALIFY TO PIPELINE ── */}
            <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Qualify to Pipeline</div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  → {pipelineForLead(selectedLead).pipelineName}
                </div>
              </div>
              {qualToast && <div className="text-sm font-medium" style={{ color: qualToast.startsWith('⚠') ? 'var(--red)' : 'var(--green)' }}>{qualToast}</div>}
              <button
                onClick={() => qualifyToPipeline(selectedLead)}
                disabled={qualifying}
                className="inline-grid place-items-center"
                aria-label="Qualify lead to pipeline"
                title={qualifying ? 'Qualifying...' : 'Qualify lead to pipeline'}
                style={{ ...leadIconActionStyle, ...(qualifying ? leadIconTone.muted : leadIconTone.green), opacity: qualifying ? 0.6 : 1 }}>
                {iconOnly(CheckCircle2)}
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Status */}
              <div>
                <label className={label} style={labelStyle}>Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {STS.map(s => (
                    <button key={s.v} onClick={() => up(selectedLead.id, { st: s.v })}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${selectedLead.st === s.v ? "ring-2 ring-offset-1 ring-offset-white" : "opacity-50 hover:opacity-80"}`}
                      style={{ color: s.c, borderColor: s.c + "44", ...(selectedLead.st === s.v ? { ringColor: s.c } : {}) }}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact + Details — 2-column layout */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} style={labelStyle}>Contact Name</label>
                  <input value={selectedLead.cn} onChange={e => up(selectedLead.id, { cn: e.target.value })} placeholder="Name" className={inp} style={inpStyle} />
                </div>
                <div>
                  <label className={label} style={labelStyle}>Phone</label>
                  <div className="flex gap-1.5">
                    <input value={selectedLead.ph} onChange={e => up(selectedLead.id, { ph: e.target.value })} placeholder="PHONE_REDACTED" className={`${inp} flex-1`} style={inpStyle} />
                    {selectedLead.ph && /\d{7,}/.test(selectedLead.ph.replace(/\D/g, '')) && (
                      <CallButton
                        phone={selectedLead.ph}
                        name={selectedLead.cn || selectedLead.bn}
                        label={iconOnly(Phone)}
                        inline
                        className="inline-grid place-items-center shrink-0"
                        style={{ ...leadIconActionStyle, ...leadIconTone.primary }}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className={label} style={labelStyle}>Email</label>
                  <input value={selectedLead.em} onChange={e => up(selectedLead.id, { em: e.target.value })} placeholder="redacted@example.invalid" className={inp} style={inpStyle} />
                </div>
                <div>
                  <label className={label} style={labelStyle}>Website</label>
                  <div className="flex gap-1.5">
                    <input value={selectedLead.web || ''} onChange={e => up(selectedLead.id, { web: e.target.value })} placeholder="https://..." className={`${inp} flex-1`} style={inpStyle} />
                    <a href={selectedLead.web ? (selectedLead.web.startsWith('http') ? selectedLead.web : `https://${selectedLead.web}`) : `https://www.google.com/search?q=${encodeURIComponent(selectedLead.bn + ' ' + (selectedLead.paperCity || selectedLead.address || ''))}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-grid place-items-center shrink-0"
                      style={{ ...leadIconActionStyle, ...leadIconTone.primary }}
                      title={selectedLead.web ? 'Visit website' : 'Search on Google'}>
                      {iconOnly(ExternalLink)}
                    </a>
                  </div>
                </div>
                {selectedLead.address && (
                <div>
                  <label className={label} style={labelStyle}>Address</label>
                  <div className="flex gap-1.5">
                    <input value={selectedLead.address || ''} onChange={e => up(selectedLead.id, { address: e.target.value })} className={`${inp} flex-1`} style={inpStyle} />
                    <a href={`https://www.google.com/maps/search/${encodeURIComponent(selectedLead.address)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-grid place-items-center shrink-0"
                      style={{ ...leadIconActionStyle, ...leadIconTone.teal }}
                      title="Open in Google Maps">
                      {iconOnly(MapPin)}
                    </a>
                  </div>
                </div>
                )}
                {selectedLead.lt === "tda" ? (
                <div>
                  <label className={label} style={labelStyle}>State</label>
                  <div className="px-3 py-2 rounded-lg border text-sm font-medium">🏛️ {selectedLead.paperStateName || selectedLead.paperState || "—"}</div>
                </div>
                ) : (
                <div>
                  <label className={label} style={labelStyle}>Sponsorship Slot</label>
                  <ThemedSelect value={selectedLead.cat} onChange={e => up(selectedLead.id, { cat: e.target.value })} className={inp} style={inpStyle}>
                    {CATS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </ThemedSelect>
                </div>
                )}
              </div>

              {/* TDA Service Info */}
              {selectedLead.lt === "tda" && (
                <div className="rounded-lg p-4" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                  <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>News & Community Engagement Platform — $25,000/year</div>
                  <ul className="text-xs space-y-1" style={{ color: 'var(--text)' }}>
                    <li>• Dedicated engagement platform for their region — live within 24 hours</li>
                    <li>• Free advertising for all TDA member businesses</li>
                    <li>• Directory listings, advertorials & editorial features included</li>
                    <li>• AI voice assistant for visitor engagement</li>
                    <li>• Google News indexed — organic search visibility</li>
                    <li>• Dedicated support contact + ticket system</li>
                    <li>• No ongoing costs for members — one flat annual fee</li>
                  </ul>
                  {selectedLead.web && (
                    <a href={selectedLead.web} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: 'var(--accent)' }}>
                      Visit website →
                    </a>
                  )}
                </div>
              )}

              {(selectedLead.web || selectedLead.researchSummary) && (
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  {selectedLead.web && (
                    <div className="mb-2">
                      <label className={label} style={labelStyle}>Website</label>
                      <a href={selectedLead.web} target="_blank" rel="noopener noreferrer" className="text-sm font-medium break-all" style={{ color: 'var(--accent)' }}>
                        {selectedLead.web}
                      </a>
                    </div>
                  )}
                  {selectedLead.researchSummary && (
                    <div>
                      <label className={label} style={labelStyle}>Research Summary</label>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{selectedLead.researchSummary}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Classification */}
              <div className={`grid ${selectedLead.lt === "tda" ? "grid-cols-2" : "grid-cols-3"} gap-3`}>
                {selectedLead.lt !== "tda" && (
                <div>
                  <label className={label} style={labelStyle}>Lead Type</label>
                  <ThemedSelect value={selectedLead.lt || "business"} onChange={e => up(selectedLead.id, { lt: e.target.value })} className={inp} style={inpStyle}>
                    {LEAD_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </ThemedSelect>
                </div>
                )}
                <div>
                  <label className={label} style={labelStyle}>Access Level</label>
                  <ThemedSelect value={selectedLead.al || "direct"} onChange={e => up(selectedLead.id, { al: e.target.value })} className={inp} style={inpStyle}>
                    {ACCESS_LEVELS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                  </ThemedSelect>
                </div>
                <div>
                  <label className={label} style={labelStyle}>Priority Tier</label>
                  <ThemedSelect value={selectedLead.tier || "2"} onChange={e => up(selectedLead.id, { tier: e.target.value })} className={inp} style={inpStyle}>
                    {TIERS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </ThemedSelect>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1.5 pt-1 flex-wrap">
                {selectedLead.em && (
                  <button onClick={() => { setEmailTo(selectedLead.em || ""); setShowEmail(selectedLead.id); }}
                    aria-label="Email lead" title="Email lead" style={{ ...leadIconActionStyle, ...leadIconTone.muted }}>
                    {iconOnly(Mail)}
                  </button>
                )}
                {selectedLead.em && (
                  <VideoMeetButton
                    to={selectedLead.em}
                    name={selectedLead.cn || selectedLead.bn}
                    seed={selectedLead.bn || selectedLead.cn}
                    linkedTo={{ leadId: selectedLead.id }}
                    instant
                    stopPropagation
                    label={iconOnly(Video)}
                    className="inline-grid place-items-center"
                    style={{ ...leadIconActionStyle, ...leadIconTone.purple }}
                  />
                )}
                <button onClick={() => setEditing({ id: selectedLead.id, bn: selectedLead.bn, cn: selectedLead.cn, ph: selectedLead.ph, em: selectedLead.em, web: selectedLead.web || '', address: selectedLead.address || '', mk: selectedLead.mk, cat: selectedLead.cat, bt: selectedLead.bt, st: selectedLead.st, lt: selectedLead.lt || "business", al: selectedLead.al || "direct", tier: selectedLead.tier || "2" })}
                  aria-label="Edit lead" title="Edit lead" style={{ ...leadIconActionStyle, ...leadIconTone.primary }}>
                  {iconOnly(Pencil)}
                </button>
                <button onClick={() => { if (confirm(`Delete ${selectedLead.bn}?`)) del(selectedLead.id); }}
                  aria-label="Delete lead" title="Delete lead" style={{ ...leadIconActionStyle, ...leadIconTone.danger }}>
                  {iconOnly(Trash2)}
                </button>
              </div>

              {/* AI Panel */}
              <LeadAI key={selectedLead.id} lead={selectedLead} onResearchSaved={() => refreshLeads(selectedLead.id)} />

              {/* Call Logger */}
              <div className="pt-3 border-t">
                <label className={label} style={labelStyle}>Log a Call</label>
                <div className="flex gap-1.5 mb-2">
                  {activeScripts.filter(s => s.active).map(s => (
                    <button key={s.id} onClick={() => { setActiveScriptId(s.id); setShowScript(s.id); }}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={activeScriptId === s.id
                        ? { background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)' }
                        : { background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                      {s.tag}: {s.name.split(" ").slice(1).join(" ")}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5 mb-2">
                  <ThemedSelect value={callOutcome} onChange={e => setCallOutcome(e.target.value)} className={`${inp} !text-xs`} style={inpStyle}>
                    {activeCampaign.outcomes.map(o => (
                      <option key={o.v} value={o.v}>{o.l}</option>
                    ))}
                  </ThemedSelect>
                  <input value={callNote} onChange={e => setCallNote(e.target.value)} placeholder="Quick note..."
                    onKeyDown={e => { if (e.key === "Enter") logCall(selectedLead.id); }}
                    className={`${inp} flex-1 !text-xs`} style={inpStyle} />
                  <button onClick={() => logCall(selectedLead.id)}
                    className="px-3 py-2 rounded-lg text-xs font-semibold shrink-0"
                    style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                    Log
                  </button>
                </div>
                {(selectedLead.calls && selectedLead.calls.length > 0) && (
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {[...(selectedLead.calls)].reverse().slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded">
                        <span className="font-medium" style={{ color: 'var(--accent)' }}>Script {c.scriptTag}</span>
                        <span className="font-medium" style={{ color: c.outcome === "closed" ? 'var(--green, #16a34a)' : c.outcome === "interested" ? 'var(--amber, #d97706)' : c.outcome === "declined" ? 'var(--red)' : 'var(--text-muted)' }}>
                          {c.outcome.replace("_", " ")}
                        </span>
                        <span className="truncate flex-1">{c.note}</span>
                        <span className="shrink-0">{fd(c.d)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="pt-3 border-t">
                <label className={label} style={labelStyle}>Notes ({selectedLead.notes.length})</label>
                <div className="flex gap-2 mb-3">
                  <input value={noteText} onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addNote(selectedLead.id); }}
                    placeholder="Add a note..." className={`${inp} flex-1`} style={inpStyle} />
                  <button onClick={() => addNote(selectedLead.id)}
                    className="px-3 py-2 rounded-lg text-sm hover: transition-colors border">
                    Add
                  </button>
                </div>
                {selectedLead.notes.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {[...selectedLead.notes].reverse().map((n, i) => (
                      <div key={i} className="p-2.5 rounded-lg border-l-2 border-blue-500">
                        <div className="text-xs mb-1">{fd(n.d)}</div>
                        <div className="text-sm">{n.t}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {editing && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-5" onClick={() => setEditing(null)}>
          <div className="crm-modal rounded-2xl border shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">{editing.id ? "Edit Lead" : "New Lead"}</h3>
              <button onClick={() => setEditing(null)} className="hover: p-1 rounded-md hover: transition-colors" aria-label="Close"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={label} style={labelStyle}>Business Name *</label>
                <input value={editing.bn} onChange={e => setEditing(p => p ? { ...p, bn: e.target.value } : p)} placeholder="Business name" className={inp} autoFocus />
              </div>
              <div>
                <label className={label} style={labelStyle}>Contact Name</label>
                <input value={editing.cn} onChange={e => setEditing(p => p ? { ...p, cn: e.target.value } : p)} placeholder="Person" className={inp} style={inpStyle} />
              </div>
              {editing.campaign !== 'farrington_dev' && editing.campaign !== 'ContentStudio_demos' && (
                <div>
                  <label className={label} style={labelStyle}>Business Type</label>
                  <input value={editing.bt} onChange={e => setEditing(p => p ? { ...p, bt: e.target.value } : p)} placeholder="e.g. Bike shop" className={inp} style={inpStyle} />
                </div>
              )}
              <div>
                <label className={label} style={labelStyle}>Phone</label>
                <input value={editing.ph} onChange={e => setEditing(p => p ? { ...p, ph: e.target.value } : p)} placeholder="PHONE_REDACTED" className={inp} style={inpStyle} />
              </div>
              <div>
                <label className={label} style={labelStyle}>Email</label>
                <input value={editing.em} onChange={e => setEditing(p => p ? { ...p, em: e.target.value } : p)} placeholder="redacted@example.invalid" className={inp} style={inpStyle} />
              </div>
              <div>
                <label className={label} style={labelStyle}>Website</label>
                <input value={editing.web || ''} onChange={e => setEditing(p => p ? { ...p, web: e.target.value } : p)} placeholder="https://..." className={inp} style={inpStyle} />
              </div>
              <div className="col-span-2">
                <label className={label} style={labelStyle}>Address</label>
                <input value={editing.address || ''} onChange={e => setEditing(p => p ? { ...p, address: e.target.value } : p)} placeholder="123 Main St, City, State" className={inp} style={inpStyle} />
              </div>
              {editing.campaign !== 'farrington_dev' && editing.campaign !== 'ContentStudio_demos' && (
                <>
                  <div>
                    <label className={label} style={labelStyle}>Market</label>
                    <ThemedSelect value={editing.mk} onChange={e => setEditing(p => p ? { ...p, mk: e.target.value } : p)} className={inp} style={inpStyle}>
                      {M.map(m => <option key={m.id} value={m.id}>{m.p} — {m.n}</option>)}
                    </ThemedSelect>
                  </div>
                  <div>
                    <label className={label} style={labelStyle}>Category</label>
                    <ThemedSelect value={editing.cat} onChange={e => setEditing(p => p ? { ...p, cat: e.target.value } : p)} className={inp} style={inpStyle}>
                      {CATS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </ThemedSelect>
                  </div>
                </>
              )}
              <div>
                <label className={label} style={labelStyle}>Status</label>
                <ThemedSelect value={editing.st} onChange={e => setEditing(p => p ? { ...p, st: e.target.value } : p)} className={inp} style={inpStyle}>
                  {STS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </ThemedSelect>
              </div>
              <div>
                <label className={label} style={labelStyle}>Lead Type</label>
                <ThemedSelect value={editing.lt || "business"} onChange={e => setEditing(p => p ? { ...p, lt: e.target.value } : p)} className={inp} style={inpStyle}>
                  {LEAD_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                </ThemedSelect>
              </div>
              <div>
                <label className={label} style={labelStyle}>Access Level</label>
                <ThemedSelect value={editing.al || "direct"} onChange={e => setEditing(p => p ? { ...p, al: e.target.value } : p)} className={inp} style={inpStyle}>
                  {ACCESS_LEVELS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                </ThemedSelect>
              </div>
              <div>
                <label className={label} style={labelStyle}>Priority Tier</label>
                <ThemedSelect value={editing.tier || "2"} onChange={e => setEditing(p => p ? { ...p, tier: e.target.value } : p)} className={inp} style={inpStyle}>
                  {TIERS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                </ThemedSelect>
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end flex-wrap">
              <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-lg border text-sm hover:">Cancel</button>
              {editing.id && (
                <button
                  onClick={() => {
                    const normalized = {
                      id: editing.id,
                      businessName: editing.bn || '',
                      name: editing.cn || '',
                      email: editing.em || '',
                      phone: editing.ph || '',
                      title: '',
                      notes: Array.isArray(editing.notes) ? editing.notes.map(n => typeof n === 'string' ? n : (n.text || '')).filter(Boolean).join('\n\n') : (editing.notes || ''),
                      tags: editing.tags || [],
                      suggestedPipelineId: editing.campaign || 'sponsors',
                    }
                    setEditing(null)
                    setQualifyingLead(normalized)
                  }}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  style={{ background: 'var(--green)', color: 'var(--accent-text)' }}
                  data-tooltip="Promote to a real deal in a sales pipeline (creates Account + Contact + Opportunity)">
                  ✓ Qualify → Sales Pipeline
                </button>
              )}
              <button onClick={saveLead} disabled={!editing.bn.trim()}
                className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-30 transition-colors">
                {editing.id ? "Save Changes" : "Create Lead"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Modal ── */}
      {showEmail && (() => {
        const lead = leads.find(l => l.id === showEmail); if (!lead) return null;
        const isNewspaper = lead.lt === "newspaper";
        const isTda = lead.lt === "tda";
        const isFarrington = isFarringtonDevelopmentLead(lead);
        const body = (isNewspaper || isTda || isFarrington) ? "" : emailBody(lead);
        const stateName = lead.paperStateName || lead.paperState || "your state";
        const emailSubject = isTda
          ? `A News & Community Engagement Platform for ${stateName} Tourism`
          : isNewspaper
          ? `Upgrade ${lead.bn} with AI-Powered Technology — ContentStudio`
          : isFarrington
          ? `Farrington Development next step for ${lead.bn || "your project"}`
          : (body.match(/^Subject: (.+)\n/)?.[1] || "Founding Sponsor Opportunity");
        const emailBodyText = isTda
          ? `Hi ${lead.cn || "there"},\n\nThank you for taking the time to speak with me. My name is Carl Farrington, and I'm the founder of ContentStudio.\n\nI wanted to follow up because what we've built is unlike anything currently available to tourism development authorities — and I believe it could be a powerful new tool for ${lead.bn}.\n\nHere's the idea in plain terms:\n\nWe build a dedicated news and community engagement platform for ${lead.bn} — a professional, AI-powered publication designed entirely around promoting tourism in your region. Hotels, restaurants, outfitters, attractions, event venues, B&Bs — every member of your tourism network gets featured. No cost to them. No advertising fees. No contracts for individual businesses.\n\nThe entire platform is yours for $25,000/year. That's it. One flat annual fee covers everything:\n\n• We design and launch your platform — you'll have it up and running within 24 hours\n• Every member in your tourism network gets free advertising — directory listings, premium placements, and editorial features at no cost to them\n• We write and publish advertorials, business profiles, destination features, event coverage, and local tourism news — all handled by our team\n• Your platform is indexed on Google News, so every article ranks in organic search results — travelers find your member businesses on a trusted news source\n• An AI-powered voice assistant built into the platform gives visitors a conversational way to discover your destinations and member businesses\n• Your office gets a dedicated point of contact, plus a support ticket system for anything you need\n• There are no ongoing costs for your members and no ongoing costs beyond the annual fee for your office\n\nThis is not an advertising product. There is nothing for your members to buy. This is a news and community engagement platform — we handle the content, the technology, and all member interactions. Every tourism business in your network benefits from being part of a professional, Google News-indexed publication that engages travelers and promotes your region year-round.\n\nThink of it this way: for less than the cost of a single billboard campaign, every tourism business in your region gets a full year of free promotion through a professional news and engagement platform — plus AI-powered tools that connect travelers directly to your member businesses.\n\nLearn more: https://content.example.com\n\nI'd love to walk you through a quick demo — 15 minutes is all it takes. You can book a time here:\nhttps://calendar.app.google/Lii7ixesgekmiKNn6\n\nOr just reply to this email and we'll set something up.\n\nLooking forward to it,\n\nCarl Farrington\nFounder, ContentStudio\nPHONE_REDACTED\ncontent.example.com`
          : isNewspaper
          ? `Hi ${lead.cn || "there"},\n\nIt was great talking with you about ${lead.bn}. As I mentioned, ContentStudio is a news and community engagement platform built for community newspapers like yours.\n\nHere's what you get — day one:\n• AI-powered article generation for local news, sports, business & events\n• Modern, mobile-first website indexed on Google News\n• Built-in sponsor system — 6 category slots at $2,500–$5,000/yr (revenue you keep)\n• Your brand, your market, your editorial voice\n\nIt's free to start, no credit card required. You'll have a live paper in 24 hours.\n\nSee it in action: https://wnctimes.com\nGet started: https://content.example.com/get-started\n\nWant a live walkthrough? Book a 15-minute demo with me on Google Meet:\nhttps://calendar.app.google/Lii7ixesgekmiKNn6\n\nLooking forward to getting you set up,\n\nCarl Farrington\nFounder, ContentStudio\nPHONE_REDACTED`
          : isFarrington
          ? `Hi ${lead.cn || "there"},\n\nI wanted to follow up from Farrington Development and make sure we have the right next step for ${lead.bn || "your project"}.\n\nBased on what I have so far, this looks like it may fit a consulting, automation, web, CRM, or AI workflow conversation. I can help define the scope, budget, and timeline before anyone invests time in the wrong direction.\n\nIf you are open to it, the best next step is a short conversation so I can confirm money, authority, and need, then give you a practical recommendation.\n\nCarl Farrington\nFarrington Development`
          : body.replace(/^Subject: .+\n\n/, "");

        const m = gm(lead.mk);
        const c = gc(lead.cat);

        const handleSend = async () => {
          if (!emailTo.includes("@")) return;
          setSending(true);
          setSendResult(null);
          try {
            const fd = new FormData();
            fd.append("to", emailTo.trim());
            fd.append("subject", emailSubject);
            fd.append("body", emailBodyText);
            fd.append("campaignType", isTda ? "tda_outreach" : isNewspaper ? "newspaper_outreach" : isFarrington ? "farrington_dev" : "sponsors");
            fd.append("brand", isFarrington ? "farrington_dev" : "ContentStudio");
            fd.append("fromName", isFarrington ? "Farrington Development" : "ContentStudio");
            fd.append("contactName", lead.cn || "there");
            if (isTda) {
              fd.append("paperName", lead.bn || "State Tourism Office");
              fd.append("state", stateName);
            } else if (isNewspaper) {
              fd.append("paperName", lead.bn || "your paper");
              fd.append("city", lead.paperCity || "");
              fd.append("state", lead.paperStateName || "");
            } else {
              fd.append("paperName", m?.p || "");
              fd.append("marketName", m?.n || "");
              fd.append("category", lead.cat);
              fd.append("price", String(c?.price || 2500));
              fd.append("monthlyPrice", String(Math.round((c?.price || 2500) / 12)));
            }
            for (const file of emailFiles) {
              fd.append("attachments", file);
            }
            const res = await fetch("/api/sponsor-email", { method: "POST", body: fd });
            const data = await res.json();
            if (data.ok) {
              setSendResult({ ok: true, msg: "Email sent successfully!" });
              up(lead.id, { st: "email_sent" });
              addNote(lead.id);
              setNoteText("");
              setTimeout(() => { setShowEmail(null); setSendResult(null); setEmailFiles([]); }, 1500);
            } else {
              setSendResult({ ok: false, msg: data.error || "Failed to send" });
            }
          } catch {
            setSendResult({ ok: false, msg: "Network error — could not send" });
          } finally {
            setSending(false);
          }
        };

        const removeFile = (idx) => setEmailFiles(f => f.filter((_, i) => i !== idx));

        return (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-5" onClick={() => { if (!sending) { setShowEmail(null); setEmailFiles([]); setSendResult(null); } }}>
            <div className="crm-modal rounded-2xl border shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">Email for {lead.bn}</h3>
                <button onClick={() => { if (!sending) { setShowEmail(null); setEmailFiles([]); setSendResult(null); } }} className="hover: p-1 rounded-md hover: transition-colors" aria-label="Close"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>

              {!emailTo.includes("@") && (
                <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
                  Enter an email address above to send directly via Resend.
                </div>
              )}

              {sendResult && (
                <div className={`mb-3 p-3 rounded-lg border text-sm ${sendResult.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                  {sendResult.msg}
                </div>
              )}

              {/* To / Subject */}
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 mb-3 text-sm items-center">
                <span className="py-1">To:</span>
                <input value={emailTo} onChange={e => setEmailTo(e.target.value)}
                  placeholder="email@example.com, another@example.com"
                  className={`${inp} !text-sm`} style={inpStyle} />
                <span className="py-1">Subject:</span>
                <span className="py-1">{emailSubject}</span>
              </div>

              <textarea value={emailBodyText} readOnly className="w-full min-h-[250px] p-4 rounded-lg border text-sm leading-relaxed font-mono resize-y" />

              {/* Attachments */}
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover: transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    Attach Files
                  </button>
                  <input ref={fileInputRef} type="file" multiple className="hidden"
                    onChange={e => { if (e.target.files) { setEmailFiles(prev => [...prev, ...Array.from(e.target.files)]); e.target.value = ""; } }} />
                  {emailFiles.length > 0 && <span className="crm-muted text-xs">{emailFiles.length} file{emailFiles.length > 1 ? "s" : ""} attached</span>}
                </div>
                {emailFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {emailFiles.map((file, i) => (
                      <div key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="max-w-[150px] truncate">{file.name}</span>
                        <span className="text-blue-400 text-xs">({(file.size / 1024).toFixed(0)}KB)</span>
                        <button onClick={() => removeFile(i)} className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors" aria-label="Remove">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-4 justify-end">
                <button onClick={() => { if (!sending) { setShowEmail(null); setEmailFiles([]); setSendResult(null); } }}
                  className="crm-btn px-4 py-2.5 rounded-lg border text-sm" disabled={sending}>
                  Close
                </button>
                <button onClick={() => { navigator.clipboard.writeText(body); up(lead.id, { st: "email_sent" }); setShowEmail(null); setEmailFiles([]); }}
                  className="px-4 py-2.5 rounded-lg border text-sm hover: transition-colors" disabled={sending}>
                  Copy to Clipboard
                </button>
                <button onClick={handleSend} disabled={!emailTo.includes("@") || sending}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-40 transition-colors flex items-center gap-2">
                  {sending && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                  {sending ? "Sending..." : "Send via Resend"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* ── Script Viewer Modal ── */}
      {showScript && (() => {
        const script = activeScripts.find(s => s.id === showScript) || scripts.find(s => s.id === showScript) || npScripts.find(s => s.id === showScript) || tdaScripts.find(s => s.id === showScript);
        if (!script) return null;
        const lead = selectedLead;
        const m = lead ? gm(lead.mk) : null;
        const c = lead ? gc(lead.cat) : null;
        const fill = (t) => t
          .replace(/\[PAPER NAME\]/g, m?.p || "[PAPER NAME]")
          .replace(/\[MARKET\]/g, m?.n || "[MARKET]")
          .replace(/\[CATEGORY\]/g, lead?.cat || "[CATEGORY]")
          .replace(/\[BUSINESS TYPE\]/g, lead?.bt || "[BUSINESS TYPE]")
          .replace(/\[\$PRICE\]/g, "$" + (c?.price || 2500).toLocaleString())
          .replace(/\[\$MONTHLY\]/g, "$" + Math.round((c?.price || 2500) / 12))
          .replace(/\[ORG NAME\]/g, lead?.bn || "[ORG NAME]")
          .replace(/\[STATE\]/g, lead?.paperStateName || lead?.paperState || "[STATE]")
          .replace(/\[THEIR PAPER\]/g, lead?.bn || "[THEIR PAPER]")
          .replace(/\[CITY\/STATE\]/g, lead?.paperStateName || lead?.paperState || "[CITY/STATE]")
          .replace(/\[CITY\]/g, lead?.paperCity || "[CITY]")
          .replace(/\[STATE CITY\]/g, lead?.paperCity || lead?.paperStateName || "[STATE CITY]");
        return (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-5" onClick={() => setShowScript(null)}>
            <div className="crm-modal rounded-2xl border shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-bold">Script {script.tag}: {script.name}</h3>
                  <p className="text-xs mt-0.5">{script.description}</p>
                </div>
                <button onClick={() => setShowScript(null)} className="hover: p-1 rounded-md hover:" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                {script.sections.map((sec, i) => (
                  <div key={i}>
                    <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--accent)' }}>{sec.heading}</h4>
                    {sec.lines.map((line, j) => (
                      <p key={j} className="text-sm leading-relaxed mb-2 pl-3 border-l-2" style={{ color: 'var(--text)', borderColor: 'var(--accent)' }}>{fill(line)}</p>
                    ))}
                  </div>
                ))}
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--red)' }}>Objection Handling</h4>
                  {script.objections.map((o, i) => (
                    <div key={i} className="mb-4 rounded-lg p-3" style={{ background: 'var(--red-soft)', border: '1px solid var(--border)' }}>
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>&ldquo;{fill(o.obj)}&rdquo;</div>
                      <div className="text-sm pl-3 border-l-2 mt-2" style={{ color: 'var(--text)', borderColor: 'var(--red)' }}>{fill(o.response)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-6 py-3 border-t flex justify-between items-center shrink-0" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {script.stats.calls} calls &middot; {script.stats.interested} interested &middot; {script.stats.closed} closed
                  {script.stats.calls > 0 && <span className="ml-2 font-semibold" style={{ color: 'var(--green, #16a34a)' }}>{Math.round((script.stats.interested + script.stats.closed) / script.stats.calls * 100)}% conversion</span>}
                </div>
                <button onClick={() => setShowScript(null)} className="px-4 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--surface2)', minHeight: 48 }}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Script Manager Modal ── */}
      {showScriptManager && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-5" onClick={() => setShowScriptManager(false)}>
          <div className="crm-modal rounded-2xl border shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold">{activeCampaign.icon} {activeCampaign.name} — Scripts &amp; Performance</h3>
              <button onClick={() => setShowScriptManager(false)} className="hover: p-1 rounded-md hover:" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Script inline editor */}
              {editingScript && (() => {
                const upd = (patch) => setEditingScript(p => ({ ...p, ...patch }));
                const updSec = (i, patch) => setEditingScript(p => ({ ...p, sections: p.sections.map((s, j) => j === i ? { ...s, ...patch } : s) }));
                const updLines = (i, text) => updSec(i, { lines: text.split('\n') });
                const updObj = (i, patch) => setEditingScript(p => ({ ...p, objections: p.objections.map((o, j) => j === i ? { ...o, ...patch } : o) }));
                return (
                  <div className="mb-6 rounded-xl p-4" style={{ background: 'var(--surface)', border: '2px solid var(--accent)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="font-bold text-base" style={{ color: 'var(--accent)' }}>Editing: {editingScript.name}</div>
                      <div className="flex gap-2">
                        <button onClick={async () => {
                          const all = [...scripts, ...npScripts, ...tdaScripts, ...devScripts];
                          const updated = all.map(s => s.id === editingScript.id ? editingScript : s);
                          const setByCampaign = { sponsors: setScripts, newspapers: setNpScripts, tda_outreach: setTdaScripts, farrington_dev: setDevScripts };
                          const setter = setByCampaign[editingScript.campaign];
                          if (setter) setter(updated.filter(s => s.campaign === editingScript.campaign));
                          await saveScript(editingScript);
                          setEditingScript(null);
                        }} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 48 }}>Save</button>
                        <button onClick={() => setEditingScript(null)} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 48 }}>Cancel</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Script Name</label>
                        <input value={editingScript.name} onChange={e => upd({ name: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Tag (A/B/C...)</label>
                        <input value={editingScript.tag} onChange={e => upd({ tag: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Description</label>
                      <textarea value={editingScript.description} onChange={e => upd({ description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    </div>
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sections</label>
                        <button onClick={() => setEditingScript(p => ({ ...p, sections: [...p.sections, { heading: 'New Section', lines: [''] }] }))}
                          className="text-xs px-2 py-1 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>+ Section</button>
                      </div>
                      <div className="space-y-3">
                        {editingScript.sections.map((sec, i) => (
                          <div key={i} className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                            <div className="flex gap-2 mb-2">
                              <input value={sec.heading} onChange={e => updSec(i, { heading: e.target.value })} placeholder="Section heading" className="flex-1 px-2 py-1.5 rounded text-sm font-semibold outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
                              <button onClick={() => setEditingScript(p => ({ ...p, sections: p.sections.filter((_, j) => j !== i) }))}
                                className="px-2 py-1 rounded text-xs" style={{ color: 'var(--red)', border: '1px solid var(--red)', background: 'var(--red-soft)' }}>✕</button>
                            </div>
                            <textarea value={sec.lines.join('\n')} onChange={e => updLines(i, e.target.value)} rows={Math.max(3, sec.lines.length + 1)} placeholder="One line per row. Use [PAPER NAME], [MARKET], [CATEGORY], [$PRICE] as placeholders." className="w-full px-2 py-2 rounded text-xs outline-none resize-none font-mono" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', lineHeight: 1.6 }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Objection Handling</label>
                        <button onClick={() => setEditingScript(p => ({ ...p, objections: [...p.objections, { obj: '', response: '' }] }))}
                          className="text-xs px-2 py-1 rounded" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--red)' }}>+ Objection</button>
                      </div>
                      <div className="space-y-2">
                        {editingScript.objections.map((o, i) => (
                          <div key={i} className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                            <div className="flex gap-2 mb-2">
                              <input value={o.obj} onChange={e => updObj(i, { obj: e.target.value })} placeholder='Objection (e.g. "We already advertise online")' className="flex-1 px-2 py-1.5 rounded text-xs font-semibold outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                              <button onClick={() => setEditingScript(p => ({ ...p, objections: p.objections.filter((_, j) => j !== i) }))}
                                className="px-2 py-1 rounded text-xs" style={{ color: 'var(--red)', border: '1px solid var(--red)', background: 'var(--red-soft)' }}>✕</button>
                            </div>
                            <textarea value={o.response} onChange={e => updObj(i, { response: e.target.value })} rows={2} placeholder="Your response..." className="w-full px-2 py-2 rounded text-xs outline-none resize-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Stats comparison */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Scripts for {activeCampaign.name}</span>
                <button onClick={async () => {
                  const s = await createScript(campaign);
                  if (s) {
                    const setter = { sponsors: setScripts, newspapers: setNpScripts, tda_outreach: setTdaScripts, farrington_dev: setDevScripts }[campaign];
                    if (setter) setter(p => [...p, s]);
                    setEditingScript(s);
                  }
                }} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 48 }}>+ New Script</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {activeScripts.map(s => {
                  const convRate = s.stats.calls > 0 ? Math.round((s.stats.interested + s.stats.closed) / s.stats.calls * 100) : 0;
                  const closeRate = s.stats.calls > 0 ? Math.round(s.stats.closed / s.stats.calls * 100) : 0;
                  return (
                    <div key={s.id} className="p-4 rounded-xl transition-all" style={{ border: `2px solid ${s.active ? 'var(--accent)' : 'var(--border)'}`, background: s.active ? 'var(--accent-soft)' : 'var(--surface)', opacity: s.active ? 1 : 0.6 }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>Script {s.tag}</span>
                        <button onClick={async () => { setActiveScripts(p => p.map(x => x.id === s.id ? { ...x, active: !x.active } : x)); await fetch('/api/scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle', id: s.id }) }); }}
                          className="text-xs px-2 py-1 rounded-full font-medium"
                          style={s.active ? { background: 'var(--green-soft, #dcfce7)', color: 'var(--green, #16a34a)' } : { background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                          {s.active ? "Active" : "Inactive"}
                        </button>
                      </div>
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>{s.name}</div>
                      <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{s.description.slice(0, 80)}...</div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-xl font-bold" style={{ color: 'var(--text)' }}>{s.stats.calls}</div>
                          <div className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>Calls</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold" style={{ color: 'var(--amber, #d97706)' }}>{convRate}%</div>
                          <div className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>{activeCampaign.metricLabels.secondary === "Sign-Ups" ? "Demos" : "Interest"}</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold" style={{ color: 'var(--green, #16a34a)' }}>{closeRate}%</div>
                          <div className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>{activeCampaign.metricLabels.secondary === "Sign-Ups" ? "Sign-Up" : "Close"}</div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => { setShowScriptManager(false); setShowScript(s.id); }}
                          className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                          View
                        </button>
                        <button onClick={() => setEditingScript({ ...s })}
                          className="px-2 py-1.5 rounded-lg text-xs font-medium"
                          style={{ border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }}>
                          Edit
                        </button>
                        <button onClick={async () => {
                          if (!confirm(`Delete "${s.name}"?`)) return;
                          await deleteScriptById(s.id);
                          setActiveScripts(p => p.filter(x => x.id !== s.id));
                        }} className="px-2 py-1.5 rounded-lg text-xs"
                          style={{ border: '1px solid var(--red)', color: 'var(--red)', background: 'var(--red-soft)' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* All call history across leads */}
              <div>
                <h4 className="text-sm font-bold mb-2">Recent Call Log (all leads)</h4>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {leads.flatMap(l => (l.calls || []).map(c => ({ ...c, bn: l.bn }))).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 30).map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-3 rounded border">
                      <span className="font-semibold w-16 shrink-0" style={{ color: 'var(--accent)' }}>Script {c.scriptTag}</span>
                      <span className="font-medium w-36 truncate shrink-0">{c.bn}</span>
                      <span className={`font-medium w-20 shrink-0 ${c.outcome === "closed" ? "text-green-600" : c.outcome === "interested" ? "text-amber-600" : c.outcome === "declined" ? "text-red-500" : ""}`}>
                        {c.outcome.replace("_", " ")}
                      </span>
                      <span className="truncate flex-1">{c.note}</span>
                      <span className="shrink-0">{fd(c.d)}</span>
                    </div>
                  ))}
                  {leads.every(l => !l.calls || l.calls.length === 0) && (
                    <div className="text-center py-6 text-sm">No calls logged yet. Select a lead and log your first call!</div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 border-t flex justify-end shrink-0">
              <button onClick={() => setShowScriptManager(false)} className="crm-btn px-4 py-2.5 rounded-lg border text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Qualify Wizard (promote lead to pipeline opportunity) ── */}
      {qualifyingLead && pipelineList.length > 0 && (
        <QualifyWizard
          lead={qualifyingLead}
          pipelines={pipelineList}
          onComplete={() => {
            setQualifyingLead(null)
            // Re-fetch so the converted lead's new 'closed' status shows up on the board
            fetch('/api/sponsor-leads').then(r => r.json()).then(d => { if (Array.isArray(d)) setLeads(d) }).catch(() => {})
          }}
          onClose={() => setQualifyingLead(null)}
        />
      )}

      {/* ── Campaign picker (first step of New Lead) ── */}
      {pickingCampaign && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-5" onClick={() => setPickingCampaign(false)}>
          <div className="crm-modal rounded-2xl border shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">New Lead — pick the campaign</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Which bucket does this lead belong to? The form adapts based on your choice.</p>
            <div className="grid gap-2">
              {[
                { id: 'sponsors',           icon: '🤝', label: 'Sponsors',             desc: 'Business sponsorship outreach' },
                { id: 'newspaper',          icon: '📰', label: 'Newspaper Outreach',   desc: 'Cold newspaper list' },
                { id: 'tda',                icon: '🏞️', label: 'State TDA',            desc: 'Tourism Development Authority' },
                { id: 'farrington_dev',     icon: '💻', label: 'Farrington Dev',       desc: 'Web dev inquiry' },
                { id: 'ContentStudio_demos', icon: '🎥', label: 'ContentStudio Demo',    desc: 'Product demo request' },
              ].map(c => (
                <button key={c.id}
                  onClick={() => { setPickingCampaign(false); setEditing({ ...EMPTY_LEAD, campaign: c.id }) }}
                  className="text-left rounded-lg p-3 transition-all flex items-center gap-3 hover:scale-[1.01]"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div className="text-2xl">{c.icon}</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{c.label}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{c.desc}</div>
                  </div>
                  <div className="text-xs opacity-40">→</div>
                </button>
              ))}
            </div>
            <button onClick={() => setPickingCampaign(false)} className="w-full mt-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ── */}
      {showCsvImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={() => { setShowCsvImport(false); setCsvPreview(null); }}>
          <div className="w-full max-w-2xl rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text)" }}>⬆ Import Leads from CSV</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              CSV should have headers. Supported columns: <strong>business</strong> (or company/name), <strong>contact</strong> (or contact_name), <strong>phone</strong>, <strong>email</strong>, <strong>category</strong>, <strong>type</strong> (or business_type), <strong>market</strong>, <strong>website</strong>, <strong>state</strong>, <strong>city</strong>, <strong>notes</strong>
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Assign imported leads to campaign:</label>
              <ThemedSelect id="csv-campaign" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                {allCampaigns.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </ThemedSelect>
            </div>

            <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => {
                const text = ev.target.result;
                const lines = text.split(/\r?\n/).filter(l => l.trim());
                if (lines.length < 2) { setCsvPreview({ error: "CSV needs a header row and at least one data row." }); return; }
                const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
                const colMap = {
                  bn: headers.findIndex(h => /^(business|company|name|business.?name)$/i.test(h)),
                  cn: headers.findIndex(h => /^(contact|contact.?name|person|rep)$/i.test(h)),
                  ph: headers.findIndex(h => /^(phone|tel|telephone|mobile)$/i.test(h)),
                  em: headers.findIndex(h => /^(email|e.?mail)$/i.test(h)),
                  cat: headers.findIndex(h => /^(category|cat|section)$/i.test(h)),
                  bt: headers.findIndex(h => /^(type|business.?type|industry)$/i.test(h)),
                  mk: headers.findIndex(h => /^(market|mk|region)$/i.test(h)),
                  web: headers.findIndex(h => /^(website|web|url|site)$/i.test(h)),
                  state: headers.findIndex(h => /^(state|st|province)$/i.test(h)),
                  city: headers.findIndex(h => /^(city|town)$/i.test(h)),
                  notes: headers.findIndex(h => /^(notes|note|comments)$/i.test(h)),
                };
                const rows = [];
                for (let i = 1; i < lines.length; i++) {
                  const vals = lines[i].match(/("([^"]*)"|[^,]*)/g)?.map(v => v.replace(/^"|"$/g, "").trim()) || [];
                  const bn = colMap.bn >= 0 ? vals[colMap.bn] : "";
                  if (!bn) continue;
                  rows.push({
                    bn,
                    cn: colMap.cn >= 0 ? vals[colMap.cn] || "" : "",
                    ph: colMap.ph >= 0 ? vals[colMap.ph] || "" : "",
                    em: colMap.em >= 0 ? vals[colMap.em] || "" : "",
                    cat: colMap.cat >= 0 ? vals[colMap.cat] || "Local News" : "Local News",
                    bt: colMap.bt >= 0 ? vals[colMap.bt] || "" : "",
                    mk: colMap.mk >= 0 ? vals[colMap.mk] || "avl" : "avl",
                    web: colMap.web >= 0 ? vals[colMap.web] || "" : "",
                    paperState: colMap.state >= 0 ? vals[colMap.state] || "" : "",
                    paperCity: colMap.city >= 0 ? vals[colMap.city] || "" : "",
                    noteText: colMap.notes >= 0 ? vals[colMap.notes] || "" : "",
                  });
                }
                setCsvPreview({ headers, rows, colMap });
              };
              reader.readAsText(file);
              e.target.value = "";
            }} />

            {!csvPreview && (
              <button onClick={() => csvInputRef.current?.click()}
                className="w-full py-8 rounded-xl border-2 border-dashed text-sm font-medium transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--surface2)" }}>
                Click to select CSV file
              </button>
            )}

            {csvPreview?.error && (
              <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(243,139,168,0.15)", color: "var(--red)" }}>{csvPreview.error}</div>
            )}

            {csvPreview?.rows && (
              <>
                <div className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
                  Preview: {csvPreview.rows.length} leads found
                </div>
                <div className="rounded-lg overflow-auto max-h-60 mb-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                  <table className="w-full text-xs">
                    <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="px-2 py-1.5 text-left" style={{ color: "var(--text-muted)" }}>Business</th>
                      <th className="px-2 py-1.5 text-left" style={{ color: "var(--text-muted)" }}>Contact</th>
                      <th className="px-2 py-1.5 text-left" style={{ color: "var(--text-muted)" }}>Phone</th>
                      <th className="px-2 py-1.5 text-left" style={{ color: "var(--text-muted)" }}>Email</th>
                      <th className="px-2 py-1.5 text-left" style={{ color: "var(--text-muted)" }}>Type</th>
                    </tr></thead>
                    <tbody>
                      {csvPreview.rows.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="px-2 py-1.5" style={{ color: "var(--text)" }}>{r.bn}</td>
                          <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{r.cn || "—"}</td>
                          <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{r.ph || "—"}</td>
                          <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{r.em || "—"}</td>
                          <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{r.bt || "—"}</td>
                        </tr>
                      ))}
                      {csvPreview.rows.length > 10 && (
                        <tr><td colSpan={5} className="px-2 py-1.5 text-center" style={{ color: "var(--text-muted)" }}>...and {csvPreview.rows.length - 10} more</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => {
                    const campaignId = document.getElementById("csv-campaign")?.value || "";
                    const campaignObj = allCampaigns.find(c => c.id === campaignId);
                    let maxId = leads.reduce((mx, l) => Math.max(mx, parseInt(l.id) || 0), 0);
                    const now = new Date().toISOString();
                    const newLeads = csvPreview.rows.map(r => {
                      const lt = r.bt ? guessLeadType(r.bt) : (campaignId === "farrington_dev" ? "business" : "business");
                      const al = lt === "government" || lt === "chamber" ? "multi" : lt === "business" ? "gatekeeper" : "direct";
                      return {
                        id: String(++maxId), bn: r.bn, cn: r.cn, ph: r.ph, em: r.em,
                        mk: r.mk, cat: r.cat || "Local News", bt: r.bt, st: "prospect",
                        lt, al, tier: "2", notes: r.noteText ? [{ d: now, text: r.noteText }] : [],
                        calls: [], ts: now, lc: now,
                        campaign: campaignId === "farrington_dev" ? "farrington_dev" : "",
                        web: r.web || "", paperState: r.paperState || "", paperCity: r.paperCity || "",
                      };
                    });
                    setLeads(prev => [...prev, ...newLeads]);
                    setShowCsvImport(false); setCsvPreview(null);
                  }}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                    style={{ background: "var(--accent)", color: "var(--accent-text)" }}>
                    Import {csvPreview.rows.length} Leads
                  </button>
                  <button onClick={() => csvInputRef.current?.click()}
                    className="px-4 py-2.5 rounded-lg text-sm"
                    style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                    Choose Different File
                  </button>
                  <button onClick={() => { setShowCsvImport(false); setCsvPreview(null); }}
                    className="px-4 py-2.5 rounded-lg text-sm"
                    style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
