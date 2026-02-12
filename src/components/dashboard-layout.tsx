import { ReactNode } from 'react';
import { AppSidebar } from './sidebar';
import { Header } from './header';

export function DashboardLayout({ children, activePath }: { children: ReactNode; activePath: string }) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AppSidebar activePath={activePath} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 scrollbar-thin scrollbar-thumb-primary/20">
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
