import "./styles.css";

// Lock the viewport: double-tap and pinch zoom hijack rapid taps on the race
// controls (iOS especially). viewport-fit covers the notch on landscape phones.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata = {
  title: "CHOP FIRST — 24-hour touge time attack",
  description:
    "Race three laps down the mountain, set a time, and send the link — your friends have 24 hours to chop it. Drift, boost, collect coins, and leave road messages for the next drivers.",
  openGraph: {
    title: "CHOP FIRST — 24-hour touge time attack",
    description: "Set a time on the mountain sprint. Your friends have 24 hours to chop it.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
