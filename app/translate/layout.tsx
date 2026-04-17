import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Translate — Upload & process files",
  description:
    "Upload documents, media, or spreadsheets and translate to your chosen language.",
};

export default function TranslateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
