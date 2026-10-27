import './globals.css';

export const metadata = {
  title: 'Naat-App | AI Naat Studio',
  description: 'AI-powered naat production studio with vocal enhancement, effects, and layered mixing.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
