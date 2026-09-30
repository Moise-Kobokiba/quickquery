import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'QuickQuery — Explore your data. Get answers fast.', description: 'A calm, visual workspace for exploring CSV data without SQL.' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html> }
