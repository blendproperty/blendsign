import "./globals.css";

export const metadata = {
  title: "BlendSign",
  description: "E-signatures for South African property documents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
