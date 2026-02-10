import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">3D Print Service</h1>
          <p className="text-muted-foreground">Select your location</p>
        </div>
        
        <div className="flex flex-col gap-4">
          <Link href="/toronto" className="w-full">
            <Button size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold tracking-wide">
              Toronto
            </Button>
          </Link>
          
          <Link href="/sf" className="w-full">
            <Button size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold tracking-wide">
              San Francisco
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
