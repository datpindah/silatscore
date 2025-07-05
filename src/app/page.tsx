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
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
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
