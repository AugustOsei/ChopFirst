import Script from "next/script";
import "./styles.css";
import { SITE_URL } from "../lib/site";

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
  metadataBase: new URL(SITE_URL),
  title: "CHOP FIRST — Free Browser Car Racing Game (Ghana)",
  description:
    "A free, no-install car racing game you play in your browser. Drift a mountain touge or street-race through Accra, Ghana, set a lap time, and challenge friends to chop it within 24 hours.",
  keywords: [
    "car racing game",
    "car racing game Ghana",
    "racing games in Ghana",
    "Accra racing game",
    "free browser game",
    "online racing game",
    "drift game",
    "touge",
    "vibecoded game",
    "CHOP FIRST",
    "indie racing game",
  ],
  applicationName: "CHOP FIRST",
  authors: [{ name: "Augustine Osei", url: "https://www.augustwheel.com" }],
  creator: "Augustine Osei",
  alternates: { canonical: "/" },
  verification: { google: "CD-E2u3Vv21vNedhM6opHx5uCjvrsdQ8Bt6rOUOpGXk" },
  openGraph: {
    title: "CHOP FIRST — Free Browser Car Racing Game (Ghana)",
    description:
      "Drift a mountain touge or race the streets of Accra, Ghana. Set a time, send the link — friends have 24 hours to chop it. Free, no install.",
    url: SITE_URL,
    siteName: "CHOP FIRST",
    type: "website",
    locale: "en",
    images: [
      { url: "/cover-accra.jpg", width: 1376, height: 768, alt: "CHOP FIRST — racing through Accra, Ghana" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CHOP FIRST — Free Browser Car Racing Game (Ghana)",
    description:
      "Drift a mountain touge or race the streets of Accra, Ghana. Set a time, send the link — friends have 24 hours to chop it.",
    images: ["/cover-accra.jpg"],
  },
};

// Structured data so search engines understand this is a free, browser-playable
// racing game — enables game/rich-result eligibility.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "CHOP FIRST",
  alternateName: "CHOP FIRST Car Racing Game",
  description:
    "A free browser-based arcade car racing game. Drift a mountain touge or street-race through Accra, Ghana, set a lap time, and challenge friends to beat it within 24 hours.",
  url: SITE_URL,
  image: `${SITE_URL}/cover-accra.jpg`,
  genre: ["Racing", "Arcade", "Driving"],
  gamePlatform: ["Web Browser"],
  applicationCategory: "Game",
  operatingSystem: "Any (web browser)",
  inLanguage: "en",
  author: { "@type": "Person", name: "Augustine Osei", url: "https://www.augustwheel.com" },
  publisher: { "@type": "Person", name: "Augustine Osei" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-5KVJMC1RL9"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-5KVJMC1RL9');
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
