import React from "react";
import { ImageItem, PhoneCarousel } from "@/components/ui/phone-mockups-1-utils/phone-carousel";

// Real screens from the Mila app (fictional demo data).
const exampleImages: ImageItem[] = [
  { src: "/screens/m-home.webp", alt: "Mila home screen with a request box and suggestions", caption: "Tell Mila what you need." },
  { src: "/screens/m-chat.webp", alt: "Mila building a listing brief for a Malibu home", caption: "She builds the whole brief." },
  { src: "/screens/m-event.webp", alt: "An open house card expanded with directions and follow-up buttons", caption: "Every event, one tap away." },
  { src: "/screens/m-content.webp", alt: "Instagram post drafts ready to review", caption: "Posts written, ready to review." },
  { src: "/screens/m-properties.webp", alt: "Property cards with photos and prices", caption: "Your listings, always current." },
  { src: "/screens/m-contacts.webp", alt: "Contacts organized by pipeline stage", caption: "Know who needs a follow-up." },
];

export default function PhoneMockupBasic() { return <PhoneCarousel images={exampleImages} />; }
