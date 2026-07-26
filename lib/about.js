// Everything the About panel shows, in one editable place. Change the copy,
// the links or the photo here — AboutModal renders whatever it finds and needs
// no edits of its own.
//
// PHOTO: drop a square-ish portrait at /public/august.jpg (or point `photo`
// wherever you like). Until that file exists the panel falls back to a monogram
// automatically, so there is never a broken image.
export const ABOUT = {
  name: "Augustine Osei",
  shortName: "August",
  role: "Designer, builder, writer",
  // shown as a small line under the name
  bases: "Ghanaian American · between the USA, the UK and Ghana",
  photo: "/august.jpg",

  paragraphs: [
    "I'm August. I'm Ghanaian American, and I spend most of my time between the United States, the United Kingdom and Ghana — which is roughly how everything I make ends up looking, too.",
    "I write The August Dispatch, and I build things like the one you're playing right now. CHOP FIRST started as a small experiment in how much of a real racing game fits in a browser tab, and got away from me.",
    "I'm open to collaboration. If you're working on something — a game, a brand, a piece of writing, something with no name yet — I'd genuinely like to hear about it.",
  ],

  // `url: ""` renders as plain text instead of a link, so an entry can sit here
  // before its address is settled.
  projects: [
    {
      name: "The August Dispatch",
      blurb: "The blog — where the thinking behind the projects gets written down.",
      url: "https://www.theaugustdispatch.com",
    },
    {
      name: "Explorer 233",
      blurb: "A science fiction story.",
      url: "https://www.explorer233.com",
    },
    {
      name: "aWord",
      blurb: "A word game, built for the same two-minute itch as this one.",
      url: "https://aword.augustwheel.com/onboarding",
    },
  ],

  email: "theteam@augustwheel.com",
  site: { label: "augustwheel.com", url: "https://www.augustwheel.com" },
};
