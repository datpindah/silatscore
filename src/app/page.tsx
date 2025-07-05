import { Button } from "@/components/ui/button";
import { Header } from "@/components/layout/Header";
import { PageTitle } from "@/components/shared/PageTitle";
import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <PageTitle title="Selamat Datang Di Evoke Skor" description="Your comprehensive solution for Pencak Silat match scoring and management." />
          
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <Image 
                src="https://storage.googleapis.com/magic-box-images/martial-arts-sunset-silhouette.jpg" 
                alt="Silhouette of a martial artist performing a stance at sunset" 
                width={600} 
                height={400}
                className="rounded-lg shadow-lg object-cover"
                data-ai-hint="martial arts sunset"
              />
            </div>
            <div className="space-y-6">
              <p className="text-lg font-body leading-relaxed">
                Evoke Skor Digital provides a seamless experience for judges, officials, and enthusiasts to track scores, manage matches, and access rule clarifications with ease.
              </p>
              <div className="space-y-4">
                <SectionCard
                  title="Live Scoring"
                  description="Go to the scoring page to manage a live match, track points, fouls, and time."
                  buttonHref="/saya"
                  buttonLabel="Login & Scoring"
                />
                <SectionCard
                  title="Admin Panel"
                  description="Access the admin panel to manage schedules, review match data, and clarify rules."
                  buttonHref="/admin"
                  buttonLabel="Go to Admin"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

interface SectionCardProps {
  title: string;
  description: string;
  buttonHref: string;
  buttonLabel: string;
}

function SectionCard({ title, description, buttonHref, buttonLabel }: SectionCardProps) {
  return (
    <div className="p-6 bg-card rounded-lg shadow-md border border-border">
      <h2 className="text-2xl font-headline text-primary mb-2">{title}</h2>
      <p className="text-foreground/90 font-body mb-4">{description}</p>
      <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
        <Link href={buttonHref}>{buttonLabel}</Link>
      </Button>
    </div>
  );
}

function Footer() {
  return (
    <footer className="py-6 border-t border-border/40 bg-background/95">
      <div className="container mx-auto text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} Evoke Skor Digital. All rights reserved.
      </div>
    </footer>
  );
}
